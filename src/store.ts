import { create } from 'zustand';
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
