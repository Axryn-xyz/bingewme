import { useRef, useState, useEffect } from 'react';
import { RoomLobby } from './components/RoomLobby';
import { parseRoomCode } from './lib/rooms';
import { applyTheme, readAccent } from './lib/theme';
import {
  Zap,
  ArrowUpRight,
  Link,
  Plus,
  MessageSquare,
  ListVideo,
  Settings,
  Users,
  Smile,
  Paperclip,
  Check,
  Copy,
  X,
  MonitorUp,
  Upload,
  Globe,
  Pencil,
  Trash2,
  Headphones,
  Mic,
  MicOff,
  Video,
  MoreHorizontal,
  Lock,
  Shield,
  Radio,
  ArrowRight,
  Play,
  Film,
  Volume2,
} from 'lucide-react';
import { useStore, type QueueItem } from './store';
import { GifPicker } from './components/chat/GifPicker';
import { stageFile } from './lib/staging';
import { useWebRTCSync } from './hooks/useWebRTCSync';
import { MediaEngine } from './components/player/MediaEngine';
import { Controls } from './components/player/Controls';
import { Telestrator } from './components/canvas/Telestrator';
import { ReactionOverlay, type Reaction } from './components/chat/ReactionOverlay';
export default function App() {
  const match = location.pathname.match(/^\/party\/([^/]+)\/?$/);
  const room = match ? parseRoomCode(match[1]) : null;
  return room ? <WatchRoom room={room} /> : <RoomLobby />;
}
function WatchRoom({ room }: { room: string }) {
  const [accent, setAccent] = useState(readAccent);
  const s = useStore();
  const video = useRef<HTMLVideoElement>(null);
  const [name] = useState(() => sessionStorage.getItem('party-name') || 'You');
  const sync = useWebRTCSync(room, name, video);
  const [tab, setTab] = useState('chat');
  const [modal, setModal] = useState<'media' | 'invite' | null>(null);
  const [mode, setMode] = useState('link');
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [clearKey, setClearKey] = useState(0);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState('');
  const [mic, setMic] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [cam, setCam] = useState<MediaStream | null>(null);
  const [picker, setPicker] = useState(false);
  const [gifPicker, setGifPicker] = useState(false);
  const [vote, setVote] = useState(false);
  const [votes, setVotes] = useState(0);
  const file = useRef<HTMLInputElement>(null);
  const chatEnd = useRef<HTMLDivElement>(null);
  const objectUrl = useRef('');
  const disabled = s.locked && !sync.host;
  function toast(message: string) {
    setNotice(message);
    setTimeout(() => setNotice(''), 4000);
  }
  function react(emoji: string, broadcast = true) {
    const r = { id: crypto.randomUUID(), emoji, x: 20 + Math.random() * 60 };
    setReactions((a) => [...a.slice(-20), r]);
    setTimeout(() => setReactions((a) => a.filter((x) => x.id !== r.id)), 3000);
    if (broadcast) sync.socket.current?.emit('reaction', emoji);
  }
  useEffect(() => {
    const socket = sync.socket.current;
    if (!socket) return;
    const r = (emoji: string) => react(emoji, false);
    const settings = (data: { locked: boolean; vote: boolean }) => s.set(data);
    socket.on('reaction', r);
    socket.on('settings', settings);
    const voteState = (data: { votes: number }) => {
      setVote(true);
      setVotes(data.votes);
    };
    const voteResult = (data: { passed: boolean }) => {
      setVote(false);
      toast(
        data.passed ? 'Vote passed. Taking a breather.' : 'Pause vote did not reach a majority.',
      );
    };
    const fileNotice = (data: { name: string }) =>
      toast('The host loaded ' + data.name + '. Select your matching local file.');
    socket.on('vote-state', voteState);
    socket.on('vote-result', voteResult);
    socket.on('file-metadata', fileNotice);
    return () => {
      socket.off('reaction', r);
      socket.off('settings', settings);
      socket.off('vote-state', voteState);
      socket.off('vote-result', voteResult);
      socket.off('file-metadata', fileNotice);
    };
  }, [sync.connected]);
  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [s.messages.length]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches('input,textarea,select')) return;
      if (e.code === 'Space') {
        e.preventDefault();
        toggle();
      }
      if (e.key === 'm') s.set({ volume: s.volume ? 0 : 0.75 });
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [s.playing, s.volume, disabled]);
  useEffect(
    () => () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      cam?.getTracks().forEach((t) => t.stop());
    },
    [cam],
  );
  function toggle() {
    if (disabled || (!s.source && !localStream && !sync.remoteStream)) return;
    if (s.playing && s.vote) {
      sync.socket.current?.emit('vote-start');
      return;
    }
    if (s.playing) video.current?.pause();
    else video.current?.play().catch(() => toast('Add a playable video to get started.'));
    s.set({ playing: !s.playing });
    sync.broadcast();
  }
  function load(item: QueueItem) {
    s.set({ source: item.url, title: item.title, playing: false, time: 0, duration: 0 });
    setLocalStream(null);
    setTimeout(sync.broadcast, 100);
  }
  function next() {
    if (!s.queue.length) return;
    const index = s.queue.findIndex((q) => q.title === s.title);
    load(s.queue[(index + 1) % s.queue.length]);
  }
  async function localFile(f: File) {
    if (disabled) return;
    stageFile(f).catch(() =>
      toast('Browser storage is full. Playback still works for this session.'),
    );
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = URL.createObjectURL(f);
    s.set({ source: objectUrl.current, title: f.name, playing: false, time: 0 });
    setModal(null);
    setLocalStream(null);
    const hash = Array.from(
      new Uint8Array(
        await crypto.subtle.digest('SHA-256', await f.slice(0, 1048576).arrayBuffer()),
      ),
    )
      .map((x) => x.toString(16).padStart(2, '0'))
      .join('');
    sync.socket.current?.emit('file-metadata', { name: f.name, size: f.size, hash });
    toast('Local file loaded. Friends should select the same file.');
  }
  function addLink() {
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw Error();
      const title = decodeURIComponent(parsed.pathname.split('/').pop() || parsed.hostname);
      const item = {
        id: crypto.randomUUID(),
        title,
        subtitle: parsed.hostname,
        url,
        image: '',
        duration: 'VIDEO',
      };
      s.set({ queue: [...s.queue, item] });
      load(item);
      setModal(null);
      setUrl('');
    } catch {
      toast('Enter a valid http or https video URL.');
    }
  }
  async function share() {
    try {
      const stream = await sync.share();
      setLocalStream(stream);
      setModal(null);
      s.set({ title: 'Live screen share' });
      stream.getVideoTracks()[0].onended = () => {
        setLocalStream(null);
        stream.getTracks().forEach((t) => t.stop());
        sync.socket.current?.emit('share-stop');
      };
    } catch {
      toast('Screen sharing was cancelled or is unavailable.');
    }
  }
  async function camera() {
    if (cam) {
      cam.getTracks().forEach((t) => t.stop());
      setCam(null);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: { noiseSuppression: true, echoCancellation: true },
      });
      stream.getAudioTracks().forEach((t) => (t.enabled = false));
      setCam(stream);
    } catch {
      toast('Camera access is unavailable.');
    }
  }
  function send() {
    if (!text.trim()) return;
    const m = {
      id: crypto.randomUUID(),
      name,
      text: text.trim(),
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      color: '#ffe600',
    };
    if (sync.connected) sync.socket.current?.emit('chat', m);
    else s.addMessage(m);
    setText('');
    setPicker(false);
  }
  const participants = sync.members.length ? sync.members : [{ id: 'local', name: 'You' }];
  return (
    <div className="app">
      <header className="header">
        <a className="brand" href="/">
          <span className="brand-mark">
            <Zap size={22} fill="currentColor" />
          </span>
          Binge <span>W Me</span>
          <sup>®</sup>
        </a>
        <div className="header-center">
          <span className="live-dot" /> THE INTERNET IS BETTER TOGETHER.
        </div>
        <a
          className="header-link"
          href="https://github.com/havioo/bingewme"
          target="_blank"
          rel="noreferrer"
        >
          Made for your people <ArrowUpRight size={15} />
        </a>
      </header>
      <main>
        <div className="room-heading">
          <div>
            <div className="eyebrow">
              <span className="tiny-dot" /> YOUR ROOM. YOUR RULES.
            </div>
            <h1>
              Your room, <span>your night.</span>
              <span className="title-star">✳</span>
            </h1>
            <div className="room-meta">
              <span className="room-tag">#{room}</span>
              <span className="meta-divider" />
              <Lock size={12} /> Invite-only link <span className="meta-divider" />
              <span className="connection-dot" />{' '}
              {sync.connected
                ? 'Connected & in sync'
                : sync.connectionError
                  ? 'Room connection unavailable'
                  : 'Connecting to room'}
            </div>
          </div>
          <div className="room-actions">
            <a className="outline-btn" href="/">
              Leave room
            </a>
            <div className="avatar-stack">
              {participants.slice(0, 3).map((p) => (
                <span key={p.id} style={{ background: 'var(--accent-soft)' }}>
                  {p.name.slice(0, 1).toUpperCase()}
                </span>
              ))}
            </div>
            <span className="online-count">{participants.length} here</span>
            <button className="yellow-btn" onClick={() => setModal('invite')}>
              <Link size={16} /> Invite friends <ArrowUpRight size={16} />
            </button>
          </div>
        </div>
        {sync.connectionError && (
          <div className="connection-warning" role="alert">
            The room connection is unavailable. Chat and playback sync will reconnect automatically
            when the service is back online.
          </div>
        )}
        <div className="workspace">
          <section className="watch-column">
            <div className="player-shell">
              <div className="player-topline">
                <span>
                  <span className="lime-dot" />{' '}
                  {s.source || localStream || sync.remoteStream
                    ? 'NOW PLAYING'
                    : 'READY WHEN YOU ARE'}
                </span>
                <span>
                  YOUR ROOM <span className="muted"> / </span> GOOD TIMES ONLY
                </span>
                <MoreHorizontal size={17} />
              </div>
              <div
                className="video-stage"
                data-playing={s.playing}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files[0]) localFile(e.dataTransfer.files[0]);
                }}
              >
                <MediaEngine ref={video} stream={localStream || sync.remoteStream} onEnded={next} />
                <div className="video-shade" />
                {(s.source || localStream || sync.remoteStream) && !s.playing && (
                  <button className="center-play" aria-label="Play video" onClick={toggle}>
                    <Play size={28} fill="currentColor" />
                  </button>
                )}
                {s.source || localStream || sync.remoteStream ? (
                  <div className="film-label">
                    <span className="film-pill">
                      <Film size={12} /> YOUR MEDIA
                    </span>
                    <h2>{s.title || 'Live screen share'}</h2>
                    <span>Grab a snack. Get comfortable.</span>
                  </div>
                ) : (
                  <div className="player-empty">
                    <span className="empty-screen-icon">
                      <Film size={32} />
                    </span>
                    <div className="eyebrow">THE SCREEN IS YOURS</div>
                    <h2>Bring something worth watching.</h2>
                    <p>Paste a video link, drop a file here, or share your screen.</p>
                    <button
                      className="yellow-btn"
                      disabled={disabled}
                      onClick={() => setModal('media')}
                    >
                      <Plus size={16} /> Add your first media <ArrowUpRight size={16} />
                    </button>
                    <small>
                      {disabled ? 'Waiting for the host to add media.' : 'Your room. Your picks.'}
                    </small>
                  </div>
                )}
                <Telestrator socket={sync.socket.current} clearKey={clearKey} />
                <ReactionOverlay reactions={reactions} />
                {cam && (
                  <video
                    className="camera-preview"
                    muted
                    autoPlay
                    playsInline
                    ref={(el) => {
                      if (el) el.srcObject = cam;
                    }}
                  />
                )}
                {vote && (
                  <div className="vote-card">
                    Pause for a moment?{' '}
                    <button onClick={() => sync.socket.current?.emit('vote-yes')}>
                      Vote yes · {votes}
                    </button>
                  </div>
                )}
              </div>
              <Controls
                video={video}
                disabled={disabled || (!s.source && !localStream && !sync.remoteStream)}
                onToggle={toggle}
                onNext={next}
                onSync={() => {
                  if (sync.host) sync.broadcast();
                  else sync.socket.current?.emit('request-sync');
                  toast('Playback synchronized.');
                }}
              />
            </div>
            <div className="under-player">
              <div className="source-label">
                <span className="source-icon">
                  <Film size={17} />
                </span>
                <div>
                  <strong>{s.title || 'Nothing playing yet'}</strong>
                  <small>
                    {s.source
                      ? 'Everyone is watching the same moment.'
                      : 'Add something to start the night.'}
                  </small>
                </div>
                <span className="source-badge">{s.source ? 'IN SYNC' : 'EMPTY ROOM'}</span>
              </div>
              <button className="outline-btn" onClick={() => setModal('media')} disabled={disabled}>
                <Plus size={15} /> Add media
              </button>
            </div>
            <div className="interaction-bar">
              <div className="reaction-buttons">
                <span>FEEL SOMETHING?</span>
                {['🔥', '😂', '❤️', '😮', '👏'].map((e) => (
                  <button key={e} title={`React ${e}`} onClick={() => react(e)}>
                    {e}
                  </button>
                ))}
                <button className="more-reactions" onClick={() => setPicker(!picker)}>
                  <Plus size={17} />
                </button>
              </div>
              <div className="draw-tools">
                <button
                  className={s.drawing ? 'selected' : ''}
                  onClick={() => s.set({ drawing: !s.drawing })}
                  title="Draw on screen"
                >
                  <Pencil size={16} />
                  <span>Draw</span>
                </button>
                {s.drawing && (
                  <>
                    <input
                      aria-label="Brush color"
                      type="color"
                      value={s.color}
                      onChange={(e) => s.set({ color: e.target.value })}
                    />
                    <button onClick={() => setClearKey((k) => k + 1)} title="Clear drawing">
                      <Trash2 size={15} />
                    </button>
                  </>
                )}
                <span className="tool-divider" />
                <button
                  onClick={async () => {
                    if (!cam) {
                      toast('Turn on your camera to enable its microphone.');
                      return;
                    }
                    setMic(!mic);
                    cam.getAudioTracks().forEach((t) => (t.enabled = !mic));
                  }}
                  title="Toggle microphone"
                >
                  {mic ? <Mic size={16} /> : <MicOff size={16} />}
                </button>
                <button onClick={camera} title="Toggle camera">
                  <Video size={17} />
                </button>
              </div>
            </div>
            <div className="bottom-grid">
              <div className="vibe-card">
                <div className="vibe-icon">✳</div>
                <div>
                  <h3>Same screen. Different sofas.</h3>
                  <p>Send the link. Settle in. Make a night of it.</p>
                </div>
                <span className="vibe-doodle">↗</span>
              </div>
              <div className="shortcut-card">
                <Headphones size={20} />
                <div>
                  <strong>Better with headphones</strong>
                  <p>Less echo. More immersion.</p>
                </div>
              </div>
            </div>
            <div className="page-foot">
              <span>
                <Shield size={12} /> No sign-ups. No awkward downloads. Just press play.
              </span>
              <span>BUILT FOR THE HANGOUT ↗</span>
            </div>
          </section>
          <aside className="sidebar">
            <div className="sidebar-tabs">
              {[
                { id: 'chat', icon: MessageSquare, label: 'Chat' },
                { id: 'queue', icon: ListVideo, label: 'Queue' },
                { id: 'people', icon: Users, label: 'People' },
                { id: 'settings', icon: Settings, label: 'Settings' },
              ].map((t) => (
                <button
                  key={t.id}
                  className={tab === t.id ? 'active' : ''}
                  onClick={() => setTab(t.id)}
                >
                  <t.icon size={17} />
                  <span>{t.label}</span>
                  {t.id === 'chat' && <i />}
                </button>
              ))}
            </div>
            {tab === 'chat' ? (
              <>
                <div className="panel-title">
                  <h3>
                    The group chat <span>{participants.length}</span>
                  </h3>
                  <button
                    title="Chat options"
                    onClick={() => toast('Messages stay in this session.')}
                  >
                    <MoreHorizontal size={19} />
                  </button>
                </div>
                <div className="chat-scroll">
                  <div className="welcome-card">
                    <span className="welcome-mark">
                      <Zap size={24} fill="currentColor" />
                    </span>
                    <h3>The gang’s (almost) here.</h3>
                    <p>
                      This is your little corner of the internet.
                      <br />
                      Invite your people and hit play.
                    </p>
                    <button onClick={() => setModal('invite')}>
                      Invite your friends <ArrowRight size={14} />
                    </button>
                  </div>
                  <div className="chat-day">
                    <span /> TODAY <span />
                  </div>
                  <div className="system-message">
                    <span>✳</span> You’re in. Invite your people and make yourself at home.
                  </div>
                  {s.messages.length === 0 && (
                    <div className="empty-chat">
                      <MessageSquare size={25} />
                      <p>First message energy.</p>
                      <small>Say hey. Recommend a movie. Start something.</small>
                    </div>
                  )}
                  {s.messages.map((m) => (
                    <div className="message" key={m.id}>
                      <div className="chat-avatar" style={{ background: 'var(--accent-soft)' }}>
                        {m.name.charAt(0)}
                      </div>
                      <div>
                        <div className="message-author">
                          {m.name}
                          <time>{m.time}</time>
                        </div>
                        <p>
                          {/^https:\/\/(?:media[0-9]*\.giphy\.com|i\.giphy\.com)\//.test(m.text) ? (
                            <img
                              className="chat-gif"
                              src={m.text}
                              alt="GIF reaction"
                              loading="lazy"
                            />
                          ) : (
                            m.text
                          )}
                        </p>
                      </div>
                    </div>
                  ))}
                  <div ref={chatEnd} />
                </div>
                {gifPicker && (
                  <GifPicker
                    onClose={() => setGifPicker(false)}
                    onPick={(url) => {
                      const m = {
                        id: crypto.randomUUID(),
                        name,
                        text: url,
                        time: new Date().toLocaleTimeString(),
                        color: '#e7ff66',
                      };
                      if (sync.connected) sync.socket.current?.emit('chat', m);
                      else s.addMessage(m);
                      setGifPicker(false);
                    }}
                  />
                )}
                {picker && (
                  <div className="emoji-picker">
                    {['🎉', '💀', '🍿', '🥹', '🤯', '🙌', '💚', '👀', '🎬', '✨', '😎', '🥳'].map(
                      (e) => (
                        <button
                          key={e}
                          onClick={() => {
                            react(e);
                            setText((t) => t + e);
                          }}
                        >
                          {e}
                        </button>
                      ),
                    )}
                  </div>
                )}
                <div className="chat-compose">
                  <div className="compose-input">
                    <input
                      aria-label="Chat message"
                      placeholder="Say something good…"
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') send();
                      }}
                    />
                    <button className="send-button" title="Send message" onClick={send}>
                      <ArrowUpRight size={19} />
                    </button>
                  </div>
                  <div className="compose-bottom">
                    <div>
                      <button title="Emoji picker" onClick={() => setPicker(!picker)}>
                        <Smile size={17} />
                      </button>
                      <button className="gif-btn" onClick={() => setGifPicker((open) => !open)}>
                        GIF
                      </button>
                      <button title="Attach media" onClick={() => setModal('media')}>
                        <Paperclip size={16} />
                      </button>
                    </div>
                    <span>
                      Be cool. Be kind. <span>✌</span>
                    </span>
                  </div>
                </div>
              </>
            ) : tab === 'queue' ? (
              <div className="panel-content">
                <div className="section-title">
                  <h3>
                    Up next <span>{s.queue.length}</span>
                  </h3>
                  <button onClick={() => setModal('media')}>
                    <Plus size={18} />
                  </button>
                </div>
                <p className="panel-description">
                  {s.queue.length
                    ? 'Good things come in a queue.'
                    : 'Your queue is empty. Add a video link to get started.'}
                </p>
                {s.queue.map((item, i) => (
                  <button
                    className={`queue-item ${s.title === item.title ? 'current' : ''}`}
                    key={item.id}
                    onClick={() => !disabled && load(item)}
                  >
                    <div className="queue-thumb" style={{ backgroundImage: `url(${item.image})` }}>
                      <span>{item.duration}</span>
                    </div>
                    <div>
                      <small>
                        {s.title === item.title ? 'NOW PLAYING' : `0${i + 1} / UP NEXT`}
                      </small>
                      <strong>{item.title}</strong>
                      <p>{item.subtitle}</p>
                    </div>
                    <Play size={14} />
                  </button>
                ))}
                <button className="queue-add" onClick={() => setModal('media')}>
                  <Plus size={17} /> Add to the good times
                </button>
              </div>
            ) : tab === 'people' ? (
              <div className="panel-content">
                <div className="section-title">
                  <h3>Your people</h3>
                  <span className="room-tag">{participants.length} / 100</span>
                </div>
                <p className="panel-description">Different places. Same wavelength.</p>
                {participants.map((p, i) => (
                  <div className="person" key={p.id}>
                    <span className="chat-avatar" style={{ background: 'var(--accent-soft)' }}>
                      {p.name[0]}
                    </span>
                    <div>
                      <strong>
                        {p.name} {i === 0 && <small>HOST</small>}
                      </strong>
                      <p>Connected to the room</p>
                      <input
                        aria-label={`${p.name} volume`}
                        type="range"
                        min="0"
                        max="100"
                        defaultValue="100"
                      />
                    </div>
                    <Volume2 size={16} />
                  </div>
                ))}
                <button className="queue-add" onClick={() => setModal('invite')}>
                  <Plus size={17} /> There's room for your friends
                </button>
              </div>
            ) : (
              <div className="panel-content">
                <h3>Make yourself at home.</h3>
                <p className="panel-description">A little control over the chaos.</p>
                {[
                  {
                    title: 'Host controls only',
                    desc: 'Keep playback in the host’s hands.',
                    value: s.locked,
                    action: () => {
                      s.set({ locked: !s.locked });
                      sync.socket.current?.emit('settings', { locked: !s.locked });
                    },
                  },
                  {
                    title: 'Vote to pause',
                    desc: 'A quick vote before the intermission.',
                    value: s.vote,
                    action: () => {
                      s.set({ vote: !s.vote });
                      sync.socket.current?.emit('settings', { vote: !s.vote });
                    },
                  },
                ].map((o) => (
                  <div className="setting" key={o.title}>
                    <div>
                      <strong>{o.title}</strong>
                      <p>{o.desc}</p>
                    </div>
                    <button
                      className={`toggle ${o.value ? 'on' : ''}`}
                      role="switch"
                      aria-checked={o.value}
                      aria-label={o.title}
                      disabled={!sync.host}
                      onClick={o.action}
                    >
                      <i />
                    </button>
                  </div>
                ))}
                <div className="setting">
                  <div>
                    <strong>Your accent color</strong>
                    <p>Backgrounds, borders, and text adapt to your color.</p>
                  </div>
                  <input
                    type="color"
                    aria-label="Room accent color"
                    value={accent}
                    onChange={(e) => {
                      setAccent(e.target.value);
                      applyTheme(e.target.value, true);
                    }}
                  />
                </div>
                <div className="settings-note">
                  <Shield size={20} />
                  <p>Your room is temporary. Chat history disappears when everyone leaves.</p>
                </div>
              </div>
            )}
            <div className="sidebar-status">
              <span className="connection-dot" />{' '}
              {sync.connected ? 'ALL SYSTEMS GO' : 'LOCAL PREVIEW'}
              <span>
                <Radio size={12} /> {sync.connected ? 'LIVE' : 'OFFLINE'}
              </span>
            </div>
          </aside>
        </div>
        <div className="next-strip">
          <span className="next-label">
            <ListVideo size={17} /> THE NIGHT IS STILL YOUNG
          </span>
          <div>
            {s.queue.length === 0 && (
              <span className="empty-queue-note">
                Your next watch goes here. Add media to get started.
              </span>
            )}
            {s.queue.slice(1).map((q) => (
              <button key={q.id} onClick={() => load(q)}>
                <span className="mini-thumb" style={{ backgroundImage: `url(${q.image})` }} />
                <span>
                  <small>UP NEXT</small>
                  <strong>{q.title}</strong>
                </span>
                <span className="mini-duration">{q.duration}</span>
                <Play size={12} />
              </button>
            ))}
          </div>
          <button className="view-queue" onClick={() => setTab('queue')}>
            View queue <ArrowUpRight size={14} />
          </button>
        </div>
      </main>
      <footer>
        <span className="footer-brand">
          Binge <span>W Me</span>
          <span className="footer-dot">✳</span>
        </span>
        <span>A LITTLE LESS SCROLLING. A LOT MORE TOGETHER.</span>
        <span>YOUR NEXT GOOD NIGHT STARTS HERE.</span>
      </footer>
      {modal && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button className="modal-close" onClick={() => setModal(null)} title="Close">
              <X size={20} />
            </button>
            <div className="eyebrow">GOOD TIMES ARE A GROUP PROJECT</div>
            <h2 id="modal-title">
              {modal === 'invite' ? 'Save them a seat.' : 'What are we watching?'}
            </h2>
            {modal === 'invite' ? (
              <>
                <p>One link. All your favorite people. No account needed.</p>
                <div className="invite-link">
                  <span>
                    {location.origin}/party/{room}
                  </span>
                  <button
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(`${location.origin}/party/${room}`);
                        setCopied(true);
                      } catch {
                        toast('Copy the room link from your address bar.');
                      }
                    }}
                  >
                    {copied ? <Check size={18} /> : <Copy size={18} />}
                  </button>
                </div>
                <span className="modal-foot">Only people with the link can find your room.</span>
              </>
            ) : (
              <>
                <div className="media-tabs">
                  {[
                    { id: 'link', icon: Globe, label: 'Paste a link' },
                    { id: 'local', icon: Upload, label: 'Local file' },
                    { id: 'screen', icon: MonitorUp, label: 'Share screen' },
                  ].map((m) => (
                    <button
                      className={mode === m.id ? 'active' : ''}
                      key={m.id}
                      onClick={() => setMode(m.id)}
                    >
                      <m.icon size={17} />
                      {m.label}
                    </button>
                  ))}
                </div>
                {mode === 'link' ? (
                  <>
                    <label className="input-label">VIDEO URL</label>
                    <input
                      className="url-input"
                      placeholder="https://…"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addLink()}
                    />
                    <p className="help-text">
                      Direct MP4, WebM, HLS streams, YouTube, and Vimeo. Embedded platforms manage
                      their own playback.
                    </p>
                    <button className="yellow-btn full" onClick={addLink}>
                      Add to the party <ArrowRight size={16} />
                    </button>
                  </>
                ) : mode === 'local' ? (
                  <button className="drop-zone" onClick={() => file.current?.click()}>
                    <Upload size={30} />
                    <strong>Your file. Everyone’s movie night.</strong>
                    <span>Choose MP4, WebM, MKV, or MP3</span>
                    <small>Each guest needs a matching copy.</small>
                  </button>
                ) : (
                  <div className="screen-info">
                    <MonitorUp size={35} />
                    <p>
                      Share a screen, window, or browser tab.
                      <br />
                      Choose a tab to include system audio.
                    </p>
                    <button className="yellow-btn full" onClick={share}>
                      Start screen share <ArrowUpRight size={17} />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
      <input
        hidden
        ref={file}
        type="file"
        accept="video/*,audio/*,.mkv"
        onChange={(e) => {
          if (e.target.files?.[0]) localFile(e.target.files[0]);
        }}
      />
      {notice && (
        <div className="toast">
          <Check size={16} />
          {notice}
        </div>
      )}
    </div>
  );
}
