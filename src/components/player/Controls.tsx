import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  PictureInPicture2,
  RefreshCw,
  SkipForward,
} from 'lucide-react';
import { useStore } from '../../store';
import { useEffect, useRef, useState } from 'react';
import { togglePlayerFullscreen } from '../../lib/fullscreen';
import '../../styles/fullscreen.css';
import '../../styles/media-extras.css';
import { SeekPreview } from './SeekPreview';
import { useAudioBoost } from '../../hooks/useAudioBoost';
export const clock = (n: number) =>
  `${Math.floor((Number.isFinite(n) ? n : 0) / 60)}:${String(Math.floor((Number.isFinite(n) ? n : 0) % 60)).padStart(2, '0')}`;
export function Controls({
  video,
  onChange,
  onResync,
  onNext,
  onToggle,
  disabled,
}: {
  video: React.RefObject<HTMLVideoElement | null>;
  onChange: (changes?: { time?: number; rate?: number }) => void;
  onResync: () => void;
  onNext: () => void;
  onToggle: () => void;
  disabled: boolean;
}) {
  const s = useStore();
  const deck = useRef<HTMLDivElement>(null);
  const [fullscreenError, setFullscreenError] = useState('');
  const [hover, setHover] = useState<{ time: number; fraction: number } | null>(null);
  const audio = useAudioBoost(video);
  useEffect(() => setHover(null), [s.source]);
  const boostAvailable =
    !s.controller && (!!video.current?.srcObject || s.source.startsWith('/api/media/'));
  return (
    <div className="control-deck" ref={deck}>
      <div
        className="seek-wrap"
        onPointerLeave={() => setHover(null)}
        onPointerMove={(event) => {
          if (
            s.controller ||
            video.current?.srcObject ||
            !Number.isFinite(s.duration) ||
            s.duration <= 0 ||
            /\.m3u8(?:[?#]|$)/i.test(s.source)
          )
            return;
          const box = event.currentTarget.getBoundingClientRect();
          const fraction = Math.max(0, Math.min(1, (event.clientX - box.left) / box.width));
          setHover({ time: Math.min(s.duration - 0.05, fraction * s.duration), fraction });
        }}
      >
        {hover && <SeekPreview source={s.source} {...hover} />}
        <input
          aria-label="Seek video"
          className="seek"
          type="range"
          min="0"
          max={Number.isFinite(s.duration) ? s.duration : 0}
          value={s.time}
          disabled={disabled || s.controller?.isLive || !!video.current?.srcObject}
          onChange={(e) => {
            const player = s.controller?.source === s.source ? s.controller : video.current;
            if (player) player.currentTime = +e.target.value;
            s.set({ time: +e.target.value });
            onChange({ time: +e.target.value });
          }}
        />
      </div>
      <div className="control-row">
        <button
          className="play-button"
          disabled={disabled && !s.needsInteraction}
          onClick={onToggle}
          title="Play / pause (Space)"
        >
          {s.playing ? <Pause size={18} /> : <Play size={18} fill="currentColor" />}
        </button>
        <button title="Next video" onClick={onNext} disabled={disabled}>
          <SkipForward size={18} />
        </button>
        <button title="Mute" onClick={() => s.set({ volume: s.volume ? 0 : 0.75 })}>
          {s.volume ? <Volume2 size={19} /> : <VolumeX size={19} />}
        </button>
        <input
          aria-label="Volume"
          className="volume"
          type="range"
          min="0"
          max="1"
          step=".01"
          value={s.volume}
          onChange={(e) => s.set({ volume: +e.target.value })}
        />
        <span className="timestamp">
          {video.current?.srcObject || s.controller?.isLive ? (
            'LIVE'
          ) : (
            <>
              {clock(s.time)} <span>/ {clock(s.duration)}</span>
            </>
          )}
        </span>
        <button
          className="boost-button"
          title={
            boostAvailable
              ? `Audio boost: ${audio.boost}x`
              : 'Audio boost is available for shared uploads and screen shares'
          }
          disabled={!boostAvailable}
          onClick={() => void audio.change(audio.boost >= 3 ? 1 : audio.boost + 0.5)}
        >
          {audio.boost}x🔊
        </button>
        <div className="control-spacer" />
        <button className="sync-button" onClick={onResync}>
          <RefreshCw size={13} /> <span>Resync</span>
        </button>
        <select
          aria-label="Playback speed"
          disabled={
            disabled || s.controller?.supportsPlaybackRate === false || !!video.current?.srcObject
          }
          value={s.rate}
          onChange={(e) => {
            s.set({ rate: +e.target.value });
            onChange({ rate: +e.target.value });
          }}
        >
          {[0.5, 0.75, 1, 1.25, 1.5, 2].map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
        <button
          title="Picture in picture"
          onClick={() => {
            video.current?.requestPictureInPicture?.().catch(() => {});
          }}
          disabled={!!s.controller}
        >
          <PictureInPicture2 size={18} />
        </button>
        <button
          title="Fullscreen"
          onClick={() => {
            setFullscreenError('');
            try {
              togglePlayerFullscreen(
                deck.current?.closest<HTMLElement>('.player-shell') || null,
                video.current,
              ).catch((error: Error) => setFullscreenError(error.message));
            } catch (error) {
              setFullscreenError(
                error instanceof Error ? error.message : 'Fullscreen could not start.',
              );
            }
          }}
        >
          <Maximize size={18} />
        </button>
      </div>
      {fullscreenError && (
        <p className="fullscreen-error" role="status">
          {fullscreenError}
        </p>
      )}
      {audio.error && (
        <p className="fullscreen-error" role="status">
          {audio.error}
        </p>
      )}
    </div>
  );
}
