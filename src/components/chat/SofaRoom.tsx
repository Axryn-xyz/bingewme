import { useEffect, useRef, useState } from 'react';
import { Sofa, Mic, MicOff, Volume2 } from 'lucide-react';
import type { SofaParticipant } from '../../hooks/useSofaMedia';
import '../../styles/sofa.css';
function Seat({
  stream,
  name,
  local,
  video,
  audio,
}: {
  stream?: MediaStream;
  name: string;
  local: boolean;
  video: boolean;
  audio: boolean;
}) {
  const media = useRef<HTMLVideoElement>(null);
  const [blocked, setBlocked] = useState(false);
  const [volume, setVolume] = useState(1);
  useEffect(() => {
    const element = media.current;
    if (!element || !stream) return;
    element.srcObject = stream;
    element.muted = local || !audio || volume === 0;
    element.volume = volume;
    void element
      .play()
      .then(() => setBlocked(false))
      .catch(() => setBlocked(true));
    return () => {
      element.srcObject = null;
    };
  }, [stream, local]);
  useEffect(() => {
    if (media.current) {
      media.current.volume = volume;
      media.current.muted = local || !audio || volume === 0;
    }
  }, [volume, local, audio]);
  return (
    <article className="sofa-seat">
      <video
        ref={media}
        playsInline
        autoPlay
        muted={local}
        className={video ? '' : 'sofa-audio-only'}
      />
      {!video && <div className="sofa-avatar">{name[0]}</div>}
      <span className="sofa-name">
        {audio ? <Mic size={11} /> : <MicOff size={11} />}
        {name}
        {local && ' (you)'}
      </span>
      {blocked && (
        <button
          className="sofa-enable"
          onClick={() => {
            void media.current
              ?.play()
              .then(() => setBlocked(false))
              .catch(() => setBlocked(true));
          }}
        >
          Enable audio/video
        </button>
      )}
      {!local && (
        <label className="sofa-volume">
          <Volume2 size={11} />
          <input
            aria-label={`${name} sofa volume`}
            type="range"
            min="0"
            max="1"
            step=".05"
            value={volume}
            onChange={(event) => setVolume(+event.target.value)}
          />
        </label>
      )}
    </article>
  );
}
export function SofaRoom({
  participants,
  streams,
  localStream,
  self,
  members,
  error,
}: {
  participants: SofaParticipant[];
  streams: Record<string, MediaStream>;
  localStream: MediaStream | null;
  self?: string;
  members: { id: string; name: string }[];
  error: string;
}) {
  return (
    <section className="sofa-room" aria-label="Virtual sofa">
      <header>
        <span>
          <Sofa size={15} /> THE SOFA
        </span>
        <small>{participants.length} / 12 LIVE</small>
      </header>
      {participants.length ? (
        <div className="sofa-seats">
          {participants.map((person) => (
            <Seat
              key={person.id}
              {...person}
              name={members.find((member) => member.id === person.id)?.name || 'Guest'}
              stream={person.id === self ? localStream || undefined : streams[person.id]}
              local={person.id === self}
            />
          ))}
        </div>
      ) : (
        <p>Camera on, feet up. Take a seat with your people.</p>
      )}
      {error && <p role="status">{error}</p>}
    </section>
  );
}
