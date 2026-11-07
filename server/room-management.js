import { canModerate, hashPasscode } from './room-store.js';

export function roomOptions(room) {
  return {
    persistent: !!room.persistent,
    hasPasscode: !!room.passcodeHash,
    branding: room.branding || {},
  };
}
export function registerManagement(
  socket,
  { io, state, roomCode, store, update, publishMedia, stopScreenShare },
) {
  const publish = () => {
    const room = state();
    if (!room) return;
    store.save(roomCode(), room);
    io.to(roomCode()).emit('room-options', roomOptions(room));
    update();
    for (const id of room.members.keys()) {
      const target = io.sockets.sockets.get(id);
      if (target && canModerate(room, target))
        target.emit('moderation-state', {
          bans: [...(room.bans || new Map())].map(([id, value]) => ({ id, ...value })),
        });
    }
  };
  socket.on('room-manage', async (data, reply) => {
    const room = state();
    if (!canModerate(room, socket))
      return reply?.({ error: 'Only hosts and moderators can manage this room.' });
    try {
      const target = typeof data?.target === 'string' ? io.sockets.sockets.get(data.target) : null;
      const hash = target?.data.identityHash;
      if (data.action === 'configure') {
        if (socket.id !== room.host) throw new Error('Only the host can change room access.');
        let passcodeHash = room.passcodeHash;
        if (typeof data.passcode === 'string') {
          if (data.passcode.length > 128 || (data.passcode && data.passcode.length < 4))
            throw new Error('Use a passcode with 4–128 characters.');
          passcodeHash = await hashPasscode(data.passcode);
        }
        if (state() !== room || room.host !== socket.id)
          throw new Error('Room ownership changed during the update.');
        if (typeof data.persistent === 'boolean') room.persistent = data.persistent;
        room.passcodeHash = passcodeHash;
      } else if (data.action === 'unban') {
        room.bans?.delete(data.target);
      } else if (data.action === 'branding') {
        room.branding ||= {};
        if (data.clearBackground) {
          store.removeAsset(room.branding.background);
          room.branding.background = '';
        }
        if (typeof data.removeEmote === 'string') {
          store.removeAsset(
            room.branding.emotes?.find((emote) => emote.id === data.removeEmote)?.url,
          );
          room.branding.emotes = (room.branding.emotes || []).filter(
            (emote) => emote.id !== data.removeEmote,
          );
        }
        if (data.badges) {
          if (!Array.isArray(data.badges) || data.badges.length > 16)
            throw new Error('Use at most 16 custom badges.');
          room.branding.badges = data.badges.filter(
            (badge) => typeof badge === 'string' && badge.length > 0 && badge.length <= 24,
          );
        }
      } else {
        if (!target || !room.members.has(target.id) || target.id === socket.id)
          throw new Error('Choose another person in this room.');
        if (target.id === room.host || hash === room.ownerHash)
          throw new Error('The host cannot be moderated.');
        if (data.action === 'kick' || data.action === 'ban') {
          if (data.action === 'ban') {
            room.bans ||= new Map();
            room.bans.set(hash, {
              name: room.members.get(target.id),
              at: Date.now(),
              reason: String(data.reason || '').slice(0, 200),
            });
          }
          const targets =
            data.action === 'ban'
              ? [...room.members.keys()]
                  .map((id) => io.sockets.sockets.get(id))
                  .filter((member) => member?.data.identityHash === hash)
              : [target];
          for (const member of targets) {
            if (room.sharing === member.id) stopScreenShare(roomCode(), room);
            member.emit(
              'room-error',
              data.action === 'ban'
                ? 'You are banned from this room.'
                : 'You were removed from this room.',
            );
            member.disconnect(true);
          }
        } else if (data.action === 'mute-chat' || data.action === 'mute-mic') {
          const key = data.action === 'mute-chat' ? 'chatMutes' : 'micMutes';
          room[key] ||= new Set();
          if (data.muted === false) room[key].delete(hash);
          else room[key].add(hash);
          for (const id of room.members.keys()) {
            const member = io.sockets.sockets.get(id);
            if (member?.data.identityHash === hash) {
              member.data[data.action === 'mute-chat' ? 'chatMuted' : 'micMuted'] =
                data.muted !== false;
              if (data.action === 'mute-mic' && data.muted !== false) {
                const camera = room.cameras?.get(id);
                if (camera) camera.audio = false;
                member.emit('mic-muted');
              }
            }
          }
          if (data.action === 'mute-mic' && data.muted !== false) {
            const camera = room.cameras?.get(target.id);
            if (camera) camera.audio = false;
            target.emit('mic-muted');
            io.to(roomCode()).emit(
              'camera-state',
              [...(room.cameras || new Map())].map(([id, devices]) => ({ id, ...devices })),
            );
          }
        } else if (data.action === 'moderator') {
          if (socket.id !== room.host) throw new Error('Only the host can assign moderators.');
          room.moderators ||= new Set();
          if (data.enabled === false) room.moderators.delete(hash);
          else room.moderators.add(hash);
        } else if (data.action === 'transfer-host') {
          if (socket.id !== room.host) throw new Error('Only the host can transfer ownership.');
          room.host = target.id;
          room.ownerHash = hash;
        } else throw new Error('Unknown moderation action.');
      }
      publish();
      reply?.({ ok: true });
    } catch (error) {
      reply?.({ error: error.message || 'The room could not be updated.' });
    }
  });
  socket.on('badge-select', (badge, reply) => {
    const room = state();
    if (!room || (badge !== '' && !room.branding?.badges?.includes(badge)))
      return reply?.({ error: 'Choose a room badge.' });
    room.badgesByIdentity ||= new Map();
    room.badgesByIdentity.set(socket.data.identityHash, badge);
    publish();
    reply?.({ ok: true });
  });
  socket.on('queue-reorder', (ids, reply) => {
    const room = state();
    if (!room || (room.locked && !canModerate(room, socket)))
      return reply?.({ error: 'Queue controls are locked.' });
    if (
      !Array.isArray(ids) ||
      ids.length !== room.queue.length ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !room.queue.some((item) => item.id === id))
    )
      return reply?.({ error: 'The queue changed. Try again.' });
    room.queue = ids.map((id) => room.queue.find((item) => item.id === id));
    store.save(roomCode(), room);
    io.to(roomCode()).emit('queue-state', room.queue);
    reply?.({ ok: true });
  });
  socket.on('skip-vote', (_, reply) => {
    const room = state();
    if (!room || room.sharing || room.queue.length < 2)
      return reply?.({ error: 'Add another queued video before voting to skip.' });
    if (room.skipBallot?.mediaId !== room.state?.mediaId) {
      clearTimeout(room.skipTimer);
      room.skipBallot = {
        mediaId: room.state?.mediaId,
        votes: new Set(),
        ends: Date.now() + 10000,
      };
      room.skipTimer = setTimeout(() => {
        room.skipBallot = null;
        io.to(roomCode()).emit('skip-state', null);
      }, 10000);
    }
    room.skipBallot.votes.add(socket.id);
    const votes = [...room.skipBallot.votes].filter((id) => room.members.has(id)).length;
    if (votes > room.members.size / 2) {
      clearTimeout(room.skipTimer);
      room.skipBallot = null;
      const index = room.queue.findIndex((item) => item.id === room.state?.mediaId);
      publishMedia(roomCode(), room, room.queue[(index + 1) % room.queue.length], true);
      io.to(roomCode()).emit('skip-state', null);
    } else
      io.to(roomCode()).emit('skip-state', {
        votes,
        needed: Math.floor(room.members.size / 2) + 1,
        ends: room.skipBallot.ends,
      });
    reply?.({ ok: true });
  });
  socket.on('gif-overlay', (url, reply) => {
    const room = state();
    let valid =
      typeof url === 'string' && !!room?.branding?.emotes?.some((emote) => emote.url === url);
    try {
      const parsed = new URL(url);
      valid ||= parsed.protocol === 'https:' && /(^|\.)giphy\.com$/.test(parsed.hostname);
    } catch {
      /* Local room assets are valid without an origin. */
    }
    if (!room || socket.data.chatMuted || !valid)
      return reply?.({ error: 'Choose a room emote or a Giphy image.' });
    if (Date.now() - (socket.data.lastOverlay || 0) < 1200)
      return reply?.({ error: 'Give that reaction a moment.' });
    socket.data.lastOverlay = Date.now();
    io.to(roomCode()).emit('gif-overlay', {
      id: crypto.randomUUID(),
      url,
      name: room.members.get(socket.id),
    });
    reply?.({ ok: true });
  });
  return { publish };
}
