# Move Rankings Hover Tooltip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a hoverable tooltip on the Pokemon count in Move Rankings listing each Pokemon (name + sprite) that has the move equipped.

**Architecture:** Extend the `moveRankings` useMemo to collect a `pokemon` array per move entry. Replace the plain count `<td>` with a CSS-only hover pill + absolute-positioned tooltip. No React state needed.

**Tech Stack:** React, TypeScript, CSS (no new dependencies)

---

## Files

- Modify: `src/components/StatisticsPage.tsx` — extend data shape, update JSX
- Modify: `src/components/StatisticsPage.css` — add tooltip CSS classes

---

### Task 1: Extend `moveRankings` data shape to include pokemon list

**Files:**
- Modify: `src/components/StatisticsPage.tsx`

The `moveRankings` useMemo currently tracks a `count: number` per move. Replace it with `pokemon: { name: string; spriteUrl: string }[]` and derive the count from `pokemon.length` at render time.

- [ ] **Step 1: Update the moveCount Map type and accumulation logic**

In `src/components/StatisticsPage.tsx`, replace the `moveRankings` useMemo (lines 31–64) with:

```tsx
const moveRankings = useMemo(() => {
  const moveCount = new Map<number, {
    name: string;
    type: TypeName;
    damageClass: DamageClass;
    power: number;
    accuracy: number | null;
    priority: number;
    effectText: string;
    pokemon: { name: string; spriteUrl: string }[];
  }>();
  for (const pokemon of nonDisabled) {
    const persisted = getPokemonPersisted(pokemon.id);
    const uniqueMoveIds = new Set(persisted.moveset);
    for (const moveId of uniqueMoveIds) {
      const move = pokemon.availableMoves.find(m => m.id === moveId);
      if (!move) continue;
      if (!moveCount.has(moveId)) {
        moveCount.set(moveId, {
          name: move.name,
          type: move.type,
          damageClass: move.damageClass,
          power: move.power,
          accuracy: move.accuracy,
          priority: move.priority,
          effectText: effectSummary(move),
          pokemon: [],
        });
      }
      moveCount.get(moveId)!.pokemon.push({ name: pokemon.name, spriteUrl: pokemon.spriteUrl });
    }
  }
  return [...moveCount.values()].sort((a, b) => b.pokemon.length - a.pokemon.length);
}, [nonDisabled]);
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run build
```

Expected: build succeeds. If it fails because `m.count` is still referenced in the JSX, that's fine — fix it in Task 2.

---

### Task 2: Update JSX to render the pill count and tooltip

**Files:**
- Modify: `src/components/StatisticsPage.tsx`

- [ ] **Step 1: Replace the plain count cell with the hoverable pill + tooltip**

Find this line in the `moveRankings.map` render (currently around line 134):

```tsx
<td className="stats-count">{m.count}</td>
```

Replace it with:

```tsx
<td className="stats-count">
  <span className="move-poke-wrap">
    <span className="move-poke-count">{m.pokemon.length}</span>
    <div className="move-poke-tooltip">
      {m.pokemon.map(p => (
        <div key={p.name} className="move-poke-row">
          <img src={p.spriteUrl} alt={p.name} className="move-poke-sprite" />
          <span>{formatPokemonName(p.name)}</span>
        </div>
      ))}
    </div>
  </span>
</td>
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npm run build
```

Expected: build succeeds with no errors.

---

### Task 3: Add CSS for the pill and tooltip

**Files:**
- Modify: `src/components/StatisticsPage.css`

- [ ] **Step 1: Append the new CSS classes to the end of `StatisticsPage.css`**

```css
.move-poke-wrap {
  position: relative;
  display: inline-block;
}

.move-poke-count {
  display: inline-block;
  font-weight: 700;
  background: rgba(166, 77, 255, 0.15);
  border: 1px solid rgba(166, 77, 255, 0.35);
  border-radius: 4px;
  padding: 1px 7px;
  color: #c97fff;
  cursor: default;
}

.move-poke-tooltip {
  display: none;
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 100;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
  min-width: 150px;
}

.move-poke-wrap:hover .move-poke-tooltip {
  display: block;
}

.move-poke-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  border-bottom: 1px solid var(--border);
  font-size: 0.82rem;
  font-weight: 600;
  white-space: nowrap;
  color: var(--text);
}

.move-poke-row:last-child {
  border-bottom: none;
}

.move-poke-sprite {
  width: 28px;
  height: 28px;
  image-rendering: pixelated;
}
```

- [ ] **Step 2: Final build check**

```bash
npm run build
```

Expected: build succeeds with no errors.

- [ ] **Step 3: Manual smoke test**

Run `npm run dev`, open the app, go to Statistics → Move Rankings. Hover over any count pill — the tooltip should appear below it listing the Pokemon with their sprites and names. Verify:
- Count pill has purple background/border
- Tooltip appears below the pill on hover
- Each row shows the sprite (28×28px) and formatted Pokemon name
- Tooltip disappears when mouse leaves

- [ ] **Step 4: Commit**

```bash
git add src/components/StatisticsPage.tsx src/components/StatisticsPage.css
git commit -m "feat: show pokemon tooltip on move count hover in Move Rankings"
```
