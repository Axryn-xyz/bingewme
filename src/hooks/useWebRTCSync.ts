import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useStore } from '../store';
import { ROOM_SERVER_URL } from '../lib/backend';
import { applyPlayback, type PlaybackSnapshot } from '../lib/playback';
import type { QueueItem } from '../store';
export function useWebRTCSync(
  room: string,
  name: string,
  video: React.RefObject<HTMLVideoElement | null>,
) {
  const socket = useRef<Socket | null>(null);
  const nameRef = useRef(name);
  nameRef.current = name;
  const source = useStore((state) => state.source);
  const controller = useStore((state) => state.controller);
  const pendingPlayback = useRef<{ snapshot: PlaybackSnapshot; receivedAt: number } | null>(null);
  const [uploadToken, setUploadToken] = useState('');
  const [connected, setConnected] = useState(false);
  const [connectionError, setConnectionError] = useState(false);
  const [roomError, setRoomError] = useState('');
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
  const [host, setHost] = useState(false);
  const peers = useRef(new Map<string, RTCPeerConnection>());
  const stream = useRef<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  useEffect(() => {
    const s = io(ROOM_SERVER_URL, { autoConnect: true });
    socket.current = s;
    s.on('connect', () => {
      setConnected(false);
      setConnectionError(false);
      setRoomError('');
      s.emit('join', { room, name: nameRef.current });
    });
    s.on('disconnect', () => setConnected(false));
    s.on('connect_error', () => {
      setConnected(false);
      setConnectionError(true);
    });
    s.on('room-error', (message: string) => {
      setConnected(false);
      setConnectionError(true);
      setRoomError(message);
    });
    s.on('session', (data: { uploadToken: string }) => setUploadToken(data.uploadToken));
    s.on('queue-state', (queue: QueueItem[]) => useStore.getState().set({ queue }));
    s.on('share-stop', () => {
      setRemoteStream(null);
      stream.current?.getTracks().forEach((track) => track.stop());
      stream.current = null;
    });
    s.on('members', ({ members, host }) => {
      setConnected(true);
      setMembers(members);
      setHost(host === s.id);
    });
    s.on('chat', useStore.getState().addMessage);
    s.on('sync', (data: PlaybackSnapshot) => {
      const receivedAt = performance.now();
      pendingPlayback.current = { snapshot: data, receivedAt };
      const state = useStore.getState();
      const v = state.controller?.source === state.source ? state.controller : video.current;
      const sourceChanged =
        data.source && data.source !== 'local' && data.source !== useStore.getState().source;
      if (sourceChanged) {
        useStore.getState().set({
          source: data.source,
          title: data.title,
          mediaId: data.mediaId || '',
          time: 0,
          duration: 0,
          needsInteraction: false,
          needsUnmute: false,
          mediaError: '',
        });
        setRemoteStream(null);
      } else if (v && v.readyState >= 1) {
        applyPlayback(v, data, receivedAt)
          .then(() => useStore.getState().set({ needsInteraction: false }))
          .catch(() => useStore.getState().set({ needsInteraction: true }));
      }
      useStore.getState().set({
        title: data.title,
        mediaId: data.mediaId || '',
        playing: data.playing,
        rate: data.rate,
      });
    });
    const peer = (id: string) => {
      let p = peers.current.get(id);
      if (!p) {
        p = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
        peers.current.set(id, p);
        p.onicecandidate = (e) => {
          if (e.candidate) s.emit('signal', { to: id, candidate: e.candidate });
        };
        p.ontrack = (e) => {
          setRemoteStream(e.streams[0]);
          e.track.onended = () => setRemoteStream(null);
        };
        stream.current?.getTracks().forEach((t) => p!.addTrack(t, stream.current!));
      }
      return p;
    };
    s.on('signal', async ({ from, description, candidate }) => {
      try {
        const p = peer(from);
        if (description) {
          await p.setRemoteDescription(description);
          if (description.type === 'offer') {
            await p.setLocalDescription(await p.createAnswer());
            s.emit('signal', { to: from, description: p.localDescription });
          }
        }
        if (candidate) await p.addIceCandidate(candidate);
      } catch (e) {
        console.error('Connection failed', e);
      }
    });
    s.on('share-request', async (id: string) => {
      if (!stream.current) return;
      const p = peer(id);
      await p.setLocalDescription(await p.createOffer());
      s.emit('signal', { to: id, description: p.localDescription });
    });
    return () => {
      s.disconnect();
      peers.current.forEach((p) => p.close());
      peers.current.clear();
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, [room, video]);
  useEffect(() => {
    const current = useStore.getState();
    const v = current.controller?.source === source ? current.controller : video.current;
    if (!v) return;
    const apply = () => {
      const pending = pendingPlayback.current;
      if (pending)
        applyPlayback(v, pending.snapshot, pending.receivedAt)
          .then(() => useStore.getState().set({ needsInteraction: false }))
          .catch(() => useStore.getState().set({ needsInteraction: true }));
    };
    const native = video.current;
    native?.addEventListener('loadedmetadata', apply);
    if (v.readyState >= 1) apply();
    return () => native?.removeEventListener('loadedmetadata', apply);
  }, [source, video, controller]);
  function request<T>(event: string, payload: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!socket.current?.connected)
        return reject(new Error('The room connection is unavailable.'));
      socket.current
        .timeout(event === 'queue-add' ? 20000 : 8000)
        .emit(event, payload, (error: Error | null, response: T & { error?: string }) => {
          if (error) reject(new Error('The room did not respond. Please try again.'));
          else if (response.error) reject(new Error(response.error));
          else resolve(response);
        });
    });
  }
  const broadcast = (
    changes: Partial<Pick<PlaybackSnapshot, 'time' | 'rate' | 'playing'>> = {},
  ) => {
    const st = useStore.getState();
    const observedTime =
      st.controller?.source === st.source ? st.controller.currentTime : video.current?.currentTime;
    socket.current?.emit('sync', {
      time: observedTime ?? st.time ?? 0,
      playing: st.playing,
      rate: st.rate,
      source: st.source.startsWith('blob:') ? 'local' : st.source,
      title: st.title,
      mediaId: st.mediaId,
      ...changes,
    });
  };
  useEffect(() => {
    if (!host) return;
    const t = setInterval(broadcast, 3000);
    return () => clearInterval(t);
  }, [host]);
  const share = async () => {
    stream.current = await navigator.mediaDevices.getDisplayMedia({
      video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30, max: 60 } },
      audio: true,
    });
    socket.current?.emit('share-start');
    return stream.current;
  };
  return {
    socket,
    connected,
    connectionError,
    roomError,
    members,
    host,
    broadcast,
    share,
    remoteStream,
    uploadToken,
    addToQueue: (url: string, title: string) =>
      request<{ item: QueueItem }>('queue-add', { url, title }),
    selectMedia: (id: string) => request<{ ok: boolean }>('queue-select', id),
    rename: (name: string) => request<{ name: string }>('rename', name),
  };
}
