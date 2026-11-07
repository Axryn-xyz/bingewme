export function savedName(): string {
  try {
    return sessionStorage.getItem('party-name') || '';
  } catch {
    return '';
  }
}
export function saveName(name: string): string {
  const clean = name.trim().slice(0, 32) || 'Guest';
  try {
    sessionStorage.setItem('party-name', clean);
  } catch {
    /* The room still works without storage. */
  }
  return clean;
}
export function prepareEntry(room: string, name: string): void {
  const clean = saveName(name);
  try {
    sessionStorage.setItem('party-entry', JSON.stringify({ room, name: clean }));
  } catch {
    /* The invite name form will be shown instead. */
  }
}
export function preparedName(room: string | null): string | null {
  try {
    const entry = JSON.parse(sessionStorage.getItem('party-entry') || 'null');
    return room && entry?.room === room && typeof entry.name === 'string' ? entry.name : null;
  } catch {
    return null;
  }
}
export function clearEntry(): void {
  try {
    sessionStorage.removeItem('party-entry');
  } catch {
    /* Optional storage. */
  }
}
let memoryIdentity = '';
export function browserIdentity(): string {
  if (memoryIdentity) return memoryIdentity;
  try {
    memoryIdentity = localStorage.getItem('bingewme:identity') || '';
  } catch {
    /* Use this session's identity. */
  }
  if (!/^[a-f0-9-]{32,128}$/i.test(memoryIdentity)) memoryIdentity = crypto.randomUUID();
  rememberIdentity(memoryIdentity);
  return memoryIdentity;
}
export function rememberIdentity(token: string) {
  memoryIdentity = token;
  try {
    localStorage.setItem('bingewme:identity', token);
  } catch {
    /* Memory is sufficient for this visit. */
  }
}
