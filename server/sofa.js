export function sofaSnapshot(room) {
  return [...(room.cameras || new Map())].map(([id, devices]) => ({ id, ...devices }));
}
export function registerSofa(socket, { io, state, roomCode }) {
  socket.on('camera-start', (devices, reply) => {
    const room = state();
    if (!room || !room.members.has(socket.id)) return reply?.({ error: 'Join the room first.' });
    if (typeof devices?.video !== 'boolean' || typeof devices?.audio !== 'boolean') return;
    if (!devices.video && !devices.audio)
      return reply?.({ error: 'Enable a camera or microphone first.' });
    if (socket.data.micMuted && devices.audio)
      return reply?.({ error: 'A moderator has muted your microphone.' });
    room.cameras ||= new Map();
    if (!room.cameras.has(socket.id) && room.cameras.size >= 12)
      return reply?.({ error: 'All 12 live sofa seats are occupied.' });
    socket.to(roomCode()).emit('camera-stop', socket.id);
    room.cameras.set(socket.id, { video: devices.video, audio: devices.audio });
    io.to(roomCode()).emit('camera-state', sofaSnapshot(room));
    for (const id of room.members.keys()) if (id !== socket.id) socket.emit('camera-request', id);
    reply?.({ ok: true });
  });
  socket.on('camera-stop', () => {
    const room = state();
    room?.cameras?.delete(socket.id);
    socket.to(roomCode()).emit('camera-stop', socket.id);
    if (room) io.to(roomCode()).emit('camera-state', sofaSnapshot(room));
  });
  socket.on('camera-signal', ({ to, publisher, description, candidate } = {}) => {
    const room = state();
    if (!room?.members.has(to) || !room.cameras?.has(publisher)) return;
    if (socket.id !== publisher && to !== publisher) return;
    io.to(to).emit('camera-signal', { from: socket.id, publisher, description, candidate });
  });
}
