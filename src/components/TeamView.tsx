import type { TeamBattleState, SideIndex, TeamSlotIndex } from '../models/types';
import { legalActions } from '../battle/teamBattleEngine';
import BattlerPanel from './BattlerPanel';
import TypeBadge from './TypeBadge';
import BaseStatsPanel from './BaseStatsPanel';
import { formatPokemonName } from '../utils/formatName';
import { getTypeColor } from '../utils/typeColors';

export default function TeamView({
  state,
  side,
  onSwitch,
}: {
  state: TeamBattleState;
  side: SideIndex;
  onSwitch?: (slot: TeamSlotIndex) => void;
}) {
  const team = state.teams[side];
  const switchableSlots = new Set<TeamSlotIndex>();
  if (onSwitch) {
    for (const a of legalActions(state, side)) {
      if (a.kind === 'switch') switchableSlots.add(a.targetIdx);
    }
  }
  const order = team.pokemon
    .map((_, idx) => idx)
    .sort((a, b) => (a === team.activeIdx ? -1 : b === team.activeIdx ? 1 : a - b));
  return (
    <div className="team-view">
      {order.map(i => {
        const p = team.pokemon[i];
        const isActive = i === team.activeIdx;
        const fainted = p.currentHp <= 0;
        const canSwitchHere = switchableSlots.has(i as TeamSlotIndex);
        return (
          <div
            key={i}
            className={
              'team-slot-view ' +
              (isActive ? 'team-slot-active-wrap ' : '') +
              (fainted ? 'team-slot-fainted' : '')
            }
          >
            {isActive ? (
              <>
                <div className={`team-slot-active team-slot-active-${side}`}>
                  <BattlerPanel pokemon={p} hideMoves />
                  <BaseStatsPanel data={p.data} />
                </div>
                <div className="active-moves-row">
                  {p.moves.map(m => (
                    <span
                      key={m.id}
                      className="active-move-chip"
                      style={{ borderColor: getTypeColor(m.type) }}
                    >
                      {m.name}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <div className="team-bench-mini">
                <img src={p.data.spriteUrl} alt={p.data.name} />
                <div className="bench-name-wrap">
                  <div className="bench-name">{formatPokemonName(p.data.name)}</div>
                  <div className="bench-types">
                    {p.data.types.map(t => <TypeBadge key={t} type={t} />)}
                  </div>
                </div>
                <div className="bench-hp">{Math.max(0, p.currentHp)}/{p.level50Stats.hp}</div>
                {canSwitchHere && onSwitch && (
                  <button
                    className="btn-bench-switch"
                    onClick={() => onSwitch(i as TeamSlotIndex)}
                  >
                    Switch in
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
