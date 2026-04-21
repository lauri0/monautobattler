import type { BattlePokemon } from '../models/types';
import HpBar from './HpBar';
import TypeBadge from './TypeBadge';
import { getTypeColor } from '../utils/typeColors';
import { formatPokemonName, formatAbilityName } from '../utils/formatName';
import { isAbilityImplemented } from '../battle/abilities';

const STATUS_STYLES: Record<string, { label: string; bg: string }> = {
  burn:      { label: 'BRN', bg: '#e94560' },
  poison:    { label: 'PSN', bg: '#a64dff' },
  paralysis: { label: 'PAR', bg: '#f1c40f' },
  sleep:     { label: 'SLP', bg: '#6c7a89' },
  freeze:    { label: 'FRZ', bg: '#4fc3f7' },
};

export default function BattlerPanel({ pokemon, hideMoves }: { pokemon: BattlePokemon; hideMoves?: boolean }) {
  const status = pokemon.statusCondition ? STATUS_STYLES[pokemon.statusCondition] : null;
  return (
    <div className="battler-panel card">
      <img src={pokemon.data.spriteUrl} alt={pokemon.data.name} className="battler-sprite" />
      <div className="battler-name-row">
        <span className="battler-name">{formatPokemonName(pokemon.data.name)}</span>
        {status && (
          <span className="ailment-badge" style={{ background: status.bg }}>{status.label}</span>
        )}
        {pokemon.confused && (
          <span className="ailment-badge" style={{ background: '#d68910' }}>CNF</span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 4, justifyContent: 'center', marginBottom: 8 }}>
        {pokemon.data.types.map(t => <TypeBadge key={t} type={t} />)}
      </div>
      {pokemon.ability && (
        <div style={{ textAlign: 'center', fontSize: '0.85em', marginBottom: 6, opacity: 0.85 }}>
          {formatAbilityName(pokemon.ability)}
          {!isAbilityImplemented(pokemon.ability) && (
            <span style={{ opacity: 0.6 }}> (Unimplemented)</span>
          )}
        </div>
      )}
      <HpBar current={pokemon.currentHp} max={pokemon.level50Stats.hp} />
      {!hideMoves && (
        <div className="battler-moves">
          {pokemon.moves.map(m => (
            <span key={m.id} className="battler-move-chip" style={{ borderColor: getTypeColor(m.type) }}>
              {m.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
