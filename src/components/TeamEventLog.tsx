import type { TeamTurnEvent } from '../models/types';
import LogEntry from './LogEntry';
import { formatPokemonName } from '../utils/formatName';

export function renderTeamEvent(ev: TeamTurnEvent, key: number) {
  if (ev.kind === 'switch') {
    return (
      <div key={key} className="log-entry log-entry--effect">
        <span className="log-turn">T{ev.turn}</span>
        <span className="log-attacker">Team {ev.side + 1}</span>
        <span className="log-eff"> withdrew {formatPokemonName(ev.outName)} and sent in {formatPokemonName(ev.inName)}!</span>
      </div>
    );
  }
  return <LogEntry key={key} ev={ev} />;
}
