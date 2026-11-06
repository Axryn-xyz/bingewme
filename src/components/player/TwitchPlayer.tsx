import { useEffect, useId, useRef } from 'react';
import { useStore } from '../../store';
import { loadTwitch, twitchSource } from '../../lib/twitch';
import { YouTubeController, type YouTubeAction } from '../../lib/youtube';
export function TwitchPlayer({
  source,
  onAction,
  onEnded,
}: {
  source: string;
  onAction: (action: YouTubeAction) => void;
  onEnded: () => void;
}) {
  const host = useRef<HTMLDivElement>(null),
    id = 'twitch-' + useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const callbacks = useRef({ onAction, onEnded });
  callbacks.current = { onAction, onEnded };
  const spec = twitchSource(source);
  useEffect(() => {
    if (!spec || spec.kind === 'clip') return;
    let cancelled = false,
      controller: YouTubeController | null = null,
      interval: ReturnType<typeof setInterval> | undefined,
      cleanupSDK: (() => void) | undefined;
    useStore.getState().set({ mediaError: '', needsUnmute: false, needsInteraction: false });
    loadTwitch()
      .then((api) => {
        if (cancelled || !host.current) return;
        const mount = document.createElement('div');
        mount.id = id;
        mount.style.width = '100%';
        mount.style.height = '100%';
        host.current.appendChild(mount);
        const sdk = new api.Player(id, {
          width: '100%',
          height: '100%',
          parent: [location.hostname],
          autoplay: false,
          muted: true,
          ...{ [spec.kind === 'video' ? 'video' : 'channel']: spec.value },
        });
        const listeners: [string, () => void][] = [];
        const on = (event: string, callback: () => void) => {
          const guarded = () => {
            if (!cancelled) callback();
          };
          listeners.push([event, guarded]);
          sdk.addEventListener(event, guarded);
        };
        cleanupSDK = () => {
          for (const [event, callback] of listeners) sdk.removeEventListener?.(event, callback);
          sdk.pause();
        };
        on(api.Player.READY, () => {
          const iframe = host.current?.querySelector('iframe');
          if (iframe) {
            iframe.allow = 'autoplay; fullscreen; picture-in-picture';
            iframe.title = 'Twitch player';
          }
          controller = new YouTubeController(
            source,
            {
              playVideo: () => sdk.play(),
              pauseVideo: () => sdk.pause(),
              seekTo: (time) => {
                if (spec.kind === 'video') sdk.seek(time);
              },
              getCurrentTime: () => (spec.kind === 'video' ? sdk.getCurrentTime() : 0),
              getDuration: () => (spec.kind === 'video' ? sdk.getDuration() : 0),
              getPlaybackRate: () => 1,
              setPlaybackRate: () => {},
              getPlayerState: () => (sdk.isPaused() ? 2 : 1),
              setVolume: (volume) => sdk.setVolume(volume / 100),
              mute: () => sdk.setMuted(true),
              unMute: () => sdk.setMuted(false),
              isMuted: () => sdk.getMuted(),
              getIframe: () => host.current!.querySelector('iframe')!,
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
          controller.isLive = spec.kind === 'channel';
          controller.supportsPlaybackRate = false;
          // Cross-origin playback with sound can be blocked even after a click in our toolbar.
          // Keep the initial play muted; our Enable sound action supplies the local gesture.
          useStore.getState().set({ needsUnmute: useStore.getState().volume > 0 });
          controller.setVolume(useStore.getState().volume);
          useStore.getState().set({ controller, rate: 1, duration: controller.duration });
          interval = setInterval(() => controller?.tick(), 250);
          if (useStore.getState().playing)
            controller.play().catch(() => useStore.getState().set({ needsInteraction: true }));
        });
        on(api.Player.PLAYING, () => {
          useStore.getState().set({ mediaError: '' });
          controller?.onState(1);
        });
        on(api.Player.PAUSE, () => controller?.onState(2));
        on(api.Player.ENDED, () => {
          if (spec.kind === 'video') controller?.onState(0);
        });
        on(api.Player.PLAYBACK_BLOCKED, () => controller?.onAutoplayBlocked());
        on(api.Player.SEEK, () => controller?.onSeek());
        on(api.Player.OFFLINE, () =>
          useStore.getState().set({ mediaError: 'This Twitch channel is offline.' }),
        );
        on(api.Player.ONLINE, () => {
          useStore.getState().set({ mediaError: '' });
          if (useStore.getState().playing)
            controller?.play().catch(() => useStore.getState().set({ needsInteraction: true }));
        });
      })
      .catch((error) => {
        if (!cancelled) useStore.getState().set({ mediaError: error.message });
      });
    return () => {
      cancelled = true;
      clearInterval(interval);
      cleanupSDK?.();
      controller?.destroy();
      if (useStore.getState().controller === controller)
        useStore.getState().set({ controller: null });
      host.current?.replaceChildren();
    };
  }, [source, id]);
  if (spec?.kind === 'clip') {
    const url = new URL('https://clips.twitch.tv/embed');
    url.searchParams.set('clip', spec.value);
    url.searchParams.set('parent', location.hostname);
    url.searchParams.set('autoplay', 'false');
    return (
      <iframe
        className="video twitch-player"
        src={url.href}
        title="Twitch clip"
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
      />
    );
  }
  return <div ref={host} className="video twitch-player" />;
}
