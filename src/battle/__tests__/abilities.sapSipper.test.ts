import { describe, it, expect } from 'vitest';
import { resolveSingleAttack } from '../battleEngine';
import { absorbsGrass } from '../abilities';
import { makePokemon, makeMove } from './fixtures';
import type { TurnEvent } from '../../models/types';

const ctx = { preFlinched: false, foeHitUserThisTurn: false };

const grassMove  = makeMove({ name: 'razor-leaf', type: 'grass',  power: 55, damageClass: 'physical' });
const waterMove  = makeMove({ name: 'surf',        type: 'water',  power: 90, damageClass: 'special'  });
const grassStatus = makeMove({ name: 'spore',      type: 'grass',  power: 0,  damageClass: 'status', effect: { ailment: 'sleep' } });

describe('Sap Sipper', () => {
  it('nullifies incoming grass-type damaging moves', () => {
    const attacker = makePokemon({ name: 'a', types: ['grass'], stats: { attack: 150 } });
    const defender = makePokemon({ name: 'b', types: ['normal'], ability: 'sap-sipper', stats: { hp: 200 } });
    const result = resolveSingleAttack(attacker, defender, grassMove, 1, ctx, []);
    expect(result.defender.currentHp).toBe(200);
  });

  it('raises Attack by 1 stage when absorbing a grass move', () => {
    const events: TurnEvent[] = [];
    const attacker = makePokemon({ name: 'a', types: ['grass'] });
    const defender = makePokemon({ name: 'b', types: ['normal'], ability: 'sap-sipper' });
    const result = resolveSingleAttack(attacker, defender, grassMove, 1, ctx, events);
    expect(result.defender.statStages.attack).toBe(1);
    expect(events.some(e => e.kind === 'stat_change')).toBe(true);
  });

  it('emits ability_triggered and 0-damage attack events', () => {
    const events: TurnEvent[] = [];
    const attacker = makePokemon({ name: 'a', types: ['grass'] });
    const defender = makePokemon({ name: 'b', types: ['normal'], ability: 'sap-sipper' });
    resolveSingleAttack(attacker, defender, grassMove, 1, ctx, events);
    expect(events.some(e => e.kind === 'ability_triggered' && e.ability === 'sap-sipper')).toBe(true);
    const atk = events.find(e => e.kind === 'attack');
    expect(atk).toBeDefined();
    if (atk && atk.kind === 'attack') expect(atk.damage).toBe(0);
  });

  it('does not absorb non-grass moves', () => {
    expect(absorbsGrass(makePokemon({ name: 'x', ability: 'sap-sipper' }), waterMove)).toBe(false);
  });

  it('does not absorb grass-type status moves', () => {
    expect(absorbsGrass(makePokemon({ name: 'x', ability: 'sap-sipper' }), grassStatus)).toBe(false);
  });
});
