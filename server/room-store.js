import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { createRoomState } from './room-codes.js';
const derive = promisify(scrypt);
export const identityHash = (token) => createHash('sha256').update(token).digest('hex');
export async function hashPasscode(passcode) {
  if (!passcode) return '';
  const salt = randomBytes(16).toString('hex');
  return salt + ':' + (await derive(passcode, salt, 32)).toString('hex');
}
export async function checkPasscode(passcode, stored) {
  if (!stored) return true;
  if (typeof passcode !== 'string' || passcode.length > 128) return false;
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const actual = await derive(passcode, salt, 32);
  const expected = Buffer.from(hash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function canModerate(room, socket) {
  return (
    !!room &&
    !!socket &&
    (room.host === socket.id || room.moderators?.has(socket.data.identityHash))
  );
}
export function createRoomStore(
  filename = process.env.ROOM_DATABASE_PATH || resolve('data/rooms.sqlite'),
) {
  if (filename !== ':memory:') mkdirSync(dirname(resolve(filename)), { recursive: true });
  const database = new DatabaseSync(filename);
  database.exec(
    'PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS rooms (code TEXT PRIMARY KEY, payload TEXT NOT NULL)',
  );
  const write = database.prepare(
    'INSERT INTO rooms(code,payload) VALUES (?,?) ON CONFLICT(code) DO UPDATE SET payload=excluded.payload',
  );
  const remove = database.prepare('DELETE FROM rooms WHERE code=?');
  const assetDirectory =
    filename === ':memory:' ? resolve('data/assets') : resolve(dirname(filename), 'assets');
  const removeAsset = (url) => {
    if (
      typeof url !== 'string' ||
      !/^\/api\/room-assets\/[a-f0-9-]+\.(png|gif|webp|jpg)$/.test(url)
    )
      return;
    void unlink(resolve(assetDirectory, url.split('/').pop())).catch(() => {});
  };
  return {
    load() {
      return new Map(
        database
          .prepare('SELECT code,payload FROM rooms')
          .all()
          .map(({ code, payload }) => {
            const data = JSON.parse(payload);
            const room = {
              ...createRoomState(),
              ...data,
              members: new Map(),
              host: null,
              updatedAt: Date.now(),
              moderators: new Set(data.moderators || []),
              bans: new Map(data.bans || []),
              chatMutes: new Set(data.chatMutes || []),
              micMutes: new Set(data.micMutes || []),
              badgesByIdentity: new Map(data.badgesByIdentity || []),
            };
            if (room.state) room.state.playing = false;
            return [code, room];
          }),
      );
    },
    save(code, room) {
      if (!room.persistent) {
        remove.run(code);
        return;
      }
      const queue = room.queue.filter((item) => item.kind !== 'upload');
      const state =
        room.state && !room.sharing && !room.state.source?.startsWith('/api/media/')
          ? { ...room.state, playing: false }
          : null;
      write.run(
        code,
        JSON.stringify({
          persistent: true,
          ownerHash: room.ownerHash,
          passcodeHash: room.passcodeHash || '',
          locked: room.locked,
          voteEnabled: room.voteEnabled,
          queue,
          state,
          moderators: [...(room.moderators || [])],
          bans: [...(room.bans || [])],
          chatMutes: [...(room.chatMutes || [])],
          micMutes: [...(room.micMutes || [])],
          badgesByIdentity: [...(room.badgesByIdentity || [])],
          branding: room.branding || {},
        }),
      );
    },
    close: () => database.close(),
    assetDirectory,
    removeAsset,
    removeAssets(room) {
      removeAsset(room.branding?.background);
      room.branding?.emotes?.forEach((emote) => removeAsset(emote.url));
    },
  };
}
