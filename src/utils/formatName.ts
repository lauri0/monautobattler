function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function formatPokemonName(name: string): string {
  if (name.endsWith('-mega-x')) return `Mega ${cap(name.slice(0, -7))} X`;
  if (name.endsWith('-mega-y')) return `Mega ${cap(name.slice(0, -7))} Y`;
  if (name.endsWith('-mega'))   return `Mega ${cap(name.slice(0, -5))}`;
  if (name.endsWith('-alola'))  return cap(name.slice(0, -6));
  if (name.endsWith('-hisui'))  return cap(name.slice(0, -6));
  if (name.endsWith('-paldea-blaze-breed')) return cap(name.slice(0, -19));
  if (name.endsWith('-paldea-aqua-breed'))  return cap(name.slice(0, -18));
  if (name.endsWith('-paldea-combat-breed')) return cap(name.slice(0, -20));
  return name.split('-').map(cap).join(' ');
}

export function formatAbilityName(name: string): string {
  return name.split('-').map(cap).join(' ');
}
