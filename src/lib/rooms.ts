/** Keep room codes canonical so links and pasted codes resolve to the same room. */
export function parseRoomCode(input: string): string | null {
  let value = input.trim();
  if (/^https?:\/\//i.test(value)) {
    try {
      value = new URL(value).pathname;
    } catch {
      return null;
    }
  }
  value = value.replace(/^\/?party\//, '').replace(/\/$/, '');
  if (/^[\d\s-]+$/.test(value)) {
    const digits = value.replace(/[\s-]/g, '');
    return /^\d{5}$/.test(digits) ? digits : null;
  }
  return /^[a-zA-Z0-9][a-zA-Z0-9_-]{2,79}$/.test(value) ? value.toLowerCase() : null;
}
