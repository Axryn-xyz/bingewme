import type { PlaybackTarget } from './playback';

export function youtubeId(source: string): string | null {
  try {
    const url = new URL(source);
    const host = url.hostname.toLowerCase().replace(/^(www\.|m\.|music\.)/, '');
    let id: string | null = null;
    if (host === 'youtu.be') id = url.pathname.split('/')[1];
    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      const parts = url.pathname.split('/');
      id =
        url.pathname === '/watch'
          ? url.searchParams.get('v')
          : ['embed', 'shorts', 'live'].includes(parts[1])
            ? parts[2]
            : null;
    }
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

export interface YouTubeAPIPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(time: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlaybackRate(): number;
  setPlaybackRate(rate: number): void;
  getPlayerState(): number;
  setVolume(volume: number): void;
  mute(): void;
  unMute(): void;
  isMuted(): boolean;
  getIframe(): HTMLIFrameElement;
  destroy(): void;
}
export type YouTubeAction = { playing?: boolean; time?: number; rate?: number };
export interface YouTubeCallbacks {
  state: (state: {
    time?: number;
    duration?: number;
    needsInteraction?: boolean;
    needsUnmute?: boolean;
    mediaError?: string;
  }) => void;
  action: (action: YouTubeAction) => void;
  ended: () => void;
  needsUnmute: () => boolean;
}

/** Translate the room's native-player contract to YouTube's asynchronous API. */
export class YouTubeController implements PlaybackTarget {
  readonly source: string;
  private player: YouTubeAPIPlayer;
  private callbacks: YouTubeCallbacks;
  readonly srcObject = null;
  readonly readyState = 1;
  isLive = false;
  supportsPlaybackRate = true;
  private expectedState: number | null = null;
  private expectedRate: number | null = null;
  private seekUntil = 0;
  private lastTick: { time: number; at: number; playing: boolean; rate: number } | null = null;
  private pending: {
    resolve: () => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;
  private disposed = false;
  private fallbackUsed = false;
  private locallyBlocked = false;
  private volume = 0.75;
  private pauseTimer: ReturnType<typeof setTimeout> | undefined;
  constructor(source: string, player: YouTubeAPIPlayer, callbacks: YouTubeCallbacks) {
    this.source = source;
    this.player = player;
    this.callbacks = callbacks;
  }
  get currentTime() {
    return this.player.getCurrentTime() || 0;
  }
  set currentTime(time: number) {
    this.seekUntil = performance.now() + 1500;
    this.lastTick = null;
    this.player.seekTo(time, true);
  }
  get duration() {
    return this.player.getDuration() || 0;
  }
  get playbackRate() {
    return this.player.getPlaybackRate() || 1;
  }
  set playbackRate(rate: number) {
    if (this.playbackRate !== rate) {
      this.expectedRate = rate;
      this.player.setPlaybackRate(rate);
    }
  }
  play(): Promise<void> {
    if (this.disposed) return Promise.reject(new Error('The YouTube player was closed.'));
    if (this.player.getPlayerState() === 1) return Promise.resolve();
    if (this.pending)
      return new Promise((resolve, reject) => {
        const previous = this.pending!;
        this.pending = {
          ...previous,
          resolve: () => {
            previous.resolve();
            resolve();
          },
          reject: (error) => {
            previous.reject(error);
            reject(error);
          },
        };
      });
    this.expectedState = 1;
    this.fallbackUsed = false;
    this.locallyBlocked = false;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => this.finish(new Error('YouTube playback did not start.')),
        12000,
      );
      this.pending = { resolve, reject, timer };
      this.player.playVideo();
    });
  }
  pause() {
    this.finish();
    clearTimeout(this.pauseTimer);
    if (this.player.getPlayerState() !== 2) {
      this.expectedState = 2;
      this.player.pauseVideo();
      this.pauseTimer = setTimeout(() => {
        if (this.disposed || this.expectedState !== 2) return;
        this.expectedState = null;
        if (this.player.getPlayerState() === 1)
          this.callbacks.action({ playing: true, time: this.currentTime });
      }, 1500);
    } else this.expectedState = null;
  }
  setVolume(volume: number) {
    this.volume = volume;
    this.player.setVolume(Math.round(volume * 100));
    if (volume === 0) this.player.mute();
    else if (!this.callbacks.needsUnmute()) this.player.unMute();
  }
  enableAudio() {
    this.fallbackUsed = false;
    this.player.setVolume(Math.round((this.volume || 0.75) * 100));
    this.player.unMute();
    this.callbacks.state({ needsUnmute: false, needsInteraction: false });
    return this.play();
  }
  requestFullscreen() {
    return this.player.getIframe().requestFullscreen?.() || Promise.resolve();
  }
  onState(state: number) {
    if (this.disposed) return;
    this.callbacks.state({ time: this.currentTime, duration: this.duration });
    if (state === 1) {
      this.locallyBlocked = false;
      this.finish();
      this.callbacks.state({ needsInteraction: false });
    }
    if (state === 0) {
      this.expectedState = null;
      this.callbacks.ended();
      return;
    }
    if (state !== 1 && state !== 2) return;
    if (state === 2 && this.locallyBlocked) return;
    if (this.expectedState === state) {
      this.expectedState = null;
      return;
    }
    if (this.expectedState !== null) return;
    this.callbacks.action({ playing: state === 1, time: this.currentTime });
  }
  onRate(rate: number) {
    if (this.expectedRate === rate) {
      this.expectedRate = null;
      return;
    }
    this.expectedRate = null;
    this.callbacks.action({ rate, time: this.currentTime });
  }
  onAutoplayBlocked(allowMutedFallback = true) {
    if (allowMutedFallback && !this.fallbackUsed && !this.player.isMuted()) {
      this.fallbackUsed = true;
      this.player.mute();
      this.callbacks.state({ needsUnmute: this.volume > 0 });
      this.player.playVideo();
      return;
    }
    this.expectedState = null;
    this.locallyBlocked = true;
    this.callbacks.state({ needsInteraction: true });
    this.finish(new Error('Tap to allow playback on this device.'));
  }
  tick(now = performance.now()) {
    if (this.disposed) return;
    const time = this.currentTime,
      rate = this.playbackRate,
      playing = this.player.getPlayerState() === 1;
    const previous = this.lastTick;
    this.callbacks.state({ time, duration: this.duration });
    if (previous && now > this.seekUntil) {
      const expected =
        previous.time + (previous.playing ? ((now - previous.at) / 1000) * previous.rate : 0);
      if (Math.abs(time - expected) > 1.5) this.callbacks.action({ time });
    }
    this.lastTick = { time, at: now, playing, rate };
  }
  onSeek() {
    if (performance.now() <= this.seekUntil) return;
    this.lastTick = null;
    this.callbacks.action({ time: this.currentTime });
  }
  destroy() {
    this.disposed = true;
    clearTimeout(this.pauseTimer);
    this.finish();
    this.player.destroy();
  }
  private finish(error?: Error) {
    const pending = this.pending;
    this.pending = null;
    if (pending) {
      clearTimeout(pending.timer);
      if (error) pending.reject(error);
      else pending.resolve();
    }
  }
}

interface YouTubeNamespace {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string;
      width: string;
      height: string;
      playerVars: Record<string, string | number>;
      events: {
        onReady: (event: { target: YouTubeAPIPlayer }) => void;
        onStateChange: (event: { data: number }) => void;
        onPlaybackRateChange: (event: { data: number }) => void;
        onAutoplayBlocked: () => void;
        onError: (event: { data: number }) => void;
      };
    },
  ) => YouTubeAPIPlayer;
}
declare global {
  interface Window {
    YT?: YouTubeNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}
let loading: Promise<YouTubeNamespace> | null = null;
export function loadYouTubeAPI(): Promise<YouTubeNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    const previous = window.onYouTubeIframeAPIReady;
    const fail = () => {
      clearTimeout(timer);
      script.remove();
      loading = null;
      reject(new Error('YouTube could not load. Check your connection or content blocker.'));
    };
    const timer = setTimeout(fail, 20000);
    window.onYouTubeIframeAPIReady = () => {
      clearTimeout(timer);
      try {
        previous?.();
      } finally {
        if (window.YT?.Player) resolve(window.YT);
        else fail();
      }
    };
    script.onerror = fail;
    document.head.appendChild(script);
  });
  return loading;
}
