import express from 'express';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { canModerate } from './room-store.js';
import { roomOptions } from './room-management.js';

export function registerRoomAssets({ app, io, rooms, store }) {
  app.use(
    '/api/room-assets',
    express.static(store.assetDirectory, {
      dotfiles: 'deny',
      setHeaders(res) {
        res.set('X-Content-Type-Options', 'nosniff');
      },
    }),
  );
  app.post('/api/rooms/:code/assets', async (req, res) => {
    const room = rooms.get(req.params.code);
    const token = req.headers.authorization?.replace(/^Bearer /, '');
    const socket =
      room &&
      [...room.members.keys()]
        .map((id) => io.sockets.sockets.get(id))
        .find((socket) => socket?.data.uploadToken === token);
    if (!token || !socket || !canModerate(room, socket))
      return res.status(403).json({ error: 'Only room moderators can upload branding.' });
    const kind = req.query.kind;
    if (!['background', 'emote'].includes(kind))
      return res.status(400).json({ error: 'Choose background or emote.' });
    room.branding ||= {};
    if (kind === 'emote' && (room.branding.emotes?.length || 0) >= 24)
      return res.status(409).json({ error: 'Use at most 24 emotes per room.' });
    const limit = kind === 'background' ? 2 * 1024 ** 2 : 512 * 1024;
    if (Number(req.headers['content-length']) > limit)
      return res.status(413).json({
        error:
          kind === 'background'
            ? 'Backgrounds must be under 2 MiB.'
            : 'Emotes must be under 512 KiB.',
      });
    if (room.assetUploading)
      return res.status(409).json({ error: 'Another room image is uploading. Try again shortly.' });
    room.assetUploading = true;
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > limit) throw new Error('This image is too large.');
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      let extension = '';
      if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
        extension = 'png';
      else if (/^GIF8[79]a$/.test(buffer.subarray(0, 6).toString('ascii'))) extension = 'gif';
      else if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) extension = 'jpg';
      else if (
        buffer.subarray(0, 4).toString() === 'RIFF' &&
        buffer.subarray(8, 12).toString() === 'WEBP'
      )
        extension = 'webp';
      if (!extension) return res.status(415).json({ error: 'Use PNG, GIF, JPEG, or WebP images.' });
      if (rooms.get(req.params.code) !== room || !canModerate(room, socket))
        throw new Error('The room changed during the upload.');
      const id = randomUUID(),
        url = `/api/room-assets/${id}.${extension}`;
      await mkdir(store.assetDirectory, { recursive: true });
      await writeFile(join(store.assetDirectory, `${id}.${extension}`), buffer);
      if (kind === 'background') {
        const previous = room.branding.background;
        room.branding.background = url;
        if (previous?.startsWith('/api/room-assets/'))
          void unlink(join(store.assetDirectory, previous.split('/').pop())).catch(() => {});
      } else {
        room.branding.emotes ||= [];
        room.branding.emotes.push({
          id,
          name: String(req.query.name || 'Emote').slice(0, 32),
          url,
        });
      }
      store.save(req.params.code, room);
      io.to(req.params.code).emit('room-options', roomOptions(room));
      res.status(201).json({ url });
    } catch (error) {
      if (!res.destroyed)
        res.status(400).json({ error: error.message || 'The image could not be uploaded.' });
    } finally {
      room.assetUploading = false;
    }
  });
}
