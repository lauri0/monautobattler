import { describe, it, expect } from 'vitest';
import { applyPoisonTouch } from '../abilities';
import { resolveSingleAttack } from '../battleEngine';
import { makePokemon, makeMove } from './fixtures';
import { stubRngConst } from './rng';
import type { TurnEvent } from '../../models/types';

function ev(): TurnEvent[] { return []; }

const poisonTouch = makePokemon({ name: 'pt', ability: 'poison-touch' });
const plain       = makePokemon({ name: 'p' });

function contactMove()  { return makeMove({ name: 'tackle',     type: 'normal', power: 40,  damageClass: 'physical' }); }
function rangedMove()   { return makeMove({ name: 'earthquake', type: 'ground', power: 100, damageClass: 'physical' }); }
function specialMove()  { return makeMove({ name: 'flamethrower', type: 'fire', power: 90,  damageClass: 'special' }); }

describe('Poison Touch — unit', () => {
  it('poisons the defender on a successful 30% roll with a contact move', () => {
    stubRngConst(0); // 0 < 0.3 → poisons
    const events: TurnEvent[] = [];
    const result = applyPoisonTouch(poisonTouch, plain, contactMove(), 1, events);
    expect(result.statusCondition).toBe('poison');
    expect(events.some(e => e.kind === 'ability_triggered' && e.ability === 'poison-touch')).toBe(true);
  });

  it('does not trigger when the roll fails', () => {
    stubRngConst(0.99);
    const result = applyPoisonTouch(poisonTouch, plain, contactMove(), 1, ev());
    expect(result.statusCondition).toBeUndefined();
  });

  it('does not trigger on non-contact physical moves', () => {
    stubRngConst(0);
    const result = applyPoisonTouch(poisonTouch, plain, rangedMove(), 1, ev());
    expect(result.statusCondition).toBeUndefined();
  });

  it('does not trigger on special moves', () => {
    stubRngConst(0);
    const result = applyPoisonTouch(poisonTouch, plain, specialMove(), 1, ev());
    expect(result.statusCondition).toBeUndefined();
  });

  it('does not trigger on a Pokemon without Poison Touch', () => {
    stubRngConst(0);
    const result = applyPoisonTouch(plain, plain, contactMove(), 1, ev());
    expect(result.statusCondition).toBeUndefined();
  });

  it('does not overwrite an existing status', () => {
    stubRngConst(0);
    const already = { ...plain, statusCondition: 'burn' as const };
    const result = applyPoisonTouch(poisonTouch, already, contactMove(), 1, ev());
    expect(result.statusCondition).toBe('burn');
  });

  it('does not poison poison- or steel-type defenders', () => {
    stubRngConst(0);
    const poisonType = makePokemon({ name: 'x', types: ['poison'] });
    const steelType  = makePokemon({ name: 'y', types: ['steel'] });
    expect(applyPoisonTouch(poisonTouch, poisonType, contactMove(), 1, ev()).statusCondition).toBeUndefined();
    expect(applyPoisonTouch(poisonTouch, steelType,  contactMove(), 1, ev()).statusCondition).toBeUndefined();
  });

  it('does not trigger against a fainted defender', () => {
    stubRngConst(0);
    const fainted = { ...plain, currentHp: 0 };
    const result = applyPoisonTouch(poisonTouch, fainted, contactMove(), 1, ev());
    expect(result.statusCondition).toBeUndefined();
  });
});

describe('Poison Touch — integration via resolveSingleAttack', () => {
  it('poisons the defender when Poison Touch rolls successfully', () => {
    stubRngConst(0);
    const attacker = makePokemon({ name: 'a', ability: 'poison-touch', stats: { attack: 100 } });
    const defender = makePokemon({ name: 'd', types: ['normal'] });
    const result = resolveSingleAttack(attacker, defender, contactMove(), 1, { preFlinched: false, foeHitUserThisTurn: false }, []);
    expect(result.defender.statusCondition).toBe('poison');
  });

  it('does not poison when using a non-contact move', () => {
    stubRngConst(0);
    const attacker = makePokemon({ name: 'a', ability: 'poison-touch', stats: { attack: 100 } });
    const defender = makePokemon({ name: 'd', types: ['normal'] });
    const result = resolveSingleAttack(attacker, defender, rangedMove(), 1, { preFlinched: false, foeHitUserThisTurn: false }, []);
    expect(result.defender.statusCondition).toBeUndefined();
  });
});
