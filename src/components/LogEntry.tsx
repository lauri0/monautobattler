import type { TurnEvent } from '../models/types';

function effectivenessText(e: number): string {
  if (e === 0) return "It had no effect!";
  if (e >= 4) return "It's extremely effective!";
  if (e >= 2) return "It's super effective!";
  if (e <= 0.25) return "It's mostly ineffective...";
  if (e < 1) return "It's not very effective...";
  return '';
}

function statLabel(stat: string): string {
  const map: Record<string, string> = {
    'attack': 'Attack', 'defense': 'Defense',
    'special-attack': 'Sp. Atk', 'special-defense': 'Sp. Def', 'speed': 'Speed',
  };
  return map[stat] ?? stat;
}

function conditionLabel(c: string): string {
  const map: Record<string, string> = {
    burn: 'burn', poison: 'poison', paralysis: 'paralysis', sleep: 'sleep', freeze: 'freeze',
  };
  return map[c] ?? c;
}

export default function LogEntry({ ev }: { ev: TurnEvent }) {
  if (ev.kind === 'attack') {
    const effText = effectivenessText(ev.effectiveness);
    return (
      <div className="log-entry">
        <span className="log-turn">T{ev.turn}</span>
        <span className="log-attacker">{ev.attackerName}</span>
        <span className="log-move"> used {ev.moveName}</span>
        {ev.missed
          ? <span className="log-miss"> — missed!</span>
          : ev.effectiveness === 0
            ? <span className="log-immune"> — had no effect!</span>
            : (
              <>
                <span className="log-damage"> — {ev.damage} dmg</span>
                {ev.isCrit && <span className="log-crit"> CRIT!</span>}
                {effText && <span className="log-eff"> {effText}</span>}
                <span className="log-hp"> ({ev.defenderName}: {ev.defenderHpAfter} HP)</span>
              </>
            )
        }
      </div>
    );
  }

  if (ev.kind === 'recoil') {
    return (
      <div className="log-entry log-entry--effect">
        <span className="log-turn">T{ev.turn}</span>
        <span className="log-attacker">{ev.pokemonName}</span>
        <span className="log-miss"> was hurt by recoil!</span>
        <span className="log-hp"> ({ev.hpAfter} HP)</span>
      </div>
    );
  }

  if (ev.kind === 'drain') {
    return (
      <div className="log-entry log-entry--effect">
        <span className="log-turn">T{ev.turn}</span>
        <span className="log-attacker">{ev.pokemonName}</span>
        <span className="log-eff"> drained energy! (+{ev.healed} HP, {ev.hpAfter} HP)</span>
      </div>
    );
  }

  if (ev.kind === 'stat_change') {
    const dir = ev.change > 0 ? 'rose' : 'fell';
    const sharp = Math.abs(ev.change) >= 2 ? ' sharply' : '';
    return (
      <div className="log-entry log-entry--effect">
        <span className="log-turn">T{ev.turn}</span>
        <span className="log-attacker">{ev.pokemonName}</span>
        <span className="log-eff">'s {statLabel(ev.stat)}{sharp} {dir}! (stage {ev.newStage > 0 ? '+' : ''}{ev.newStage})</span>
      </div>
    );
  }

  if (ev.kind === 'status_applied') {
    const msgs: Record<string, string> = {
      burn: 'was burned!', poison: 'was poisoned!', paralysis: 'was paralyzed!',
      sleep: 'fell asleep!', freeze: 'was frozen solid!',
    };
    return (
      <div className="log-entry log-entry--status">
        <span className="log-turn">T{ev.turn}</span>
        <span className="log-attacker">{ev.pokemonName}</span>
        <span className="log-miss"> {msgs[ev.condition] ?? `got ${ev.condition}!`}</span>
      </div>
    );
  }

  if (ev.kind === 'status_damage') {
    return (
      <div className="log-entry log-entry--status">
        <span className="log-turn">T{ev.turn}</span>
        <span className="log-attacker">{ev.pokemonName}</span>
        <span className="log-miss"> is hurt by its {conditionLabel(ev.condition)}!</span>
        <span className="log-hp"> ({ev.hpAfter} HP)</span>
      </div>
    );
  }

  if (ev.kind === 'cant_move') {
    const msgs: Record<string, string> = {
      paralysis: 'is paralyzed and can\'t move!',
      sleep: 'is fast asleep!',
      freeze: 'is frozen solid!',
      flinch: 'flinched and couldn\'t move!',
    };
    return (
      <div className="log-entry log-entry--status">
        <span className="log-turn">T{ev.turn}</span>
        <span className="log-attacker">{ev.pokemonName}</span>
        <span className="log-miss"> {msgs[ev.reason] ?? `can't move!`}</span>
      </div>
    );
  }

  if (ev.kind === 'status_cured') {
    const msgs: Record<string, string> = {
      sleep: 'woke up!', freeze: 'thawed out!',
    };
    return (
      <div className="log-entry log-entry--effect">
        <span className="log-turn">T{ev.turn}</span>
        <span className="log-attacker">{ev.pokemonName}</span>
        <span className="log-eff"> {msgs[ev.condition] ?? `recovered from ${ev.condition}!`}</span>
      </div>
    );
  }

  if (ev.kind === 'confused') {
    return (
      <div className="log-entry log-entry--status">
        <span className="log-turn">T{ev.turn}</span>
        <span className="log-attacker">{ev.pokemonName}</span>
        <span className="log-miss"> became confused!</span>
      </div>
    );
  }

  if (ev.kind === 'confusion_hit') {
    return (
      <div className="log-entry log-entry--status">
        <span className="log-turn">T{ev.turn}</span>
        <span className="log-attacker">{ev.pokemonName}</span>
        <span className="log-miss"> hurt itself in confusion!</span>
        <span className="log-hp"> ({ev.hpAfter} HP)</span>
      </div>
    );
  }

  if (ev.kind === 'confusion_end') {
    return (
      <div className="log-entry log-entry--effect">
        <span className="log-turn">T{ev.turn}</span>
        <span className="log-attacker">{ev.pokemonName}</span>
        <span className="log-eff"> snapped out of confusion!</span>
      </div>
    );
  }

  if (ev.kind === 'move_failed') {
    return (
      <div className="log-entry log-entry--status">
        <span className="log-turn">T{ev.turn}</span>
        <span className="log-attacker">{ev.pokemonName}</span>
        <span className="log-miss">'s {ev.moveName} failed!</span>
      </div>
    );
  }

  return null;
}
