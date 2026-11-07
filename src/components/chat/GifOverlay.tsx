import { useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { apiUrl } from '../../lib/backend';
export function GifOverlay({ socket }: { socket: Socket | null }) {
  const [overlays, setOverlays] = useState<{ id: string; url: string; name: string }[]>([]);
  useEffect(() => {
    if (!socket) return;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const show = (overlay: { id: string; url: string; name: string }) => {
      setOverlays((values) => [...values.slice(-2), overlay]);
      const timer = setTimeout(() => {
        timers.delete(timer);
        setOverlays((values) => values.filter((value) => value.id !== overlay.id));
      }, 4000);
      timers.add(timer);
    };
    socket.on('gif-overlay', show);
    return () => {
      socket.off('gif-overlay', show);
      timers.forEach(clearTimeout);
    };
  }, [socket]);
  return (
    <div className="gif-overlays" aria-hidden="true">
      {overlays.map((overlay) => (
        <img
          className="gif-overlay"
          key={overlay.id}
          src={overlay.url.startsWith('/') ? apiUrl(overlay.url) : overlay.url}
          alt=""
        />
      ))}
    </div>
  );
}
