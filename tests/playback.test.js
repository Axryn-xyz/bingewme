import test from 'node:test';
import assert from 'node:assert/strict';
import { applyPlayback } from '../src/lib/playback.ts';

test('late media readiness applies the host timestamp and elapsed playback', async () => {
  let plays = 0,
    pauses = 0;
  const video = {
    currentTime: 0,
    duration: 120,
    srcObject: null,
    play: async () => {
      plays++;
    },
    pause: () => pauses++,
    playbackRate: 1,
  };
  await applyPlayback(video, { time: 45, playing: true, rate: 1.5 }, 1000, 3000);
  assert.equal(video.currentTime, 48);
  assert.equal(video.playbackRate, 1.5);
  assert.equal(plays, 1);
  await applyPlayback(video, { time: 30, playing: false, rate: 1 }, 3000, 9000);
  assert.equal(video.currentTime, 30);
  assert.equal(pauses, 1);
});

test('autoplay rejection remains actionable; live streams do not seek', async () => {
  const video = {
    currentTime: 8,
    duration: Infinity,
    srcObject: {},
    play: async () => {
      throw new Error('NotAllowedError');
    },
    pause: () => {},
    playbackRate: 1,
  };
  await assert.rejects(
    applyPlayback(video, { time: 40, playing: true, rate: 1 }, 0, 0),
    /NotAllowed/,
  );
  assert.equal(video.currentTime, 8);
});

test('Twitch live players receive play state without unsupported seeking', async () => {
  const video = {
    currentTime: 0,
    duration: 0,
    isLive: true,
    srcObject: null,
    playbackRate: 1,
    play: async () => {},
    pause: () => {},
  };
  await applyPlayback(video, { time: 100, playing: true, rate: 1 }, 0, 10000);
  assert.equal(video.currentTime, 0);
});
