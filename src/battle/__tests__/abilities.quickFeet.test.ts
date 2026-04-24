import { describe, it, expect } from 'vitest';
import { effectiveSpeed } from '../damageCalc';
import { makePokemon, type PokemonOverrides } from './fixtures';

const BASE_SPEED = 100;

function makeQF(status?: PokemonOverrides['statusCondition']) {
  return makePokemon({ name: 'qf', ability: 'quick-feet', stats: { speed: BASE_SPEED }, statusCondition: status });
}

function makePlain(status?: PokemonOverrides['statusCondition']) {
  return makePokemon({ name: 'plain', stats: { speed: BASE_SPEED }, statusCondition: status });
}

describe('Quick Feet', () => {
  it('raises Speed by 1.5× when burned', () => {
    expect(effectiveSpeed(makeQF('burn'))).toBeCloseTo(BASE_SPEED * 1.5);
  });

  it('raises Speed by 1.5× when poisoned', () => {
    expect(effectiveSpeed(makeQF('poison'))).toBeCloseTo(BASE_SPEED * 1.5);
  });

  it('raises Speed by 1.5× when paralyzed (paralysis speed penalty does not apply)', () => {
    expect(effectiveSpeed(makeQF('paralysis'))).toBeCloseTo(BASE_SPEED * 1.5);
  });

  it('raises Speed by 1.5× when asleep', () => {
    expect(effectiveSpeed(makeQF('sleep'))).toBeCloseTo(BASE_SPEED * 1.5);
  });

  it('raises Speed by 1.5× when frozen', () => {
    expect(effectiveSpeed(makeQF('freeze'))).toBeCloseTo(BASE_SPEED * 1.5);
  });

  it('does not boost Speed when healthy', () => {
    expect(effectiveSpeed(makeQF())).toBe(BASE_SPEED);
  });

  it('a plain paralyzed pokemon still takes the 0.5× penalty', () => {
    expect(effectiveSpeed(makePlain('paralysis'))).toBeCloseTo(BASE_SPEED * 0.5);
  });

  it('a plain burned pokemon has no speed change', () => {
    expect(effectiveSpeed(makePlain('burn'))).toBe(BASE_SPEED);
  });
});
