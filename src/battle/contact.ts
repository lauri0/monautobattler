import type { Move } from '../models/types';

// PokeAPI does not expose a "makes-contact" flag, so we derive it: the vast
// majority of physical moves make contact and the vast majority of special
// moves don't. The two lists below are hand-maintained exceptions to that rule.
// Amend them as new moves are added to the game or errata are discovered.

// Physical moves that do NOT make contact (ranged, projectile, ground-shake).
export const PHYSICAL_NO_CONTACT: ReadonlySet<string> = new Set([
  // Ground — seismic, no touch
  'earthquake',
  'bulldoze',
  // Rock — thrown rocks
  'rock-slide',
  'rock-throw',
  'rock-tomb',
  'rock-blast',
  'stone-edge',
  'smack-down',
  // Grass — thrown seeds / leaves
  'bullet-seed',
  'razor-leaf',
  'magical-leaf',
  // Bug / steel — thrown projectiles
  'pin-missile',
  'egg-bomb',
  'barrage',
  'spike-cannon',
  // Ice — scattered shards
  'icicle-spear',
  // Ground / trap
  'sand-tomb',
  // Poison — ranged sting
  'poison-sting',
  // Miscellaneous
  'feint',
  'trailblaze',
]);

// Special moves that DO make contact (draining, wraparound, dance).
export const SPECIAL_CONTACT: ReadonlySet<string> = new Set([
  'absorb',
  'mega-drain',
  'giga-drain',
  'dream-eater',
  'draining-kiss',
  'petal-dance',
  'infestation',
  'leech-life', // Note: Gen 7+ is physical; safe to list either way.
]);

export function makesContact(move: Move): boolean {
  if (move.damageClass === 'status') return false;
  if (PHYSICAL_NO_CONTACT.has(move.name)) return false;
  if (SPECIAL_CONTACT.has(move.name)) return true;
  return move.damageClass === 'physical';
}
