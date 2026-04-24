import type { RR4v4State } from '../tournament/roundRobin4v4Engine';

const KEY = 'round_robin_4v4_state';

export function saveRoundRobin4v4(state: RR4v4State): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // storage quota or disabled — silently drop; in-memory state still works.
  }
}

export function loadRoundRobin4v4(): RR4v4State | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as RR4v4State) : null;
  } catch {
    return null;
  }
}

export function clearRoundRobin4v4(): void {
  localStorage.removeItem(KEY);
}
