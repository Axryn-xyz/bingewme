import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { renderToString } from 'react-dom/server';
import { createElement } from 'react';
import { parseRoomCode } from '../src/lib/rooms.ts';
import { allocateRoomCode } from '../server/room-codes.js';

test('room links and codes resolve consistently; generated rooms are distinct', () => {
  assert.equal(parseRoomCode(' https://example.com/party/Film-Night/ '), 'film-night');
  assert.equal(parseRoomCode('/party/film-night'), 'film-night');
  assert.equal(parseRoomCode('film-night'), 'film-night');
  assert.equal(parseRoomCode('48271'), '48271');
  assert.equal(parseRoomCode('48 271'), '48271');
  assert.equal(parseRoomCode('48-271'), '48271');
  assert.equal(parseRoomCode('https://binge.axryn.xyz/party/48271'), '48271');
  for (const invalid of [
    '',
    'ab',
    '../another-room',
    '/party/',
    'a room',
    'https://example.com/',
    'javascript:alert(1)',
    '1234',
    '123456',
  ])
    assert.equal(parseRoomCode(invalid), null);
  const rooms = new Map();
  for (let i = 0; i < 100; i++) {
    const code = allocateRoomCode(rooms);
    assert.match(code, /^\d{5}$/);
    assert.equal(parseRoomCode(code), code);
    assert.ok(!rooms.has(code));
    rooms.set(code, {});
  }
  assert.equal(rooms.size, 100);
});

test('room allocation retries collisions, finds a free code, and handles exhaustion', () => {
  const occupied = new Map([
    ['48271', {}],
    ['10000', {}],
  ]);
  assert.equal(
    allocateRoomCode(occupied, () => 48271),
    '10001',
  );
  const full = new Map(Array.from({ length: 90000 }, (_, i) => [String(10000 + i), {}]));
  assert.throws(() => allocateRoomCode(full, () => 48271), /All room codes/);
});

test('home is a lobby and fresh rooms contain no sample media', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  const previousLocation = globalThis.location;
  const previousStorage = globalThis.sessionStorage;
  globalThis.sessionStorage = { getItem: () => null };
  try {
    const { default: App, WatchRoom } = await vite.ssrLoadModule('/src/App.tsx');
    globalThis.location = { pathname: '/', origin: 'http://localhost' };
    const home = renderToString(createElement(App));
    assert.match(home, /Create new room/);
    assert.match(home, /Join room/);
    assert.match(home, /FIVE-DIGIT CODE/);
    assert.doesNotMatch(home, /video-stage|Connecting to room|friday-night/);
    globalThis.location = { pathname: '/party/48271', origin: 'http://localhost' };
    const invite = renderToString(createElement(App));
    assert.match(invite, /invite-name/);
    assert.match(invite, /Join room/);
    assert.match(invite, /YOUR NAME/);
    assert.doesNotMatch(invite, /video-stage/);
    const room = renderToString(createElement(WatchRoom, { room: '48271', initialName: 'Alex' }));
    assert.match(room, /Add your first media/);
    assert.match(room, /Nothing playing yet/);
    assert.match(room, /Leave room/);
    assert.match(room, /Copy room code/);
    assert.match(room, /48271/);
    assert.doesNotMatch(
      room,
      /<video|<iframe|Big Buck Bunny|Sintel|Elephants Dream|Blender Foundation|unsplash/,
    );
  } finally {
    globalThis.location = previousLocation;
    globalThis.sessionStorage = previousStorage;
    await vite.close();
  }
});
