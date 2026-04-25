# Move Rankings — Pokemon Hover Tooltip

**Date:** 2026-04-25

## Summary

When hovering over the Pokemon count in the Move Rankings tab of the Statistics page, show a dropdown tooltip listing the Pokemon that currently have that move equipped (name + small sprite image).

## Scope

Changes are limited to two files:
- `src/components/StatisticsPage.tsx`
- `src/components/StatisticsPage.css`

## Data Layer

Extend each entry in the `moveRankings` useMemo to include a `pokemon` array alongside the existing fields:

```ts
pokemon: { name: string; spriteUrl: string }[]
```

As we loop through `nonDisabled` Pokemon and their movesets, push `{ name: p.name, spriteUrl: p.spriteUrl }` onto the array for each move the Pokemon has equipped. Drop the separate `count` field — derive it inline as `m.pokemon.length`.

## UI Layer

Replace the plain count cell:

```tsx
<td className="stats-count">{m.count}</td>
```

With a hoverable pill + tooltip:

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

## CSS

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

## Implementation Approach

Pure CSS hover — no React state required. The tooltip is `position: absolute` relative to its `position: relative` wrapper, appearing below the count pill. Visibility is toggled entirely via the `:hover` selector.

**Overflow note:** The `.stats-table-wrapper` has `overflow-x: auto`. This is not expected to clip the tooltip in practice because the table is wider than it is tall and horizontal scrolling won't activate on normal screen sizes. If clipping becomes an issue, the fix is to switch to `position: fixed` with `getBoundingClientRect()`.
