import { describe, it, expect } from 'vitest';
import { applyContactAbility } from '../abilities';
import { makesContact } from '../contact';
import { makePokemon, makeMove } from './fixtures';
import { stubRngConst, stubRng } from './rng';
import type { TurnEvent } from '../../models/types';

describe('makesContact', () => {
  it('status moves never make contact', () => {
    expect(makesContact(makeMove({ name: 'toxic', damageClass: 'status', power: 0 }))).toBe(false);
  });
  it('physical moves make contact by default', () => {
    expect(makesContact(makeMove({ name: 'tackle', damageClass: 'physical', power: 40 }))).toBe(true);
  });
  it('physical projectiles in the exception list do not make contact', () => {
    expect(makesContact(makeMove({ name: 'earthquake', damageClass: 'physical', power: 100 }))).toBe(false);
    expect(makesContact(makeMove({ name: 'rock-slide', damageClass: 'physical', power: 75 }))).toBe(false);
  });
  it('special moves do not make contact by default', () => {
    expect(makesContact(makeMove({ name: 'flamethrower', damageClass: 'special', power: 90 }))).toBe(false);
  });
  it('special draining moves in the exception list do make contact', () => {
    expect(makesContact(makeMove({ name: 'giga-drain', damageClass: 'special', power: 75 }))).toBe(true);
    expect(makesContact(makeMove({ name: 'draining-kiss', damageClass: 'special', power: 50 }))).toBe(true);
  });
});

function contactMove() { return makeMove({ name: 'tackle', damageClass: 'physical', power: 40 }); }
function rangedMove() { return makeMove({ name: 'earthquake', damageClass: 'physical', power: 100 }); }

describe('Static', () => {
  it('paralyzes the attacker on a successful 30% roll', () => {
    stubRngConst(0); // roll = 0 < 0.3
    const events: TurnEvent[] = [];
    const attacker = makePokemon({ name: 'hitter', types: ['normal'] });
    const defender = makePokemon({ name: 'pikachu', types: ['electric'], ability: 'static' });
    const result = applyContactAbility(attacker, defender, contactMove(), 1, events);
    expect(result.statusCondition).toBe('paralysis');
    expect(events.some(e => e.kind === 'ability_triggered' && e.ability === 'static')).toBe(true);
  });

  it('does not trigger when the roll fails', () => {
    stubRngConst(0.99);
    const events: TurnEvent[] = [];
    const attacker = makePokemon({ name: 'hitter', types: ['normal'] });
    const defender = makePokemon({ name: 'pikachu', types: ['electric'], ability: 'static' });
    const result = applyContactAbility(attacker, defender, contactMove(), 1, events);
    expect(result.statusCondition).toBeUndefined();
  });

  it('does not trigger on non-contact moves', () => {
    stubRngConst(0);
    const events: TurnEvent[] = [];
    const attacker = makePokemon({ name: 'hitter', types: ['ground'] });
    const defender = makePokemon({ name: 'pikachu', types: ['electric'], ability: 'static' });
    const result = applyContactAbility(attacker, defender, rangedMove(), 1, events);
    expect(result.statusCondition).toBeUndefined();
  });

  it('does not paralyze an electric-type attacker', () => {
    stubRngConst(0);
    const events: TurnEvent[] = [];
    const attacker = makePokemon({ name: 'rai', types: ['electric'] });
    const defender = makePokemon({ name: 'pikachu', types: ['electric'], ability: 'static' });
    const result = applyContactAbility(attacker, defender, contactMove(), 1, events);
    expect(result.statusCondition).toBeUndefined();
  });
});

describe('Flame Body', () => {
  it('burns the attacker on a contact move', () => {
    stubRngConst(0);
    const events: TurnEvent[] = [];
    const attacker = makePokemon({ name: 'hitter', types: ['normal'] });
    const defender = makePokemon({ name: 'magmar', types: ['fire'], ability: 'flame-body' });
    const result = applyContactAbility(attacker, defender, contactMove(), 1, events);
    expect(result.statusCondition).toBe('burn');
  });

  it('does not burn a fire-type attacker', () => {
    stubRngConst(0);
    const events: TurnEvent[] = [];
    const attacker = makePokemon({ name: 'char', types: ['fire'] });
    const defender = makePokemon({ name: 'magmar', types: ['fire'], ability: 'flame-body' });
    const result = applyContactAbility(attacker, defender, contactMove(), 1, events);
    expect(result.statusCondition).toBeUndefined();
  });
});

describe('Poison Point', () => {
  it('poisons the attacker on a contact move', () => {
    stubRngConst(0);
    const events: TurnEvent[] = [];
    const attacker = makePokemon({ name: 'hitter', types: ['normal'] });
    const defender = makePokemon({ name: 'nidoking', types: ['poison'], ability: 'poison-point' });
    const result = applyContactAbility(attacker, defender, contactMove(), 1, events);
    expect(result.statusCondition).toBe('poison');
  });

  it('does not poison a steel or poison type attacker', () => {
    stubRngConst(0);
    const events: TurnEvent[] = [];
    const steel = makePokemon({ name: 'steely', types: ['steel'] });
    const poison = makePokemon({ name: 'p', types: ['poison'] });
    const defender = makePokemon({ name: 'n', types: ['poison'], ability: 'poison-point' });
    expect(applyContactAbility(steel, defender, contactMove(), 1, events).statusCondition).toBeUndefined();
    expect(applyContactAbility(poison, defender, contactMove(), 1, events).statusCondition).toBeUndefined();
  });
});

describe('Effect Spore', () => {
  it('applies one of paralysis/poison/sleep on a successful roll', () => {
    // First RNG call gates the 30%; second picks the ailment.
    // 0.1 < 0.3 (gate passes), 0.1 < 1/3 -> paralysis
    const events: TurnEvent[] = [];
    // stubRngConst(0.1) doesn't exist; use two calls via stubRng
stubRng([0.1, 0.1]);
    const attacker = makePokemon({ name: 'x', types: ['normal'] });
    const defender = makePokemon({ name: 'vileplume', types: ['grass', 'poison'], ability: 'effect-spore' });
    const result = applyContactAbility(attacker, defender, contactMove(), 1, events);
    expect(result.statusCondition).toBe('paralysis');
  });

  it('grass-type attackers are immune', () => {
    stubRngConst(0);
    const events: TurnEvent[] = [];
    const attacker = makePokemon({ name: 'venu', types: ['grass'] });
    const defender = makePokemon({ name: 'vileplume', types: ['grass', 'poison'], ability: 'effect-spore' });
    const result = applyContactAbility(attacker, defender, contactMove(), 1, events);
    expect(result.statusCondition).toBeUndefined();
  });

  it('selects poison in the middle third of the roll', () => {
const events: TurnEvent[] = [];
    stubRng([0.1, 0.5]); // gate passes, 0.5 is in [1/3, 2/3) -> poison
    const attacker = makePokemon({ name: 'x', types: ['normal'] });
    const defender = makePokemon({ name: 'v', types: ['grass'], ability: 'effect-spore' });
    const result = applyContactAbility(attacker, defender, contactMove(), 1, events);
    expect(result.statusCondition).toBe('poison');
  });

  it('selects sleep in the top third of the roll', () => {
const events: TurnEvent[] = [];
    stubRng([0.1, 0.9]); // gate passes, 0.9 >= 2/3 -> sleep
    const attacker = makePokemon({ name: 'x', types: ['normal'] });
    const defender = makePokemon({ name: 'v', types: ['grass'], ability: 'effect-spore' });
    const result = applyContactAbility(attacker, defender, contactMove(), 1, events);
    expect(result.statusCondition).toBe('sleep');
  });
});

describe('Contact ability preconditions', () => {
  it('does not overwrite an existing status on the attacker', () => {
    stubRngConst(0);
    const events: TurnEvent[] = [];
    const attacker = makePokemon({ name: 'x', types: ['normal'], statusCondition: 'burn' });
    const defender = makePokemon({ name: 'p', types: ['electric'], ability: 'static' });
    const result = applyContactAbility(attacker, defender, contactMove(), 1, events);
    expect(result.statusCondition).toBe('burn');
  });

  it('does nothing when defender has no implemented contact ability', () => {
    stubRngConst(0);
    const events: TurnEvent[] = [];
    const attacker = makePokemon({ name: 'x', types: ['normal'] });
    const defender = makePokemon({ name: 'd', types: ['normal'] });
    const result = applyContactAbility(attacker, defender, contactMove(), 1, events);
    expect(result.statusCondition).toBeUndefined();
  });
});
