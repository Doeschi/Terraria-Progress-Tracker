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
| `lib/availability.ts`, `lib/drops.ts`, `lib/recipes.ts`, `lib/bestiary.ts` | Items per playthrough, drops, crafting, bestiary |
| `lib/world.ts`, `lib/coords.ts`, `workers/` | World files (parsed in a Web Worker), chests, areas, coordinates |
| `lib/prefs.ts` | View settings remembered in the browser (columns, sorting, hidden filters, autosave, …) |
| `lib/format.ts` | Small text helpers (plurals, names, dates) |
| `hooks/` | View models (`useTrackerView`, `useBestiaryView`), world loading, autosave, areas |
| `components/` | Screens and parts: header (`TopBar`, `topbar/`), filter sidebar, item and bestiary lists, item details, `dialogs/`, `table/` |
| `components/ui/` | shadcn/ui components (generated, kept in their own style) |
