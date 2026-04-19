import type { RR3v3State } from '../tournament/roundRobin3v3Engine';

const KEY = 'round_robin_3v3_state';

export function saveRoundRobin3v3(state: RR3v3State): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // storage quota or disabled — silently drop; in-memory state still works.
  }
}

export function loadRoundRobin3v3(): RR3v3State | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as RR3v3State) : null;
  } catch {
    return null;
  }
}

export function clearRoundRobin3v3(): void {
  localStorage.removeItem(KEY);
}
