// Empty uses the same origin: the local Vite proxy or the combined Node service.
export const ROOM_SERVER_URL = import.meta.env.VITE_ROOM_SERVER_URL?.trim().replace(/\/+$/, '');

export function apiUrl(path: string): string {
  return `${ROOM_SERVER_URL || ''}${path}`;
}
