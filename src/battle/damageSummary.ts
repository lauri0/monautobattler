import type { TeamTurnEvent, DamageStat, MatchDamageSummary, TeamBattleState, SideIndex } from '../models/types';

interface HazardSetters {
  stealthRock?: string;
  spikes?: string;
  toxicSpikes?: string;
}

export function buildNameToIdMap(state: TeamBattleState): Map<string, number> {
  const map = new Map<string, number>();
  for (const team of state.teams) {
    for (const p of team.pokemon) {
      map.set(p.data.name, p.data.id);
    }
  }
  return map;
}

function emptyDamageStat(): DamageStat {
  return { physical: 0, special: 0, other: 0, recoil: 0, heal: 0 };
}

function isAllZero(s: DamageStat): boolean {
  return s.physical === 0 && s.special === 0 && s.other === 0 && s.recoil === 0 && s.heal === 0;
}

export function parseDamageSummary(
  log: TeamTurnEvent[],
  nameToId: Map<string, number>,
): MatchDamageSummary {
  const hazardSetters: [HazardSetters, HazardSetters] = [{}, {}];
  let weatherSetter: string | undefined;
  const statusSources = new Map<string, string>();
  const confusionCausers = new Map<string, string>();
  const lastReceivedAttack = new Map<string, { attacker: string; turn: number }>();
  const damage = new Map<string, DamageStat>();

  function get(name: string): DamageStat {
    if (!damage.has(name)) damage.set(name, emptyDamageStat());
    return damage.get(name)!;
  }

  let prevAbilityHolder: string | null = null;

  for (const ev of log) {
    const abilityHolderThisStep = prevAbilityHolder;
    prevAbilityHolder = null;

    if (ev.kind === 'attack') {
      if (!ev.missed && ev.damage > 0) {
        const stat = get(ev.attackerName);
        if (ev.damageClass === 'physical') stat.physical += ev.damage;
        else stat.special += ev.damage;
      }
      lastReceivedAttack.set(ev.defenderName, { attacker: ev.attackerName, turn: ev.turn });

    } else if (ev.kind === 'recoil') {
      get(ev.pokemonName).recoil += ev.damage;

    } else if (ev.kind === 'drain' || ev.kind === 'heal' || ev.kind === 'terrain_heal') {
      get(ev.pokemonName).heal += ev.healed;

    } else if (ev.kind === 'field_set') {
      const side = ev.side as SideIndex;
      if (ev.effect === 'stealthRock') hazardSetters[side].stealthRock = ev.pokemonName;
      else if (ev.effect === 'spikes') hazardSetters[side].spikes = ev.pokemonName;
      else if (ev.effect === 'toxicSpikes') hazardSetters[side].toxicSpikes = ev.pokemonName;

    } else if (ev.kind === 'weather_set') {
      weatherSetter = ev.pokemonName;

    } else if (ev.kind === 'ability_triggered') {
      prevAbilityHolder = ev.pokemonName;

    } else if (ev.kind === 'status_applied') {
      const target = ev.pokemonName;
      if (abilityHolderThisStep && abilityHolderThisStep !== target) {
        statusSources.set(target, abilityHolderThisStep);
      } else {
        const last = lastReceivedAttack.get(target);
        if (last) statusSources.set(target, last.attacker);
      }

    } else if (ev.kind === 'toxic_spikes_poison') {
      const side = ev.side as SideIndex;
      const setter = hazardSetters[side].toxicSpikes;
      if (setter) statusSources.set(ev.pokemonName, setter);

    } else if (ev.kind === 'confused') {
      const target = ev.pokemonName;
      const last = lastReceivedAttack.get(target);
      if (last && last.turn === ev.turn && last.attacker !== target) {
        confusionCausers.set(target, last.attacker);
      } else {
        confusionCausers.set(target, target);
      }

    } else if (ev.kind === 'stealth_rock_damage') {
      const setter = hazardSetters[ev.side as SideIndex].stealthRock;
      if (setter) get(setter).other += ev.damage;

    } else if (ev.kind === 'spikes_damage') {
      const setter = hazardSetters[ev.side as SideIndex].spikes;
      if (setter) get(setter).other += ev.damage;

    } else if (ev.kind === 'status_damage') {
      const causer = statusSources.get(ev.pokemonName);
      if (causer) get(causer).other += ev.damage;

    } else if (ev.kind === 'weather_damage') {
      if (weatherSetter) get(weatherSetter).other += ev.damage;

    } else if (ev.kind === 'confusion_hit') {
      const causer = confusionCausers.get(ev.pokemonName) ?? ev.pokemonName;
      if (causer !== ev.pokemonName) {
        get(causer).other += ev.damage;
      } else {
        get(ev.pokemonName).other -= ev.damage;
      }
    }
  }

  const result: MatchDamageSummary = [];
  for (const [name, stat] of damage) {
    if (isAllZero(stat)) continue;
    const id = nameToId.get(name);
    if (id !== undefined) result.push({ pokemonId: id, ...stat });
  }
  return result;
}
