import type { RR4v4State } from '../tournament/roundRobin4v4Engine';

export interface PokemonDamageAccum {
  physSum: number;
  specSum: number;
  otherSum: number;
  totalSum: number;
  recoilSum: number;
  healSum: number;
  tournamentCount: number;
}

export interface TournamentAvg {
  phys: number;
  spec: number;
  other: number;
  total: number;
  recoil: number;
  heal: number;
}

const KEY = 'tournament_damage_stats';

function loadDamageStats(): Record<number, PokemonDamageAccum> {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveDamageStats(stats: Record<number, PokemonDamageAccum>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(stats));
  } catch {
    // storage quota or disabled — silently drop
  }
}

export function computeTournamentAverages(state: RR4v4State): Map<number, TournamentAvg> {
  const accum = new Map<number, { physSum: number; specSum: number; otherSum: number; totalSum: number; recoilSum: number; healSum: number; count: number }>();

  state.schedule.forEach((pair, i) => {
    const result = state.results[i];
    if (!result?.damageSummary) return;

    const participatingIds = [
      ...state.teams[pair.a].roster,
      ...state.teams[pair.b].roster,
    ];
    const battleTotal = result.damageSummary.reduce(
      (s, e) => s + e.physical + e.special + e.other, 0,
    );
    if (battleTotal === 0) return;

    const entryById = new Map(result.damageSummary.map(e => [e.pokemonId, e]));

    for (const id of participatingIds) {
      if (!accum.has(id)) {
        accum.set(id, { physSum: 0, specSum: 0, otherSum: 0, totalSum: 0, recoilSum: 0, healSum: 0, count: 0 });
      }
      const a = accum.get(id)!;
      const entry = entryById.get(id);
      const phys  = (entry?.physical ?? 0) / battleTotal * 100;
      const spec  = (entry?.special  ?? 0) / battleTotal * 100;
      const other = (entry?.other    ?? 0) / battleTotal * 100;
      a.physSum  += phys;
      a.specSum  += spec;
      a.otherSum += other;
      a.totalSum += phys + spec + other;
      a.recoilSum += (entry?.recoil ?? 0) / battleTotal * 100;
      a.healSum   += (entry?.heal   ?? 0) / battleTotal * 100;
      a.count++;
    }
  });

  const averages = new Map<number, TournamentAvg>();
  for (const [id, a] of accum) {
    averages.set(id, {
      phys:  a.physSum  / a.count,
      spec:  a.specSum  / a.count,
      other: a.otherSum / a.count,
      total: a.totalSum / a.count,
      recoil: a.recoilSum / a.count,
      heal:  a.healSum  / a.count,
    });
  }
  return averages;
}

export function getDamageStats(): Record<number, PokemonDamageAccum> {
  return loadDamageStats();
}

/**
 * Merges this tournament's per-pokemon damage averages into the persistent store.
 * Each pokemon's sums receive the within-tournament average (averaged across the
 * battles that pokemon participated in), and tournamentCount increments by 1.
 * Call this once per completed tournament, not once per battle.
 */
export function recordTournamentDamage(state: RR4v4State): void {
  const averages = computeTournamentAverages(state);
  if (averages.size === 0) return;
  const all = loadDamageStats();
  for (const [pokemonId, avg] of averages) {
    const existing = all[pokemonId] ?? {
      physSum: 0, specSum: 0, otherSum: 0, totalSum: 0, recoilSum: 0, healSum: 0, tournamentCount: 0,
    };
    all[pokemonId] = {
      physSum:         existing.physSum  + avg.phys,
      specSum:         existing.specSum  + avg.spec,
      otherSum:        existing.otherSum + avg.other,
      totalSum:        existing.totalSum + avg.total,
      recoilSum:       existing.recoilSum + avg.recoil,
      healSum:         existing.healSum  + avg.heal,
      tournamentCount: existing.tournamentCount + 1,
    };
  }
  saveDamageStats(all);
}

export function clearDamageStats(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
