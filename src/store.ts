import { create } from 'zustand';
import type { YouTubeController } from './lib/youtube';
export interface Message {
  id: string;
  name: string;
  text: string;
  time: string;
  color: string;
}
export interface QueueItem {
  id: string;
  title: string;
  subtitle: string;
  url: string;
  image: string;
  duration: string;
  kind?: 'url' | 'upload';
  mediaType?: 'video' | 'audio' | 'hls' | 'embed';
  provider?: string;
  originalUrl?: string;
}
export const initialQueue: QueueItem[] = [];
interface State {
  playing: boolean;
  time: number;
  duration: number;
  volume: number;
  rate: number;
  source: string;
  title: string;
  mediaId: string;
  needsInteraction: boolean;
  needsUnmute: boolean;
  mediaError: string;
  controller: YouTubeController | null;
  drawing: boolean;
  color: string;
  width: number;
  locked: boolean;
  vote: boolean;
  messages: Message[];
  queue: QueueItem[];
  set: (s: Partial<State>) => void;
  addMessage: (m: Message) => void;
}
export const useStore = create<State>((set) => ({
  playing: false,
  time: 0,
  duration: 0,
  volume: 0.75,
  rate: 1,
  source: '',
  title: '',
  mediaId: '',
  needsInteraction: false,
  needsUnmute: false,
  mediaError: '',
  controller: null,
  drawing: false,
  color: '#ffe600',
  width: 4,
  locked: false,
  vote: false,
  messages: [],
  queue: initialQueue,
  set: (s) => set(s),
  addMessage: (m) => set((s) => ({ messages: [...s.messages.slice(-199), m] })),
}));
