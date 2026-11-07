export type ScreenSignal = {
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
};

type Entry = {
  connection: RTCPeerConnection;
  candidates: RTCIceCandidateInit[];
  tasks: Promise<void>;
};

/** One-way screen delivery with ordered signaling and ICE queued until SDP is ready. */
export class ScreenPeers {
  private peers = new Map<string, Entry>();
  private local: MediaStream | null = null;
  private iceServers: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
  constructor(
    private send: (to: string, signal: ScreenSignal) => void,
    private receive: (stream: MediaStream | null) => void,
    private error: (message: string) => void,
  ) {}
  configure(iceServers: RTCIceServer[]) {
    this.iceServers = iceServers;
  }
  setStream(stream: MediaStream | null) {
    this.close();
    this.local = stream;
  }
  private peer(id: string): Entry {
    let entry = this.peers.get(id);
    if (entry) return entry;
    const connection = new RTCPeerConnection({ iceServers: this.iceServers });
    entry = { connection, candidates: [], tasks: Promise.resolve() };
    this.peers.set(id, entry);
    connection.onicecandidate = ({ candidate }) => {
      if (candidate) this.send(id, { candidate: candidate.toJSON() });
    };
    connection.ontrack = ({ streams, track }) => {
      if (this.peers.get(id) !== entry) return;
      const remote = streams[0] || new MediaStream([track]);
      this.receive(remote);
      if (track.kind === 'video')
        track.onended = () => {
          if (this.peers.get(id) === entry) this.receive(null);
        };
    };
    connection.onconnectionstatechange = () => {
      if (this.peers.get(id) === entry && connection.connectionState === 'failed') {
        this.error(
          `Screen sharing connection failed (ICE: ${connection.iceConnectionState}). Copy connection details to identify the cause.`,
        );
      }
    };
    this.local?.getTracks().forEach((track) => connection.addTrack(track, this.local!));
    return entry;
  }
  private enqueue(id: string, task: (entry: Entry) => Promise<void>) {
    const entry = this.peer(id);
    entry.tasks = entry.tasks
      .then(async () => {
        if (this.peers.get(id) === entry) await task(entry);
      })
      .catch(() => {
        if (this.peers.get(id) === entry)
          this.error('Screen-sharing negotiation failed. Stop sharing and try again.');
      });
    return entry.tasks;
  }
  offer(id: string) {
    if (!this.local) return Promise.resolve();
    return this.enqueue(id, async ({ connection }) => {
      await connection.setLocalDescription(await connection.createOffer());
      this.send(id, { description: connection.localDescription!.toJSON() });
    });
  }
  private async tuneVideo(connection: RTCPeerConnection) {
    for (const sender of connection.getSenders()) {
      if (sender.track?.kind !== 'video') continue;
      const parameters = sender.getParameters();
      if (!parameters.encodings?.length) continue;
      parameters.degradationPreference = 'maintain-framerate';
      for (const encoding of parameters.encodings) {
        encoding.maxFramerate = 60;
        encoding.maxBitrate = 12_000_000;
      }
      // Older Safari versions may reject optional encoder preferences; keep the call alive.
      await sender.setParameters(parameters).catch(() => {});
    }
  }
  signal(id: string, { description, candidate }: ScreenSignal) {
    return this.enqueue(id, async (entry) => {
      const { connection } = entry;
      if (description) {
        await connection.setRemoteDescription(description);
        if (description.type === 'answer') await this.tuneVideo(connection);
        for (const queued of entry.candidates.splice(0)) await connection.addIceCandidate(queued);
        if (description.type === 'offer') {
          await connection.setLocalDescription(await connection.createAnswer());
          this.send(id, { description: connection.localDescription!.toJSON() });
        }
      }
      if (candidate) {
        if (connection.remoteDescription) await connection.addIceCandidate(candidate);
        else entry.candidates.push(candidate);
      }
    });
  }
  retain(ids: string[]) {
    for (const [id, entry] of this.peers) {
      if (ids.includes(id)) continue;
      entry.connection.close();
      this.peers.delete(id);
    }
  }
  async diagnostics() {
    const connections = [];
    for (const { connection } of this.peers.values()) {
      const counters: Record<string, number | string> = {};
      try {
        const stats = await connection.getStats();
        stats.forEach((report) => {
          if (report.type === 'local-candidate' || report.type === 'remote-candidate') {
            const key = `${report.type}:${report.candidateType}`;
            counters[key] = Number(counters[key] || 0) + 1;
          }
          if (report.type === 'transport') counters.dtls = report.dtlsState;
          if (
            (report.type === 'inbound-rtp' || report.type === 'outbound-rtp') &&
            report.kind === 'video'
          ) {
            for (const key of [
              'framesPerSecond',
              'framesDecoded',
              'framesEncoded',
              'bytesReceived',
              'bytesSent',
              'qualityLimitationReason',
            ]) {
              if (report[key] !== undefined) counters[key] = report[key];
            }
          }
        });
      } catch {
        /* A closed connection may no longer expose statistics. */
      }
      connections.push({
        connection: connection.connectionState,
        ice: connection.iceConnectionState,
        gathering: connection.iceGatheringState,
        signaling: connection.signalingState,
        counters,
      });
    }
    return {
      browser: navigator.userAgent,
      relayConfigured: this.iceServers.some(({ urls }) =>
        [urls].flat().some((url) => /^turns?:/i.test(url)),
      ),
      captureFrameRate: this.local?.getVideoTracks()[0]?.getSettings().frameRate,
      connections,
    };
  }
  close() {
    this.peers.forEach(({ connection }) => connection.close());
    this.peers.clear();
  }
}
