import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isEmoji,
  DEFAULT_FAVORITES,
  readFavoriteEmojis,
  saveFavoriteEmojis,
  toggleFavoriteEmoji,
} from '../src/lib/emoji-favorites.ts';

test('emoji favorites preserve complex emoji, toggle and put new quick reactions first', () => {
  for (const emoji of ['🇺🇸', '👨🏿‍🤝‍👨🏻', '👩🏽‍💻', '1️⃣', '❤️']) assert.equal(isEmoji(emoji), true);
  for (const value of ['hello', '🔥😂', '', '🔥 text', null]) assert.equal(isEmoji(value), false);
  const values = toggleFavoriteEmoji(DEFAULT_FAVORITES, '🍿');
  assert.equal(values[0], '🍿');
  assert.deepEqual(toggleFavoriteEmoji(values, '🍿'), DEFAULT_FAVORITES);
  assert.deepEqual(toggleFavoriteEmoji(values, 'not an emoji'), values);
});

test('favorites restore after reload, preserve an empty list and tolerate blocked or corrupt storage', () => {
  let saved = null;
  const storage = {
    getItem: () => saved,
    setItem: (_, value) => {
      saved = value;
    },
  };
  assert.deepEqual(readFavoriteEmojis(storage), DEFAULT_FAVORITES);
  saveFavoriteEmojis(['🍿', '👩🏽‍💻', '🍿', 'invalid'], storage);
  assert.deepEqual(readFavoriteEmojis(storage), ['🍿', '👩🏽‍💻']);
  saveFavoriteEmojis([], storage);
  assert.deepEqual(readFavoriteEmojis(storage), []);
  saved = '{invalid';
  assert.deepEqual(readFavoriteEmojis(storage), DEFAULT_FAVORITES);
  const blocked = {
    getItem() {
      throw new Error('Blocked');
    },
    setItem() {
      throw new Error('Blocked');
    },
  };
  assert.deepEqual(readFavoriteEmojis(blocked), DEFAULT_FAVORITES);
  assert.doesNotThrow(() => saveFavoriteEmojis(['🍿'], blocked));
});
