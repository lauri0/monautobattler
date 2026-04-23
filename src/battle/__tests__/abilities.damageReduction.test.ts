import { describe, it, expect } from 'vitest';
import { calcDamage, calcMinDamage, calcExpectedDamage } from '../damageCalc';
import { makePokemon, makeMove } from './fixtures';
import { stubRngConst } from './rng';

const attacker = makePokemon({ name: 'a', types: ['normal'], stats: { attack: 100, specialAttack: 100 } });

const physical = makeMove({ name: 'tackle',        type: 'normal', power: 80, damageClass: 'physical' });
const special  = makeMove({ name: 'hyper-beam',    type: 'normal', power: 80, damageClass: 'special'  });

describe('Ice Scales', () => {
  const plain   = makePokemon({ name: 'plain',   types: ['normal'],                        stats: { defense: 100, specialDefense: 100 } });
  const iceScales = makePokemon({ name: 'scaled', types: ['normal'], ability: 'ice-scales', stats: { defense: 100, specialDefense: 100 } });

  it('halves damage from special moves', () => {
    stubRngConst(0.99);
    const vsPlain   = calcDamage(attacker, plain,     special);
    stubRngConst(0.99);
    const vsScaled  = calcDamage(attacker, iceScales, special);
    expect(vsScaled.damage / vsPlain.damage).toBeCloseTo(0.5, 1);
  });

  it('does not reduce physical move damage', () => {
    stubRngConst(0.99);
    const vsPlain  = calcDamage(attacker, plain,     physical);
    stubRngConst(0.99);
    const vsScaled = calcDamage(attacker, iceScales, physical);
    expect(vsScaled.damage).toBe(vsPlain.damage);
  });

  it('halves special damage in calcMinDamage', () => {
    const vsPlain  = calcMinDamage(attacker, plain,     special);
    const vsScaled = calcMinDamage(attacker, iceScales, special);
    expect(vsScaled / vsPlain).toBeCloseTo(0.5, 1);
  });

  it('halves special damage in calcExpectedDamage', () => {
    const vsPlain  = calcExpectedDamage(attacker, plain,     special);
    const vsScaled = calcExpectedDamage(attacker, iceScales, special);
    expect(vsScaled / vsPlain).toBeCloseTo(0.5, 1);
  });
});

describe('Fur Coat', () => {
  const plain   = makePokemon({ name: 'plain',   types: ['normal'],                     stats: { defense: 100, specialDefense: 100 } });
  const furCoat = makePokemon({ name: 'furcoat', types: ['normal'], ability: 'fur-coat', stats: { defense: 100, specialDefense: 100 } });

  it('halves damage from physical moves', () => {
    stubRngConst(0.99);
    const vsPlain   = calcDamage(attacker, plain,    physical);
    stubRngConst(0.99);
    const vsFurCoat = calcDamage(attacker, furCoat,  physical);
    expect(vsFurCoat.damage / vsPlain.damage).toBeCloseTo(0.5, 1);
  });

  it('does not reduce special move damage', () => {
    stubRngConst(0.99);
    const vsPlain   = calcDamage(attacker, plain,    special);
    stubRngConst(0.99);
    const vsFurCoat = calcDamage(attacker, furCoat,  special);
    expect(vsFurCoat.damage).toBe(vsPlain.damage);
  });

  it('halves physical damage in calcMinDamage', () => {
    const vsPlain   = calcMinDamage(attacker, plain,   physical);
    const vsFurCoat = calcMinDamage(attacker, furCoat, physical);
    expect(vsFurCoat / vsPlain).toBeCloseTo(0.5, 1);
  });

  it('halves physical damage in calcExpectedDamage', () => {
    const vsPlain   = calcExpectedDamage(attacker, plain,   physical);
    const vsFurCoat = calcExpectedDamage(attacker, furCoat, physical);
    expect(vsFurCoat / vsPlain).toBeCloseTo(0.5, 1);
  });
});
