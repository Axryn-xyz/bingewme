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
export const clock = (n: number) =>
  `${Math.floor((n || 0) / 60)}:${String(Math.floor((n || 0) % 60)).padStart(2, '0')}`;
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
  return (
    <div className="control-deck">
      <input
        aria-label="Seek video"
        className="seek"
        type="range"
        min="0"
        max={Number.isFinite(s.duration) ? s.duration : 0}
        value={s.time}
        disabled={disabled}
        onChange={(e) => {
          const player = s.controller?.source === s.source ? s.controller : video.current;
          if (player) player.currentTime = +e.target.value;
          s.set({ time: +e.target.value });
          onChange({ time: +e.target.value });
        }}
      />
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
          {clock(s.time)} <span>/ {clock(s.duration)}</span>
        </span>
        <div className="control-spacer" />
        <button className="sync-button" onClick={onResync}>
          <RefreshCw size={13} /> <span>Resync</span>
        </button>
        <select
          aria-label="Playback speed"
          disabled={disabled}
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
            if (s.controller?.source === s.source) s.controller.requestFullscreen().catch(() => {});
            else video.current?.parentElement?.requestFullscreen?.().catch(() => {});
          }}
        >
          <Maximize size={18} />
        </button>
      </div>
    </div>
  );
}
