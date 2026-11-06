export interface PlaybackSnapshot {
  source: string;
  title: string;
  mediaId?: string;
  time: number;
  playing: boolean;
  rate: number;
}

export function applyPlayback(
  video: HTMLVideoElement,
  snapshot: PlaybackSnapshot,
  receivedAt: number,
  now = performance.now(),
): Promise<void> {
  video.playbackRate = snapshot.rate;
  if (!video.srcObject) {
    let time =
      snapshot.time +
      (snapshot.playing ? (Math.max(0, now - receivedAt) / 1000) * snapshot.rate : 0);
    if (Number.isFinite(video.duration)) time = Math.min(time, Math.max(0, video.duration - 0.05));
    if (Math.abs(video.currentTime - time) > 1.5 || snapshot.time === 0)
      video.currentTime = Math.max(0, time);
  }
  if (snapshot.playing) return video.play();
  video.pause();
  return Promise.resolve();
}
