import { describe, it, expect } from 'vitest';
import { applyStench } from '../abilities';
import { resolveSingleAttack } from '../battleEngine';
import { makePokemon, makeMove } from './fixtures';
import { stubRngConst } from './rng';
import type { TurnEvent } from '../../models/types';

function ev(): TurnEvent[] { return []; }

const stench  = makePokemon({ name: 's', ability: 'stench' });
const plain   = makePokemon({ name: 'p' });
const noFlinch = makePokemon({ name: 'nf', ability: 'inner-focus' });

function damaging() { return makeMove({ name: 'tackle', type: 'normal', power: 40, damageClass: 'physical' }); }
function status()   { return makeMove({ name: 'growl',  type: 'normal', power: 0,  damageClass: 'status' }); }

describe('Stench — unit', () => {
  it('returns true and emits ability_triggered on a successful 10% roll', () => {
    stubRngConst(0); // 0 < 0.1 → flinch
    const events: TurnEvent[] = [];
    const result = applyStench(stench, plain, damaging(), 1, events);
    expect(result).toBe(true);
    expect(events.some(e => e.kind === 'ability_triggered' && e.ability === 'stench')).toBe(true);
  });

  it('returns false when the roll fails', () => {
    stubRngConst(0.99); // 0.99 >= 0.1 → no flinch
    expect(applyStench(stench, plain, damaging(), 1, ev())).toBe(false);
  });

  it('does not trigger on a status move', () => {
    stubRngConst(0);
    expect(applyStench(stench, plain, status(), 1, ev())).toBe(false);
  });

  it('does not trigger on a Pokemon without Stench', () => {
    stubRngConst(0);
    expect(applyStench(plain, plain, damaging(), 1, ev())).toBe(false);
  });

  it('does not flinch an Inner Focus defender', () => {
    stubRngConst(0);
    expect(applyStench(stench, noFlinch, damaging(), 1, ev())).toBe(false);
  });

  it('does not trigger against a fainted defender', () => {
    stubRngConst(0);
    const fainted = { ...plain, currentHp: 0 };
    expect(applyStench(stench, fainted, damaging(), 1, ev())).toBe(false);
  });
});

describe('Stench — integration via resolveSingleAttack', () => {
  it('causes defenderFlinched when Stench roll succeeds', () => {
    stubRngConst(0); // damage roll, crit, and Stench all pass at 0
    const attacker = makePokemon({ name: 'a', ability: 'stench', stats: { attack: 100 } });
    const defender = makePokemon({ name: 'd' });
    const result = resolveSingleAttack(attacker, defender, damaging(), 1, { preFlinched: false, foeHitUserThisTurn: false }, []);
    expect(result.defenderFlinched).toBe(true);
  });

  it('does not flinch when Stench roll fails', () => {
    stubRngConst(0.99);
    const attacker = makePokemon({ name: 'a', ability: 'stench', stats: { attack: 100 } });
    const defender = makePokemon({ name: 'd' });
    const result = resolveSingleAttack(attacker, defender, damaging(), 1, { preFlinched: false, foeHitUserThisTurn: false }, []);
    expect(result.defenderFlinched).toBe(false);
  });

  it('does not double-apply flinch when move already has a flinch chance', () => {
    // Move has 100% flinch chance — defenderFlinched should be true from move alone
    stubRngConst(0); // guarantees move flinch fires
    const attacker = makePokemon({ name: 'a', ability: 'stench', stats: { attack: 100 } });
    const defender = makePokemon({ name: 'd' });
    const flinchMove = makeMove({ name: 'flincher', type: 'normal', power: 40, damageClass: 'physical', effect: { flinchChance: 100 } });
    const result = resolveSingleAttack(attacker, defender, flinchMove, 1, { preFlinched: false, foeHitUserThisTurn: false }, []);
    expect(result.defenderFlinched).toBe(true);
  });
});
