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
  const forcedPivot = state.phase === 'pivot0';

  if (moves.length === 0 && !forcedReplace && !forcedPivot && !thinking) return null;

  let label: string;
  if (forcedReplace) {
    label = `${formatPokemonName(active.data.name)} fainted — pick a replacement from the bench.`;
  } else if (forcedPivot) {
    label = `${formatPokemonName(active.data.name)} is switching out — pick a replacement from the bench.`;
  } else {
    label = `Your move — ${formatPokemonName(active.data.name)}`;
  }

  return (
    <div className="player-action-bar card">
      <div className="action-label">{label}</div>
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
                <span className="btn-move-name">{a.move.name}</span>
                <span className="btn-move-stats">
                  {a.move.power > 0 ? `PWR ${a.move.power}` : '—'}
                  {' · '}
                  {a.move.accuracy != null ? `ACC ${a.move.accuracy}` : '—'}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {thinking && <div className="action-thinking">Opponent thinking…</div>}
    </div>
  );
}
