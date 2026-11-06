export const DEFAULT_FAVORITES = ['🔥', '😂', '❤️', '😮', '👏'];
const KEY = 'bingewme:favorite-emojis';
const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
type StorageAccess = Pick<Storage, 'getItem' | 'setItem'>;

export function isEmoji(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 32 &&
    /[\p{Extended_Pictographic}\p{Regional_Indicator}\u20e3]/u.test(value) &&
    [...segmenter.segment(value)].length === 1
  );
}
function normalize(values: unknown[]): string[] {
  return [...new Set(values.filter(isEmoji))].slice(0, 24);
}
export function readFavoriteEmojis(storage?: StorageAccess): string[] {
  try {
    const raw = (storage ?? globalThis.localStorage).getItem(KEY);
    if (raw !== null) {
      const values: unknown = JSON.parse(raw);
      if (Array.isArray(values)) return normalize(values);
    }
  } catch {
    /* Private browsing and invalid saved data fall back to starter favorites. */
  }
  return [...DEFAULT_FAVORITES];
}
export function saveFavoriteEmojis(values: string[], storage?: StorageAccess) {
  try {
    (storage ?? globalThis.localStorage).setItem(KEY, JSON.stringify(normalize(values)));
  } catch {
    /* Favorites remain usable for this visit when storage is unavailable. */
  }
}
export function toggleFavoriteEmoji(values: string[], emoji: string): string[] {
  if (!isEmoji(emoji)) return values;
  return values.includes(emoji)
    ? values.filter((value) => value !== emoji)
    : normalize([emoji, ...values]);
}
