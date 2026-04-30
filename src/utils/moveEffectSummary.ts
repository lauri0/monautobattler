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

  if (eff.useOwnDefense) {
    parts.push('uses own Def');
  }

  if (eff.hitsExactly) {
    parts.push(eff.escalatingHits ? `hits ${eff.hitsExactly}×, escalating power` : `hits ${eff.hitsExactly}×`);
  }

  if (eff.hitsVariable) {
    parts.push('hits 2–5×');
  }

  if (eff.confusesUser) {
    parts.push('confuse self');
  }

  if (eff.pivotSwitch) {
    parts.push('switch out');
  }

  if (eff.heal) {
    parts.push(`heal ${eff.heal}%`);
  }

  if (eff.protect) {
    parts.push('protect');
  }

  if (eff.taunt) {
    parts.push('taunt 3t');
  }

  if (eff.removesScreens) {
    parts.push('breaks screens');
  }

  if (eff.clearsHazards) {
    parts.push('clears hazards');
  }

  if (eff.crashOnMiss) {
    parts.push('crash 50% on miss');
  }

  if (eff.failsIfTargetNotAttacking) {
    parts.push('fails vs status');
  }

  if (eff.fieldEffect) {
    const labels: Record<string, string> = {
      trickRoom: 'trick room 5t',
      tailwind: 'tailwind 4t',
      lightScreen: 'light screen 5t',
      reflect: 'reflect 5t',
      stealthRock: 'stealth rock',
      spikes: 'spikes',
      toxicSpikes: 'toxic spikes',
    };
    parts.push(labels[eff.fieldEffect] ?? eff.fieldEffect);
  }

  return parts.join(' · ');
}
