import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectedMedia,
  publicResource,
  resolveBrowserMedia,
  validateMedia,
} from '../server/browser-media.js';

const playlist = (text) => ({
  status: 200,
  headers: { 'content-type': 'application/vnd.apple.mpegurl' },
  body: Buffer.from(text),
});

test('browser media detection ignores blobs, fragments and private addresses', () => {
  for (const url of [
    'blob:https://example.com/123',
    'http://127.0.0.1/video.mp4',
    'https://example.com/init.m4s',
    'https://example.com/segment.ts',
  ])
    assert.equal(detectedMedia(url), null);
  assert.equal(
    detectedMedia('https://cdn.example/opaque', 'application/vnd.apple.mpegurl').mediaType,
    'hls',
  );
  assert.equal(detectedMedia('https://cdn.example/opaque', 'video/mp4').mediaType, 'video');
  assert.equal(detectedMedia('https://cdn.example/opaque', 'audio/mpeg').mediaType, 'audio');
  assert.throws(() => publicResource('http://169.254.169.254/video'), /Private/);
});

test('HLS validation checks alternate audio and variants without discarding the master playlist', async () => {
  const root = 'https://cdn.example/master.m3u8';
  const requests = [];
  const fetchResource = async (url) => {
    requests.push(url);
    return playlist(
      url === root
        ? '#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,URI="audio.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=1000\nvideo.m3u8'
        : '#EXTM3U\n#EXTINF:4,\nsegment.ts',
    );
  };
  const candidate = detectedMedia(root);
  assert.deepEqual(await validateMedia(candidate, fetchResource), candidate);
  assert.deepEqual(requests, [
    root,
    'https://cdn.example/video.m3u8',
    'https://cdn.example/audio.m3u8',
  ]);
  await assert.rejects(
    validateMedia(candidate, async () =>
      playlist('#EXTM3U\n#EXT-X-KEY:METHOD=SAMPLE-AES,URI="key"\nsegment.ts'),
    ),
    /encrypted/,
  );
  await assert.rejects(
    validateMedia(candidate, async () =>
      playlist('#EXTM3U\n#EXT-X-SESSION-KEY:METHOD=AES-128,URI="key"\nsegment.ts'),
    ),
    /encrypted/,
  );
  await assert.rejects(
    validateMedia(candidate, async () => playlist('<html>Login</html>')),
    /not valid HLS/,
  );
  await assert.rejects(
    validateMedia(candidate, async () => ({
      status: 302,
      headers: { location: 'http://127.0.0.1/secret' },
      body: Buffer.alloc(0),
    })),
    /Private/,
  );
  await assert.rejects(
    validateMedia(candidate, async () => ({ status: 403, headers: {}, body: Buffer.alloc(0) })),
    /requires a session/,
  );
});

test(
  'a real isolated browser resolves a JavaScript blob player to its public media source',
  { timeout: 30000 },
  async () => {
    const requests = [];
    const source = 'https://fixture.example/watch';
    const html = `<title>JavaScript movie</title><video></video><script>
    const video = document.querySelector('video');
    video.src = URL.createObjectURL(new MediaSource());
    setTimeout(() => fetch('/dynamic/playlist').then(r => r.text()), 100);
    fetch('http://127.0.0.1/private.mp4').catch(() => {});
  </script>`;
    const fetchResource = async (url) => {
      requests.push(url);
      if (url === source)
        return { status: 200, headers: { 'content-type': 'text/html' }, body: Buffer.from(html) };
      if (url === 'https://fixture.example/dynamic/playlist')
        return playlist('#EXTM3U\n#EXTINF:4,\nsegment.ts');
      return { status: 404, headers: {}, body: Buffer.alloc(0) };
    };
    const result = await resolveBrowserMedia(source, { fetchResource });
    assert.equal(result.url, 'https://fixture.example/dynamic/playlist');
    assert.equal(result.mediaType, 'hls');
    assert.equal(result.provider, 'direct');
    assert.equal(result.title, 'JavaScript movie');
    assert.ok(requests.includes(source));
    assert.ok(!requests.some((url) => url.includes('127.0.0.1')));
  },
);

test(
  'failed browser lookups time out, close and release the lookup slot',
  { timeout: 30000 },
  async () => {
    const fetchResource = async () => ({
      status: 200,
      headers: { 'content-type': 'text/html' },
      body: Buffer.from('<title>No player</title>'),
    });
    for (let i = 0; i < 2; i++) {
      await assert.rejects(
        resolveBrowserMedia('https://fixture.example/empty', { fetchResource, timeoutMs: 250 }),
        /No public, unencrypted media/,
      );
    }
  },
);
