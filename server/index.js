import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { randomUUID } from 'node:crypto';
import { allocateRoomCode, createRoomState } from './room-codes.js';
const app = express();
const http = createServer(app);
const frontendOrigins = (process.env.FRONTEND_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const io = new Server(http, {
  maxHttpBufferSize: 100000,
  cors: { origin: frontendOrigins, methods: ['GET', 'POST'] },
});
const rooms = new Map();
app.use('/api', (req, res, next) => {
  res.vary('Origin');
  if (frontendOrigins.includes(req.headers.origin)) {
    res.set('Access-Control-Allow-Origin', req.headers.origin);
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.get('/api/health', (_, res) => res.json({ status: 'ok' }));
app.post('/api/rooms', (_, res) => {
  try {
    const code = allocateRoomCode(rooms);
    const room = createRoomState();
    rooms.set(code, room);
    // Give the creator time to navigate, without keeping abandoned reservations forever.
    room.reservationTimer = setTimeout(
      () => {
        if (rooms.get(code) === room && !room.members.size) rooms.delete(code);
      },
      5 * 60 * 1000,
    );
    room.reservationTimer.unref();
    res.set('Cache-Control', 'no-store').status(201).json({ code });
  } catch {
    res.status(503).json({ error: 'All room codes are in use. Please try again shortly.' });
  }
});
app.get('/api/rooms/:code', (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!/^\d{5}$/.test(req.params.code) || !rooms.has(req.params.code)) {
    return res
      .status(404)
      .json({ error: 'That room code is no longer active. Ask for a new invite.' });
  }
  res.json({ code: req.params.code });
});
app.get('/api/gifs', async (req, res) => {
  const query = String(req.query.q || '').slice(0, 80);
  const fallback = [
    {
      id: 'popcorn',
      title: 'Popcorn movie night',
      url: 'https://media.giphy.com/media/pUeXcg80cO8I8/giphy.gif',
    },
    {
      id: 'happy',
      title: 'Happy excited celebration',
      url: 'https://media.giphy.com/media/11sBLVxNs7v6WA/giphy.gif',
    },
    {
      id: 'wow',
      title: 'Wow surprised reaction',
      url: 'https://media.giphy.com/media/5VKbvrjxpVJCM/giphy.gif',
    },
    {
      id: 'yes',
      title: 'Yes applause clapping',
      url: 'https://media.giphy.com/media/l3q2XhfQ8oCkm1Ts4/giphy.gif',
    },
  ];
  if (!process.env.GIPHY_API_KEY)
    return res.json({
      gifs: fallback.filter((g) => !query || g.title.toLowerCase().includes(query.toLowerCase())),
    });
  try {
    const url = new URL('https://api.giphy.com/v1/gifs/' + (query ? 'search' : 'trending'));
    url.searchParams.set('api_key', process.env.GIPHY_API_KEY);
    url.searchParams.set('q', query);
    url.searchParams.set('limit', '12');
    url.searchParams.set('rating', 'pg');
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw Error();
    const json = await response.json();
    res.set('Cache-Control', 'public, max-age=120').json({
      gifs: json.data.map((g) => ({ id: g.id, title: g.title, url: g.images.fixed_height.url })),
    });
  } catch {
    res.json({ gifs: fallback });
  }
});
app.use(express.static('dist'));
app.get('*', (_, res) => res.sendFile(process.cwd() + '/dist/index.html'));
io.on('connection', (s) => {
  let room;
  let lastChat = 0;
  const state = () => rooms.get(room);
  const update = () => {
    const r = state();
    if (r)
      io.to(room).emit('members', {
        members: [...r.members].map(([id, name]) => ({ id, name })),
        host: r.host,
      });
  };
  const snapshot = () => {
    const r = state();
    if (!r?.state) return null;
    return {
      ...r.state,
      time:
        r.state.time + (r.state.playing ? ((Date.now() - r.updatedAt) / 1000) * r.state.rate : 0),
    };
  };
  s.on('join', (data) => {
    if (typeof data?.room !== 'string' || typeof data?.name !== 'string') return;
    if (room) return;
    const code = data.room.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9_-]{2,79}$/.test(code)) {
      return s.emit('room-error', 'That room code is invalid.');
    }
    let r = rooms.get(code);
    if (!r) {
      if (/^\d+$/.test(code)) {
        return s.emit('room-error', 'That room code is no longer active. Ask for a new invite.');
      }
      // Preserve existing shared links while new rooms use reserved five-digit codes.
      r = createRoomState(s.id);
      rooms.set(code, r);
    }
    if (r.members.size >= 100) {
      return s.emit('room-error', 'Room is full');
    }
    room = code;
    clearTimeout(r.reservationTimer);
    if (!r.host) r.host = s.id;
    r.members.set(s.id, data.name.slice(0, 32));
    s.join(room);
    update();
    s.emit('settings', { locked: r.locked, vote: r.voteEnabled });
    const current = snapshot();
    if (current) s.emit('sync', current);
    if (r.sharing) io.to(r.sharing).emit('share-request', s.id);
  });
  s.on('sync', (data) => {
    const r = state();
    if (!r || !r.members.has(s.id) || (r.locked && r.host !== s.id)) return;
    if (
      !data ||
      !Number.isFinite(data.time) ||
      data.time < 0 ||
      ![0.5, 0.75, 1, 1.25, 1.5, 2].includes(data.rate) ||
      typeof data.source !== 'string' ||
      data.source.length > 4096
    )
      return;
    if (data.source !== 'local' && !/^https?:\/\//.test(data.source)) return;
    r.state = {
      time: data.time,
      playing: !!data.playing,
      rate: data.rate,
      source: data.source,
      title: String(data.title || 'Untitled').slice(0, 200),
    };
    r.updatedAt = Date.now();
    s.to(room).emit('sync', r.state);
  });
  s.on('request-sync', () => {
    const current = snapshot();
    if (current) s.emit('sync', current);
  });
  s.on('settings', (data) => {
    const r = state();
    if (r?.host === s.id) {
      if (typeof data.locked === 'boolean') r.locked = data.locked;
      if (typeof data.vote === 'boolean') r.voteEnabled = data.vote;
      io.to(room).emit('settings', { locked: r.locked, vote: r.voteEnabled });
    }
  });
  s.on('vote-start', () => {
    const r = state();
    if (!r || !r.voteEnabled || r.ballot) return;
    r.ballot = new Set([s.id]);
    io.to(room).emit('vote-state', { votes: 1, ends: Date.now() + 5000 });
    r.voteTimer = setTimeout(() => {
      if (!rooms.has(room)) return;
      const passed = r.ballot.size > r.members.size / 2;
      const current = snapshot();
      if (passed && current) {
        r.state = { ...current, playing: false };
        r.updatedAt = Date.now();
        io.to(room).emit('sync', r.state);
      }
      io.to(room).emit('vote-result', { passed });
      r.ballot = null;
    }, 5000);
  });
  s.on('vote-yes', () => {
    const r = state();
    if (r?.ballot) {
      r.ballot.add(s.id);
      io.to(room).emit('vote-state', { votes: r.ballot.size });
    }
  });
  s.on('chat', (m) => {
    if (!room || typeof m?.text !== 'string' || !m.text.trim() || Date.now() - lastChat < 300)
      return;
    lastChat = Date.now();
    io.to(room).emit('chat', {
      id: randomUUID(),
      name: state()?.members.get(s.id) || 'Guest',
      text: m.text.slice(0, 2000),
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      color: '#c5b6fa',
    });
  });
  s.on('draw', (data) => {
    if (
      !state() ||
      !data ||
      !['x', 'y', 'px', 'py', 'width'].every((k) => Number.isFinite(data[k])) ||
      !/^#[0-9a-f]{6}$/i.test(data.color) ||
      data.width < 1 ||
      data.width > 32
    )
      return;
    s.to(room).emit('draw', data);
  });
  s.on('reaction', (data) => {
    if (room && typeof data === 'string' && data.length < 16) s.to(room).emit('reaction', data);
  });
  s.on('file-metadata', (data) => {
    if (state() && data && typeof data.name === 'string' && typeof data.hash === 'string')
      s.to(room).emit('file-metadata', {
        name: data.name.slice(0, 200),
        hash: data.hash,
        size: data.size,
      });
  });
  s.on('signal', (data) => {
    if (state()?.members.has(data?.to)) io.to(data.to).emit('signal', { ...data, from: s.id });
  });
  s.on('share-stop', () => {
    const r = state();
    if (r?.sharing === s.id) {
      r.sharing = null;
      s.to(room).emit('share-stop');
    }
  });
  s.on('share-start', () => {
    const r = state();
    if (!r || (r.locked && r.host !== s.id)) return;
    r.sharing = s.id;
    for (const id of r.members.keys()) if (id !== s.id) s.emit('share-request', id);
  });
  s.on('disconnect', () => {
    const r = state();
    if (!r) return;
    r.members.delete(s.id);
    if (!r.members.size) {
      clearTimeout(r.voteTimer);
      rooms.delete(room);
    } else {
      if (r.host === s.id) r.host = r.members.keys().next().value;
      if (r.sharing === s.id) r.sharing = null;
      update();
    }
  });
});
http.listen(process.env.PORT || 3001, () =>
  console.log('Binge W Me room server ready on port ' + (process.env.PORT || 3001)),
);
