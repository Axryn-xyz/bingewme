import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { io } from 'socket.io-client';
const event = (s, name, matches = () => true) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      s.off(name, listener);
      reject(new Error('Timeout: ' + name));
    }, 8000);
    const listener = (data) => {
      if (!matches(data)) return;
      clearTimeout(timer);
      s.off(name, listener);
      resolve(data);
    };
    s.on(name, listener);
  });
test('room chat, playback, host lock, resync and majority vote', async () => {
  const proc = spawn(process.execPath, ['server/index.js'], {
    env: {
      ...process.env,
      PORT: '3002',
      FRONTEND_ORIGINS: 'https://binge.axryn.xyz',
      MAX_UPLOAD_BYTES: '',
    },
    stdio: 'pipe',
  });
  const clients = [];
  try {
    await new Promise((resolve, reject) => {
      proc.stdout.once('data', resolve);
      proc.once('error', reject);
    });
    const health = await fetch('http://localhost:3002/api/health', {
      headers: { Origin: 'https://binge.axryn.xyz' },
    });
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok' });
    const uploadLimits = await (await fetch('http://localhost:3002/api/media/config')).json();
    assert.equal(uploadLimits.maxUploadBytes, 10 * 1024 ** 3);
    assert.equal(health.headers.get('access-control-allow-origin'), 'https://binge.axryn.xyz');
    const deniedOrigin = await fetch('http://localhost:3002/api/health', {
      headers: { Origin: 'https://unrelated.example' },
    });
    assert.equal(deniedOrigin.headers.get('access-control-allow-origin'), null);
    const created = await Promise.all(
      Array.from({ length: 2 }, () =>
        fetch('http://localhost:3002/api/rooms', {
          method: 'POST',
          headers: { Origin: 'https://binge.axryn.xyz' },
        }),
      ),
    );
    for (const response of created) {
      assert.equal(response.status, 201);
      assert.equal(response.headers.get('cache-control'), 'no-store');
    }
    const [{ code }, { code: otherCode }] = await Promise.all(
      created.map((response) => response.json()),
    );
    assert.match(code, /^[1-9]\d{4}$/);
    assert.notEqual(code, otherCode);
    const found = await fetch(`http://localhost:3002/api/rooms/${code}`);
    assert.equal(found.status, 200);
    assert.deepEqual(await found.json(), { code });
    assert.equal((await fetch('http://localhost:3002/api/rooms/00000')).status, 404);
    const missing = io('http://localhost:3002', { transports: ['websocket'] });
    clients.push(missing);
    await event(missing, 'connect');
    const rejected = event(missing, 'room-error');
    missing.emit('join', { room: '00000', name: 'Guest' });
    assert.match(await rejected, /no longer active/);
    async function join(name, room = code) {
      const socket = io('http://localhost:3002', { transports: ['websocket'] });
      clients.push(socket);
      await event(socket, 'connect');
      const joined = event(socket, 'members');
      socket.emit('join', { room, name });
      const membership = await joined;
      assert.equal(membership.members.length, room === otherCode ? 1 : name === 'Host' ? 1 : 2);
      return socket;
    }
    const host = await join('Host');
    const guest = await join('Guest');
    const otherHost = await join('Other host', otherCode);
    const leaked = [];
    otherHost.on('chat', (m) => leaked.push(m));
    otherHost.on('sync', (m) => leaked.push(m));
    const message = event(guest, 'chat');
    host.emit('chat', { text: 'Hello party' });
    assert.equal((await message).text, 'Hello party');
    const playback = event(guest, 'sync');
    host.emit('sync', {
      source: 'https://example.com/movie.mp4',
      title: 'Test film',
      time: 20,
      playing: true,
      rate: 1,
    });
    assert.equal((await playback).time, 20);
    otherHost.emit('sync', {
      source: 'https://example.com/other.mp4',
      title: 'Other room film',
      time: 60,
      playing: false,
      rate: 1,
    });
    const otherSnapshot = event(otherHost, 'sync');
    otherHost.emit('request-sync');
    assert.equal((await otherSnapshot).title, 'Other room film');
    assert.equal(leaked.length, 1);
    assert.equal(leaked[0].title, 'Other room film');
    const settings = event(guest, 'settings');
    host.emit('settings', { locked: true, vote: true });
    assert.equal((await settings).locked, true);
    guest.emit('sync', {
      source: 'https://example.com/movie.mp4',
      title: 'Bad control',
      time: 99,
      playing: false,
      rate: 1,
    });
    const snapshot = event(guest, 'sync');
    guest.emit('request-sync');
    const state = await snapshot;
    assert.equal(state.title, 'Test film');
    assert.ok(state.time >= 20 && state.time < 25);
    const ballot = event(guest, 'vote-state');
    host.emit('vote-start');
    assert.equal((await ballot).votes, 1);
    const majority = event(host, 'vote-state', (state) => state.votes === 2);
    guest.emit('vote-yes');
    assert.equal((await majority).votes, 2);
    const result = event(host, 'vote-result');
    assert.equal((await result).passed, true);
    const response = await fetch('http://localhost:3002/party/test-room');
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Binge W Me/);
  } finally {
    clients.forEach((s) => s.disconnect());
    proc.kill();
  }
});
