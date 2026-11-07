import { lazy, Suspense, useRef, useState, useEffect } from 'react';
import { readFavoriteEmojis, saveFavoriteEmojis, toggleFavoriteEmoji } from './lib/emoji-favorites';
import { RoomLobby } from './components/RoomLobby';
import { RoomEntry } from './components/RoomEntry';
import { preparedName, clearEntry, saveName } from './lib/identity';
import { apiUrl } from './lib/backend';
import { UploadProgress } from './components/player/UploadProgress';
import { uploadFile, formatBytes, type UploadProgress as UploadStatus } from './lib/upload';
import { youtubeId, type YouTubeAction } from './lib/youtube';
import { twitchSource } from './lib/twitch';
import { vimeoSource } from './lib/vimeo';
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
} from 'lucide-react';
import { useStore, type QueueItem } from './store';
import { GifPicker } from './components/chat/GifPicker';
import { stageFile } from './lib/staging';
import { useWebRTCSync } from './hooks/useWebRTCSync';
import { useSofaMedia } from './hooks/useSofaMedia';
import { SofaRoom } from './components/chat/SofaRoom';
import { RoomDashboard, ModerationDashboard } from './components/RoomDashboard';
import { GifOverlay } from './components/chat/GifOverlay';
import { MediaEngine } from './components/player/MediaEngine';
import { Controls } from './components/player/Controls';
import { Telestrator } from './components/canvas/Telestrator';
import { ReactionOverlay, type Reaction } from './components/chat/ReactionOverlay';
const EmojiPicker = lazy(() => import('./components/chat/EmojiPicker'));
export default function App() {
  const match = location.pathname.match(/^\/party\/([^/]+)\/?$/);
  const room = match ? parseRoomCode(match[1]) : null;
  const [name, setName] = useState(() => preparedName(room));
  useEffect(() => {
    if (name) clearEntry();
  }, [name]);
  if (!room) return <RoomLobby />;
  return name ? (
    <WatchRoom room={room} initialName={name} />
  ) : (
    <RoomEntry room={room} onJoin={setName} />
  );
}
export function WatchRoom({ room, initialName }: { room: string; initialName: string }) {
  const [accent, setAccent] = useState(readAccent);
  const s = useStore();
  const video = useRef<HTMLVideoElement>(null);
  const [name, setName] = useState(initialName);
  const [nameDraft, setNameDraft] = useState(initialName);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus | null>(null);
  const [uploadName, setUploadName] = useState('');
  const uploadAbort = useRef<AbortController | null>(null);
  const sync = useWebRTCSync(room, name, video);
  const sofa = useSofaMedia(sync.socket);
  const cameraOn =
    sofa.participants.find((person) => person.id === sync.socket.current?.id)?.video || false;
  const mic =
    sofa.participants.find((person) => person.id === sync.socket.current?.id)?.audio || false;
  const [tab, setTab] = useState('chat');
  const [modal, setModal] = useState<'media' | 'invite' | null>(null);
  const [mode, setMode] = useState('link');
  const [url, setUrl] = useState('');
  const [addingLink, setAddingLink] = useState(false);
  const [text, setText] = useState('');
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [clearKey, setClearKey] = useState(0);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState('');
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [picker, setPicker] = useState<'reaction' | 'chat' | null>(null);
  const [favoriteEmojis, setFavoriteEmojis] = useState(readFavoriteEmojis);
  useEffect(() => saveFavoriteEmojis(favoriteEmojis), [favoriteEmojis]);
  const [gifPicker, setGifPicker] = useState(false);
  const [vote, setVote] = useState(false);
  const [votes, setVotes] = useState(0);
  const file = useRef<HTMLInputElement>(null);
  const chatEnd = useRef<HTMLDivElement>(null);
  const disabled = s.locked && !sync.moderator;
  const twitch = twitchSource(s.source);
  const isEmbedded =
    !localStream &&
    !sync.remoteStream &&
    (!!youtubeId(s.source) || !!twitch || !!vimeoSource(s.source));
  function toast(message: string) {
    setNotice(message);
    setTimeout(() => setNotice(''), 4000);
  }
  async function copyRoomCode() {
    try {
      await navigator.clipboard.writeText(room);
      toast('Room code copied.');
    } catch {
      toast(`Your room code is ${room}.`);
    }
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
    const stopShare = () => setLocalStream(null);
    socket.on('vote-state', voteState);
    socket.on('vote-result', voteResult);
    socket.on('share-stop', stopShare);
    return () => {
      socket.off('reaction', r);
      socket.off('settings', settings);
      socket.off('vote-state', voteState);
      socket.off('vote-result', voteResult);
      socket.off('share-stop', stopShare);
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
  useEffect(() => () => uploadAbort.current?.abort(), []);
  useEffect(() => {
    if (!sync.connected) setLocalStream(null);
  }, [sync.connected]);
  function toggle() {
    const player = s.controller?.source === s.source ? s.controller : video.current;
    if (s.needsInteraction) {
      const attempt =
        s.controller?.source === s.source ? s.controller.enableAudio() : player?.play();
      attempt
        ?.then(() => s.set({ needsInteraction: false }))
        .catch(() => toast('Tap play again to allow video and audio.'));
      return;
    }
    if (disabled || (!s.source && !localStream && !sync.remoteStream)) return;
    if (!player) {
      toast('The player is still loading. Try play again in a moment.');
      return;
    }
    if (s.playing && s.vote) {
      sync.socket.current?.emit('vote-start');
      return;
    }
    if (s.playing) player.pause();
    else player.play().catch(() => s.set({ needsInteraction: true }));
    s.set({ playing: !s.playing });
    sync.broadcast();
  }
  function youtubeAction(action: YouTubeAction) {
    const state = useStore.getState();
    if (disabled) {
      sync.socket.current?.emit('request-sync');
      return;
    }
    if (action.playing === false && state.playing && state.vote) {
      sync.socket.current?.emit('vote-start');
      sync.socket.current?.emit('request-sync');
      return;
    }
    state.set(action);
    sync.broadcast(action);
  }
  function load(item: QueueItem) {
    if (disabled) return;
    sync.selectMedia(item.id).catch((error) => toast(error.message));
  }
  function next() {
    if (!s.queue.length) return;
    const index = s.queue.findIndex((q) => q.id === s.mediaId);
    load(s.queue[(index + 1) % s.queue.length]);
  }
  async function localFile(f: File) {
    if (disabled || uploading) return;
    if (!sync.connected || !sync.uploadToken) {
      toast('Wait for the room connection before uploading.');
      return;
    }
    setUploading(true);
    setUploadName(f.name);
    setUploadStatus({
      loaded: 0,
      total: f.size,
      percent: 0,
      bytesPerSecond: 0,
      remainingSeconds: null,
      phase: 'checking',
    });
    const abort = new AbortController();
    uploadAbort.current = abort;
    try {
      const config = await fetch(apiUrl('/api/media/config'), { signal: abort.signal });
      if (!config.ok || !config.headers.get('content-type')?.includes('application/json'))
        throw new Error(
          'The room server needs the latest upload update. Redeploy it, then rejoin the room.',
        );
      const { maxUploadBytes } = await config.json();
      if (!Number.isFinite(maxUploadBytes) || maxUploadBytes <= 0)
        throw new Error('The room server returned an invalid file size limit.');
      if (f.size > maxUploadBytes)
        throw new Error(
          `This file is ${formatBytes(f.size)}. The room server allows up to ${formatBytes(maxUploadBytes)} per file.`,
        );
      await uploadFile(
        apiUrl(`/api/rooms/${room}/media?name=${encodeURIComponent(f.name)}`),
        f,
        sync.uploadToken,
        abort.signal,
        setUploadStatus,
      );
      // Large uploads already live on the room server; avoid duplicating them in browser storage.
      if (f.size <= 100 * 1024 ** 2) void stageFile(f).catch(() => {});
      setModal(null);
      toast('Video added. Everyone in the room can watch it now.');
    } catch (error) {
      if (!abort.signal.aborted)
        toast(error instanceof Error ? error.message : 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
      setUploadStatus(null);
      uploadAbort.current = null;
      if (file.current) file.current.value = '';
    }
  }
  async function addLink() {
    if (addingLink) return;
    setAddingLink(true);
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw Error();
      const title = decodeURIComponent(parsed.pathname.split('/').pop() || parsed.hostname);
      await sync.addToQueue(url, title);
      setModal(null);
      setUrl('');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Enter a valid http or https video URL.');
    } finally {
      setAddingLink(false);
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
    } catch (error) {
      toast(
        error instanceof Error ? error.message : 'Screen sharing was cancelled or is unavailable.',
      );
    }
  }
  async function camera() {
    try {
      await sofa.setDevices(!cameraOn, mic);
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Camera access is unavailable.');
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
    setPicker(null);
  }
  const participants = sync.members.length ? sync.members : [{ id: 'local', name: 'You' }];
  const uploadPanel = uploadStatus && (
    <UploadProgress
      progress={uploadStatus}
      name={uploadName}
      onCancel={() => {
        uploadAbort.current?.abort();
        toast('Upload cancelled.');
      }}
    />
  );
  return (
    <div
      className="app"
      style={
        sync.options.branding.background
          ? {
              backgroundImage: `linear-gradient(rgb(0 0 0 / 72%), rgb(0 0 0 / 72%)), url("${apiUrl(sync.options.branding.background)}")`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }
          : undefined
      }
    >
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
              <button
                className="room-tag room-code-badge"
                title="Copy room code"
                onClick={copyRoomCode}
              >
                {room} <Copy size={12} />
              </button>
              <span className="meta-divider" />
              <Lock size={12} /> Shared room <span className="meta-divider" />
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
            {sync.roomError ||
              'The room connection is unavailable. Chat and playback sync will reconnect automatically when the service is back online.'}
          </div>
        )}
        {/passcode/i.test(sync.roomError) && (
          <form
            className="passcode-form"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              sync.joinPasscode(String(data.get('passcode') || ''));
            }}
          >
            <input
              name="passcode"
              type="password"
              className="url-input"
              aria-label="Room passcode"
              placeholder="Room passcode"
              autoComplete="current-password"
              required
              maxLength={128}
            />
            <button className="yellow-btn" type="submit">
              Unlock room
            </button>
          </form>
        )}
        {uploadStatus && !(modal === 'media' && mode === 'local') && uploadPanel}
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
                <MediaEngine
                  ref={video}
                  stream={localStream || sync.remoteStream}
                  muted={!!localStream}
                  onAction={youtubeAction}
                  onEnded={() => {
                    if (sync.host) next();
                  }}
                />
                {!isEmbedded && <div className="video-shade" />}
                {(s.source || localStream || sync.remoteStream) &&
                  !isEmbedded &&
                  (!s.playing || s.needsInteraction) && (
                    <button
                      className="center-play"
                      aria-label={
                        s.needsInteraction ? 'Tap to start video and audio' : 'Play video'
                      }
                      onClick={toggle}
                    >
                      <Play size={28} fill="currentColor" />
                    </button>
                  )}
                {s.source || localStream || sync.remoteStream ? (
                  !isEmbedded && (
                    <div className="film-label">
                      <span className="film-pill">
                        <Film size={12} /> YOUR MEDIA
                      </span>
                      <h2>{s.title || 'Live screen share'}</h2>
                      <span>Grab a snack. Get comfortable.</span>
                    </div>
                  )
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
                <GifOverlay socket={sync.socket.current} />
                {vote && (
                  <div className="vote-card">
                    Pause for a moment?{' '}
                    <button onClick={() => sync.socket.current?.emit('vote-yes')}>
                      Vote yes · {votes}
                    </button>
                  </div>
                )}
              </div>
              {(s.mediaError || s.needsUnmute || s.needsInteraction) && (
                <div className="player-notice" role="status">
                  <span>
                    {s.mediaError ||
                      (s.needsInteraction
                        ? 'Tap once to allow playback on this device.'
                        : 'Playing in sync with sound off on this device.')}
                  </span>
                  {/screen.?shar/i.test(s.mediaError) && (
                    <button
                      className="outline-btn"
                      onClick={async () => {
                        try {
                          const details = await sync.screenDiagnostics();
                          await navigator.clipboard.writeText(JSON.stringify(details, null, 2));
                          toast('Connection details copied.');
                        } catch {
                          toast('Could not copy connection details on this device.');
                        }
                      }}
                    >
                      Copy connection details
                    </button>
                  )}
                  {!s.mediaError && (
                    <button
                      className="outline-btn"
                      onClick={() => {
                        if (s.controller?.source === s.source) {
                          if (!s.volume) s.set({ volume: 0.75 });
                          s.controller.enableAudio().catch(() => s.set({ needsInteraction: true }));
                        } else toggle();
                      }}
                    >
                      {s.needsUnmute ? 'Enable sound' : 'Start playback'}
                    </button>
                  )}
                </div>
              )}
              {twitch?.kind === 'clip' && (
                <div className="player-notice">
                  Twitch clips use their own playback controls. Use screen share if everyone needs
                  the exact same moment.
                </div>
              )}
              <Controls
                video={video}
                disabled={
                  disabled ||
                  (!s.source && !localStream && !sync.remoteStream) ||
                  (isEmbedded && s.controller?.source !== s.source)
                }
                onToggle={toggle}
                onNext={next}
                onChange={sync.broadcast}
                onResync={() => {
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
                    {localStream || sync.remoteStream
                      ? 'Live screen share with your room.'
                      : s.source
                        ? 'Everyone is watching the same moment.'
                        : 'Add something to start the night.'}
                  </small>
                </div>
                <span className="source-badge">
                  {localStream || sync.remoteStream ? 'LIVE' : s.source ? 'IN SYNC' : 'EMPTY ROOM'}
                </span>
              </div>
              <button className="outline-btn" onClick={() => setModal('media')} disabled={disabled}>
                <Plus size={15} /> Add media
              </button>
              <button
                className="outline-btn"
                disabled={
                  !sync.connected || s.queue.length < 2 || !!localStream || !!sync.remoteStream
                }
                onClick={() => void sync.voteSkip().catch((error: Error) => toast(error.message))}
              >
                {sync.skipVote
                  ? `Skip vote ${sync.skipVote.votes}/${sync.skipVote.needed}`
                  : 'Vote to skip'}
              </button>
            </div>
            <div className="interaction-bar">
              <div className="reaction-buttons">
                <span>FEEL SOMETHING?</span>
                {favoriteEmojis.slice(0, 5).map((e) => (
                  <button key={e} title={`React ${e}`} onClick={() => react(e)}>
                    {e}
                  </button>
                ))}
                <button
                  className="more-reactions"
                  title="Choose emojis and edit favorites"
                  aria-label="Choose emojis and edit favorites"
                  onClick={() => setPicker('reaction')}
                >
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
                    try {
                      await sofa.setDevices(cameraOn, !mic);
                    } catch (error) {
                      toast(
                        error instanceof Error
                          ? error.message
                          : 'Microphone access is unavailable.',
                      );
                    }
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
            <SofaRoom {...sofa} self={sync.socket.current?.id} members={sync.members} />
            {tab === 'chat' ? (
              <>
                {!!sync.options.branding.emotes?.length && (
                  <div className="chat-emote-pack">
                    {sync.options.branding.emotes.map((emote) => (
                      <button
                        key={emote.id}
                        title={`Show ${emote.name} on screen`}
                        onClick={() =>
                          void sync.overlay(emote.url).catch((error: Error) => toast(error.message))
                        }
                      >
                        <img src={apiUrl(emote.url)} alt={emote.name} />
                      </button>
                    ))}
                  </div>
                )}
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
                          {m.badge && <span className="custom-badge">{m.badge}</span>}
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
                    onOverlay={(url) => {
                      void sync
                        .overlay(url)
                        .then(() => setGifPicker(false))
                        .catch((error: Error) => toast(error.message));
                    }}
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
                      <button title="Emoji picker" onClick={() => setPicker('chat')}>
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
                  <div className="queue-row" key={item.id}>
                    <div className="queue-move">
                      {[-1, 1].map((direction) => (
                        <button
                          key={direction}
                          aria-label={`Move ${item.title} ${direction < 0 ? 'up' : 'down'}`}
                          disabled={
                            disabled ||
                            !sync.connected ||
                            i + direction < 0 ||
                            i + direction >= s.queue.length
                          }
                          onClick={() => {
                            const ids = s.queue.map((item) => item.id);
                            [ids[i], ids[i + direction]] = [ids[i + direction], ids[i]];
                            void sync
                              .reorderQueue(ids)
                              .catch((error: Error) => toast(error.message));
                          }}
                        >
                          {direction < 0 ? '↑' : '↓'}
                        </button>
                      ))}
                    </div>
                    <button
                      className={`queue-item ${s.mediaId === item.id ? 'current' : ''}`}
                      onClick={() => !disabled && load(item)}
                    >
                      <div
                        className="queue-thumb"
                        style={{ backgroundImage: `url(${item.image})` }}
                      >
                        <span>{item.duration}</span>
                      </div>
                      <div>
                        <small>
                          {s.mediaId === item.id ? 'NOW PLAYING' : `0${i + 1} / UP NEXT`}
                        </small>
                        <strong>{item.title}</strong>
                        <p>{item.subtitle}</p>
                      </div>
                      <Play size={14} />
                    </button>
                    <button
                      className="queue-remove"
                      title={`Remove ${item.title}`}
                      aria-label={`Remove ${item.title} from queue`}
                      disabled={disabled || !sync.connected}
                      onClick={() =>
                        sync.removeMedia(item.id).catch((error) => toast(error.message))
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
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
                <ModerationDashboard sync={sync} notify={toast} />
              </div>
            ) : (
              <div className="panel-content">
                <h3>Make yourself at home.</h3>
                <p className="panel-description">A little control over the chaos.</p>
                <form
                  className="name-settings"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    try {
                      const result = await sync.rename(nameDraft);
                      setName(saveName(result.name));
                      setNameDraft(result.name);
                      toast('Your name has been updated.');
                    } catch (error) {
                      toast(error instanceof Error ? error.message : 'Could not update your name.');
                    }
                  }}
                >
                  <label className="input-label" htmlFor="room-display-name">
                    YOUR NAME
                  </label>
                  <div className="compose-input">
                    <input
                      id="room-display-name"
                      required
                      maxLength={32}
                      value={nameDraft}
                      onChange={(event) => setNameDraft(event.target.value)}
                      autoComplete="nickname"
                    />
                    <button className="outline-btn" type="submit" disabled={!sync.connected}>
                      Save
                    </button>
                  </div>
                </form>
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
                  <p>
                    {sync.options.persistent
                      ? 'Room settings and link queues are saved. Chat remains ephemeral.'
                      : 'Temporary rooms close when everyone leaves. Enable persistence below to keep this room.'}
                  </p>
                </div>
                <RoomDashboard room={room} sync={sync} notify={toast} />
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
                <p>Give your friends the code. They can enter it on the home screen.</p>
                <div className="invite-code" data-short={/^\d{5}$/.test(room)}>
                  <span className="input-label">ROOM CODE</span>
                  <strong>{room}</strong>
                  <button className="yellow-btn full" onClick={copyRoomCode}>
                    <Copy size={16} /> Copy room code
                  </button>
                </div>
                <div className="invite-link">
                  <span>
                    {location.origin}/party/{room}
                  </span>
                  <button
                    title="Copy invite link"
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
                <span className="modal-foot">Share the code or send the full invite link.</span>
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
                      Direct MP4, WebM, HLS streams, YouTube, and Vimeo. YouTube syncs with the
                      room; Vimeo uses its own playback controls.
                    </p>
                    <button className="yellow-btn full" onClick={addLink} disabled={addingLink}>
                      {addingLink ? 'Finding the player…' : 'Find player & add'}{' '}
                      <ArrowRight size={16} />
                    </button>
                  </>
                ) : mode === 'local' ? (
                  uploadStatus ? (
                    uploadPanel
                  ) : (
                    <button
                      className="drop-zone"
                      disabled={uploading || !sync.connected}
                      onClick={() => file.current?.click()}
                    >
                      <Upload size={30} />
                      <strong>
                        {uploading ? 'Uploading for the room…' : 'Upload once. Everyone watches.'}
                      </strong>
                      <span>Choose a video or audio file</span>
                      <small>
                        {uploading
                          ? 'Keep this tab open until the upload finishes.'
                          : 'Shared temporarily with the people in this room.'}
                      </small>
                    </button>
                  )
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
        accept=".mp4,.webm,.mkv,.mov,.mp3,.m4a,.ogg,.wav"
        onChange={(e) => {
          if (e.target.files?.[0]) localFile(e.target.files[0]);
        }}
      />
      {picker && (
        <Suspense
          fallback={
            <div className="toast" role="status">
              Loading emojis…
            </div>
          }
        >
          <EmojiPicker
            mode={picker}
            favorites={favoriteEmojis}
            onClose={() => setPicker(null)}
            onFavorite={(emoji) =>
              setFavoriteEmojis((values) => toggleFavoriteEmoji(values, emoji))
            }
            onPick={(emoji) => {
              if (picker === 'chat') setText((value) => value + emoji);
              else react(emoji);
            }}
          />
        </Suspense>
      )}
      {notice && (
        <div className="toast">
          <Check size={16} />
          {notice}
        </div>
      )}
    </div>
  );
}
