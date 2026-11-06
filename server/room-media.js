import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';

export function createRoomMedia({ app, io, rooms, publishMedia }) {
  const files = new Map();
  const directory = join(tmpdir(), `bingewme-${randomUUID()}`);
  const configuredLimit = Number(process.env.MAX_UPLOAD_BYTES);
  const maxBytes =
    Number.isSafeInteger(configuredLimit) && configuredLimit > 0
      ? configuredLimit
      : 2 * 1024 * 1024 * 1024;
  const activeUploads = new Set();
  app.get('/api/media/config', (_, res) =>
    res.set('Cache-Control', 'no-store').json({ maxUploadBytes: maxBytes }),
  );
  app.post('/api/rooms/:code/media', async (req, res) => {
    const room = rooms.get(req.params.code);
    const token = req.headers.authorization?.replace(/^Bearer /, '');
    if (!token) return res.status(401).json({ error: 'Join this room before uploading a file.' });
    const member =
      room &&
      [...room.members.keys()].find((id) => io.sockets.sockets.get(id)?.data.uploadToken === token);
    if (!member) return res.status(401).json({ error: 'Join this room before uploading a file.' });
    if (room.locked && room.host !== member)
      return res
        .status(403)
        .json({ error: 'Only the host can add media while controls are locked.' });
    if (activeUploads.has(member))
      return res.status(409).json({ error: 'Wait for your current upload to finish.' });
    if (room.queue.length >= 100) return res.status(409).json({ error: 'The room queue is full.' });
    const name = String(req.query.name || 'Untitled video')
      .replace(/[\x00-\x1f\x7f]/g, '')
      .slice(0, 200);
    const extension = name.split('.').pop()?.toLowerCase();
    const types = {
      mp4: 'video/mp4',
      webm: 'video/webm',
      mkv: 'video/x-matroska',
      mp3: 'audio/mpeg',
      m4a: 'audio/mp4',
      ogg: 'audio/ogg',
      wav: 'audio/wav',
      mov: 'video/quicktime',
    };
    if (!Object.hasOwn(types, extension))
      return res
        .status(415)
        .json({ error: 'Choose an MP4, WebM, MKV, MOV, MP3, M4A, OGG, or WAV file.' });
    if (Number(req.headers['content-length']) > maxBytes)
      return res.status(413).json({
        error: `This server allows files up to ${Math.floor(maxBytes / 1024 / 1024)} MB.`,
      });
    const id = randomUUID();
    const path = join(directory, id);
    let size = 0;
    activeUploads.add(member);
    try {
      await mkdir(directory, { recursive: true });
      const limit = new Transform({
        transform(chunk, _, done) {
          size += chunk.length;
          done(size > maxBytes ? new Error('Upload exceeds the server file limit.') : null, chunk);
        },
      });
      await pipeline(req, limit, createWriteStream(path, { flags: 'wx' }));
      if (!size) throw new Error('The selected file is empty.');
      if (rooms.get(req.params.code) !== room || !room.members.has(member))
        throw new Error('The room closed before the upload finished.');
      if (room.locked && room.host !== member)
        throw new Error('The host locked media controls during this upload.');
      if (room.queue.length >= 100) throw new Error('The room queue is full.');
      const item = {
        id,
        title: name,
        subtitle: 'Shared room upload',
        url: `/api/media/${id}`,
        image: '',
        duration: 'FILE',
        kind: 'upload',
      };
      files.set(id, { path, room: req.params.code, type: types[extension] });
      room.queue.push(item);
      publishMedia(req.params.code, room, item);
      res.status(201).json({ item });
    } catch (error) {
      await rm(path, { force: true }).catch(() => {});
      if (!res.destroyed)
        res
          .status(size > maxBytes ? 413 : 400)
          .json({ error: error.message || 'The upload failed. Try again.' });
    } finally {
      activeUploads.delete(member);
    }
  });
  app.get('/api/media/:id', (req, res) => {
    const file = files.get(req.params.id);
    if (!file || !rooms.has(file.room))
      return res.status(404).json({ error: 'This room file is no longer available.' });
    res.set('Cache-Control', 'private, no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    res.sendFile(file.path, { headers: { 'Content-Type': file.type } }, (error) => {
      if (error && !res.headersSent) res.status(error.statusCode || 500).end();
    });
  });
  return {
    removeItem(id, code) {
      const file = files.get(id);
      if (file?.room !== code) return;
      files.delete(id);
      void rm(file.path, { force: true }).catch(() => {});
    },
    removeRoom(code) {
      for (const [id, file] of files)
        if (file.room === code) {
          files.delete(id);
          void rm(file.path, { force: true }).catch(() => {});
        }
    },
    async close() {
      await rm(directory, { recursive: true, force: true });
    },
  };
}
