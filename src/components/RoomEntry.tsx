import { useState } from 'react';
import { ArrowRight, Users, Zap } from 'lucide-react';
import { saveName, savedName } from '../lib/identity';

export function RoomEntry({ room, onJoin }: { room: string; onJoin: (name: string) => void }) {
  const [name, setName] = useState(savedName);
  return (
    <div className="app lobby-app">
      <header className="header">
        <a className="brand" href="/">
          <span className="brand-mark">
            <Zap size={22} fill="currentColor" />
          </span>
          Binge <span>W Me</span>
        </a>
        <span className="lobby-no-account">YOU'RE INVITED</span>
      </header>
      <main className="entry-main">
        <section className="lobby-panel">
          <div className="lobby-panel-top">
            <span className="lime-dot" /> ROOM {room}
            <Users size={16} />
          </div>
          <form
            className="lobby-panel-body entry-form"
            onSubmit={(event) => {
              event.preventDefault();
              onJoin(saveName(name));
            }}
          >
            <div className="eyebrow">SAVE YOURSELF A SEAT</div>
            <h1>
              Who's <span>watching?</span>
            </h1>
            <p>Choose the name your friends will see in the room.</p>
            <label className="input-label" htmlFor="invite-name">
              YOUR NAME <span>OPTIONAL</span>
            </label>
            <input
              className="url-input"
              id="invite-name"
              autoFocus
              autoComplete="nickname"
              maxLength={32}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="What should we call you?"
            />
            <button className="yellow-btn full" type="submit">
              Join room {/^\d{5}$/.test(room) ? room : ''}
              <ArrowRight size={17} />
            </button>
            <small>Leave it blank to join as Guest. No account needed.</small>
            <a className="entry-back" href="/">
              Back to home
            </a>
          </form>
        </section>
      </main>
    </div>
  );
}
