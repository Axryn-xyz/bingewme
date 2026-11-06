import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  createTheme,
  contrastRatio,
  DEFAULT_ACCENT,
  applyTheme,
  readAccent,
} from '../src/lib/theme.ts';

test('pink, dark, light, and saturated accents produce readable coordinated palettes', () => {
  for (const accent of [
    '#ff0055',
    '#ff99cc',
    '#7a00ff',
    '#000000',
    '#ffffff',
    '#00ff66',
    '#000080',
    DEFAULT_ACCENT,
  ]) {
    const theme = createTheme(accent);
    assert.equal(theme['--accent'], accent);
    assert.ok(
      contrastRatio(theme['--on-accent'], accent) >= 4.5,
      `${accent}: button label contrast`,
    );
    for (const foreground of [
      '--accent-text',
      '--text-faint',
      '--text-muted',
      '--text-secondary',
      '--text-primary',
    ]) {
      for (const background of [
        '--surface-base',
        '--surface-panel',
        '--surface-raised',
        '--surface-active',
      ]) {
        assert.ok(
          contrastRatio(theme[foreground], theme[background]) >= 4.5,
          `${accent}: ${foreground} against ${background}`,
        );
      }
    }
  }
  assert.notEqual(
    createTheme('#ff0055')['--surface-panel'],
    createTheme(DEFAULT_ACCENT)['--surface-panel'],
  );
  assert.equal(createTheme('bad')['--accent'], DEFAULT_ACCENT);
});

test('theme preferences persist, restore, and still apply if storage is blocked', () => {
  const saved = { document: globalThis.document, localStorage: globalThis.localStorage };
  const variables = new Map();
  const preferences = new Map();
  globalThis.document = {
    documentElement: { style: { setProperty: (key, value) => variables.set(key, value) } },
    querySelector: () => null,
  };
  globalThis.localStorage = {
    getItem: (key) => preferences.get(key) || null,
    setItem: (key, value) => preferences.set(key, value),
  };
  try {
    applyTheme('#ff0055', true);
    assert.equal(readAccent(), '#ff0055');
    assert.equal(variables.get('--surface-panel'), createTheme('#ff0055')['--surface-panel']);
    globalThis.localStorage = {
      getItem: () => {
        throw Error('blocked');
      },
      setItem: () => {
        throw Error('blocked');
      },
    };
    assert.equal(readAccent(), DEFAULT_ACCENT);
    assert.doesNotThrow(() => applyTheme('#7a00ff', true));
  } finally {
    globalThis.document = saved.document;
    globalThis.localStorage = saved.localStorage;
  }
});

test('room and lobby styles use palette tokens instead of fixed green colors', () => {
  for (const file of ['src/styles/brutalism.css', 'src/styles/lobby.css']) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), /#[\da-f]{3,8}\b/i);
  }
});
