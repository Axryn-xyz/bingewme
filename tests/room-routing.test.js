import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { renderToString } from 'react-dom/server';
import { createElement } from 'react';
import { createRoomCode, parseRoomCode } from '../src/lib/rooms.ts';

test('room links and codes resolve consistently; generated rooms are distinct', () => {
  assert.equal(parseRoomCode(' https://example.com/party/Film-Night/ '), 'film-night');
  assert.equal(parseRoomCode('/party/film-night'), 'film-night');
  assert.equal(parseRoomCode('film-night'), 'film-night');
  for (const invalid of [
    '',
    'ab',
    '../another-room',
    '/party/',
    'a room',
    'https://example.com/',
    'javascript:alert(1)',
  ])
    assert.equal(parseRoomCode(invalid), null);
  const codes = Array.from({ length: 100 }, createRoomCode);
  assert.equal(new Set(codes).size, 100);
  codes.forEach((code) => assert.equal(parseRoomCode(code), code));
});

test('home is a lobby and fresh rooms contain no sample media', async () => {
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
  const previousLocation = globalThis.location;
  const previousStorage = globalThis.sessionStorage;
  globalThis.sessionStorage = { getItem: () => null };
  try {
    const { default: App } = await vite.ssrLoadModule('/src/App.tsx');
    globalThis.location = { pathname: '/', origin: 'http://localhost' };
    const home = renderToString(createElement(App));
    assert.match(home, /Create new room/);
    assert.match(home, /Join room/);
    assert.doesNotMatch(home, /video-stage|Connecting to room|friday-night/);
    globalThis.location = { pathname: '/party/new-test-room', origin: 'http://localhost' };
    const room = renderToString(createElement(App));
    assert.match(room, /Add your first media/);
    assert.match(room, /Nothing playing yet/);
    assert.match(room, /Leave room/);
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
