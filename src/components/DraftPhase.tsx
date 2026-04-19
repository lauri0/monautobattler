import type { PokemonData } from '../models/types';
import TypeBadge from './TypeBadge';
import { formatPokemonName } from '../utils/formatName';
import { getTypeColor } from '../utils/typeColors';
import { RR_DRAFT_ROUNDS } from '../tournament/roundRobin3v3Engine';
import { getPokemonPersisted } from '../persistence/userStorage';

interface Props {
  allPokemon: PokemonData[];
  offeredIds: number[];
  pickedIds: number[];
  round: number; // 0-indexed current round
  onPick: (id: number) => void;
}

function bst(p: PokemonData): number {
  const b = p.baseStats;
  return b.hp + b.attack + b.defense + b.specialAttack + b.specialDefense + b.speed;
}

function DraftCard({ data, onPick }: { data: PokemonData; onPick: () => void }) {
  const moveset = getPokemonPersisted(data.id).moveset;
  const selectedMoves = moveset
    .map(id => data.availableMoves.find(m => m.id === id))
    .filter((m): m is PokemonData['availableMoves'][number] => !!m);
  return (
    <div className="draft-card card">
      <img src={data.spriteUrl} alt={data.name} className="draft-card-sprite" />
      <div className="draft-card-name">{formatPokemonName(data.name)}</div>
      <div className="draft-card-types">
        {data.types.map(t => <TypeBadge key={t} type={t} />)}
      </div>
      <div className="draft-card-bst">BST {bst(data)}</div>
      <div className="draft-card-moves">
        {selectedMoves.map(m => (
          <span key={m.id} className="draft-card-move" style={{ borderColor: getTypeColor(m.type) }}>
            {m.name}
          </span>
        ))}
      </div>
      <button className="btn-primary draft-pick-btn" onClick={onPick}>
        Pick {formatPokemonName(data.name)}
      </button>
    </div>
  );
}

export default function DraftPhase({
  allPokemon, offeredIds, pickedIds, round, onPick,
}: Props) {
  const byId = new Map(allPokemon.map(p => [p.id, p]));
  const offered = offeredIds.map(id => byId.get(id)).filter((p): p is PokemonData => !!p);
  const picked = pickedIds.map(id => byId.get(id)).filter((p): p is PokemonData => !!p);

  return (
    <div className="draft-phase">
      <div className="draft-header">
        <h2 className="section-title">Draft — Pick {round + 1} of {RR_DRAFT_ROUNDS}</h2>
        <p className="draft-help">Choose one of the three Pokemon below to add to your 4-Pokemon roster.</p>
      </div>

      <div className="draft-layout">
        <div className="draft-offerings">
          {offered.map(p => (
            <DraftCard key={p.id} data={p} onPick={() => onPick(p.id)} />
          ))}
        </div>

        <div className="draft-roster card">
          <h3 className="section-title">Your Roster</h3>
          <div className="draft-roster-slots">
            {Array.from({ length: RR_DRAFT_ROUNDS }).map((_, i) => {
              const p = picked[i];
              return (
                <div key={i} className={'draft-roster-slot' + (p ? ' filled' : '')}>
                  {p ? (
                    <>
                      <img src={p.spriteUrl} alt={p.name} />
                      <div className="draft-roster-name">{formatPokemonName(p.name)}</div>
                      <div className="draft-roster-types">
                        {p.types.map(t => <TypeBadge key={t} type={t} />)}
                      </div>
                    </>
                  ) : (
                    <span className="draft-roster-empty">Slot {i + 1}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
