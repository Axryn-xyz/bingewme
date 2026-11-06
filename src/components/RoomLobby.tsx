import { useState } from 'react';
import { ArrowRight, ArrowUpRight, Check, Link, MonitorPlay, Plus, Users, Zap } from 'lucide-react';
import { parseRoomCode } from '../lib/rooms';
import { apiUrl } from '../lib/backend';
import { savedName, prepareEntry } from '../lib/identity';

export function RoomLobby() {
  const [name, setName] = useState(savedName);
  const [room, setRoom] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState<'create' | 'join' | null>(null);
  function enter(code: string) {
    prepareEntry(code, name);
    window.location.assign(`/party/${code}`);
  }
  async function create() {
    if (pending) return;
    setPending('create');
    setError('');
    try {
      const response = await fetch(apiUrl('/api/rooms'), {
        method: 'POST',
        signal: AbortSignal.timeout(20000),
      });
      const data = await response.json();
      if (!response.ok || !/^\d{5}$/.test(data.code)) {
        throw new Error(data.error || 'Could not create a room. Please try again.');
      }
      enter(data.code);
    } catch (error) {
      setError(
        error instanceof Error && error.message.startsWith('All room codes')
          ? error.message
          : 'Could not reach the room service. Please try again in a moment.',
      );
      setPending(null);
    }
  }
  async function join(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    const code = parseRoomCode(room);
    if (!code) {
      setError('Enter a five-digit room code or paste an invite link.');
      return;
    }
    setPending('join');
    setError('');
    try {
      if (/^\d{5}$/.test(code)) {
        const response = await fetch(apiUrl(`/api/rooms/${code}`), {
          signal: AbortSignal.timeout(20000),
        });
        if (response.status === 404) {
          setError('That code is no longer active. Double-check it or ask for a new invite.');
          setPending(null);
          return;
        }
        if (!response.ok) throw new Error('Room service unavailable');
        const data = await response.json();
        if (data.code !== code) throw new Error('Room service unavailable');
      }
      enter(code);
    } catch {
      setError('Could not reach the room service. Please try again in a moment.');
      setPending(null);
    }
  }
  return (
    <div className="app lobby-app">
      <header className="header">
        <a className="brand" href="/">
          <span className="brand-mark">
            <Zap size={22} fill="currentColor" />
          </span>
          Binge <span>W Me</span>
        </a>
        <span className="header-center">
          <span className="live-dot" /> YOUR PEOPLE. ONE SCREEN.
        </span>
        <span className="lobby-no-account">
          NO ACCOUNT NEEDED <ArrowUpRight size={14} />
        </span>
      </header>
      <main className="lobby-main">
        <section className="lobby-intro">
          <div className="eyebrow">
            <span className="tiny-dot" /> LESS SCROLLING. MORE TOGETHER.
          </div>
          <h1>
            Your next good night
            <br />
            starts <span>right here.</span>
            <span className="title-star">✳</span>
          </h1>
          <p>
            Make a room. Send the link. Watch something together.
            <br />
            Different sofas, same moment.
          </p>
          <div className="lobby-benefits">
            <span>
              <Check size={13} /> No sign-up
            </span>
            <span>
              <Check size={13} /> Your own room
            </span>
            <span>
              <Check size={13} /> In sync
            </span>
          </div>
        </section>
        <section className="lobby-panel" aria-label="Create or join a room">
          <div className="lobby-panel-top">
            <span className="lime-dot" /> SAVE YOUR PEOPLE A SEAT <MonitorPlay size={16} />
          </div>
          <div className="lobby-panel-body">
            <label className="input-label" htmlFor="display-name">
              WHAT SHOULD WE CALL YOU? <span>OPTIONAL</span>
            </label>
            <input
              className="url-input"
              id="display-name"
              maxLength={32}
              autoComplete="nickname"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <div className="lobby-create">
              <span className="lobby-card-icon">
                <Plus size={22} />
              </span>
              <h2>Start your own hangout.</h2>
              <p>One room. Five digits. Tell your friends and choose what plays.</p>
              <button className="yellow-btn full" disabled={!!pending} onClick={create}>
                <Plus size={17} />{' '}
                {pending === 'create' ? 'Creating your room…' : 'Create new room'}{' '}
                <ArrowUpRight size={17} />
              </button>
            </div>
            <div className="lobby-or">
              <span /> ALREADY HAVE AN INVITE? <span />
            </div>
            <form onSubmit={join}>
              <label className="input-label" htmlFor="room-code">
                FIVE-DIGIT CODE OR INVITE LINK
              </label>
              <div className="join-room-input">
                <Link size={16} />
                <input
                  id="room-code"
                  required
                  placeholder="12345 or paste an invite link"
                  inputMode="numeric"
                  autoComplete="off"
                  spellCheck={false}
                  value={room}
                  onChange={(e) => {
                    setRoom(e.target.value);
                    setError('');
                  }}
                  aria-describedby={error ? 'join-error' : undefined}
                  aria-invalid={!!error}
                />
                <button type="submit" title="Join room" disabled={!!pending}>
                  <ArrowRight size={20} />
                </button>
              </div>
              {error && (
                <p className="lobby-error" id="join-error" role="alert">
                  {error}
                </p>
              )}
              <button className="outline-btn full lobby-join" type="submit" disabled={!!pending}>
                <Users size={16} /> {pending === 'join' ? 'Finding your room…' : 'Join room'}{' '}
                <ArrowRight size={15} />
              </button>
            </form>
          </div>
          <div className="lobby-panel-foot">
            <span className="connection-dot" /> Nothing plays until you add it.
          </div>
        </section>
      </main>
      <footer>
        <span className="footer-brand">
          Binge <span>W Me</span>
          <span className="footer-dot">✳</span>
        </span>
        <span>A LITTLE LESS SCROLLING. A LOT MORE TOGETHER.</span>
      </footer>
    </div>
  );
}
