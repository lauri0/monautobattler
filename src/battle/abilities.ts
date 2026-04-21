import type { AbilityId, BattlePokemon, Move, StatStageName, TurnEvent, StatStages } from '../models/types';

// Registry of abilities whose effects are wired into the battle engine. Any
// ability name not present here displays as "(Unimplemented)" in the UI and
// has no in-battle effect.

export interface AbilityEffect {
  // Applied when the bearer switches in (including the start of a battle).
  // Returns the updated opposing active. May push events.
  onSwitchIn?: (self: BattlePokemon, opponent: BattlePokemon, turn: number, events: TurnEvent[]) => BattlePokemon;
  // Multiplier applied to the bearer's outgoing damage.
  damageMultiplier?: (self: BattlePokemon, move: Move) => number;
}

function clampStage(v: number): number {
  return Math.max(-6, Math.min(6, v));
}

function applyStatChange(
  p: BattlePokemon,
  stat: StatStageName,
  change: number,
  turn: number,
  events: TurnEvent[],
): BattlePokemon {
  const oldStage = p.statStages[stat];
  const newStage = clampStage(oldStage + change);
  if (newStage === oldStage) return p;
  events.push({ kind: 'stat_change', turn, pokemonName: p.data.name, stat, change: newStage - oldStage, newStage });
  return { ...p, statStages: { ...p.statStages, [stat]: newStage } as StatStages };
}

export const IMPLEMENTED_ABILITIES: Record<string, AbilityEffect> = {
  'intimidate': {
    onSwitchIn: (_self, opponent, turn, events) => {
      if (opponent.currentHp <= 0) return opponent;
      return applyStatChange(opponent, 'attack', -1, turn, events);
    },
  },
  'overgrow': {
    damageMultiplier: (self, move) => {
      if (move.type !== 'grass') return 1;
      if (self.currentHp * 3 < self.level50Stats.hp) return 1.5;
      return 1;
    },
  },
};

export function isAbilityImplemented(name: AbilityId | undefined): boolean {
  if (!name) return false;
  return name in IMPLEMENTED_ABILITIES;
}

export function getAbilityDamageMultiplier(attacker: BattlePokemon, move: Move): number {
  const ability = attacker.ability;
  if (!ability) return 1;
  const entry = IMPLEMENTED_ABILITIES[ability];
  return entry?.damageMultiplier?.(attacker, move) ?? 1;
}

// Applies the incoming pokemon's switch-in ability against the opponent.
// Returns the (possibly updated) opponent. Emits an `ability_triggered` event
// when the ability actually produced an effect.
export function applySwitchInAbility(
  incoming: BattlePokemon,
  opponent: BattlePokemon,
  turn: number,
  events: TurnEvent[],
): BattlePokemon {
  const ability = incoming.ability;
  if (!ability) return opponent;
  const entry = IMPLEMENTED_ABILITIES[ability];
  if (!entry?.onSwitchIn) return opponent;
  const marker: TurnEvent[] = [];
  const updated = entry.onSwitchIn(incoming, opponent, turn, marker);
  if (marker.length > 0) {
    events.push({ kind: 'ability_triggered', turn, pokemonName: incoming.data.name, ability });
    for (const ev of marker) events.push(ev);
  }
  return updated;
}
