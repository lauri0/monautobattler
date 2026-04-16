import { useState, useRef, useEffect } from 'react';
import type { PokemonData, BattlePokemon, TurnEvent } from '../models/types';
import { buildBattlePokemon } from '../battle/buildBattlePokemon';
import { resolveTurn } from '../battle/battleEngine';
import { expectiminimaxAI } from '../ai/expectiminimaxAI';
import { applyEloResult } from '../utils/eloCalc';
import { getPokemonPersisted, setPokemonPersisted, getBattleSelection, setBattleSelection } from '../persistence/userStorage';
import HpBar from './HpBar';
import TypeBadge from './TypeBadge';
import { getTypeColor } from '../utils/typeColors';
import './BattlePage.css';

interface Props {
  allPokemon: PokemonData[];
  onBack: () => void;
}

type Phase = 'select' | 'battle' | 'end';

function effectivenessText(e: number): string {
  if (e === 0) return "It had no effect!";
  if (e >= 4) return "It's super effective!! (×4)";
  if (e >= 2) return "It's super effective!";
  if (e <= 0.25) return "It's not very effective... (×0.25)";
  if (e < 1) return "It's not very effective...";
  return '';
}

export default function BattlePage({ allPokemon, onBack }: Props) {
  const enabled = allPokemon.filter(p => !getPokemonPersisted(p.id).disabled);
  const [phase, setPhase] = useState<Phase>('select');
  const [selA, setSelA] = useState(() => {
    const saved = getBattleSelection();
    return saved && enabled.some(p => p.id === saved.idA) ? saved.idA : (enabled[0]?.id ?? 0);
  });
  const [selB, setSelB] = useState(() => {
    const saved = getBattleSelection();
    return saved && enabled.some(p => p.id === saved.idB) ? saved.idB : (enabled[1]?.id ?? 0);
  });
  const [p1, setP1] = useState<BattlePokemon | null>(null);
  const [p2, setP2] = useState<BattlePokemon | null>(null);
  const [log, setLog] = useState<TurnEvent[]>([]);
  const [turn, setTurn] = useState(1);
  const [battleOver, setBattleOver] = useState(false);
  const [eloMsg, setEloMsg] = useState<string[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [log]);

  function startBattle() {
    const dataA = allPokemon.find(p => p.id === selA);
    const dataB = allPokemon.find(p => p.id === selB);
    if (!dataA || !dataB || selA === selB) return;
    setBattleSelection(selA, selB);
    setP1(buildBattlePokemon(dataA));
    setP2(buildBattlePokemon(dataB));
    setLog([]);
    setTurn(1);
    setBattleOver(false);
    setEloMsg([]);
    setPhase('battle');
  }

  function nextTurn() {
    if (!p1 || !p2 || battleOver) return;
    const { events, p1After, p2After, battleOver: over, lastAttackerIsP1 } = resolveTurn(p1, p2, turn, expectiminimaxAI, expectiminimaxAI);
    setLog(prev => [...prev, ...events]);
    setP1(p1After);
    setP2(p2After);
    setTurn(t => t + 1);
    if (over) {
      setBattleOver(true);
      setPhase('end');
      // Determine winner/loser — if both fainted (recoil), defender wins
      let winner: typeof p1After, loser: typeof p1After;
      if (p1After.currentHp > 0) {
        winner = p1After; loser = p2After;
      } else if (p2After.currentHp > 0) {
        winner = p2After; loser = p1After;
      } else {
        const attackerIsP1 = lastAttackerIsP1 === true;
        winner = attackerIsP1 ? p1After : p2After;
        loser = attackerIsP1 ? p2After : p1After;
      }
      const wP = getPokemonPersisted(winner.data.id);
      const lP = getPokemonPersisted(loser.data.id);
      const { newWinnerElo, newLoserElo } = applyEloResult(wP.elo, lP.elo);
      setPokemonPersisted({ ...wP, elo: newWinnerElo, wins: wP.wins + 1 });
      setPokemonPersisted({ ...lP, elo: newLoserElo, losses: lP.losses + 1 });
      setEloMsg([
        `${winner.data.name}: ${wP.elo} → ${newWinnerElo} (+${newWinnerElo - wP.elo})`,
        `${loser.data.name}: ${lP.elo} → ${newLoserElo} (${newLoserElo - lP.elo})`,
      ]);
    }
  }

  function rematch() {
    if (!p1 || !p2) return;
    const dataA = allPokemon.find(p => p.id === p1.data.id);
    const dataB = allPokemon.find(p => p.id === p2.data.id);
    if (!dataA || !dataB) return;
    setP1(buildBattlePokemon(dataA));
    setP2(buildBattlePokemon(dataB));
    setLog([]);
    setTurn(1);
    setBattleOver(false);
    setEloMsg([]);
    setPhase('battle');
  }

  if (phase === 'select') {
    return (
      <div className="page">
        <button className="back-btn" onClick={onBack}>← Back</button>
        <h1 className="page-title">Single Battle</h1>
        <div className="battle-select card">
          <div className="battle-select-pickers">
            <div className="picker-col">
              <label className="picker-label">Pokemon A</label>
              <select value={selA} onChange={e => setSelA(Number(e.target.value))}>
                {enabled.map(p => (
                  <option key={p.id} value={p.id}>#{p.id} {p.name}</option>
                ))}
              </select>
            </div>
            <div className="vs-label">VS</div>
            <div className="picker-col">
              <label className="picker-label">Pokemon B</label>
              <select value={selB} onChange={e => setSelB(Number(e.target.value))}>
                {enabled.map(p => (
                  <option key={p.id} value={p.id}>#{p.id} {p.name}</option>
                ))}
              </select>
            </div>
          </div>
          {selA === selB && <p style={{ color: '#f44336', marginTop: '0.75rem', textAlign: 'center' }}>Choose two different Pokemon.</p>}
          <button className="btn-primary" style={{ marginTop: '1.5rem', width: '100%' }}
            onClick={startBattle} disabled={selA === selB || enabled.length < 2}>
            Start Battle
          </button>
        </div>
      </div>
    );
  }

  if (!p1 || !p2) return null;

  const winner = phase === 'end' ? (p1.currentHp > 0 ? p1 : p2) : null;

  return (
    <div className="page">
      <button className="back-btn" onClick={onBack}>← Back</button>
      <h1 className="page-title">Battle!</h1>

      <div className="battle-arena">
        <BattlerPanel pokemon={p1} />
        <div className="arena-vs">VS</div>
        <BattlerPanel pokemon={p2} />
      </div>

      {phase === 'end' && winner && (
        <div className="winner-banner card">
          <h2 style={{ color: '#f1c40f' }}>🏆 {winner.data.name} wins!</h2>
          {eloMsg.map((msg, i) => <p key={i} style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{msg}</p>)}
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
            <button className="btn-primary" onClick={rematch}>Rematch</button>
            <button className="btn-secondary" onClick={() => setPhase('select')}>New Battle</button>
            <button className="btn-secondary" onClick={onBack}>Back to Menu</button>
          </div>
        </div>
      )}

      {phase === 'battle' && (
        <div style={{ textAlign: 'center', margin: '1rem 0' }}>
          <button className="btn-primary" onClick={nextTurn}>Next Turn →</button>
        </div>
      )}

      <div className="card battle-log" ref={logRef}>
        <h3 className="section-title" style={{ marginBottom: '0.75rem' }}>Battle Log</h3>
        {log.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Press "Next Turn" to start.</p>}
        {log.map((ev, i) => (
          <LogEntry key={i} ev={ev} />
        ))}
      </div>
    </div>
  );
}

const STATUS_STYLES: Record<string, { label: string; bg: string }> = {
  burn:      { label: 'BRN', bg: '#e94560' },
  poison:    { label: 'PSN', bg: '#a64dff' },
  paralysis: { label: 'PAR', bg: '#f1c40f' },
  sleep:     { label: 'SLP', bg: '#6c7a89' },
  freeze:    { label: 'FRZ', bg: '#4fc3f7' },
};

function BattlerPanel({ pokemon }: { pokemon: BattlePokemon }) {
  const status = pokemon.statusCondition ? STATUS_STYLES[pokemon.statusCondition] : null;
  return (
    <div className="battler-panel card">
      <img src={pokemon.data.spriteUrl} alt={pokemon.data.name} className="battler-sprite" />
      <div className="battler-name">{pokemon.data.name}</div>
      <div style={{ display: 'flex', gap: 4, justifyContent: 'center', marginBottom: 8 }}>
        {pokemon.data.types.map(t => <TypeBadge key={t} type={t} />)}
      </div>
      {(status || pokemon.confused) && (
        <div className="battler-ailments">
          {status && (
            <span className="ailment-badge" style={{ background: status.bg }}>{status.label}</span>
          )}
          {pokemon.confused && (
            <span className="ailment-badge" style={{ background: '#d68910' }}>CNF</span>
          )}
        </div>
      )}
      <HpBar current={pokemon.currentHp} max={pokemon.level50Stats.hp} />
      <div className="battler-moves">
        {pokemon.moves.map(m => (
          <span key={m.id} className="battler-move-chip" style={{ borderColor: getTypeColor(m.type) }}>
            {m.name}
          </span>
        ))}
      </div>
    </div>
  );
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

function LogEntry({ ev }: { ev: TurnEvent }) {
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
