import { useEffect, useRef, useState } from 'react';
export function useAudioBoost(video: React.RefObject<HTMLVideoElement | null>) {
  const graph = useRef<{ video: HTMLVideoElement; context: AudioContext; gain: GainNode } | null>(
    null,
  );
  const [boost, setBoost] = useState(1);
  const [error, setError] = useState('');
  useEffect(() => {
    if (graph.current && graph.current.video !== video.current) {
      void graph.current.context.close();
      graph.current = null;
      setBoost(1);
      setError('');
    }
  });
  useEffect(
    () => () => {
      void graph.current?.context.close();
      graph.current = null;
    },
    [],
  );
  async function change(value: number) {
    const element = video.current;
    if (!element) return;
    let created: AudioContext | undefined;
    try {
      if (graph.current?.video !== element) {
        void graph.current?.context.close();
        const context = new AudioContext();
        created = context;
        const gain = context.createGain();
        const limiter = context.createDynamicsCompressor();
        limiter.threshold.value = -3;
        limiter.knee.value = 0;
        limiter.ratio.value = 20;
        context
          .createMediaElementSource(element)
          .connect(gain)
          .connect(limiter)
          .connect(context.destination);
        graph.current = { video: element, context, gain };
        created = undefined;
      }
      await graph.current.context.resume();
      graph.current.gain.gain.setTargetAtTime(value, graph.current.context.currentTime, 0.02);
      setBoost(value);
      setError('');
    } catch {
      void created?.close();
      setError('Audio boosting is unavailable on this device.');
    }
  }
  return { boost, change, error };
}
