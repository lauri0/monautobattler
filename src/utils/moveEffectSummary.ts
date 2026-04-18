import type { Move } from '../models/types';

const STAT_SHORT: Record<string, string> = {
  'attack': 'Atk', 'defense': 'Def',
  'special-attack': 'SpA', 'special-defense': 'SpD', 'speed': 'Spe',
};

export function effectSummary(move: Move): string {
  const eff = move.effect;
  if (!eff) return '';
  const parts: string[] = [];

  if (eff.drain !== undefined && eff.drain !== 0) {
    parts.push(eff.drain > 0 ? `drain ${eff.drain}%` : `recoil ${Math.abs(eff.drain)}%`);
  }

  if (eff.ailment) {
    const chance = eff.ailmentChance ?? 0;
    parts.push(chance === 0 ? eff.ailment : `${chance}% ${eff.ailment}`);
  }

  if (eff.statChanges && eff.statChanges.length > 0) {
    const chance = eff.statChance ?? 0;
    const byTarget = new Map<'user' | 'foe', typeof eff.statChanges>();
    for (const sc of eff.statChanges) {
      const arr = byTarget.get(sc.target) ?? [];
      arr.push(sc);
      byTarget.set(sc.target, arr);
    }
    for (const [target, changes] of byTarget) {
      const byAmount = new Map<number, string[]>();
      for (const sc of changes) {
        const arr = byAmount.get(sc.change) ?? [];
        arr.push(STAT_SHORT[sc.stat] ?? sc.stat);
        byAmount.set(sc.change, arr);
      }
      const segs = [...byAmount.entries()].map(([n, stats]) =>
        `${stats.join('/')}${n > 0 ? '+' : ''}${n}`
      ).join(' ');
      const str = (target === 'foe' ? 'foe ' : '') + segs;
      parts.push(chance > 0 ? `${chance}% ${str}` : str);
    }
  }

  if (eff.flinchChance) {
    parts.push(`${eff.flinchChance}% flinch`);
  }

  if (eff.critRate) {
    parts.push(eff.critRate >= 2 ? '++crit' : '+crit');
  }

  if (eff.confuses) {
    const chance = eff.confusionChance ?? 0;
    parts.push(chance === 0 ? 'confuse' : `${chance}% confuse`);
  }

  if (eff.doublePowerIfHit) {
    parts.push('2× if hit');
  }

  if (eff.doublePowerIfTargetStatus) {
    parts.push('2× vs status');
  }

  if (eff.superEffectiveAgainst?.length) {
    parts.push(`SE vs ${eff.superEffectiveAgainst.join('/')}`);
  }

  if (eff.useFoeAttack) {
    parts.push('uses foe Atk');
  }

  if (eff.confusesUser) {
    parts.push('confuse self');
  }

  return parts.join(' · ');
}
