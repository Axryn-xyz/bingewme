import { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { ScreenPeers, type ScreenSignal } from '../lib/screen-peers';
export interface SofaParticipant {
  id: string;
  video: boolean;
  audio: boolean;
}
export function useSofaMedia(socket: React.RefObject<Socket | null>) {
  const [participants, setParticipants] = useState<SofaParticipant[]>([]);
  const [streams, setStreams] = useState<Record<string, MediaStream>>({});
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState('');
  const engines = useRef(new Map<string, ScreenPeers>());
  const ice = useRef<RTCIceServer[]>([{ urls: 'stun:stun.l.google.com:19302' }]);
  const local = useRef<MediaStream | null>(null);
  const engine = (publisher: string) => {
    let peer = engines.current.get(publisher);
    if (!peer) {
      peer = new ScreenPeers(
        (to, signal) => socket.current?.emit('camera-signal', { to, publisher, ...signal }),
        (stream) =>
          setStreams((values) => {
            const next = { ...values };
            if (stream) next[publisher] = stream;
            else delete next[publisher];
            return next;
          }),
        (message) => setError(message.replace(/Screen.sharing/gi, 'Sofa connection')),
      );
      peer.configure(ice.current);
      engines.current.set(publisher, peer);
    }
    return peer;
  };
  useEffect(() => {
    const connection = socket.current;
    if (!connection) return;
    const session = (data: { iceServers?: RTCIceServer[] }) => {
      if (data.iceServers) ice.current = data.iceServers;
    };
    const stopped = (publisher: string) => {
      engines.current.get(publisher)?.close();
      engines.current.delete(publisher);
      setStreams((values) => {
        const next = { ...values };
        delete next[publisher];
        return next;
      });
    };
    const requested = (id: string) => {
      if (local.current && connection.id) void engine(connection.id).offer(id);
    };
    const signal = ({
      from,
      publisher,
      ...signal
    }: ScreenSignal & { from: string; publisher: string }) => {
      void engine(publisher).signal(from, signal);
    };
    const state = (values: SofaParticipant[]) => setParticipants(values);
    const reset = () => {
      engines.current.forEach((peer) => peer.close());
      engines.current.clear();
      local.current?.getTracks().forEach((track) => track.stop());
      local.current = null;
      setLocalStream(null);
      setStreams({});
      setParticipants([]);
    };
    const forcedMute = () => {
      local.current?.getAudioTracks().forEach((track) => {
        track.enabled = false;
      });
      setParticipants((values) =>
        values.map((person) =>
          person.id === connection.id ? { ...person, audio: false } : person,
        ),
      );
    };
    connection.on('session', session);
    connection.on('camera-state', state);
    connection.on('camera-stop', stopped);
    connection.on('camera-request', requested);
    connection.on('camera-signal', signal);
    connection.on('disconnect', reset);
    connection.on('mic-muted', forcedMute);
    return () => {
      connection.off('session', session);
      connection.off('camera-state', state);
      connection.off('camera-stop', stopped);
      connection.off('camera-request', requested);
      connection.off('camera-signal', signal);
      connection.off('disconnect', reset);
      connection.off('mic-muted', forcedMute);
      reset();
    };
  }, [socket]);
  async function setDevices(video: boolean, audio: boolean) {
    const connection = socket.current;
    if (!connection?.connected || !connection.id)
      throw new Error('Join the room before taking a sofa seat.');
    setError('');
    if (!video && !audio) {
      connection.emit('camera-stop');
      engines.current.get(connection.id)?.setStream(null);
      local.current?.getTracks().forEach((track) => track.stop());
      local.current = null;
      setLocalStream(null);
      return;
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      video: video
        ? { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 20, max: 24 } }
        : false,
      audio: audio
        ? { noiseSuppression: true, echoCancellation: true, autoGainControl: true }
        : false,
    });
    const previous = local.current;
    local.current = stream;
    engine(connection.id).setStream(stream);
    try {
      await new Promise<void>((resolve, reject) =>
        connection
          .timeout(8000)
          .emit(
            'camera-start',
            { video, audio },
            (failure: Error | null, response: { error?: string }) =>
              failure
                ? reject(new Error('The room did not accept your camera.'))
                : response?.error
                  ? reject(new Error(response.error))
                  : resolve(),
          ),
      );
      previous?.getTracks().forEach((track) => track.stop());
      setLocalStream(stream);
    } catch (failure) {
      stream.getTracks().forEach((track) => track.stop());
      local.current = previous;
      setLocalStream(previous);
      engine(connection.id).setStream(previous);
      if (previous && connection.connected)
        connection.emit('camera-start', {
          video: previous.getVideoTracks().some((track) => track.readyState === 'live'),
          audio: previous
            .getAudioTracks()
            .some((track) => track.readyState === 'live' && track.enabled),
        });
      throw failure;
    }
  }
  return { participants, streams, localStream, setDevices, error };
}
