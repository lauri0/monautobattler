import { describe, it, expect } from 'vitest';
import { resolveTurnWithMoves } from '../battleEngine';
import { makePokemon, makeMove } from './fixtures';
import { stubRng } from './rng';

function makeTripleAxel() {
  return makeMove({
    name: 'triple-axel', type: 'ice', power: 20, accuracy: 90, damageClass: 'physical',
    effect: { hitsExactly: 3, escalatingHits: true },
  });
}

function attacker(ability?: string) {
  return makePokemon({
    name: 'weavile', types: ['ice'], ability,
    stats: { hp: 400, attack: 200 },
  });
}

function dummyTarget() {
  return makePokemon({
    name: 'target', types: ['normal'],
    stats: { hp: 500, defense: 100 },
  });
}

// RNG order per Triple Axel hit inside calcDamage: accuracy, crit, damage-roll.
// resolveTurnWithMoves with a null defender move runs exactly one Triple Axel
// turn, so we control exactly how many rolls are consumed.

describe('Triple Axel', () => {
  it('escalates power: 2nd hit is ~2x hit-1, 3rd hit ~3x', () => {
    stubRng([
      0, 0.99, 1.0,  // hit 1
      0, 0.99, 1.0,  // hit 2
      0, 0.99, 1.0,  // hit 3
    ]);
    const { events } = resolveTurnWithMoves(attacker(), dummyTarget(), makeTripleAxel(), null, 1);
    const hits = events.filter(e => e.kind === 'attack' && e.moveName === 'triple-axel');
    expect(hits.length).toBe(3);
    if (hits[0].kind === 'attack' && hits[1].kind === 'attack' && hits[2].kind === 'attack') {
      expect(hits[1].damage).toBeGreaterThanOrEqual(2 * hits[0].damage - 4);
      expect(hits[1].damage).toBeLessThanOrEqual(2 * hits[0].damage + 4);
      expect(hits[2].damage).toBeGreaterThanOrEqual(3 * hits[0].damage - 6);
      expect(hits[2].damage).toBeLessThanOrEqual(3 * hits[0].damage + 6);
    }
  });

  it('stops early when a subsequent hit misses', () => {
    stubRng([
      0, 0.99, 1.0,  // hit 1 lands
      0.99,          // hit 2 accuracy roll misses (>0.90) — sequence ends
    ]);
    const { events } = resolveTurnWithMoves(attacker(), dummyTarget(), makeTripleAxel(), null, 1);
    const hits = events.filter(e => e.kind === 'attack' && e.moveName === 'triple-axel');
    expect(hits.length).toBe(2);
    if (hits[1].kind === 'attack') expect(hits[1].missed).toBe(true);
  });

  it('first-hit miss ends the sequence with a single event', () => {
    stubRng([0.99]); // miss on hit 1
    const { events } = resolveTurnWithMoves(attacker(), dummyTarget(), makeTripleAxel(), null, 1);
    const hits = events.filter(e => e.kind === 'attack' && e.moveName === 'triple-axel');
    expect(hits.length).toBe(1);
    if (hits[0].kind === 'attack') expect(hits[0].missed).toBe(true);
  });

  it('Skill Link forces all 3 hits even when accuracy rolls would miss', () => {
    // Under Skill Link, per-hit accuracy is nullified, so no accuracy roll is
    // consumed. Each hit still rolls crit + damage.
    stubRng([
      0.99, 1.0,  // hit 1 crit/dmg
      0.99, 1.0,  // hit 2
      0.99, 1.0,  // hit 3
    ]);
    const { events } = resolveTurnWithMoves(attacker('skill-link'), dummyTarget(), makeTripleAxel(), null, 1);
    const hits = events.filter(e => e.kind === 'attack' && e.moveName === 'triple-axel');
    expect(hits.length).toBe(3);
    for (const h of hits) {
      if (h.kind === 'attack') {
        expect(h.missed).toBe(false);
        expect(h.damage).toBeGreaterThan(0);
      }
    }
  });
});
