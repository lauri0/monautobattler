# Turn Playback System — Design Spec

**Date:** 2026-04-29
**Scope:** 1v1 and 4v4 battle modes

## Overview

Currently, turns resolve instantly — all events for a turn are applied to the UI in one synchronous update. This spec describes adding live turn playback: after a player submits an action (or clicks Next Turn in spectate mode), the turn's events play out one by one, each separated by a configurable delay. The battle engines are not changed.

## Behaviour

- When a turn resolves, its events drip into the UI one at a time.
- Each event takes **750 ms** in slow mode, **0 ms** in fast mode.
- Each event updates both the displayed battle state (HP bars, status, field) and appends a line to the event log simultaneously.
- The Next Turn / Submit action button is **disabled** while events are playing.
- A **Slow/Fast toggle** in the event log header controls playback speed. It is always interactive — toggling mid-playback takes effect immediately on the remaining queue.
- Default is **slow mode**.

## Architecture: Dual State

The core concept is two layers of state:

| Layer | Description |
|-------|-------------|
| `resolvedState` | True state after full turn resolution. Updated immediately. Used by AI for next move selection. Never rendered directly. |
| `displayedState` | What the UI renders. Updated one event at a time from the playback queue. Catches up to `resolvedState` when the queue empties. |

**Turn flow:**
1. Player submits action or clicks Next Turn.
2. Turn resolves synchronously → produces `(nextResolvedState, events[])`.
3. `resolvedState` updates immediately.
4. `events[]` stored as `playbackQueue`.
5. A `useEffect` pops one event on a timer, calls `applyEventToState(displayedState, event)` → new `displayedState`.
6. Event log line appended in the same update.
7. Repeat until queue empty → controls re-enable.

## New File: `applyEventToState.ts`

A pure utility function with no side effects. Handles all `TurnEvent` and `TeamTurnEvent` kinds, mapping each to an incremental state update:

- `attack` → update defender HP to `defenderHpAfter`, attacker HP to `attackerHpAfter`
- `recoil` / `end_of_turn_damage` → update affected Pokemon HP to `hpAfter`
- `stat_change` → update stat stage to `newStage`
- `status_applied` → set status condition on Pokemon
- `weather_set` / `terrain_set` → update field state
- `switch` (4v4) → update active Pokemon index and HP
- All other event kinds → pass through unchanged (log-only events)

Exported in two flavours:
- `applyEventToState(p1, p2, field, event: TurnEvent)` for 1v1
- `applyTeamEventToState(state: TeamBattleState, event: TeamTurnEvent)` for 4v4

## Changes to `useTeamBattleController`

New state:
```ts
const [displayedState, setDisplayedState] = useState(initialState);
const [playbackQueue, setPlaybackQueue] = useState<TeamTurnEvent[]>([]);
const [fastMode, setFastMode] = useState(false);
```

`nextTurn()` and `submitPlayerAction()` update `state` (resolved) immediately and call `setPlaybackQueue(events)` instead of `setDisplayedState`.

New `useEffect`:
```ts
useEffect(() => {
  if (playbackQueue.length === 0) return;
  const delay = fastMode ? 0 : 750;
  const timer = setTimeout(() => {
    const [event, ...rest] = playbackQueue;
    setDisplayedState(prev => applyTeamEventToState(prev, event));
    // append event to log
    setPlaybackQueue(rest);
  }, delay);
  return () => clearTimeout(timer);
}, [playbackQueue, fastMode]);
```

New exposed values: `displayedState`, `isPlaying` (`playbackQueue.length > 0`), `fastMode`, `toggleFastMode`.

The component renders `displayedState` instead of `state`. The Next Turn button uses `disabled={isPlaying || done}`.

## Changes to `BattlePage.tsx` (1v1)

Same pattern applied directly in the component (no separate hook):

- `displayedP1`, `displayedP2`, `displayedField` alongside resolved `p1`, `p2`, `field`
- `playbackQueue: TurnEvent[]`
- `fastMode: boolean`
- Same `useEffect` drip logic using `applyEventToState`
- Render from displayed state; disable Next Turn when `playbackQueue.length > 0`

## Speed Toggle UI

Placed in the **event log header**, inline with the "Battle Log" title:

```
Battle Log                          Slow ○━━ Fast
```

- Always visible and interactive, including during playback
- Toggling to fast mid-playback drains remaining queue without delay
- Toggling back to slow resumes 750 ms spacing from the next event

## Control Locking

During playback (`isPlaying === true`):
- Next Turn / Submit action buttons: disabled
- Speed toggle: always enabled
- Switch prompts (4v4 replace/pivot phases): appear only after the pre-switch playback queue has drained — no special handling needed since the queue will naturally be empty before the phase transition prompt fires

## Files Changed

| File | Change |
|------|--------|
| `src/battle/applyEventToState.ts` | **New** — pure event-to-state projection utility |
| `src/hooks/useTeamBattleController.ts` | Add dual state, playback queue, fastMode, drip useEffect |
| `src/components/BattlePage.tsx` | Add dual state, playback queue, fastMode, drip useEffect; toggle added inline in log `<div>` |
| `src/components/TeamEventLog.tsx` | Add Slow/Fast toggle to header; accept `fastMode`/`onToggleFast` props |
| `battleEngine.ts`, `teamBattleEngine.ts` | **No changes** |

## Out of Scope

- Rewind / replay of completed battles
- Per-event animation (e.g., HP bar smooth tween) — HP snaps to new value per event
- Variable delay per event type
