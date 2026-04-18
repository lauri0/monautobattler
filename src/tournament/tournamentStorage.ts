import type { TournamentState } from '../models/types';

const TOURNAMENT_KEY = 'tournament_state';

export function saveTournament(state: TournamentState): void {
  localStorage.setItem(TOURNAMENT_KEY, JSON.stringify(state));
}

export function loadTournament(): TournamentState | null {
  try {
    const raw = localStorage.getItem(TOURNAMENT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearTournament(): void {
  localStorage.removeItem(TOURNAMENT_KEY);
}
