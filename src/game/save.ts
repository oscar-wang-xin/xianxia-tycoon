import type { GameState } from './types';

const KEY = 'xianxia-tycoon-save-v1';

function storage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function hasSave(): boolean {
  return !!storage()?.getItem(KEY);
}

export function loadSave(): GameState | null {
  try {
    const raw = storage()?.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as GameState;
    if (!data || !Array.isArray(data.players) || data.players.length < 2) return null;
    return data;
  } catch {
    return null;
  }
}

export function writeSave(state: GameState): void {
  try {
    if (state.phase === 'gameover' || state.phase === 'idle') {
      storage()?.removeItem(KEY);
      return;
    }
    storage()?.setItem(KEY, JSON.stringify(state));
  } catch {
    /* 存储不可用时静默忽略 */
  }
}

export function clearSave(): void {
  try {
    storage()?.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
