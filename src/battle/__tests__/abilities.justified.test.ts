import { describe, it, expect } from 'vitest';
import { applyJustified } from '../abilities';
import { resolveSingleAttack } from '../battleEngine';
import { makePokemon, makeMove } from './fixtures';
import { stubRngConst } from './rng';
import type { TurnEvent } from '../../models/types';

const justified = makePokemon({ name: 'j', ability: 'justified' });
const plain     = makePokemon({ name: 'p' });

function darkMove()   { return makeMove({ name: 'crunch',     type: 'dark',   power: 80, damageClass: 'physical' }); }
function normalMove() { return makeMove({ name: 'tackle',     type: 'normal', power: 40, damageClass: 'physical' }); }

describe('Justified — unit', () => {
  it('raises Attack by 1 when hit by a Dark-type move', () => {
    const events: TurnEvent[] = [];
    const result = applyJustified(justified, darkMove(), 1, events);
    expect(result.statStages.attack).toBe(1);
    expect(events.some(e => e.kind === 'ability_triggered' && e.ability === 'justified')).toBe(true);
  });

  it('does not trigger on non-Dark moves', () => {
    const result = applyJustified(justified, normalMove(), 1, []);
    expect(result.statStages.attack).toBe(0);
  });

  it('does not trigger on a Pokemon without Justified', () => {
    const result = applyJustified(plain, darkMove(), 1, []);
    expect(result.statStages.attack).toBe(0);
  });

  it('does not trigger when the bearer is fainted', () => {
    const fainted = { ...justified, currentHp: 0 };
    const result = applyJustified(fainted, darkMove(), 1, []);
    expect(result.statStages.attack).toBe(0);
  });

  it('caps Attack at +6', () => {
    const maxed = { ...justified, statStages: { ...justified.statStages, attack: 6 } };
    const result = applyJustified(maxed, darkMove(), 1, []);
    expect(result.statStages.attack).toBe(6);
  });
});

describe('Justified — integration via resolveSingleAttack', () => {
  it('raises Attack by 1 after being hit by a Dark-type move', () => {
    stubRngConst(0.5);
    const attacker = makePokemon({ name: 'a', stats: { attack: 100 } });
    const events: TurnEvent[] = [];
    const result = resolveSingleAttack(attacker, justified, darkMove(), 1, { preFlinched: false, foeHitUserThisTurn: false }, events);
    expect(result.defender.statStages.attack).toBe(1);
    expect(events.some(e => e.kind === 'ability_triggered' && e.ability === 'justified')).toBe(true);
  });

  it('does not raise Attack after being hit by a non-Dark move', () => {
    stubRngConst(0.5);
    const attacker = makePokemon({ name: 'a', stats: { attack: 100 } });
    const result = resolveSingleAttack(attacker, justified, normalMove(), 1, { preFlinched: false, foeHitUserThisTurn: false }, []);
    expect(result.defender.statStages.attack).toBe(0);
  });
});
