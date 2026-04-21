function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function formatPokemonName(name: string): string {
  if (name.endsWith('-mega-x')) return `Mega ${cap(name.slice(0, -7))} X`;
  if (name.endsWith('-mega-y')) return `Mega ${cap(name.slice(0, -7))} Y`;
  if (name.endsWith('-mega'))   return `Mega ${cap(name.slice(0, -5))}`;
  if (name.endsWith('-alola'))  return cap(name.slice(0, -6));
  return name.split('-').map(cap).join(' ');
}

export function formatAbilityName(name: string): string {
  return name.split('-').map(cap).join(' ');
}
