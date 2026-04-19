import type { TeamBattleState, TeamAction } from '../models/types';
import { legalActions } from '../battle/teamBattleEngine';
import { formatPokemonName } from '../utils/formatName';
import { getTypeColor } from '../utils/typeColors';

interface Props {
  state: TeamBattleState;
  thinking: boolean;
  onAction: (a: TeamAction) => void;
}

export default function PlayerActionBar({ state, thinking, onAction }: Props) {
  const actions = legalActions(state, 0);
  const team = state.teams[0];
  const active = team.pokemon[team.activeIdx];
  const moves = actions.filter(a => a.kind === 'move');
  const forcedReplace = state.phase === 'replace0' || state.phase === 'replaceBoth';

  if (moves.length === 0 && !forcedReplace && !thinking) return null;

  return (
    <div className="player-action-bar card">
      <div className="action-label">
        {forcedReplace
          ? `${formatPokemonName(active.data.name)} fainted — pick a replacement from the bench.`
          : `Your move — ${formatPokemonName(active.data.name)}`}
      </div>
      {moves.length > 0 && (
        <div className="action-row">
          {moves.map((a, i) => {
            if (a.kind !== 'move') return null;
            const color = getTypeColor(a.move.type);
            return (
              <button
                key={i}
                className="btn-move"
                disabled={thinking}
                onClick={() => onAction(a)}
                style={{ background: color, borderColor: color, color: '#fff' }}
              >
                {a.move.name}
              </button>
            );
          })}
        </div>
      )}
      {thinking && <div className="action-thinking">Opponent thinking…</div>}
    </div>
  );
}
