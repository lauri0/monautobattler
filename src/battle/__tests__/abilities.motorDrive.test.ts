import { describe, it, expect } from 'vitest';
import { runFullBattle } from '../battleEngine';
import { absorbsMotorDrive } from '../abilities';
import { makePokemon, makeMove } from './fixtures';
import { stubRngConst } from './rng';

describe('Motor Drive', () => {
  it('nullifies electric damage and raises Speed by 1', () => {
    stubRngConst(0);
    const target = makePokemon({
      name: 'electivire', types: ['electric'], ability: 'motor-drive',
      stats: { hp: 400 },
      moves: [makeMove({ name: 'tackle', power: 1 })],
    });
    const attacker = makePokemon({
      name: 'zap', types: ['electric'],
      stats: { specialAttack: 200 },
      moves: [makeMove({ name: 'bolt', type: 'electric', power: 90, accuracy: 100, damageClass: 'special' })],
    });
    const result = runFullBattle(attacker, target);
    const triggered = result.log.find(e => e.kind === 'ability_triggered' && e.ability === 'motor-drive');
    expect(triggered).toBeDefined();
    const spdRaise = result.log.find(e => e.kind === 'stat_change' && e.pokemonName === 'electivire' && e.stat === 'speed');
    expect(spdRaise).toBeDefined();
    if (spdRaise && spdRaise.kind === 'stat_change') expect(spdRaise.change).toBe(1);
    const firstBolt = result.log.find(e => e.kind === 'attack' && e.moveName === 'bolt');
    if (firstBolt && firstBolt.kind === 'attack') expect(firstBolt.damage).toBe(0);
  });

  it('does not trigger on non-electric attacks', () => {
    expect(absorbsMotorDrive(
      makePokemon({ name: 'x', ability: 'motor-drive' }),
      makeMove({ type: 'fire', damageClass: 'special', power: 90 }),
    )).toBe(false);
  });

  it('does not trigger on status electric moves', () => {
    expect(absorbsMotorDrive(
      makePokemon({ name: 'x', ability: 'motor-drive' }),
      makeMove({ type: 'electric', damageClass: 'status', power: 0 }),
    )).toBe(false);
  });
});
