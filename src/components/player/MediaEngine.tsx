import { forwardRef, useEffect } from 'react';
import { useStore } from '../../store';
import { apiUrl } from '../../lib/backend';
import { YouTubePlayer } from './YouTubePlayer';
import { youtubeId, type YouTubeAction } from '../../lib/youtube';
import { twitchSource } from '../../lib/twitch';
import { TwitchPlayer } from './TwitchPlayer';
export const MediaEngine = forwardRef<
  HTMLVideoElement,
  {
    stream: MediaStream | null;
    muted?: boolean;
    onEnded: () => void;
    onAction: (action: YouTubeAction) => void;
  }
>(({ stream, muted = false, onEnded, onAction }, ref) => {
  const { source, volume, rate, set, controller, queue, mediaId } = useStore();
  const mediaType = queue.find((item) => item.id === mediaId)?.mediaType;
  useEffect(() => {
    if (controller?.source === source) {
      controller.setVolume(volume);
      controller.playbackRate = rate;
    }
  }, [controller, volume, rate, source]);
  useEffect(() => {
    const v = typeof ref === 'object' ? ref?.current : null;
    let dispose: (() => void) | undefined;
    let cancelled = false;
    if (
      v &&
      (mediaType === 'hls' || /\.m3u8(?:[?#]|$)/i.test(source)) &&
      !v.canPlayType('application/vnd.apple.mpegurl')
    ) {
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
  }, [source, ref, mediaType]);
  useEffect(() => {
    const v = typeof ref === 'object' ? ref?.current : null;
    if (v) {
      v.volume = volume;
      v.muted = muted;
      v.playbackRate = rate;
    }
  }, [stream, volume, rate, ref, source, muted]);
  useEffect(() => {
    const v = typeof ref === 'object' ? ref?.current : null;
    let cancelled = false;
    if (v) {
      if (stream) {
        v.srcObject = stream;
        const play = () => {
          void v
            .play()
            .then(() => {
              if (!cancelled) set({ needsInteraction: false });
            })
            .catch(() => {
              if (!cancelled) set({ needsInteraction: true });
            });
        };
        v.addEventListener('loadedmetadata', play);
        play();
        return () => {
          cancelled = true;
          v.removeEventListener('loadedmetadata', play);
          if (v.srcObject === stream) v.srcObject = null;
        };
      } else v.srcObject = null;
    }
  }, [stream, ref, source, set]);
  if (!source && !stream) return null;
  const youtube = !stream && youtubeId(source);
  if (youtube)
    return <YouTubePlayer source={source} id={youtube} onEnded={onEnded} onAction={onAction} />;
  if (!stream && twitchSource(source))
    return <TwitchPlayer source={source} onAction={onAction} onEnded={onEnded} />;
  const vimeo = source.match(/vimeo.com\/(\d+)/);
  if (!stream && vimeo)
    return (
      <iframe
        className="video"
        title="Embedded video"
        src={`https://player.vimeo.com/video/${vimeo[1]}`}
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
      />
    );
  return (
    <video
      ref={ref}
      className="video"
      src={
        stream ? undefined : source.startsWith('/api/media/') ? apiUrl(source) : source || undefined
      }
      muted={muted}
      playsInline
      preload="metadata"
      onTimeUpdate={(e) => set({ time: e.currentTarget.currentTime })}
      onLoadedMetadata={(e) => set({ duration: e.currentTarget.duration })}
      onPlay={() => set({ playing: true })}
      onPause={() => set({ playing: false })}
      onEnded={onEnded}
      onError={() =>
        set({
          mediaError:
            'This video could not be loaded or decoded by your browser. Try a supported MP4/WebM file, a direct media link, or screen share.',
        })
      }
    />
  );
});
