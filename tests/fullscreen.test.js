import test from 'node:test';
import assert from 'node:assert/strict';
import { togglePlayerFullscreen } from '../src/lib/fullscreen.ts';

test('fullscreen uses the complete player, supports exit and native Safari video fullscreen', async () => {
  const calls = [];
  const container = { requestFullscreen: async () => calls.push('player') };
  await togglePlayerFullscreen(container, null, { fullscreenEnabled: true });
  await togglePlayerFullscreen(container, null, {
    fullscreenElement: {},
    exitFullscreen: async () => calls.push('exit'),
  });
  const safari = {
    webkitEnterFullscreen: () => calls.push('safari'),
    webkitSupportsFullscreen: true,
  };
  await togglePlayerFullscreen(container, safari, { fullscreenEnabled: false });
  await togglePlayerFullscreen(
    null,
    { webkitDisplayingFullscreen: true, webkitExitFullscreen: () => calls.push('safari-exit') },
    {},
  );
  assert.deepEqual(calls, ['player', 'exit', 'safari', 'safari-exit']);
  assert.throws(() => togglePlayerFullscreen(null, null, {}), /unavailable/);
  await assert.rejects(
    togglePlayerFullscreen(
      {
        requestFullscreen: async () => {
          throw new Error('Denied');
        },
      },
      null,
      { fullscreenEnabled: true },
    ),
    /Denied/,
  );
});
