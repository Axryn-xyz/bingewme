import { useEffect, useRef } from 'react';
import { useStore } from '../../store';
import { loadYouTubeAPI, YouTubeController, type YouTubeAction } from '../../lib/youtube';

export function YouTubePlayer({
  source,
  id,
  onAction,
  onEnded,
}: {
  source: string;
  id: string;
  onAction: (action: YouTubeAction) => void;
  onEnded: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onAction, onEnded });
  callbacks.current = { onAction, onEnded };
  useEffect(() => {
    let cancelled = false;
    let controller: YouTubeController | null = null;
    let interval: ReturnType<typeof setInterval> | undefined;
    let destroyPlayer: (() => void) | undefined;
    useStore.getState().set({ mediaError: '', needsUnmute: false, needsInteraction: false });
    loadYouTubeAPI()
      .then((api) => {
        if (cancelled || !host.current) return;
        const mount = document.createElement('div');
        host.current.appendChild(mount);
        const player = new api.Player(mount, {
          videoId: id,
          width: '100%',
          height: '100%',
          playerVars: {
            enablejsapi: 1,
            origin: location.origin,
            playsinline: 1,
            controls: 0,
            disablekb: 1,
            fs: 0,
            autoplay: 0,
          },
          events: {
            onReady: ({ target }) => {
              if (cancelled) return;
              const iframe = target.getIframe();
              iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
              iframe.referrerPolicy = 'strict-origin-when-cross-origin';
              iframe.title = 'YouTube video';
              controller = new YouTubeController(source, target, {
                state: (state) => {
                  if (!cancelled) useStore.getState().set(state);
                },
                action: (action) => callbacks.current.onAction(action),
                ended: () => callbacks.current.onEnded(),
                needsUnmute: () => useStore.getState().needsUnmute,
              });
              const state = useStore.getState();
              controller.setVolume(state.volume);
              controller.playbackRate = state.rate;
              state.set({ controller, duration: controller.duration });
              interval = setInterval(() => controller?.tick(), 250);
            },
            onStateChange: (event) => controller?.onState(event.data),
            onPlaybackRateChange: (event) => controller?.onRate(event.data),
            onAutoplayBlocked: () => controller?.onAutoplayBlocked(),
            onError: (event) => {
              if (!cancelled)
                useStore.getState().set({
                  mediaError: [101, 150].includes(event.data)
                    ? 'The owner of this video has disabled embedded playback. Try another YouTube video.'
                    : event.data === 153
                      ? 'YouTube could not verify this site. Check referrer settings or try another video.'
                      : 'This YouTube video is unavailable or could not be played.',
                });
            },
          },
        });
        destroyPlayer = () => player.destroy();
      })
      .catch((error) => {
        if (!cancelled) useStore.getState().set({ mediaError: error.message });
      });
    return () => {
      cancelled = true;
      clearInterval(interval);
      if (useStore.getState().controller === controller)
        useStore.getState().set({ controller: null });
      if (controller) controller.destroy();
      else destroyPlayer?.();
      host.current?.replaceChildren();
    };
  }, [source, id]);
  return <div ref={host} className="video youtube-player" />;
}
