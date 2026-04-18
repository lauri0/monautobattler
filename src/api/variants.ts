import type { VariantSettings } from '../persistence/userStorage';

// Maps Gen1 base Pokémon ID → Alolan form PokeAPI ID
export const ALOLAN_REPLACEMENTS: Record<number, number> = {
  19: 10091,   // rattata-alola
  20: 10092,   // raticate-alola
  26: 10100,   // raichu-alola
  27: 10101,   // sandshrew-alola
  28: 10102,   // sandslash-alola
  37: 10103,   // vulpix-alola
  38: 10104,   // ninetales-alola
  50: 10105,   // diglett-alola
  51: 10106,   // dugtrio-alola
  52: 10107,   // meowth-alola
  53: 10108,   // persian-alola
  74: 10109,   // geodude-alola
  75: 10110,   // graveler-alola
  76: 10111,   // golem-alola
  88: 10112,   // grimer-alola
  89: 10113,   // muk-alola
  103: 10114,  // exeggutor-alola
  105: 10115,  // marowak-alola
};

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
  { useAlolan, includeMegas }: VariantSettings,
): number[] {
  const ids = baseIds.map(id => (useAlolan ? (ALOLAN_REPLACEMENTS[id] ?? id) : id));
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
