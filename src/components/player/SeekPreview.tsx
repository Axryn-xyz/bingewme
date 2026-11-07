import { useEffect, useRef, useState } from 'react';
import { apiUrl } from '../../lib/backend';
export function SeekPreview({
  source,
  time,
  fraction,
}: {
  source: string;
  time: number;
  fraction: number;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  const target = useRef(time);
  target.current = time;
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    const seek = () => {
      if (element.readyState >= 1) element.currentTime = target.current;
    };
    const timer = setTimeout(seek, 140);
    element.addEventListener('loadedmetadata', seek);
    return () => {
      clearTimeout(timer);
      element.removeEventListener('loadedmetadata', seek);
    };
  }, [time]);
  return (
    <div
      className="seek-preview"
      style={{ left: `${Math.max(12, Math.min(88, fraction * 100))}%` }}
    >
      {!failed && (
        <video
          ref={video}
          src={source.startsWith('/api/media/') ? apiUrl(source) : source}
          muted
          playsInline
          preload="metadata"
          onError={() => setFailed(true)}
        />
      )}
      <span>
        {Math.floor(time / 60)}:{String(Math.floor(time % 60)).padStart(2, '0')}
        {failed ? ' · preview unavailable' : ''}
      </span>
    </div>
  );
}
