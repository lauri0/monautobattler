import type { VariantSettings } from '../persistence/userStorage';

export interface VariantEntry {
  baseId: number;
  baseName: string;
  variantId: number;
  variantName: string;
}

export const ALOLAN_VARIANTS: VariantEntry[] = [
  { baseId: 19,  baseName: 'rattata',   variantId: 10091, variantName: 'rattata-alola' },
  { baseId: 20,  baseName: 'raticate',  variantId: 10092, variantName: 'raticate-alola' },
  { baseId: 26,  baseName: 'raichu',    variantId: 10100, variantName: 'raichu-alola' },
  { baseId: 27,  baseName: 'sandshrew', variantId: 10101, variantName: 'sandshrew-alola' },
  { baseId: 28,  baseName: 'sandslash', variantId: 10102, variantName: 'sandslash-alola' },
  { baseId: 37,  baseName: 'vulpix',    variantId: 10103, variantName: 'vulpix-alola' },
  { baseId: 38,  baseName: 'ninetales', variantId: 10104, variantName: 'ninetales-alola' },
  { baseId: 50,  baseName: 'diglett',   variantId: 10105, variantName: 'diglett-alola' },
  { baseId: 51,  baseName: 'dugtrio',   variantId: 10106, variantName: 'dugtrio-alola' },
  { baseId: 52,  baseName: 'meowth',    variantId: 10107, variantName: 'meowth-alola' },
  { baseId: 53,  baseName: 'persian',   variantId: 10108, variantName: 'persian-alola' },
  { baseId: 74,  baseName: 'geodude',   variantId: 10109, variantName: 'geodude-alola' },
  { baseId: 75,  baseName: 'graveler',  variantId: 10110, variantName: 'graveler-alola' },
  { baseId: 76,  baseName: 'golem',     variantId: 10111, variantName: 'golem-alola' },
  { baseId: 88,  baseName: 'grimer',    variantId: 10112, variantName: 'grimer-alola' },
  { baseId: 89,  baseName: 'muk',       variantId: 10113, variantName: 'muk-alola' },
  { baseId: 103, baseName: 'exeggutor', variantId: 10114, variantName: 'exeggutor-alola' },
  { baseId: 105, baseName: 'marowak',   variantId: 10115, variantName: 'marowak-alola' },
];

export const HISUIAN_VARIANTS: VariantEntry[] = [
  { baseId: 58,  baseName: 'growlithe', variantId: 10229, variantName: 'growlithe-hisui' },
  { baseId: 59,  baseName: 'arcanine',  variantId: 10230, variantName: 'arcanine-hisui' },
  { baseId: 100, baseName: 'voltorb',   variantId: 10231, variantName: 'voltorb-hisui' },
  { baseId: 101, baseName: 'electrode', variantId: 10232, variantName: 'electrode-hisui' },
];

export const PALDEAN_VARIANTS: VariantEntry[] = [
  { baseId: 128, baseName: 'tauros', variantId: 10251, variantName: 'tauros-paldea-blaze-breed' },
];

export const ALOLAN_REPLACEMENTS: Record<number, number> = Object.fromEntries(
  ALOLAN_VARIANTS.map(v => [v.baseId, v.variantId]),
);

export const HISUIAN_REPLACEMENTS: Record<number, number> = Object.fromEntries(
  HISUIAN_VARIANTS.map(v => [v.baseId, v.variantId]),
);

export const PALDEAN_REPLACEMENTS: Record<number, number> = Object.fromEntries(
  PALDEAN_VARIANTS.map(v => [v.baseId, v.variantId]),
);

// For each base ID in `baseIds`, determine which side of the pair is now stale
// given the current toggles, and return {id, name} for each file to delete.
// When a toggle is ON, the base (Kantonian) form is stale; when OFF, the
// regional variant is stale. Both endpoints are included so turning a toggle
// off after a previous ON load cleans up the imported variant.
export function computeStaleVariants(
  baseIds: number[],
  { useAlolan, useHisuian, usePaldean }: VariantSettings,
): { id: number; name: string }[] {
  const inRange = new Set(baseIds);
  const stale: { id: number; name: string }[] = [];
  const push = (entries: VariantEntry[], enabled: boolean) => {
    for (const v of entries) {
      if (!inRange.has(v.baseId)) continue;
      stale.push(enabled
        ? { id: v.baseId, name: v.baseName }
        : { id: v.variantId, name: v.variantName });
    }
  };
  push(ALOLAN_VARIANTS, useAlolan);
  push(HISUIAN_VARIANTS, useHisuian);
  push(PALDEAN_VARIANTS, usePaldean);
  return stale;
}

// Mega evolutions available in Let's Go Pikachu / Eevee
export const LGPE_MEGAS: number[] = [
  10033, // venusaur-mega
  10034, // charizard-mega-x
  10035, // charizard-mega-y
  10036, // blastoise-mega
  10037, // alakazam-mega
  10038, // gengar-mega
  10039, // kangaskhan-mega
  10040, // pinsir-mega
  10041, // gyarados-mega
  10042, // aerodactyl-mega
  10043, // mewtwo-mega-x
  10044, // mewtwo-mega-y
  10071, // slowbro-mega
  10073, // pidgeot-mega
  10090, // beedrill-mega
];

export function buildFetchIds(
  baseIds: number[],
  { useAlolan, useHisuian, usePaldean, includeMegas }: VariantSettings,
): number[] {
  const ids = baseIds.map(id => {
    if (useAlolan && ALOLAN_REPLACEMENTS[id] !== undefined) return ALOLAN_REPLACEMENTS[id];
    if (useHisuian && HISUIAN_REPLACEMENTS[id] !== undefined) return HISUIAN_REPLACEMENTS[id];
    if (usePaldean && PALDEAN_REPLACEMENTS[id] !== undefined) return PALDEAN_REPLACEMENTS[id];
    return id;
  });
  if (includeMegas) {
    const existing = new Set(ids);
    for (const megaId of LGPE_MEGAS) {
      if (!existing.has(megaId)) {
        ids.push(megaId);
        existing.add(megaId);
      }
    }
  }
  return ids;
}
