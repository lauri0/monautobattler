import type { TeamBattleState, SideIndex } from '../models/types';
import { formatPokemonName } from '../utils/formatName';

const STAGE_LABELS: [keyof import('../models/types').StatStages, string][] = [
  ['attack',          'ATK'],
  ['defense',         'DEF'],
  ['special-attack',  'SpA'],
  ['special-defense', 'SpD'],
  ['speed',           'SPE'],
  ['accuracy',        'ACC'],
  ['evasion',         'EVA'],
];

function SidePane({ state, side }: { state: TeamBattleState; side: SideIndex }) {
  const team = state.teams[side];
  const active = team.pokemon[team.activeIdx];
  const sideField = state.field.sides[side];

  const nonZeroStages = STAGE_LABELS.filter(([key]) => active.statStages[key] !== 0);

  const hazards: { label: string; cls: string }[] = [];
  if (sideField.stealthRock) hazards.push({ label: 'Stealth Rock', cls: 'chip-hazard' });
  if (sideField.spikes > 0)  hazards.push({ label: `Spikes ×${sideField.spikes}`, cls: 'chip-hazard' });
  if (sideField.toxicSpikes) hazards.push({ label: 'Toxic Spikes', cls: 'chip-tspikes' });

  const screens: { label: string; turns: number; cls: string }[] = [];
  if (sideField.lightScreenTurns > 0) screens.push({ label: 'Light Screen', turns: sideField.lightScreenTurns, cls: 'chip-screen' });
  if (sideField.reflectTurns > 0)     screens.push({ label: 'Reflect',       turns: sideField.reflectTurns,      cls: 'chip-screen' });
  if (sideField.tailwindTurns > 0)    screens.push({ label: 'Tailwind',      turns: sideField.tailwindTurns,     cls: 'chip-tailwind' });

  const throatChopTurns = active.throatChopTurns ?? 0;
  const isEmpty = nonZeroStages.length === 0 && hazards.length === 0 && screens.length === 0 && throatChopTurns === 0;

  return (
    <div className="field-pane">
      <div className="field-pane-header">{formatPokemonName(active.data.name)}</div>

      {isEmpty ? (
        <span className="field-pane-empty">No active effects</span>
      ) : (
        <div className="field-chips">
          {nonZeroStages.map(([key, label]) => {
            const v = active.statStages[key];
            return (
              <span key={key} className={`field-chip ${v > 0 ? 'chip-stage-pos' : 'chip-stage-neg'}`}>
                {label} {v > 0 ? '+' : ''}{v}
              </span>
            );
          })}
          {hazards.map(h => (
            <span key={h.label} className={`field-chip ${h.cls}`}>{h.label}</span>
          ))}
          {screens.map(s => (
            <span key={s.label} className={`field-chip ${s.cls}`}>
              {s.label} <span className="chip-turns">{s.turns}</span>
            </span>
          ))}
          {throatChopTurns > 0 && (
            <span className="field-chip chip-status">
              Throat Chop <span className="chip-turns">{throatChopTurns}</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default function FieldStateStrip({ state }: { state: TeamBattleState }) {
  return (
    <div className="field-state-strip card">
      <SidePane state={state} side={0} />
      <div className="field-strip-divider" />
      <SidePane state={state} side={1} />
    </div>
  );
}
