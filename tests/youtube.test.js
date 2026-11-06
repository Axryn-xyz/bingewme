import test from 'node:test';
import assert from 'node:assert/strict';
import { YouTubeController, youtubeId } from '../src/lib/youtube.ts';
import { applyPlayback } from '../src/lib/playback.ts';

function fixture() {
  const actions = [],
    calls = [],
    status = {};
  const player = {
    time: 0,
    state: 2,
    rate: 1,
    muted: false,
    playVideo() {
      calls.push(['play']);
    },
    pauseVideo() {
      calls.push(['pause']);
    },
    seekTo(time) {
      this.time = time;
      calls.push(['seek', time]);
    },
    getCurrentTime() {
      return this.time;
    },
    getDuration() {
      return 300;
    },
    getPlaybackRate() {
      return this.rate;
    },
    setPlaybackRate(rate) {
      this.rate = rate;
      calls.push(['rate', rate]);
    },
    getPlayerState() {
      return this.state;
    },
    setVolume(volume) {
      calls.push(['volume', volume]);
    },
    mute() {
      this.muted = true;
    },
    unMute() {
      this.muted = false;
    },
    isMuted() {
      return this.muted;
    },
    getIframe() {
      return {
        requestFullscreen: async () => {
          calls.push(['fullscreen']);
        },
      };
    },
    destroy() {
      calls.push(['destroy']);
    },
  };
  const controller = new YouTubeController('https://youtu.be/dQw4w9WgXcQ', player, {
    state: (update) => Object.assign(status, update),
    action: (action) => actions.push(action),
    ended: () => calls.push(['ended']),
    needsUnmute: () => !!status.needsUnmute,
  });
  return { controller, player, actions, calls, status };
}

test('YouTube links recognize watch, short, embed, live, mobile and reordered parameters', () => {
  for (const source of [
    'https://youtu.be/dQw4w9WgXcQ?si=abc',
    'https://www.youtube.com/watch?feature=shared&v=dQw4w9WgXcQ',
    'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://youtube.com/shorts/dQw4w9WgXcQ',
    'https://youtube.com/live/dQw4w9WgXcQ',
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
  ])
    assert.equal(youtubeId(source), 'dQw4w9WgXcQ');
  for (const source of [
    'https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ',
    'https://example.com/?v=dQw4w9WgXcQ',
    'https://youtube.com/watch?v=bad',
    'invalid',
  ])
    assert.equal(youtubeId(source), null);
});

test('room snapshots operate the YouTube API and do not echo remote commands', async () => {
  const f = fixture();
  try {
    f.player.getDuration = () => 0;
    const pending = applyPlayback(f.controller, { time: 40, rate: 1.5, playing: true }, 1000, 3000);
    assert.deepEqual(f.calls.slice(0, 3), [['rate', 1.5], ['seek', 43], ['play']]);
    f.player.state = 1;
    f.controller.onState(1);
    f.controller.onRate(1.5);
    await pending;
    assert.equal(f.actions.length, 0);
    await applyPlayback(f.controller, { time: 12, rate: 1, playing: false }, 3000, 3000);
    assert.ok(f.calls.some(([method]) => method === 'pause'));
    f.player.state = 2;
    f.controller.onState(2);
    f.controller.onRate(1);
    assert.equal(f.player.time, 12);
    assert.equal(f.actions.length, 0);
  } finally {
    f.controller.destroy();
  }
});

test('YouTube native controls publish play, pause, rate and seek changes', () => {
  const f = fixture();
  try {
    f.player.state = 1;
    f.controller.onState(1);
    assert.equal(f.actions.at(-1).playing, true);
    f.player.state = 2;
    f.controller.onState(2);
    assert.equal(f.actions.at(-1).playing, false);
    f.controller.onRate(1.5);
    assert.equal(f.actions.at(-1).rate, 1.5);
    f.player.state = 1;
    f.controller.tick(0);
    f.player.time = 80;
    f.controller.tick(250);
    assert.equal(f.actions.at(-1).time, 80);
    const count = f.actions.length;
    f.controller.currentTime = 30;
    f.controller.tick(performance.now());
    assert.equal(f.actions.length, count);
  } finally {
    f.controller.destroy();
  }
});

test('blocked audible autoplay retries muted and exposes an explicit sound action', async () => {
  const f = fixture();
  try {
    const pending = f.controller.play();
    f.controller.onAutoplayBlocked();
    assert.equal(f.player.muted, true);
    assert.equal(f.status.needsUnmute, true);
    assert.equal(f.calls.filter(([method]) => method === 'play').length, 2);
    f.player.state = 1;
    f.controller.onState(1);
    await pending;
    assert.equal(f.actions.length, 0);
    await f.controller.enableAudio();
    assert.equal(f.player.muted, false);
    assert.equal(f.status.needsUnmute, false);
  } finally {
    f.controller.destroy();
  }
});

test('audio-first playback asks for interaction without silently muting or pausing the room', async () => {
  const f = fixture();
  try {
    const pending = f.controller.play();
    const rejected = assert.rejects(pending, /Tap to allow/);
    f.controller.onAutoplayBlocked(false);
    await rejected;
    f.controller.onState(2);
    assert.equal(f.player.muted, false);
    assert.equal(f.calls.filter(([method]) => method === 'play').length, 1);
    assert.equal(f.status.needsInteraction, true);
    assert.equal(f.actions.length, 0);
    const retry = f.controller.enableAudio();
    f.player.state = 1;
    f.controller.onState(1);
    await retry;
    assert.equal(f.status.needsInteraction, false);
    assert.equal(f.player.muted, false);
  } finally {
    f.controller.destroy();
  }
});

test('even-muted autoplay blocks report a local interaction requirement without pausing the room', async () => {
  const f = fixture();
  try {
    f.player.muted = true;
    const pending = f.controller.play();
    const rejected = assert.rejects(pending, /Tap to allow/);
    f.controller.onAutoplayBlocked();
    await rejected;
    f.controller.onState(2);
    assert.equal(f.status.needsInteraction, true);
    assert.equal(f.actions.length, 0);
    const retry = f.controller.enableAudio();
    f.player.state = 1;
    f.controller.onState(1);
    await retry;
    assert.equal(f.status.needsInteraction, false);
    assert.equal(f.player.muted, false);
  } finally {
    f.controller.destroy();
  }
});
