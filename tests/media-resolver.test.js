import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractMedia,
  knownMedia,
  resolveMedia,
  isPublicAddress,
} from '../server/media-resolver.js';
import { twitchSource } from '../src/lib/twitch.ts';

test('Twitch channel, VOD, clip and old embed links resolve to the same playable source', async () => {
  const cases = [
    ['https://www.twitch.tv/twitchdev', { kind: 'channel', value: 'twitchdev' }],
    ['https://twitch.tv/videos/12345678', { kind: 'video', value: 'v12345678' }],
    [
      'https://player.twitch.tv/?video=v12345678&parent=old.example',
      { kind: 'video', value: 'v12345678' },
    ],
    ['https://clips.twitch.tv/Test-Clip', { kind: 'clip', value: 'Test-Clip' }],
    ['https://www.twitch.tv/twitchdev/clip/Test-Clip', { kind: 'clip', value: 'Test-Clip' }],
  ];
  for (const [source, expected] of cases) {
    assert.deepEqual(twitchSource(source), expected);
    assert.equal((await resolveMedia(source)).provider, 'twitch');
  }
  assert.equal(twitchSource('https://twitch.tv.attacker.example/twitchdev'), null);
  assert.equal(twitchSource('https://twitch.tv/directory'), null);
});

test('page extraction finds HTML video, relative sources, metadata, iframe players and JS streams', () => {
  const base = 'https://example.com/watch/movie';
  const html = `<title>Room movie</title><video><source src="../media/movie.mp4?x=1&amp;y=2" type="video/mp4"></video><iframe src="https://player.twitch.tv/?channel=twitchdev"></iframe>`;
  const page = extractMedia(html, base);
  assert.equal(page.title, 'Room movie');
  assert.equal(page.candidates[0].url, 'https://example.com/media/movie.mp4?x=1&y=2');
  assert.equal(knownMedia(page.candidates[1].url).provider, 'twitch');
  const data = extractMedia(
    `<script type="application/ld+json">{"@type":"VideoObject","contentUrl":"https://cdn.example/film.webm"}</script><meta property="og:video" content="https://youtu.be/dQw4w9WgXcQ"><script>player({file:"https:\/\/cdn.example/live.m3u8?token=abc"})</script>`,
    base,
  );
  assert.ok(data.candidates.some((item) => item.url === 'https://cdn.example/film.webm'));
  assert.ok(data.candidates.some((item) => knownMedia(item.url)?.provider === 'youtube'));
  assert.ok(data.candidates.some((item) => knownMedia(item.url)?.mediaType === 'hls'));
  assert.equal(
    extractMedia(
      '<video src="blob:private"></video><iframe src="javascript:alert(1)"></iframe>',
      base,
    ).candidates.length,
    0,
  );
});

test('page inspection blocks private networks, metadata addresses, embedded credentials and non-web URLs', async () => {
  for (const address of [
    '127.0.0.1',
    '10.0.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '::1',
    '::ffff:127.0.0.1',
    'fe80::1',
    'fc00::1',
    '100.100.100.200',
  ])
    assert.equal(isPublicAddress(address), false, address);
  assert.equal(isPublicAddress('8.8.8.8'), true);
  for (const url of [
    'http://127.0.0.1/page',
    'http://169.254.169.254/latest/meta-data',
    'http://[::1]/watch',
    'http://localhost/watch',
    'file:///etc/passwd',
    'https://user:pass@example.com/watch',
  ])
    await assert.rejects(resolveMedia(url));
});
