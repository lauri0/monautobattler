import { describe, it, expect } from 'vitest';
import type { FieldState, TurnEvent } from '../../models/types';
import {
  applySpikesOnEntry,
  applyToxicSpikesOnEntry,
  makeInitialField,
  resolveSingleAttack,
} from '../battleEngine';
import { makeMove, makePokemon } from './fixtures';

const CTX = { preFlinched: false, foeHitUserThisTurn: false };

const spikes = () => makeMove({
  name: 'spikes', type: 'ground', damageClass: 'status',
  power: 0, accuracy: null, priority: 0, effect: { fieldEffect: 'spikes' },
});
const toxicSpikes = () => makeMove({
  name: 'toxic-spikes', type: 'poison', damageClass: 'status',
  power: 0, accuracy: null, priority: 0, effect: { fieldEffect: 'toxicSpikes' },
});

describe('Spikes (move)', () => {
  it('lays one layer on the foe side and emits field_set', () => {
    const events: TurnEvent[] = [];
    const r = resolveSingleAttack(makePokemon(), makePokemon(), spikes(), 1,
      { ...CTX, field: makeInitialField(), attackerSide: 0 }, events);
    expect(r.field.sides[1].spikes).toBe(1);
    expect(r.field.sides[0].spikes).toBe(0);
    expect(events.find(e => e.kind === 'field_set')).toBeTruthy();
  });

  it('stacks up to three layers', () => {
    let field = makeInitialField();
    for (let i = 1; i <= 3; i++) {
      const events: TurnEvent[] = [];
      const r = resolveSingleAttack(makePokemon(), makePokemon(), spikes(), 1,
        { ...CTX, field, attackerSide: 0 }, events);
      field = r.field;
      expect(field.sides[1].spikes).toBe(i);
    }
    // Fourth attempt fails — already at max layers.
    const events: TurnEvent[] = [];
    resolveSingleAttack(makePokemon(), makePokemon(), spikes(), 1,
      { ...CTX, field, attackerSide: 0 }, events);
    expect(field.sides[1].spikes).toBe(3);
    expect(events.find(e => e.kind === 'move_failed')).toBeTruthy();
  });
});

describe('Spikes (on entry)', () => {
  it('deals 1/8 HP on 1 layer to grounded pokemon', () => {
    const field = makeInitialField();
    field.sides[1].spikes = 1;
    const p = makePokemon({ stats: { hp: 200 } });
    const events: TurnEvent[] = [];
    const after = applySpikesOnEntry(p, field, 1, 1, events);
    expect(p.currentHp - after.currentHp).toBe(25); // 200/8
    expect(events[0].kind).toBe('spikes_damage');
  });

  it('deals 1/6 HP on 2 layers', () => {
    const field = makeInitialField();
    field.sides[1].spikes = 2;
    const p = makePokemon({ stats: { hp: 240 } });
    const after = applySpikesOnEntry(p, field, 1, 1, []);
    expect(p.currentHp - after.currentHp).toBe(40); // 240/6
  });

  it('deals 1/4 HP on 3 layers', () => {
    const field = makeInitialField();
    field.sides[1].spikes = 3;
    const p = makePokemon({ stats: { hp: 200 } });
    const after = applySpikesOnEntry(p, field, 1, 1, []);
    expect(p.currentHp - after.currentHp).toBe(50); // 200/4
  });

  it('does not affect Flying types', () => {
    const field = makeInitialField();
    field.sides[1].spikes = 3;
    const p = makePokemon({ types: ['flying'] });
    const events: TurnEvent[] = [];
    const after = applySpikesOnEntry(p, field, 1, 1, events);
    expect(after).toBe(p);
    expect(events.length).toBe(0);
  });

  it('does not affect Levitate users', () => {
    const field = makeInitialField();
    field.sides[1].spikes = 2;
    const p = makePokemon({ ability: 'levitate' });
    const after = applySpikesOnEntry(p, field, 1, 1, []);
    expect(after).toBe(p);
  });

  it('no-op when no layers set', () => {
    const p = makePokemon();
    const after = applySpikesOnEntry(p, makeInitialField(), 1, 1, []);
    expect(after).toBe(p);
  });
});

describe('Toxic Spikes (move)', () => {
  it('lays on the foe side and emits field_set', () => {
    const events: TurnEvent[] = [];
    const r = resolveSingleAttack(makePokemon(), makePokemon(), toxicSpikes(), 1,
      { ...CTX, field: makeInitialField(), attackerSide: 0 }, events);
    expect(r.field.sides[1].toxicSpikes).toBe(true);
    expect(events.find(e => e.kind === 'field_set')).toBeTruthy();
  });

  it('fails when already set', () => {
    const field: FieldState = makeInitialField();
    field.sides[1].toxicSpikes = true;
    const events: TurnEvent[] = [];
    resolveSingleAttack(makePokemon(), makePokemon(), toxicSpikes(), 1,
      { ...CTX, field, attackerSide: 0 }, events);
    expect(events.find(e => e.kind === 'move_failed')).toBeTruthy();
  });
});

describe('Toxic Spikes (on entry)', () => {
  it('poisons a grounded non-poison switch-in', () => {
    const field = makeInitialField();
    field.sides[1].toxicSpikes = true;
    const p = makePokemon({ types: ['normal'] });
    const events: TurnEvent[] = [];
    const { pokemon, field: newField } = applyToxicSpikesOnEntry(p, field, 1, 1, events);
    expect(pokemon.statusCondition).toBe('poison');
    expect(newField.sides[1].toxicSpikes).toBe(true);
    expect(events.find(e => e.kind === 'toxic_spikes_poison')).toBeTruthy();
  });

  it('is absorbed by a grounded Poison-type, clearing the hazard', () => {
    const field = makeInitialField();
    field.sides[1].toxicSpikes = true;
    const p = makePokemon({ types: ['poison'] });
    const events: TurnEvent[] = [];
    const { pokemon, field: newField } = applyToxicSpikesOnEntry(p, field, 1, 1, events);
    expect(pokemon.statusCondition).toBeUndefined();
    expect(newField.sides[1].toxicSpikes).toBe(false);
    expect(events.find(e => e.kind === 'toxic_spikes_absorbed')).toBeTruthy();
    expect(events.find(e => e.kind === 'field_expired')).toBeTruthy();
  });

  it('does not affect Flying types', () => {
    const field = makeInitialField();
    field.sides[1].toxicSpikes = true;
    const p = makePokemon({ types: ['flying'] });
    const { pokemon, field: newField } = applyToxicSpikesOnEntry(p, field, 1, 1, []);
    expect(pokemon.statusCondition).toBeUndefined();
    expect(newField.sides[1].toxicSpikes).toBe(true);
  });

  it('does not affect Steel types', () => {
    const field = makeInitialField();
    field.sides[1].toxicSpikes = true;
    const p = makePokemon({ types: ['steel'] });
    const { pokemon } = applyToxicSpikesOnEntry(p, field, 1, 1, []);
    expect(pokemon.statusCondition).toBeUndefined();
  });

  it('does not affect Levitate users', () => {
    const field = makeInitialField();
    field.sides[1].toxicSpikes = true;
    const p = makePokemon({ ability: 'levitate' });
    const { pokemon } = applyToxicSpikesOnEntry(p, field, 1, 1, []);
    expect(pokemon.statusCondition).toBeUndefined();
  });

  it('does not overwrite an existing status', () => {
    const field = makeInitialField();
    field.sides[1].toxicSpikes = true;
    const p = makePokemon({ statusCondition: 'burn' });
    const { pokemon } = applyToxicSpikesOnEntry(p, field, 1, 1, []);
    expect(pokemon.statusCondition).toBe('burn');
  });
});

describe('Rapid Spin clears Spikes / Toxic Spikes', () => {
  it('clears all hazards on the user\'s side after hitting', () => {
    const field = makeInitialField();
    field.sides[0].stealthRock = true;
    field.sides[0].spikes = 2;
    field.sides[0].toxicSpikes = true;
    const spin = makeMove({
      name: 'rapid-spin', type: 'normal', power: 50, accuracy: 100,
      damageClass: 'physical', effect: { clearsHazards: true },
    });
    const events: TurnEvent[] = [];
    const r = resolveSingleAttack(
      makePokemon({ stats: { attack: 200 } }),
      makePokemon({ stats: { defense: 50 } }),
      spin, 1, { ...CTX, field, attackerSide: 0 }, events,
    );
    expect(r.field.sides[0].stealthRock).toBe(false);
    expect(r.field.sides[0].spikes).toBe(0);
    expect(r.field.sides[0].toxicSpikes).toBe(false);
  });
});
