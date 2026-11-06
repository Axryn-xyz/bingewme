import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useStore } from '../store';
export function useWebRTCSync(
  room: string,
  name: string,
  video: React.RefObject<HTMLVideoElement | null>,
) {
  const socket = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
  const [host, setHost] = useState(false);
  const peers = useRef(new Map<string, RTCPeerConnection>());
  const stream = useRef<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  useEffect(() => {
    const s = io({ autoConnect: true });
    socket.current = s;
    s.on('connect', () => {
      setConnected(true);
      s.emit('join', { room, name });
    });
    s.on('disconnect', () => setConnected(false));
    s.on('share-stop', () => setRemoteStream(null));
    s.on('members', ({ members, host }) => {
      setMembers(members);
      setHost(host === s.id);
    });
    s.on('chat', useStore.getState().addMessage);
    s.on('sync', (data) => {
      const v = video.current;
      if (data.source && data.source !== 'local' && data.source !== useStore.getState().source)
        useStore.getState().set({ source: data.source, title: data.title });
      if (v) {
        if (Math.abs(v.currentTime - data.time) > 1.5) v.currentTime = data.time;
        v.playbackRate = data.rate;
        if (data.playing) v.play().catch(() => {});
        else v.pause();
      }
      useStore.getState().set({ playing: data.playing, rate: data.rate });
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
  }, [room, name, video]);
  const broadcast = () => {
    const st = useStore.getState();
    socket.current?.emit('sync', {
      time: video.current?.currentTime || 0,
      playing: st.playing,
      rate: st.rate,
      source: st.source.startsWith('blob:') ? 'local' : st.source,
      title: st.title,
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
  return { socket, connected, members, host, broadcast, share, remoteStream };
}
