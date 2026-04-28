import { useState, useCallback, useEffect } from 'react';
import type {
  TeamBattleState,
  TeamTurnEvent,
  TeamAction,
  SideIndex,
} from '../models/types';
import { applyActions, battleWinner, legalActions } from '../battle/teamBattleEngine';
import { mctsTeamAI } from '../ai/mctsTeamAI';
import { applyTeamEventToState } from '../battle/applyEventToState';

const SLOW_DELAY_MS = 750;

export function useTeamBattleController(initial: TeamBattleState, initialLog: TeamTurnEvent[] = []) {
  const [state, setState] = useState<TeamBattleState>(initial);
  const [displayedState, setDisplayedState] = useState<TeamBattleState>(initial);
  const [log, setLog] = useState<TeamTurnEvent[]>(initialLog);
  const [playbackQueue, setPlaybackQueue] = useState<TeamTurnEvent[]>([]);
  const [thinking, setThinking] = useState(false);
  const [fastMode, setFastMode] = useState(false);

  const winner: SideIndex | null = battleWinner(state);
  const done = winner !== null;
  const isPlaying = playbackQueue.length > 0;

  // Drip one event from the queue on each tick.
  useEffect(() => {
    if (playbackQueue.length === 0) return;
    const delay = fastMode ? 0 : SLOW_DELAY_MS;
    const timer = setTimeout(() => {
      const [event, ...rest] = playbackQueue;
      setDisplayedState(prev => applyTeamEventToState(prev, event));
      setLog(prev => [...prev, event]);
      setPlaybackQueue(rest);
    }, delay);
    return () => clearTimeout(timer);
  }, [playbackQueue, fastMode]);

  const toggleFastMode = useCallback(() => setFastMode(f => !f), []);

  const nextTurn = useCallback(() => {
    if (thinking || isPlaying || done) return;
    setThinking(true);
    setTimeout(() => {
      const a0 = legalActions(state, 0).length > 0 ? mctsTeamAI.selectAction(state, 0) : null;
      const a1 = legalActions(state, 1).length > 0 ? mctsTeamAI.selectAction(state, 1) : null;
      const { next, events } = applyActions(state, a0, a1);
      setState(next);
      setPlaybackQueue(events);
      setThinking(false);
    }, 0);
  }, [state, thinking, isPlaying, done]);

  const submitPlayerAction = useCallback((a0: TeamAction) => {
    if (thinking || isPlaying || done) return;
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
      setState(cur);
      setPlaybackQueue(newEvents);
      setThinking(false);
    }, 0);
  }, [state, thinking, isPlaying, done]);

  const reset = useCallback((newInitial: TeamBattleState, newLog: TeamTurnEvent[] = []) => {
    setState(newInitial);
    setDisplayedState(newInitial);
    setLog(newLog);
    setPlaybackQueue([]);
    setThinking(false);
  }, []);

  return {
    state,
    displayedState,
    log,
    thinking,
    winner,
    done,
    isPlaying,
    fastMode,
    toggleFastMode,
    nextTurn,
    submitPlayerAction,
    reset,
  };
}
