import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { io } from 'socket.io-client';
import { createRoomStore, hashPasscode, checkPasscode } from '../server/room-store.js';
const event = (socket, name) =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off(name, handler);
      reject(new Error('Timeout: ' + name));
    }, 8000);
    const handler = (value) => {
      clearTimeout(timeout);
      socket.off(name, handler);
      resolve(value);
    };
    socket.on(name, handler);
  });
const request = (socket, name, value = {}) =>
  new Promise((resolve, reject) =>
    socket
      .timeout(8000)
      .emit(name, value, (failure, response) => (failure ? reject(failure) : resolve(response))),
  );

test('passcodes are salted and reject invalid passwords', async () => {
  const first = await hashPasscode('movie-night'),
    second = await hashPasscode('movie-night');
  assert.notEqual(first, second);
  assert.ok(!first.includes('movie-night'));
  assert.equal(await checkPasscode('movie-night', first), true);
  assert.equal(await checkPasscode('wrong', first), false);
  assert.equal(await checkPasscode(undefined, first), false);
});

test(
  'room access, moderation, queue votes, branding and bans survive a server restart',
  { timeout: 45000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'bingewme-rooms-'));
    const databasePath = join(directory, 'rooms.sqlite');
    const sockets = [];
    let server;
    const origin = 'http://localhost:3006';
    const start = async () => {
      server = spawn(process.execPath, ['server/index.js'], {
        env: { ...process.env, PORT: '3006', ROOM_DATABASE_PATH: databasePath },
        stdio: 'pipe',
      });
      await new Promise((resolve, reject) => {
        server.stdout.once('data', resolve);
        server.once('error', reject);
      });
    };
    const stop = async () => {
      const exited = new Promise((resolve) => server.once('exit', resolve));
      server.kill();
      await exited;
    };
    const joinRoom = async (code, name, identityToken, passcode = '') => {
      const socket = io(origin, { transports: ['websocket'] });
      sockets.push(socket);
      await event(socket, 'connect');
      const session = event(socket, 'session');
      socket.emit('join', { room: code, name, identityToken, passcode });
      return { socket, session: await session };
    };
    try {
      await start();
      const { code } = await (await fetch(origin + '/api/rooms', { method: 'POST' })).json();
      let host = await joinRoom(code, 'Owner'),
        guest = await joinRoom(code, 'Guest');
      const ownerToken = host.session.identityToken,
        guestToken = guest.session.identityToken;
      assert.deepEqual(
        await request(guest.socket, 'room-manage', { action: 'configure', persistent: true }),
        { error: 'Only hosts and moderators can manage this room.' },
      );
      assert.deepEqual(
        await request(host.socket, 'room-manage', {
          action: 'configure',
          persistent: true,
          passcode: 'movie-night',
        }),
        { ok: true },
      );
      const blocked = io(origin, { transports: ['websocket'] });
      sockets.push(blocked);
      await event(blocked, 'connect');
      const passwordError = event(blocked, 'room-error');
      blocked.emit('join', { room: code, name: 'No password' });
      assert.match(await passwordError, /passcode/);
      blocked.disconnect();
      const first = (
        await request(host.socket, 'queue-add', { url: 'https://cdn.example/one.mp4' })
      ).item;
      const second = (
        await request(host.socket, 'queue-add', { url: 'https://cdn.example/two.mp4' })
      ).item;
      const reordered = event(guest.socket, 'queue-state');
      await request(host.socket, 'queue-reorder', [second.id, first.id]);
      assert.deepEqual(
        (await reordered).map((item) => item.id),
        [second.id, first.id],
      );
      const vote = event(guest.socket, 'skip-state');
      await request(host.socket, 'skip-vote');
      assert.equal((await vote).votes, 1);
      const skipped = event(host.socket, 'sync');
      await request(guest.socket, 'skip-vote');
      assert.equal((await skipped).mediaId, first.id);
      await request(host.socket, 'room-manage', { action: 'branding', badges: ['POPCORN CREW'] });
      await request(guest.socket, 'badge-select', 'POPCORN CREW');
      const chat = event(host.socket, 'chat');
      guest.socket.emit('chat', { text: 'hello' });
      assert.equal((await chat).badge, 'POPCORN CREW');
      const png = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9X8AAAAASUVORK5CYII=',
        'base64',
      );
      const asset = await fetch(origin + `/api/rooms/${code}/assets?kind=emote&name=popcorn`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${host.session.uploadToken}`,
          'Content-Type': 'image/png',
        },
        body: png,
      });
      assert.equal(asset.status, 201);
      const { url } = await asset.json();
      assert.equal((await fetch(origin + url)).status, 200);
      const overlay = event(host.socket, 'gif-overlay');
      assert.deepEqual(await request(guest.socket, 'gif-overlay', url), { ok: true });
      assert.equal((await overlay).url, url);
      assert.ok(
        (await request(guest.socket, 'gif-overlay', 'https://attacker.example/image.gif')).error,
      );
      await request(host.socket, 'room-manage', { action: 'mute-chat', target: guest.socket.id });
      await request(host.socket, 'room-manage', { action: 'mute-mic', target: guest.socket.id });
      assert.ok((await request(guest.socket, 'camera-start', { video: false, audio: true })).error);
      const removed = event(guest.socket, 'room-error');
      await request(host.socket, 'room-manage', {
        action: 'ban',
        target: guest.socket.id,
        reason: 'test ban',
      });
      assert.match(await removed, /banned/);
      host.socket.disconnect();
      await stop();
      const stored = createRoomStore(databasePath);
      const saved = stored.load().get(code);
      assert.equal(saved.persistent, true);
      assert.equal(saved.bans.size, 1);
      assert.equal(saved.queue.length, 2);
      assert.equal(saved.branding.emotes.length, 1);
      stored.close();
      await start();
      assert.equal((await fetch(origin + '/api/rooms/' + code)).status, 200);
      const denied = io(origin, { transports: ['websocket'] });
      sockets.push(denied);
      await event(denied, 'connect');
      const banned = event(denied, 'room-error');
      denied.emit('join', {
        room: code,
        name: 'Guest again',
        identityToken: guestToken,
        passcode: 'movie-night',
      });
      assert.match(await banned, /banned/);
      denied.disconnect();
      host = await joinRoom(code, 'Owner returns', ownerToken, 'movie-night');
      const banState = event(host.socket, 'moderation-state');
      await request(host.socket, 'room-manage', { action: 'branding', badges: ['POPCORN CREW'] });
      const bans = (await banState).bans;
      await request(host.socket, 'room-manage', { action: 'unban', target: bans[0].id });
      guest = await joinRoom(code, 'Guest unbanned', guestToken, 'movie-night');
      await request(host.socket, 'room-manage', {
        action: 'moderator',
        target: guest.socket.id,
        enabled: true,
      });
      assert.deepEqual(
        await request(guest.socket, 'room-manage', { action: 'branding', badges: ['MOD'] }),
        { ok: true },
      );
      assert.ok(
        (
          await request(guest.socket, 'room-manage', {
            action: 'transfer-host',
            target: host.socket.id,
          })
        ).error,
      );
      assert.deepEqual(
        await request(host.socket, 'room-manage', {
          action: 'transfer-host',
          target: guest.socket.id,
        }),
        { ok: true },
      );
    } finally {
      sockets.forEach((socket) => socket.disconnect());
      if (server?.exitCode === null) await stop();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
