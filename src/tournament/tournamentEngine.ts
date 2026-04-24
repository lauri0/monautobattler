import type {
  PokemonData,
  TournamentPokemon,
  TournamentGroup,
  GroupMatch,
  KnockoutMatch,
  TournamentState,
} from '../models/types';
import { getPokemonPersisted } from '../persistence/userStorage';

function toTournamentPokemon(p: PokemonData): TournamentPokemon {
  return { id: p.id, name: p.name, spriteUrl: p.spriteUrl, types: p.types };
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generateGroupMatches(members: TournamentPokemon[]): GroupMatch[] {
  const [a, b, c, d] = members;
  return [
    { pokemonA: a, pokemonB: b, winnerId: null },
    { pokemonA: c, pokemonB: d, winnerId: null },
    { pokemonA: a, pokemonB: c, winnerId: null },
    { pokemonA: b, pokemonB: d, winnerId: null },
    { pokemonA: a, pokemonB: d, winnerId: null },
    { pokemonA: b, pokemonB: c, winnerId: null },
  ];
}

function createEmptyKnockout(): KnockoutMatch[] {
  const matches: KnockoutMatch[] = [];
  for (let i = 0; i < 8; i++)
    matches.push({ round: 'ro16', slot: i, pokemonA: null, pokemonB: null, winnerId: null, loserId: null });
  for (let i = 0; i < 4; i++)
    matches.push({ round: 'quarter', slot: i, pokemonA: null, pokemonB: null, winnerId: null, loserId: null });
  for (let i = 0; i < 2; i++)
    matches.push({ round: 'semi', slot: i, pokemonA: null, pokemonB: null, winnerId: null, loserId: null });
  matches.push({ round: 'third', slot: 0, pokemonA: null, pokemonB: null, winnerId: null, loserId: null });
  matches.push({ round: 'final', slot: 0, pokemonA: null, pokemonB: null, winnerId: null, loserId: null });
  return matches;
}

export function createTournament(allPokemon: PokemonData[]): TournamentState {
  const enabled = allPokemon.filter(p => {
    const persisted = getPokemonPersisted(p.id);
    return !persisted.disabled && p.availableMoves.length > 0;
  });

  if (enabled.length < 32) {
    throw new Error(`Need at least 32 enabled Pokemon with moves, but only ${enabled.length} available.`);
  }

  const selected = shuffle(enabled).slice(0, 32).map(toTournamentPokemon);
  const groupLabels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

  const groups: TournamentGroup[] = groupLabels.map((label, i) => {
    const members = selected.slice(i * 4, i * 4 + 4);
    return {
      label,
      members,
      standings: members.map(p => ({ pokemon: p, played: 0, wins: 0, losses: 0, points: 0 })),
      matches: generateGroupMatches(members),
    };
  });

  return {
    phase: 'group',
    groups,
    knockoutMatches: createEmptyKnockout(),
    currentMatchIndex: 0,
    champion: null,
    runnerUp: null,
    thirdPlace: null,
  };
}

export function getTotalGroupMatches(): number {
  return 48;
}

export function getTotalMatches(): number {
  return 48 + 16;
}

function flatGroupMatches(state: TournamentState): GroupMatch[] {
  return state.groups.flatMap(g => g.matches);
}

function flatKnockoutPlayOrder(state: TournamentState): KnockoutMatch[] {
  const byRound = (round: KnockoutMatch['round']) =>
    state.knockoutMatches.filter(m => m.round === round).sort((a, b) => a.slot - b.slot);
  return [
    ...byRound('ro16'),
    ...byRound('quarter'),
    ...byRound('semi'),
    byRound('third')[0],
    byRound('final')[0],
  ].filter(Boolean);
}

export function getNextMatch(state: TournamentState): { match: GroupMatch | KnockoutMatch; index: number } | null {
  if (state.phase === 'group') {
    const all = flatGroupMatches(state);
    for (let i = 0; i < all.length; i++) {
      if (all[i].winnerId === null) return { match: all[i], index: i };
    }
    return null;
  }
  if (state.phase === 'knockout') {
    const order = flatKnockoutPlayOrder(state);
    for (const m of order) {
      if (m.pokemonA && m.pokemonB && m.winnerId === null) return { match: m, index: 0 };
    }
    return null;
  }
  return null;
}

export function getMatchLabel(state: TournamentState): string {
  const next = getNextMatch(state);
  if (!next) return '';
  const m = next.match;
  if ('round' in m) {
    const labels: Record<string, string> = {
      ro16: 'Round of 16',
      quarter: 'Quarterfinal',
      semi: 'Semifinal',
      third: 'Third Place Match',
      final: 'Final',
    };
    return labels[m.round] ?? m.round;
  }
  const group = state.groups.find(g => g.matches.includes(m as GroupMatch));
  const matchIdx = group ? group.matches.indexOf(m as GroupMatch) + 1 : 0;
  return `Group ${group?.label ?? '?'} - Match ${matchIdx}`;
}

export function getProgress(state: TournamentState): { played: number; total: number; stage: string } {
  const total = getTotalMatches();
  if (state.phase === 'finished') return { played: total, total, stage: 'Finished' };

  const groupPlayed = flatGroupMatches(state).filter(m => m.winnerId !== null).length;
  if (state.phase === 'group') {
    return { played: groupPlayed, total, stage: 'Group Stage' };
  }
  const knockoutPlayed = state.knockoutMatches.filter(m => m.winnerId !== null).length;
  return { played: groupPlayed + knockoutPlayed, total, stage: 'Knockout Stage' };
}

function resolveGroupStandings(group: TournamentGroup): TournamentPokemon[] {
  const sorted = [...group.standings].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    return Math.random() - 0.5;
  });
  return sorted.map(s => s.pokemon);
}

function seedKnockout(state: TournamentState): KnockoutMatch[] {
  const ranked = state.groups.map(resolveGroupStandings);
  // A1vB2, C1vD2, E1vF2, G1vH2, B1vA2, D1vC2, F1vE2, H1vG2
  const seeds: [number, number, number, number][] = [
    [0, 0, 1, 1], // A1 vs B2
    [2, 0, 3, 1], // C1 vs D2
    [4, 0, 5, 1], // E1 vs F2
    [6, 0, 7, 1], // G1 vs H2
    [1, 0, 0, 1], // B1 vs A2
    [3, 0, 2, 1], // D1 vs C2
    [5, 0, 4, 1], // F1 vs E2
    [7, 0, 6, 1], // H1 vs G2
  ];

  const matches = [...state.knockoutMatches];
  seeds.forEach(([gA, rA, gB, rB], i) => {
    const ro16 = matches.find(m => m.round === 'ro16' && m.slot === i)!;
    ro16.pokemonA = ranked[gA][rA];
    ro16.pokemonB = ranked[gB][rB];
  });
  return matches;
}

function advanceKnockout(matches: KnockoutMatch[], justPlayed: KnockoutMatch): KnockoutMatch[] {
  const updated = [...matches];
  const winner = justPlayed.pokemonA?.id === justPlayed.winnerId ? justPlayed.pokemonA : justPlayed.pokemonB;
  const loser = justPlayed.pokemonA?.id === justPlayed.winnerId ? justPlayed.pokemonB : justPlayed.pokemonA;

  if (justPlayed.round === 'ro16') {
    const qfSlot = Math.floor(justPlayed.slot / 2);
    const qf = updated.find(m => m.round === 'quarter' && m.slot === qfSlot)!;
    if (justPlayed.slot % 2 === 0) qf.pokemonA = winner;
    else qf.pokemonB = winner;
  } else if (justPlayed.round === 'quarter') {
    const sfSlot = Math.floor(justPlayed.slot / 2);
    const sf = updated.find(m => m.round === 'semi' && m.slot === sfSlot)!;
    if (justPlayed.slot % 2 === 0) sf.pokemonA = winner;
    else sf.pokemonB = winner;
  } else if (justPlayed.round === 'semi') {
    const final = updated.find(m => m.round === 'final')!;
    const third = updated.find(m => m.round === 'third')!;
    if (justPlayed.slot === 0) {
      final.pokemonA = winner;
      third.pokemonA = loser;
    } else {
      final.pokemonB = winner;
      third.pokemonB = loser;
    }
  }

  return updated;
}

export function applyMatchResult(state: TournamentState, winnerId: number): TournamentState {
  const next = getNextMatch(state);
  if (!next) return state;

  if (state.phase === 'group') {
    const match = next.match as GroupMatch;
    const loserId = match.pokemonA.id === winnerId ? match.pokemonB.id : match.pokemonA.id;

    const newGroups = state.groups.map(g => {
      const mIdx = g.matches.indexOf(match);
      if (mIdx === -1) return g;

      const newMatches = [...g.matches];
      newMatches[mIdx] = { ...match, winnerId };

      const newStandings = g.standings.map(s => {
        if (s.pokemon.id === winnerId) {
          return { ...s, played: s.played + 1, wins: s.wins + 1, points: s.points + 1 };
        }
        if (s.pokemon.id === loserId) {
          return { ...s, played: s.played + 1, losses: s.losses + 1 };
        }
        return s;
      });

      return { ...g, matches: newMatches, standings: newStandings };
    });

    const allGroupsDone = newGroups.every(g => g.matches.every(m => m.winnerId !== null));

    if (allGroupsDone) {
      const newState: TournamentState = {
        ...state,
        groups: newGroups,
        phase: 'knockout',
      };
      newState.knockoutMatches = seedKnockout(newState);
      return newState;
    }

    return { ...state, groups: newGroups };
  }

  if (state.phase === 'knockout') {
    const match = next.match as KnockoutMatch;
    const loserId = match.pokemonA?.id === winnerId ? match.pokemonB?.id : match.pokemonA?.id;
    const loser = match.pokemonA?.id === winnerId ? match.pokemonB : match.pokemonA;
    const winner = match.pokemonA?.id === winnerId ? match.pokemonA : match.pokemonB;

    let newMatches = state.knockoutMatches.map(m => {
      if (m.round === match.round && m.slot === match.slot) {
        return { ...m, winnerId, loserId: loserId ?? null };
      }
      return m;
    });

    const updatedMatch = newMatches.find(m => m.round === match.round && m.slot === match.slot)!;
    newMatches = advanceKnockout(newMatches, updatedMatch);

    if (match.round === 'final') {
      const thirdMatch = newMatches.find(m => m.round === 'third')!;
      const thirdWinner = thirdMatch.winnerId
        ? (thirdMatch.pokemonA?.id === thirdMatch.winnerId ? thirdMatch.pokemonA : thirdMatch.pokemonB)
        : null;
      return {
        ...state,
        knockoutMatches: newMatches,
        phase: 'finished',
        champion: winner,
        runnerUp: loser,
        thirdPlace: thirdWinner,
      };
    }

    if (match.round === 'third') {
      const finalMatch = newMatches.find(m => m.round === 'final')!;
      if (finalMatch.winnerId !== null) {
        const champ = finalMatch.pokemonA?.id === finalMatch.winnerId ? finalMatch.pokemonA : finalMatch.pokemonB;
        const runner = finalMatch.pokemonA?.id === finalMatch.winnerId ? finalMatch.pokemonB : finalMatch.pokemonA;
        return {
          ...state,
          knockoutMatches: newMatches,
          phase: 'finished',
          champion: champ,
          runnerUp: runner,
          thirdPlace: winner,
        };
      }
      return { ...state, knockoutMatches: newMatches, thirdPlace: winner };
    }

    return { ...state, knockoutMatches: newMatches };
  }

  return state;
}
