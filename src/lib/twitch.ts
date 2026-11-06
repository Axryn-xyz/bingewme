export type TwitchSource =
  | { kind: 'channel'; value: string }
  | { kind: 'video'; value: string }
  | { kind: 'clip'; value: string };
export function twitchSource(source: string): TwitchSource | null {
  try {
    const url = new URL(source),
      host = url.hostname.replace(/^(www\.|m\.)/, '').toLowerCase(),
      parts = url.pathname.split('/').filter(Boolean);
    if (host === 'clips.twitch.tv') {
      const slug = url.searchParams.get('clip') || parts[0];
      return slug && /^[\w-]+$/.test(slug) ? { kind: 'clip', value: slug } : null;
    }
    if (!['twitch.tv', 'player.twitch.tv'].includes(host)) return null;
    if (parts[1] === 'clip' && parts[2]) return { kind: 'clip', value: parts[2] };
    const video =
      host === 'player.twitch.tv'
        ? url.searchParams.get('video')
        : parts[0] === 'videos'
          ? parts[1]
          : null;
    if (video && /^v?\d+$/.test(video))
      return { kind: 'video', value: 'v' + video.replace(/^v/, '') };
    const channel =
      host === 'player.twitch.tv'
        ? url.searchParams.get('channel')
        : parts.length === 1
          ? parts[0]
          : null;
    return channel &&
      /^[\w]{1,25}$/.test(channel) &&
      !['directory', 'search', 'downloads', 'login', 'settings'].includes(channel)
      ? { kind: 'channel', value: channel }
      : null;
  } catch {
    return null;
  }
}
interface TwitchSDKPlayer {
  play(): void;
  pause(): void;
  seek(time: number): void;
  getCurrentTime(): number;
  getDuration(): number;
  isPaused(): boolean;
  setVolume(volume: number): void;
  setMuted(muted: boolean): void;
  getMuted(): boolean;
  addEventListener(event: string, callback: () => void): void;
  removeEventListener?(event: string, callback: () => void): void;
}
interface TwitchNamespace {
  Player: {
    new (id: string, options: Record<string, unknown>): TwitchSDKPlayer;
    READY: string;
    PLAYING: string;
    PAUSE: string;
    ENDED: string;
    PLAYBACK_BLOCKED: string;
    SEEK: string;
    OFFLINE: string;
    ONLINE: string;
  };
}
declare global {
  interface Window {
    Twitch?: TwitchNamespace;
  }
}
let loading: Promise<TwitchNamespace> | null = null;
export function loadTwitch(): Promise<TwitchNamespace> {
  if (window.Twitch?.Player) return Promise.resolve(window.Twitch);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://player.twitch.tv/js/embed/v1.js';
    script.async = true;
    const fail = () => {
      clearTimeout(timer);
      script.remove();
      loading = null;
      reject(
        new Error('The Twitch player could not load. Check your connection or content blocker.'),
      );
    };
    const timer = setTimeout(fail, 20000);
    script.onerror = fail;
    script.onload = () => {
      clearTimeout(timer);
      if (window.Twitch?.Player) resolve(window.Twitch);
      else fail();
    };
    document.head.appendChild(script);
  });
  return loading;
}
