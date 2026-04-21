import { useState, useCallback } from 'react';
import type {
  TeamBattleState,
  TeamTurnEvent,
  TeamAction,
  SideIndex,
} from '../models/types';
import { applyActions, battleWinner, legalActions } from '../battle/teamBattleEngine';
import { mctsTeamAI } from '../ai/mctsTeamAI';

/**
 * Shared controller for a live, interactive 3v3 team battle.
 * Handles both spectate (both sides AI-driven, advances one turn per click)
 * and play mode (side 0 is the human; AI auto-advances any turns where
 * only the opponent needs to act — e.g. replace phases for side 1 only).
 */
export function useTeamBattleController(initial: TeamBattleState, initialLog: TeamTurnEvent[] = []) {
  const [state, setState] = useState<TeamBattleState>(initial);
  const [log, setLog] = useState<TeamTurnEvent[]>(initialLog);
  const [thinking, setThinking] = useState(false);

  const winner: SideIndex | null = battleWinner(state);
  const done = winner !== null;

  const nextTurn = useCallback(() => {
    if (thinking || done) return;
    setThinking(true);
    setTimeout(() => {
      const a0 = legalActions(state, 0).length > 0 ? mctsTeamAI.selectAction(state, 0) : null;
      const a1 = legalActions(state, 1).length > 0 ? mctsTeamAI.selectAction(state, 1) : null;
      const { next, events } = applyActions(state, a0, a1);
      setLog(prev => [...prev, ...events]);
      setState(next);
      setThinking(false);
    }, 0);
  }, [state, thinking, done]);

  const submitPlayerAction = useCallback((a0: TeamAction) => {
    if (thinking || done) return;
    setThinking(true);
    setTimeout(() => {
      let cur = state;
      const newEvents: TeamTurnEvent[] = [];
      const a1 = legalActions(cur, 1).length > 0 ? mctsTeamAI.selectAction(cur, 1) : null;
      const step = applyActions(cur, a0, a1);
      newEvents.push(...step.events);
      cur = step.next;
      while (battleWinner(cur) === null && legalActions(cur, 0).length === 0) {
        const ai1 = legalActions(cur, 1).length > 0 ? mctsTeamAI.selectAction(cur, 1) : null;
        const step2 = applyActions(cur, null, ai1);
        newEvents.push(...step2.events);
        cur = step2.next;
      }
      setLog(prev => [...prev, ...newEvents]);
      setState(cur);
      setThinking(false);
    }, 0);
  }, [state, thinking, done]);

  const reset = useCallback((newInitial: TeamBattleState, newLog: TeamTurnEvent[] = []) => {
    setState(newInitial);
    setLog(newLog);
    setThinking(false);
  }, []);

  return { state, log, thinking, winner, done, nextTurn, submitPlayerAction, reset };
}
