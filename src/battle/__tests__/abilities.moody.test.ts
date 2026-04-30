import { describe, it, expect } from 'vitest';
import { resolveTurnWithMoves } from '../battleEngine';
import { makePokemon, makeMove } from './fixtures';
import { stubRng } from './rng';

// splash: accuracy omitted so makeMove defaults to 100, but Math.random() > 1.0 never misses
const splash = makeMove({ name: 'splash', type: 'normal', power: 0, damageClass: 'status' });

// RNG call order per turn (both using splash, equal speed):
//   [0] speed-tie resolution (resolveTurnWithMoves)
//   [1] first attacker's splash accuracy roll (Math.random() > 1.0 → never misses)
//   [2] second attacker's splash accuracy roll
//   [3] Moody: Math.floor(rng * boostable.length)  → boost stat index
//   [4] Moody: Math.floor(rng * lowerable.length)  → lower stat index

// Stat order in IMPLEMENTED_ABILITIES: ['attack','defense','special-attack','special-defense','speed']

describe('Moody', () => {
  it('boosts one stat by 2 and lowers a different stat by 1 each turn', () => {
    // [3]=0.0 → boostable[0]=attack; [4]=0.0 → lowerable[0]=defense
    stubRng([0.0, 0.0, 0.0, 0.0, 0.0]);
    const bearer = makePokemon({ name: 'a', ability: 'moody' });
    const foe    = makePokemon({ name: 'b' });
    const { p1After } = resolveTurnWithMoves(bearer, foe, splash, splash, 1);
    expect(p1After.statStages.attack).toBe(2);
    expect(p1After.statStages.defense).toBe(-1);
  });

  it('the boosted and lowered stats are always different', () => {
    // [3]=0.99 → boostable[4]=speed; [4]=0.0 → lowerable[0]=attack
    stubRng([0.0, 0.0, 0.0, 0.99, 0.0]);
    const bearer = makePokemon({ name: 'a', ability: 'moody' });
    const foe    = makePokemon({ name: 'b' });
    const { p1After } = resolveTurnWithMoves(bearer, foe, splash, splash, 1);
    expect(p1After.statStages.speed).toBe(2);
    expect(p1After.statStages.attack).toBe(-1);
  });

  it('emits ability_triggered and two stat_change events', () => {
    stubRng([0.0, 0.0, 0.0, 0.0, 0.0]);
    const bearer = makePokemon({ name: 'a', ability: 'moody' });
    const foe    = makePokemon({ name: 'b' });
    const { events } = resolveTurnWithMoves(bearer, foe, splash, splash, 1);
    expect(events.some(e => e.kind === 'ability_triggered' && e.ability === 'moody')).toBe(true);
    const statChanges = events.filter(e => e.kind === 'stat_change' && e.pokemonName === 'a');
    expect(statChanges).toHaveLength(2);
    if (statChanges[0].kind === 'stat_change') expect(statChanges[0].change).toBe(2);
    if (statChanges[1].kind === 'stat_change') expect(statChanges[1].change).toBe(-1);
  });

  it('does not boost a stat already at +6', () => {
    // attack is maxed; boostable=[defense, special-attack, special-defense, speed]
    // [3]=0.0 → boostable[0]=defense (boosted); [4]=0.99 → lowerable[3]=speed (lowered)
    stubRng([0.0, 0.0, 0.0, 0.0, 0.99]);
    const bearer = makePokemon({ name: 'a', ability: 'moody', statStages: { attack: 6 } });
    const foe    = makePokemon({ name: 'b' });
    const { p1After } = resolveTurnWithMoves(bearer, foe, splash, splash, 1);
    expect(p1After.statStages.attack).toBe(6); // not boosted (was maxed, excluded from boostable)
    expect(p1After.statStages.defense).toBe(2);
    expect(p1After.statStages.speed).toBe(-1);
  });

  it('does not lower a stat already at -6', () => {
    // defense is at -6, so it's excluded from lowerable.
    // [3]=0.0 → boost attack; lowerable excludes attack and defense → [special-attack, special-defense, speed]
    // [4]=0.0 → lowerable[0]=special-attack
    stubRng([0.0, 0.0, 0.0, 0.0, 0.0]);
    const bearer = makePokemon({ name: 'a', ability: 'moody', statStages: { defense: -6 } });
    const foe    = makePokemon({ name: 'b' });
    const { p1After } = resolveTurnWithMoves(bearer, foe, splash, splash, 1);
    expect(p1After.statStages.defense).toBe(-6);
    expect(p1After.statStages.attack).toBe(2);
    expect(p1After.statStages['special-attack']).toBe(-1);
  });

  it('only boosts when all other stats are at -6', () => {
    // lowerable is empty after excluding boost stat → only one stat_change event
    // [0] speed-tie, [1] bearer accuracy, [2] foe accuracy, [3] boost pick only
    stubRng([0.0, 0.0, 0.0, 0.0]);
    const bearer = makePokemon({ name: 'a', ability: 'moody', statStages: {
      attack: 0, defense: -6, 'special-attack': -6, 'special-defense': -6, speed: -6,
    } });
    const foe = makePokemon({ name: 'b' });
    const { p1After, events } = resolveTurnWithMoves(bearer, foe, splash, splash, 1);
    expect(p1After.statStages.attack).toBe(2);
    const statChanges = events.filter(e => e.kind === 'stat_change' && e.pokemonName === 'a');
    expect(statChanges).toHaveLength(1);
  });

  it('does not trigger when the bearer has fainted', () => {
    // bearer has 0 HP; goes first (speed-tie 0.0), battleOver triggers after bearer's splash
    // [0] speed-tie, [1] bearer accuracy roll — foe never attacks, Moody never fires
    stubRng([0.0, 0.0]);
    const bearer = makePokemon({ name: 'a', ability: 'moody', currentHp: 0 });
    const foe    = makePokemon({ name: 'b' });
    const { events } = resolveTurnWithMoves(bearer, foe, splash, splash, 1);
    expect(events.some(e => e.kind === 'ability_triggered' && e.ability === 'moody')).toBe(false);
  });
});
