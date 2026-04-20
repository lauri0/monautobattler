import type { DamageClass } from '../models/types';

export function damageClassIcon(dc: DamageClass): string {
  if (dc === 'physical') return '⚔';
  if (dc === 'special') return '✦';
  return '◈';
}
