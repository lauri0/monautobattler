import { describe, it, expect } from 'vitest';
import type { TeamTurnEvent } from '../../models/types';
import { parseDamageSummary } from '../damageSummary';

// Helper to cast a partial event object — avoids fighting TypeScript intersections.
function ev(partial: Record<string, unknown>): TeamTurnEvent {
  return partial as unknown as TeamTurnEvent;
}

const nameToId = new Map([
  ['attacker', 1],
  ['defender', 2],
  ['setter', 3],
  ['weather-setter', 4],
]);

describe('parseDamageSummary', () => {
  it('credits physical attack damage to the attacker', () => {
    const log: TeamTurnEvent[] = [
      ev({ side: 0, kind: 'attack', turn: 1, attackerName: 'attacker', defenderName: 'defender',
           moveName: 'tackle', moveType: 'normal', damageClass: 'physical',
           damage: 60, isCrit: false, missed: false, effectiveness: 1,
           attackerHpAfter: 100, defenderHpAfter: 40 }),
    ];
    const result = parseDamageSummary(log, nameToId);
    const entry = result.find(e => e.pokemonId === 1);
    expect(entry?.physical).toBe(60);
    expect(entry?.special).toBe(0);
    expect(entry?.other).toBe(0);
  });

  it('credits special attack damage to the attacker', () => {
    const log: TeamTurnEvent[] = [
      ev({ side: 0, kind: 'attack', turn: 1, attackerName: 'attacker', defenderName: 'defender',
           moveName: 'flamethrower', moveType: 'fire', damageClass: 'special',
           damage: 80, isCrit: false, missed: false, effectiveness: 1,
           attackerHpAfter: 100, defenderHpAfter: 20 }),
    ];
    const result = parseDamageSummary(log, nameToId);
    const entry = result.find(e => e.pokemonId === 1);
    expect(entry?.special).toBe(80);
    expect(entry?.physical).toBe(0);
  });

  it('ignores missed attacks', () => {
    const log: TeamTurnEvent[] = [
      ev({ side: 0, kind: 'attack', turn: 1, attackerName: 'attacker', defenderName: 'defender',
           moveName: 'tackle', moveType: 'normal', damageClass: 'physical',
           damage: 0, isCrit: false, missed: true, effectiveness: 1,
           attackerHpAfter: 100, defenderHpAfter: 100 }),
    ];
    const result = parseDamageSummary(log, nameToId);
    expect(result.find(e => e.pokemonId === 1)).toBeUndefined();
  });

  it('credits stealth rock damage to the setter', () => {
    const log: TeamTurnEvent[] = [
      ev({ side: 1, kind: 'field_set', turn: 1, effect: 'stealthRock', turns: 0, pokemonName: 'setter' }),
      ev({ side: 1, kind: 'stealth_rock_damage', turn: 2, pokemonName: 'defender', damage: 25, hpAfter: 75 }),
    ];
    const result = parseDamageSummary(log, nameToId);
    const entry = result.find(e => e.pokemonId === 3);
    expect(entry?.other).toBe(25);
  });

  it('credits spikes damage to the setter', () => {
    const log: TeamTurnEvent[] = [
      ev({ side: 1, kind: 'field_set', turn: 1, effect: 'spikes', turns: 1, pokemonName: 'setter' }),
      ev({ side: 1, kind: 'spikes_damage', turn: 2, pokemonName: 'defender', damage: 25, hpAfter: 75, layers: 1 }),
    ];
    const result = parseDamageSummary(log, nameToId);
    expect(result.find(e => e.pokemonId === 3)?.other).toBe(25);
  });

  it('credits toxic spikes poison → status_damage to the toxic spikes setter', () => {
    const log: TeamTurnEvent[] = [
      ev({ side: 1, kind: 'field_set', turn: 1, effect: 'toxicSpikes', turns: 0, pokemonName: 'setter' }),
      ev({ side: 1, kind: 'toxic_spikes_poison', turn: 2, pokemonName: 'defender' }),
      ev({ side: 1, kind: 'status_damage', turn: 2, pokemonName: 'defender', condition: 'poison', damage: 25, hpAfter: 75 }),
    ];
    const result = parseDamageSummary(log, nameToId);
    expect(result.find(e => e.pokemonId === 3)?.other).toBe(25);
  });

  it('credits weather damage to the weather setter', () => {
    const log: TeamTurnEvent[] = [
      ev({ side: 0, kind: 'weather_set', turn: 1, weather: 'sandstorm', turns: 5, pokemonName: 'weather-setter' }),
      ev({ side: 1, kind: 'weather_damage', turn: 1, pokemonName: 'defender', weather: 'sandstorm', damage: 12, hpAfter: 88 }),
    ];
    const result = parseDamageSummary(log, nameToId);
    expect(result.find(e => e.pokemonId === 4)?.other).toBe(12);
  });

  it('credits status_damage from a move-applied burn to the attacker', () => {
    const log: TeamTurnEvent[] = [
      ev({ side: 0, kind: 'attack', turn: 1, attackerName: 'attacker', defenderName: 'defender',
           moveName: 'flamethrower', moveType: 'fire', damageClass: 'special',
           damage: 80, isCrit: false, missed: false, effectiveness: 1,
           attackerHpAfter: 100, defenderHpAfter: 20 }),
      ev({ side: 1, kind: 'status_applied', turn: 1, pokemonName: 'defender', condition: 'burn' }),
      ev({ side: 1, kind: 'status_damage', turn: 1, pokemonName: 'defender', condition: 'burn', damage: 12, hpAfter: 8 }),
    ];
    const result = parseDamageSummary(log, nameToId);
    const entry = result.find(e => e.pokemonId === 1);
    expect(entry?.special).toBe(80);
    expect(entry?.other).toBe(12);
  });

  it('credits status_damage from an ability-applied paralysis to the ability holder', () => {
    const log: TeamTurnEvent[] = [
      ev({ side: 0, kind: 'attack', turn: 1, attackerName: 'attacker', defenderName: 'defender',
           moveName: 'tackle', moveType: 'normal', damageClass: 'physical',
           damage: 40, isCrit: false, missed: false, effectiveness: 1,
           attackerHpAfter: 100, defenderHpAfter: 60 }),
      ev({ side: 1, kind: 'ability_triggered', turn: 1, pokemonName: 'defender', ability: 'static' }),
      ev({ side: 0, kind: 'status_applied', turn: 1, pokemonName: 'attacker', condition: 'paralysis' }),
      // paralysis chip damage attributed to defender (the ability holder that caused it)
      ev({ side: 0, kind: 'status_damage', turn: 2, pokemonName: 'attacker', condition: 'paralysis', damage: 15, hpAfter: 85 }),
    ];
    const result = parseDamageSummary(log, nameToId);
    expect(result.find(e => e.pokemonId === 1)?.physical).toBe(40);  // attacker's tackle
    expect(result.find(e => e.pokemonId === 2)?.other).toBe(15);     // defender's Static-caused damage
  });

  it('credits confusion_hit to the pokemon that caused the confusion', () => {
    const log: TeamTurnEvent[] = [
      ev({ side: 0, kind: 'attack', turn: 1, attackerName: 'attacker', defenderName: 'defender',
           moveName: 'confuse-ray', moveType: 'ghost', damageClass: 'status',
           damage: 0, isCrit: false, missed: false, effectiveness: 1,
           attackerHpAfter: 100, defenderHpAfter: 100 }),
      ev({ side: 1, kind: 'confused', turn: 1, pokemonName: 'defender' }),
      ev({ side: 1, kind: 'confusion_hit', turn: 2, pokemonName: 'defender', damage: 30, hpAfter: 70 }),
    ];
    const result = parseDamageSummary(log, nameToId);
    expect(result.find(e => e.pokemonId === 1)?.other).toBe(30);
  });

  it('subtracts confusion_hit from self when confusion was self-caused (Outrage)', () => {
    const log: TeamTurnEvent[] = [
      ev({ side: 0, kind: 'attack', turn: 1, attackerName: 'attacker', defenderName: 'defender',
           moveName: 'outrage', moveType: 'dragon', damageClass: 'physical',
           damage: 100, isCrit: false, missed: false, effectiveness: 1,
           attackerHpAfter: 100, defenderHpAfter: 0 }),
      ev({ side: 0, kind: 'confused', turn: 1, pokemonName: 'attacker' }),
      ev({ side: 0, kind: 'confusion_hit', turn: 2, pokemonName: 'attacker', damage: 40, hpAfter: 60 }),
    ];
    const result = parseDamageSummary(log, nameToId);
    const entry = result.find(e => e.pokemonId === 1);
    expect(entry?.physical).toBe(100);
    expect(entry?.other).toBe(-40);
  });

  it('tracks recoil damage', () => {
    const log: TeamTurnEvent[] = [
      ev({ side: 0, kind: 'attack', turn: 1, attackerName: 'attacker', defenderName: 'defender',
           moveName: 'flare-blitz', moveType: 'fire', damageClass: 'physical',
           damage: 120, isCrit: false, missed: false, effectiveness: 1,
           attackerHpAfter: 100, defenderHpAfter: 0 }),
      ev({ side: 0, kind: 'recoil', turn: 1, pokemonName: 'attacker', damage: 40, hpAfter: 60 }),
    ];
    const result = parseDamageSummary(log, nameToId);
    const entry = result.find(e => e.pokemonId === 1);
    expect(entry?.physical).toBe(120);
    expect(entry?.recoil).toBe(40);
  });

  it('tracks drain healing', () => {
    const log: TeamTurnEvent[] = [
      ev({ side: 0, kind: 'attack', turn: 1, attackerName: 'attacker', defenderName: 'defender',
           moveName: 'giga-drain', moveType: 'grass', damageClass: 'special',
           damage: 60, isCrit: false, missed: false, effectiveness: 1,
           attackerHpAfter: 100, defenderHpAfter: 40 }),
      ev({ side: 0, kind: 'drain', turn: 1, pokemonName: 'attacker', healed: 30, hpAfter: 130 }),
    ];
    const result = parseDamageSummary(log, nameToId);
    const entry = result.find(e => e.pokemonId === 1);
    expect(entry?.special).toBe(60);
    expect(entry?.heal).toBe(30);
  });

  it('tracks Recover/heal-move healing', () => {
    const log: TeamTurnEvent[] = [
      ev({ side: 0, kind: 'heal', turn: 1, pokemonName: 'attacker', healed: 50, hpAfter: 150 }),
    ];
    const result = parseDamageSummary(log, nameToId);
    expect(result.find(e => e.pokemonId === 1)?.heal).toBe(50);
  });

  it('tracks Grassy Terrain healing', () => {
    const log: TeamTurnEvent[] = [
      ev({ side: 0, kind: 'terrain_heal', turn: 1, pokemonName: 'attacker', healed: 12, hpAfter: 112 }),
    ];
    const result = parseDamageSummary(log, nameToId);
    expect(result.find(e => e.pokemonId === 1)?.heal).toBe(12);
  });

  it('omits pokemon with all-zero stats', () => {
    const log: TeamTurnEvent[] = [
      ev({ side: 0, kind: 'attack', turn: 1, attackerName: 'attacker', defenderName: 'defender',
           moveName: 'tackle', moveType: 'normal', damageClass: 'physical',
           damage: 0, isCrit: false, missed: true, effectiveness: 1,
           attackerHpAfter: 100, defenderHpAfter: 100 }),
    ];
    const result = parseDamageSummary(log, nameToId);
    expect(result).toHaveLength(0);
  });

  it('accumulates damage across multiple turns', () => {
    const log: TeamTurnEvent[] = [
      ev({ side: 0, kind: 'attack', turn: 1, attackerName: 'attacker', defenderName: 'defender',
           moveName: 'tackle', moveType: 'normal', damageClass: 'physical',
           damage: 40, isCrit: false, missed: false, effectiveness: 1,
           attackerHpAfter: 100, defenderHpAfter: 60 }),
      ev({ side: 0, kind: 'attack', turn: 2, attackerName: 'attacker', defenderName: 'defender',
           moveName: 'tackle', moveType: 'normal', damageClass: 'physical',
           damage: 40, isCrit: false, missed: false, effectiveness: 1,
           attackerHpAfter: 100, defenderHpAfter: 20 }),
    ];
    const result = parseDamageSummary(log, nameToId);
    expect(result.find(e => e.pokemonId === 1)?.physical).toBe(80);
  });
});
