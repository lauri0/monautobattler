import { describe, it, expect } from 'vitest';
import { resolveTurnWithMoves } from '../battleEngine';
import { makePokemon, makeMove } from './fixtures';
import { stubRngConst } from './rng';

const splash = makeMove({ name: 'splash', type: 'normal', power: 0, damageClass: 'status' });

describe('Chlorophyll', () => {
  it('heals floor(maxHp / 16) at end of turn', () => {
    stubRngConst(0.5);
    const bearer = makePokemon({ name: 'a', ability: 'chlorophyll', stats: { hp: 160 }, currentHp: 100 });
    const foe    = makePokemon({ name: 'b' });
    const result = resolveTurnWithMoves(bearer, foe, splash, splash, 1);
    expect(result.p1After.currentHp).toBe(110); // 100 + floor(160/16) = 100 + 10
  });

  it('does not heal beyond max HP', () => {
    stubRngConst(0.5);
    const bearer = makePokemon({ name: 'a', ability: 'chlorophyll', stats: { hp: 160 }, currentHp: 158 });
    const foe    = makePokemon({ name: 'b' });
    const result = resolveTurnWithMoves(bearer, foe, splash, splash, 1);
    expect(result.p1After.currentHp).toBe(160);
  });

  it('does not trigger at full HP', () => {
    stubRngConst(0.5);
    const bearer = makePokemon({ name: 'a', ability: 'chlorophyll', stats: { hp: 160 }, currentHp: 160 });
    const foe    = makePokemon({ name: 'b' });
    const { events } = resolveTurnWithMoves(bearer, foe, splash, splash, 1);
    expect(events.some(e => e.kind === 'ability_triggered' && e.ability === 'chlorophyll')).toBe(false);
  });

  it('emits ability_triggered and heal events', () => {
    stubRngConst(0.5);
    const bearer = makePokemon({ name: 'a', ability: 'chlorophyll', stats: { hp: 160 }, currentHp: 100 });
    const foe    = makePokemon({ name: 'b' });
    const { events } = resolveTurnWithMoves(bearer, foe, splash, splash, 1);
    expect(events.some(e => e.kind === 'ability_triggered' && e.ability === 'chlorophyll')).toBe(true);
    const healEv = events.find(e => e.kind === 'heal' && e.pokemonName === 'a');
    expect(healEv).toBeDefined();
    if (healEv && healEv.kind === 'heal') expect(healEv.healed).toBe(10);
  });
});
