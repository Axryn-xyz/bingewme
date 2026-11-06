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
          'Screen sharing could not connect across these networks. Configure a TURN relay on the room server, then restart the share.',
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
  signal(id: string, { description, candidate }: ScreenSignal) {
    return this.enqueue(id, async (entry) => {
      const { connection } = entry;
      if (description) {
        await connection.setRemoteDescription(description);
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
  close() {
    this.peers.forEach(({ connection }) => connection.close());
    this.peers.clear();
  }
}
