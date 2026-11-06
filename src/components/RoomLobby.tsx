import { useState } from 'react';
import { ArrowRight, ArrowUpRight, Check, Link, MonitorPlay, Plus, Users, Zap } from 'lucide-react';
import { createRoomCode, parseRoomCode } from '../lib/rooms';

export function RoomLobby() {
  const [name, setName] = useState(() => sessionStorage.getItem('party-name') || '');
  const [room, setRoom] = useState('');
  const [error, setError] = useState('');
  function enter(code: string) {
    sessionStorage.setItem('party-name', name.trim().slice(0, 32) || 'Guest');
    window.location.assign(`/party/${code}`);
  }
  function join(e: React.FormEvent) {
    e.preventDefault();
    const code = parseRoomCode(room);
    if (!code) {
      setError('Paste a room link or a code with 3–80 letters, numbers, hyphens, or underscores.');
      return;
    }
    enter(code);
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
              <p>A fresh room with a unique link. You choose what plays.</p>
              <button className="yellow-btn full" onClick={() => enter(createRoomCode())}>
                <Plus size={17} /> Create new room <ArrowUpRight size={17} />
              </button>
            </div>
            <div className="lobby-or">
              <span /> ALREADY HAVE AN INVITE? <span />
            </div>
            <form onSubmit={join}>
              <label className="input-label" htmlFor="room-code">
                ROOM LINK OR CODE
              </label>
              <div className="join-room-input">
                <Link size={16} />
                <input
                  id="room-code"
                  required
                  placeholder="Paste a link or room code"
                  value={room}
                  onChange={(e) => {
                    setRoom(e.target.value);
                    setError('');
                  }}
                  aria-describedby={error ? 'join-error' : undefined}
                  aria-invalid={!!error}
                />
                <button type="submit" title="Join room">
                  <ArrowRight size={20} />
                </button>
              </div>
              {error && (
                <p className="lobby-error" id="join-error" role="alert">
                  {error}
                </p>
              )}
              <button className="outline-btn full lobby-join" type="submit">
                <Users size={16} /> Join room <ArrowRight size={15} />
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
