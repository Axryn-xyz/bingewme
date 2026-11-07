export function vimeoSource(source: string): { id: string; hash?: string } | null {
  try {
    const url = new URL(source);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (!['vimeo.com', 'player.vimeo.com'].includes(host)) return null;
    const parts = url.pathname.split('/').filter(Boolean);
    const id = parts.find((part) => /^\d+$/.test(part));
    if (!id) return null;
    const hash = url.searchParams.get('h') || parts[parts.indexOf(id) + 1];
    return { id, ...(hash && /^[a-z0-9]+$/i.test(hash) ? { hash } : {}) };
  } catch {
    return null;
  }
}
