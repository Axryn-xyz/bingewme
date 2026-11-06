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
  return /^[a-zA-Z0-9][a-zA-Z0-9_-]{2,79}$/.test(value) ? value.toLowerCase() : null;
}

export function createRoomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
