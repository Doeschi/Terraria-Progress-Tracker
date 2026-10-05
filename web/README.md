# Terraria Progress Tracker – web app

Vite, React, TypeScript, Tailwind CSS, shadcn/ui, Zustand. See the [root README](../README.md) for
the data pipeline and deployment, [REQUIREMENTS.md](../REQUIREMENTS.md) for the features.

```bash
npm install
npm run dev            # development server on http://localhost:5173
npm run build          # type check + static site in dist/
npm run lint           # ESLint
npm run format         # Prettier (single quotes, no semicolons, 120 columns; src/components/ui excluded)
```

## Code layout (`src/`)

| Path | Contents |
|------|----------|
| `store.ts` | The tracking file, playthroughs, loaded worlds and the view state (filters, search, mode) |
| `ui.ts` | Which dialog is open, the item detail panel and its history |
| `actions.ts` | File actions shared by the header and the start page |
| `lib/types.ts`, `lib/data.ts` | Shapes and loading of the generated JSON in `public/data/` |
| `lib/saveFile.ts`, `lib/files.ts` | Tracking file format (with migrations), opening/saving, local backup, autosave writes |
| `lib/filtering.ts`, `lib/filterView.ts` | Filter groups, faceted counts; what the filter sidebar shows (hidden, completed, search) |
| `lib/availability.ts`, `lib/drops.ts`, `lib/recipes.ts`, `lib/bestiary.ts` | Items per playthrough (and which of them a new one starts with ignored), drops, crafting, bestiary |
| `lib/sources.ts`, `lib/npcs.ts`, `lib/conditions.ts` | The "Sources & sets" filter group, the links behind the NPC cards, the condition names of shop rows and drops |
| `lib/world.ts`, `lib/coords.ts`, `workers/` | World files (parsed in a Web Worker), chests, areas, coordinates |
| `lib/worldProgress.ts`, `lib/luck.ts`, `lib/banners.ts` | What a loaded world has defeated (milestones reached), expected drops ("bad luck"), enemy banners earned by kills |
| `lib/player.ts` | The attached player file (read with `packages/terraria-player-file`) |
| `lib/dataUpdate.ts` | Carrying a progress file over to newer item data (renamed keys, what changed) |
| `lib/prefs.ts`, `lib/viewState.ts`, `lib/layout.ts` | View settings remembered in the browser (columns, sorting, hidden filters, autosave, …), the view of each playthrough, what the settings can show and reorder |
| `lib/sprites.ts` | Where a wiki icon sits in the sprite sheets |
| `lib/intros.ts` | The introductions of the wiki pages ("About" in the detail panel), loaded when first shown |
| `lib/format.ts`, `lib/utils.ts` | Small helpers (plurals, names, dates; touch screens, class names) |
| `lib/eggs.tsx`, `lib/trophies.ts`, `lib/weapons.ts`, `lib/fx.ts`, `lib/confetti.ts`, `lib/parade.ts`, `lib/season.ts` | Easter eggs and celebrations |
| `hooks/` | View models (`useTrackerView`, `useBestiaryView`), world and player loading, world progress, completions, autosave, areas |
| `components/` | Screens and parts: header (`TopBar`, `topbar/`), filter sidebar, item and bestiary lists, item details, `dialogs/`, `table/` |
| `components/ui/` | shadcn/ui components (generated, kept in their own style) |
