import { useEffect, useRef } from 'react';
import { useStore } from '../../store';
import { YouTubeController, type YouTubeAction } from '../../lib/youtube';
import { vimeoSource } from '../../lib/vimeo';
export function VimeoPlayer({
  source,
  onAction,
  onEnded,
}: {
  source: string;
  onAction: (action: YouTubeAction) => void;
  onEnded: () => void;
}) {
  const iframe = useRef<HTMLIFrameElement>(null);
  const callbacks = useRef({ onAction, onEnded });
  callbacks.current = { onAction, onEnded };
  const spec = vimeoSource(source);
  const url = spec ? new URL(`https://player.vimeo.com/video/${spec.id}`) : null;
  if (url) {
    url.searchParams.set('controls', '0');
    url.searchParams.set('autopause', '0');
    url.searchParams.set('playsinline', '1');
    if (spec?.hash) url.searchParams.set('h', spec.hash);
  }
  useEffect(() => {
    if (!vimeoSource(source)) return;
    let cancelled = false,
      controller: YouTubeController | null = null;
    let dispose: (() => void) | undefined;
    useStore.getState().set({ mediaError: '', needsInteraction: false, needsUnmute: false });
    void import('@vimeo/player')
      .then(async ({ default: Player }) => {
        if (cancelled || !iframe.current) return;
        const player = new Player(iframe.current);
        dispose = () => {
          void player.destroy().catch(() => {});
        };
        await player.ready();
        const cache = {
          time: await player.getCurrentTime(),
          duration: await player.getDuration(),
          rate: await player.getPlaybackRate(),
          paused: await player.getPaused(),
          muted: false,
        };
        if (cancelled) return;
        const error = (failure: Error) => {
          if (!cancelled)
            useStore.getState().set({ mediaError: failure.message || 'Vimeo playback failed.' });
        };
        controller = new YouTubeController(
          source,
          {
            playVideo: () => {
              void player.play().catch((failure: Error) => {
                if (failure.name === 'NotAllowedError') controller?.onAutoplayBlocked(false);
                else error(failure);
              });
            },
            pauseVideo: () => {
              void player.pause().catch(error);
            },
            seekTo: (time) => {
              cache.time = time;
              void player.setCurrentTime(time).catch(error);
            },
            getCurrentTime: () => cache.time,
            getDuration: () => cache.duration,
            getPlaybackRate: () => cache.rate,
            setPlaybackRate: (rate) => {
              void player.setPlaybackRate(rate).catch(() => {
                if (controller) controller.supportsPlaybackRate = false;
                useStore.getState().set({
                  rate: cache.rate,
                  mediaError: 'This Vimeo video does not allow changing playback speed.',
                });
              });
            },
            getPlayerState: () => (cache.paused ? 2 : 1),
            setVolume: (volume) => {
              void player.setVolume(volume / 100).catch(error);
            },
            mute: () => {
              cache.muted = true;
              void player.setMuted(true).catch(error);
            },
            unMute: () => {
              cache.muted = false;
              void player.setMuted(false).catch(error);
            },
            isMuted: () => cache.muted,
            getIframe: () => iframe.current!,
            destroy: () => {},
          },
          {
            state: (state) => {
              if (!cancelled) useStore.getState().set(state);
            },
            action: (action) => callbacks.current.onAction(action),
            ended: () => callbacks.current.onEnded(),
            needsUnmute: () => useStore.getState().needsUnmute,
          },
        );
        player.on('timeupdate', ({ seconds, duration }: { seconds: number; duration: number }) => {
          cache.time = seconds;
          cache.duration = duration;
          controller?.tick();
        });
        player.on('play', () => {
          cache.paused = false;
          controller?.onState(1);
        });
        player.on('pause', () => {
          cache.paused = true;
          controller?.onState(2);
        });
        player.on('seeked', ({ seconds }: { seconds: number }) => {
          cache.time = seconds;
          controller?.onSeek();
        });
        player.on('playbackratechange', ({ playbackRate }: { playbackRate: number }) => {
          cache.rate = playbackRate;
          controller?.onRate(playbackRate);
        });
        player.on('ended', () => controller?.onState(0));
        controller.setVolume(useStore.getState().volume);
        useStore.getState().set({ controller, duration: cache.duration });
      })
      .catch((failure: Error) => {
        if (!cancelled)
          useStore.getState().set({ mediaError: failure.message || 'Vimeo could not load.' });
      });
    return () => {
      cancelled = true;
      if (useStore.getState().controller === controller)
        useStore.getState().set({ controller: null });
      controller?.destroy();
      dispose?.();
    };
  }, [source]);
  if (!url) return null;
  return (
    <iframe
      ref={iframe}
      className="video"
      src={url.href}
      title="Vimeo video"
      allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
      allowFullScreen
    />
  );
}
