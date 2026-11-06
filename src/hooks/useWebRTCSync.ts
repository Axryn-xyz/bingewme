import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useStore } from '../store';
import { ROOM_SERVER_URL } from '../lib/backend';
import { applyPlayback, type PlaybackSnapshot } from '../lib/playback';
import type { QueueItem } from '../store';
import { ScreenPeers, type ScreenSignal } from '../lib/screen-peers';
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
  const peers = useRef<ScreenPeers | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  useEffect(() => {
    const s = io(ROOM_SERVER_URL, { autoConnect: true });
    socket.current = s;
    const screenPeers = new ScreenPeers(
      (to, signal) => s.emit('signal', { to, ...signal }),
      setRemoteStream,
      (mediaError) => useStore.getState().set({ mediaError }),
    );
    peers.current = screenPeers;
    const stopShare = () => {
      screenPeers.setStream(null);
      setRemoteStream(null);
      stream.current?.getTracks().forEach((track) => track.stop());
      stream.current = null;
    };
    s.on('connect', () => {
      setConnected(false);
      setConnectionError(false);
      setRoomError('');
      s.emit('join', { room, name: nameRef.current });
    });
    s.on('disconnect', () => {
      setConnected(false);
      stopShare();
    });
    s.on('connect_error', () => {
      setConnected(false);
      setConnectionError(true);
    });
    s.on('room-error', (message: string) => {
      setConnected(false);
      setConnectionError(true);
      setRoomError(message);
    });
    s.on('session', (data: { uploadToken: string; iceServers?: RTCIceServer[] }) => {
      setUploadToken(data.uploadToken);
      if (data.iceServers) screenPeers.configure(data.iceServers);
    });
    s.on('queue-state', (queue: QueueItem[]) => useStore.getState().set({ queue }));
    s.on('share-stop', stopShare);
    s.on('members', ({ members, host }) => {
      setConnected(true);
      setMembers(members);
      setHost(host === s.id);
      screenPeers.retain(members.map((member: { id: string }) => member.id));
    });
    s.on('chat', useStore.getState().addMessage);
    s.on('sync', (data: PlaybackSnapshot) => {
      const receivedAt = performance.now();
      pendingPlayback.current = { snapshot: data, receivedAt };
      const state = useStore.getState();
      const v = state.controller?.source === state.source ? state.controller : video.current;
      const sourceChanged = data.source !== 'local' && data.source !== useStore.getState().source;
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
    s.on('signal', ({ from, ...signal }: ScreenSignal & { from: string }) => {
      void screenPeers.signal(from, signal);
    });
    s.on('share-request', (id: string) => {
      void screenPeers.offer(id);
    });
    return () => {
      s.disconnect();
      stopShare();
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
        .timeout(event === 'queue-add' ? 45000 : 8000)
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
    if (!connected || !socket.current?.connected)
      throw new Error('Join the room before sharing your screen.');
    const captured = await navigator.mediaDevices.getDisplayMedia({
      video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30, max: 60 } },
      audio: true,
    });
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = captured;
    setRemoteStream(null);
    peers.current?.setStream(captured);
    try {
      await request<{ ok: boolean }>('share-start', {});
      return captured;
    } catch (error) {
      captured.getTracks().forEach((track) => track.stop());
      stream.current = null;
      peers.current?.setStream(null);
      throw error;
    }
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
    removeMedia: (id: string) => request<{ ok: boolean }>('queue-remove', id),
    rename: (name: string) => request<{ name: string }>('rename', name),
  };
}
