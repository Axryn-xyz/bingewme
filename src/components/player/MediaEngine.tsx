import { forwardRef, useEffect } from 'react';
import { useStore } from '../../store';
import { apiUrl } from '../../lib/backend';
export const MediaEngine = forwardRef<
  HTMLVideoElement,
  { stream: MediaStream | null; onEnded: () => void }
>(({ stream, onEnded }, ref) => {
  const { source, volume, rate, set } = useStore();
  useEffect(() => {
    const v = typeof ref === 'object' ? ref?.current : null;
    let dispose: (() => void) | undefined;
    let cancelled = false;
    if (v && /\.m3u8(?:[?#]|$)/i.test(source) && !v.canPlayType('application/vnd.apple.mpegurl')) {
      import('hls.js').then(({ default: Hls }) => {
        if (cancelled || !Hls.isSupported()) return;
        const hls = new Hls({ maxBufferLength: 30, maxMaxBufferLength: 60 });
        hls.loadSource(source);
        hls.attachMedia(v);
        dispose = () => hls.destroy();
      });
    }
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [source, ref]);
  useEffect(() => {
    const v = typeof ref === 'object' ? ref?.current : null;
    if (v) {
      v.volume = volume;
      v.playbackRate = rate;
      if (stream) v.srcObject = stream;
      else v.srcObject = null;
    }
  }, [stream, volume, rate, ref, source]);
  if (!source && !stream) return null;
  const youtube = source.match(/(?:youtu.be\/|youtube.com\/watch\?v=)([\w-]+)/);
  const vimeo = source.match(/vimeo.com\/(\d+)/);
  if (youtube || vimeo)
    return (
      <iframe
        className="video"
        title="Embedded video"
        src={
          youtube
            ? `https://www.youtube.com/embed/${youtube[1]}?enablejsapi=1`
            : `https://player.vimeo.com/video/${vimeo![1]}`
        }
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
      />
    );
  return (
    <video
      ref={ref}
      className="video"
      src={stream ? undefined : source.startsWith('/api/media/') ? apiUrl(source) : source}
      playsInline
      preload="metadata"
      onTimeUpdate={(e) => set({ time: e.currentTarget.currentTime })}
      onLoadedMetadata={(e) => set({ duration: e.currentTarget.duration })}
      onPlay={() => set({ playing: true })}
      onPause={() => set({ playing: false })}
      onEnded={onEnded}
    />
  );
});
