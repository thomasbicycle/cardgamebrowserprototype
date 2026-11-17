import { useEffect, useState } from 'preact/hooks';
import { createGame, reduce, type Action, type GameState } from '../core/game';
import { hashSeed } from '../core/rng';
import { storage } from '../platform/storage';

interface Store {
  game: GameState | null;
  debug: boolean;
}

const urlDebug = new URLSearchParams(location.search).has('debug');
const store: Store = { game: null, debug: urlDebug || storage.get('debug') === '1' };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function dispatch(action: Action): void {
  if (!store.game) return;
  reduce(store.game, action);
  emit();
}

/** Text seeds are hashed; blank means a random run. */
export function newGame(seedText: string): void {
  const t = seedText.trim();
  const seed = t === '' ? Math.floor(Math.random() * 2 ** 31) : /^\d+$/.test(t) ? Number(t) >>> 0 : hashSeed(t);
  store.game = createGame(seed);
  emit();
}

export function quitGame(): void {
  store.game = null;
  emit();
}

export function setDebug(on: boolean): void {
  store.debug = on;
  storage.set('debug', on ? '1' : '0');
  emit();
}

export function useStore(): Store {
  const [, bump] = useState(0);
  useEffect(() => {
    const l = () => bump((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return store;
}

export const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
export const clock = (sec: number) => {
  const t = Math.ceil(sec);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};
