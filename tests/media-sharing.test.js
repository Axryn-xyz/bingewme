import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { io } from 'socket.io-client';

function event(socket, name, matches = () => true) {
  return new Promise((resolve, reject) => {
    const listener = (data) => {
      if (matches(data)) {
        clearTimeout(timer);
        socket.off(name, listener);
        resolve(data);
      }
    };
    const timer = setTimeout(() => {
      socket.off(name, listener);
      reject(new Error('Timeout: ' + name));
    }, 8000);
    socket.on(name, listener);
  });
}
const request = (socket, event, data) =>
  new Promise((resolve, reject) =>
    socket
      .timeout(5000)
      .emit(event, data, (error, result) => (error ? reject(error) : resolve(result))),
  );

test('shared uploads, queue edits, late joins, usernames, authorization, seeking and cleanup', async () => {
  const proc = spawn(process.execPath, ['server/index.js'], {
    env: { ...process.env, PORT: '3003', MAX_UPLOAD_BYTES: '1024' },
    stdio: 'pipe',
  });
  const sockets = [];
  const origin = 'http://localhost:3003';
  try {
    await new Promise((resolve, reject) => {
      proc.stdout.once('data', resolve);
      proc.once('error', reject);
    });
    const limits = await (await fetch(origin + '/api/media/config')).json();
    assert.equal(limits.maxUploadBytes, 1024);
    const create = async () => {
      const response = await fetch(origin + '/api/rooms', { method: 'POST' });
      return (await response.json()).code;
    };
    const code = await create(),
      otherCode = await create();
    async function join(name, room = code, withSnapshot = false) {
      const socket = io(origin, { transports: ['websocket'] });
      sockets.push(socket);
      await event(socket, 'connect');
      const members = event(socket, 'members'),
        session = event(socket, 'session'),
        queue = event(socket, 'queue-state');
      const snapshot = withSnapshot ? event(socket, 'sync') : null;
      socket.emit('join', { room, name });
      return {
        socket,
        members: await members,
        token: (await session).uploadToken,
        queue: await queue,
        snapshot: snapshot ? await snapshot : null,
      };
    }
    const host = await join('Host'),
      guest = await join('Alex'),
      other = await join('Other', otherCode);
    const firstQueue = event(guest.socket, 'queue-state', (q) => q.length === 1);
    const added = await request(host.socket, 'queue-add', {
      url: 'https://example.com/first.mp4',
      title: 'First film',
    });
    assert.equal((await firstQueue)[0].id, added.item.id);
    const secondQueue = event(host.socket, 'queue-state', (q) => q.length === 2);
    assert.ok(
      (
        await request(guest.socket, 'queue-add', {
          url: 'https://example.com/second.mp4',
          title: 'Second film',
        })
      ).item,
    );
    assert.equal((await secondQueue).length, 2);
    const locked = event(guest.socket, 'settings');
    host.socket.emit('settings', { locked: true });
    await locked;
    assert.match(
      (await request(guest.socket, 'queue-add', { url: 'https://example.com/blocked.mp4' })).error,
      /host/,
    );
    const endpoint = origin + `/api/rooms/${code}/media?name=movie.mp4`;
    assert.equal((await fetch(endpoint, { method: 'POST', body: 'test' })).status, 401);
    assert.equal(
      (
        await fetch(endpoint, {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + guest.token },
          body: 'test',
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(endpoint, {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + host.token },
          body: Buffer.alloc(2048),
        })
      ).status,
      413,
    );
    assert.equal(
      (
        await fetch(origin + `/api/rooms/${code}/media?name=bad.html`, {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + host.token },
          body: 'not media',
        })
      ).status,
      415,
    );
    const bytes = Buffer.from(Array.from({ length: 64 }, (_, i) => i));
    const uploadedQueue = event(guest.socket, 'queue-state', (q) =>
      q.some((item) => item.kind === 'upload'),
    );
    const upload = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + host.token, 'Content-Type': 'video/mp4' },
      body: bytes,
    });
    assert.equal(upload.status, 201);
    const { item } = await upload.json();
    assert.equal((await uploadedQueue).length, 3);
    assert.match(item.url, /^\/api\/media\//);
    const moved = event(guest.socket, 'sync', (s) => s.time === 42);
    host.socket.emit('sync', {
      source: item.url,
      title: item.title,
      mediaId: item.id,
      time: 42,
      playing: true,
      rate: 1,
    });
    await moved;
    const late = await join('Sam', code, true);
    assert.equal(late.queue.length, 3);
    assert.equal(late.snapshot.source, item.url);
    assert.equal(late.snapshot.mediaId, item.id);
    assert.ok(late.snapshot.time >= 42);
    const renamed = event(host.socket, 'members', (data) =>
      data.members.some((member) => member.name === 'Taylor'),
    );
    assert.equal((await request(guest.socket, 'rename', 'Taylor')).name, 'Taylor');
    assert.equal((await renamed).host, host.socket.id);
    const range = await fetch(origin + item.url, { headers: { Range: 'bytes=4-11' } });
    assert.equal(range.status, 206);
    assert.equal(range.headers.get('content-type'), 'video/mp4');
    assert.equal(range.headers.get('content-range'), 'bytes 4-11/64');
    assert.deepEqual(Buffer.from(await range.arrayBuffer()), bytes.subarray(4, 12));
    assert.deepEqual(Buffer.from(await (await fetch(origin + item.url)).arrayBuffer()), bytes);
    assert.equal(other.queue.length, 0);
    const twitch = await request(other.socket, 'queue-add', {
      url: 'https://player.twitch.tv/?video=v12345678&parent=old.example',
      title: 'Twitch VOD',
    });
    assert.equal(twitch.item.url, 'https://www.twitch.tv/videos/12345678');
    assert.equal(twitch.item.provider, 'twitch');
    const twitchGuest = await join('Twitch guest', otherCode, true);
    assert.equal(twitchGuest.queue[0].id, twitch.item.id);
    assert.equal(twitchGuest.snapshot.source, twitch.item.url);
    assert.match((await request(other.socket, 'queue-select', item.id)).error, /no longer/);
    assert.match((await request(other.socket, 'queue-remove', item.id)).error, /no longer/);
    assert.match((await request(guest.socket, 'queue-remove', item.id)).error, /host/);
    const reduced = event(guest.socket, 'queue-state', (queue) => queue.length === 2);
    assert.equal((await request(host.socket, 'queue-remove', added.item.id)).ok, true);
    await reduced;
    const current = event(guest.socket, 'sync', (snapshot) => snapshot.mediaId === item.id);
    guest.socket.emit('request-sync');
    assert.equal((await current).source, item.url);
    const switched = event(
      guest.socket,
      'sync',
      (snapshot) => snapshot.source === 'https://example.com/second.mp4',
    );
    const oneItem = event(guest.socket, 'queue-state', (queue) => queue.length === 1);
    assert.equal((await request(host.socket, 'queue-remove', item.id)).ok, true);
    const remaining = await oneItem;
    assert.equal((await switched).playing, false);
    assert.equal((await fetch(origin + item.url)).status, 404);
    const emptied = event(guest.socket, 'sync', (snapshot) => snapshot.source === '');
    assert.equal((await request(host.socket, 'queue-remove', remaining[0].id)).ok, true);
    assert.equal((await emptied).playing, false);
    const replacementUpload = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + host.token, 'Content-Type': 'video/mp4' },
      body: bytes,
    });
    assert.equal(replacementUpload.status, 201);
    const replacement = (await replacementUpload.json()).item;
    host.socket.disconnect();
    guest.socket.disconnect();
    late.socket.disconnect();
    let status = 200;
    for (let attempt = 0; attempt < 30 && status !== 404; attempt++) {
      await delay(20);
      status = (await fetch(origin + replacement.url)).status;
    }
    assert.equal(status, 404);
  } finally {
    sockets.forEach((socket) => socket.disconnect());
    proc.kill();
  }
});
