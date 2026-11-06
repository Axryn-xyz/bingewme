import { useRef, useEffect } from 'react';
import type { Socket } from 'socket.io-client';
import { useStore } from '../../store';
type Stroke = {
  x: number;
  y: number;
  px: number;
  py: number;
  color: string;
  width: number;
  at: number;
};
export function Telestrator({ socket, clearKey }: { socket: Socket | null; clearKey: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const paths = useRef<Stroke[]>([]);
  const last = useRef<{ x: number; y: number } | null>(null);
  const { drawing, color, width } = useStore();
  useEffect(() => {
    paths.current = [];
  }, [clearKey]);
  useEffect(() => {
    const receive = (s: Stroke) => {
      paths.current.push({ ...s, at: performance.now() });
    };
    socket?.on('draw', receive);
    let frame: number;
    const render = () => {
      const c = canvas.current;
      if (c) {
        const r = c.getBoundingClientRect();
        if (c.width !== Math.floor(r.width) || c.height !== Math.floor(r.height)) {
          c.width = r.width;
          c.height = r.height;
        }
        const ctx = c.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, c.width, c.height);
          const now = performance.now();
          paths.current = paths.current.filter((s) => now - s.at < 4000);
          for (const s of paths.current) {
            ctx.globalAlpha = Math.min(1, (4000 - (now - s.at)) / 1000);
            ctx.strokeStyle = s.color;
            ctx.lineWidth = s.width;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(s.px * c.width, s.py * c.height);
            ctx.lineTo(s.x * c.width, s.y * c.height);
            ctx.stroke();
          }
        }
      }
      frame = requestAnimationFrame(render);
    };
    render();
    return () => {
      cancelAnimationFrame(frame);
      socket?.off('draw', receive);
    };
  }, [socket]);
  return (
    <canvas
      ref={canvas}
      className={drawing ? 'draw-canvas active' : 'draw-canvas'}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        const r = e.currentTarget.getBoundingClientRect();
        last.current = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
      }}
      onPointerUp={() => {
        last.current = null;
      }}
      onPointerCancel={() => {
        last.current = null;
      }}
      onPointerMove={(e) => {
        if (!last.current) return;
        const r = e.currentTarget.getBoundingClientRect();
        const point = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
        const s = {
          ...point,
          px: last.current.x,
          py: last.current.y,
          color,
          width,
          at: performance.now(),
        };
        paths.current.push(s);
        socket?.emit('draw', s);
        last.current = point;
      }}
    />
  );
}
