import { useMemo, useState } from 'react'
import { Check, ChevronRight } from 'lucide-react'
import { useUi } from '@/ui'
import { usePrefs } from '@/lib/prefs'
import { cn } from '@/lib/utils'
import { ingredientItems, recipeOnPlatform, recipesFor } from '@/lib/recipes'
import type { GameData, Ingredient, Item, PlatformId, Recipe, Shimmer } from '@/lib/types'
import { WikiIcon } from './common'
import { nameOf } from '@/lib/format'

// Detail panel sections for crafting: how the item is crafted, what it is used
// in and its shimmer transmutations. Collapsible; the open state is remembered.

// "Used in" shows this many results before "Show all"
const USED_IN_LIMIT = 24

interface Props {
  data: GameData
  item: Item
  platform: PlatformId
  checked: Set<string>
}

export function RecipeSections(props: Props) {
  return (
    <>
      <CraftingSection {...props} />
      <UsedInSection {...props} />
      <ShimmerSection {...props} />
    </>
  )
}

function CraftingSection({ data, item, platform, checked }: Props) {
  const recipes = recipesFor(data, item.key, platform)
  if (!recipes.length) return null
  return (
    <CollapsibleSection id="crafting" title="Crafting" count={recipes.length}>
      <ul className="flex flex-col gap-2">
        {recipes.map((r, i) => (
          <RecipeCard key={i} data={data} recipe={r} checked={checked} />
        ))}
      </ul>
    </CollapsibleSection>
  )
}

function RecipeCard({ data, recipe, checked }: { data: GameData; recipe: Recipe; checked: Set<string> }) {
  const openDetail = useUi((s) => s.openDetail)
  return (
    <li className="rounded-lg border">
      <div className="flex flex-wrap items-center gap-1.5 border-b bg-muted/30 px-3 py-1.5 text-xs">
        {recipe.stations.map((name) => {
          const st = data.recipes.stations.get(name)
          const first = st?.items?.[0]
          const have = st?.items?.some((k) => checked.has(k))
          const others = (st?.items ?? []).slice(1).map((k) => data.itemsByKey.get(k)?.name ?? k)
          const title = others.length ? `${name} (or ${others.join(', ')})` : name
          return st?.condition || !first ? (
            <span key={name} className="rounded border bg-card px-1.5 py-0.5 font-medium">
              {name}
            </span>
          ) : (
            <button
              key={name}
              onClick={() => openDetail(first)}
              title={title}
              className="flex items-center gap-1 rounded border bg-card px-1.5 py-0.5 font-medium hover:bg-muted"
            >
              <WikiIcon src={st.icon} alt="" size={16} />
              {name}
              {have && <Check className="size-3 text-emerald-600 dark:text-emerald-400" aria-label="obtained" />}
            </button>
          )
        })}
        {recipe.amount > 1 && <span className="ml-auto text-muted-foreground">makes {recipe.amount}</span>}
      </div>
      <ul className="flex flex-col py-1">
        {recipe.ingredients.map((ing, i) => (
          <IngredientRow key={i} data={data} ingredient={ing} checked={checked} />
        ))}
      </ul>
      {recipe.platforms && (
        <p className="border-t px-3 py-1 text-[11px] text-muted-foreground">
          Only on {recipe.platforms.map((p) => nameOf(data.platforms, p)).join(', ')}
        </p>
      )}
    </li>
  )
}

function IngredientRow({
  data,
  ingredient,
  checked,
}: {
  data: GameData
  ingredient: Ingredient
  checked: Set<string>
}) {
  const openDetail = useUi((s) => s.openDetail)
  const keys = ingredientItems(data, ingredient)
  const item = ingredient.item ? data.itemsByKey.get(ingredient.item) : undefined
  const group = ingredient.group ? data.recipes.groups.get(ingredient.group) : undefined
  const name = item?.name ?? ingredient.group ?? ingredient.name ?? '?'
  const icon = item?.icon ?? group?.icon
  const have = keys.some((k) => checked.has(k))
  const title = group ? keys.map((k) => data.itemsByKey.get(k)?.name ?? k).join(', ') : undefined
  const target = keys[0]
  const content = (
    <>
      <WikiIcon src={icon} alt="" size={24} />
      <span className="min-w-0 flex-1 truncate">{name}</span>
      {have && <Check className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-label="obtained" />}
      <span className="w-10 shrink-0 text-right tabular-nums text-muted-foreground">× {ingredient.amount}</span>
    </>
  )
  return (
    <li>
      {target ? (
        <button
          onClick={() => openDetail(target)}
          title={title}
          className="flex w-full items-center gap-2 px-3 py-1 text-left text-sm hover:bg-muted/60"
        >
          {content}
        </button>
      ) : (
        <span className="flex items-center gap-2 px-3 py-1 text-sm text-muted-foreground">{content}</span>
      )}
    </li>
  )
}

function UsedInSection({ data, item, platform, checked }: Props) {
  const [all, setAll] = useState(false)
  // one entry per result: the amount of this item (or its group) the first recipe needs
  const results = useMemo(() => {
    const byKey = new Map<string, { item: Item; amount: number }>()
    for (const r of data.recipes.usedIn.get(item.key) ?? []) {
      const result = data.itemsByKey.get(r.result)
      if (!result || byKey.has(result.key) || !recipeOnPlatform(r, platform)) continue
      const ing = r.ingredients.find((i) => ingredientItems(data, i).includes(item.key))
      byKey.set(result.key, { item: result, amount: ing?.amount ?? 1 })
    }
    return [...byKey.values()].sort((a, b) => a.item.name.localeCompare(b.item.name, 'en'))
  }, [data, item, platform])
  if (!results.length) return null
  const shown = all ? results : results.slice(0, USED_IN_LIMIT)
  return (
    <CollapsibleSection id="usedIn" title="Used in" count={results.length}>
      <ItemGrid entries={shown.map((r) => ({ item: r.item, note: `× ${r.amount}` }))} checked={checked} />
      {results.length > shown.length && (
        <button onClick={() => setAll(true)} className="self-start text-xs text-primary hover:underline">
          Show all {results.length}
        </button>
      )}
    </CollapsibleSection>
  )
}

function ShimmerSection({ data, item, checked }: Props) {
  const into = data.recipes.shimmerFrom.get(item.key) ?? []
  const from = data.recipes.shimmerTo.get(item.key) ?? []
  if (!into.length && !from.length) return null
  const source = (s: Shimmer) => {
    const keys = s.item ? [s.item] : s.group ? (data.recipes.groups.get(s.group)?.items ?? []) : []
    return { item: data.itemsByKey.get(keys[0] ?? ''), label: s.group ?? s.name }
  }
  return (
    <CollapsibleSection id="shimmer" title="Shimmer" count={into.length + from.length}>
      {into.length > 0 && (
        <>
          <p className="text-xs text-muted-foreground">Turns into</p>
          <ItemGrid
            entries={into.flatMap((s) => {
              const result = data.itemsByKey.get(s.result)
              return result ? [{ item: result, note: s.amount > 1 ? `× ${s.amount}` : undefined }] : []
            })}
            checked={checked}
          />
        </>
      )}
      {from.length > 0 && (
        <>
          <p className="text-xs text-muted-foreground">Made by shimmering</p>
          <ItemGrid
            entries={from.flatMap((s) => {
              const { item: src, label } = source(s)
              return src ? [{ item: src, label }] : []
            })}
            checked={checked}
          />
        </>
      )}
    </CollapsibleSection>
  )
}

/** Compact two-column list of items; click shows the item. */
function ItemGrid({
  entries,
  checked,
}: {
  entries: { item: Item; note?: string; label?: string }[]
  checked: Set<string>
}) {
  const openDetail = useUi((s) => s.openDetail)
  return (
    <ul className="grid grid-cols-2 gap-1">
      {entries.map(({ item, note, label }, i) => (
        <li key={i}>
          <button
            onClick={() => openDetail(item.key)}
            className="flex w-full items-center gap-1.5 rounded-md border px-2 py-1 text-left text-xs hover:bg-muted/60"
            title={label ? `${label} (e.g. ${item.name})` : item.name}
          >
            <WikiIcon src={item.icon} alt="" size={20} />
            <span className="min-w-0 flex-1 truncate">{label ?? item.name}</span>
            {checked.has(item.key) && (
              <Check className="size-3 shrink-0 text-emerald-600 dark:text-emerald-400" aria-label="obtained" />
            )}
            {note && <span className="shrink-0 tabular-nums text-muted-foreground">{note}</span>}
          </button>
        </li>
      ))}
    </ul>
  )
}

export function CollapsibleSection({
  id,
  title,
  count,
  defaultOpen = true,
  children,
}: {
  id: string
  title: string
  count?: number
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const open = usePrefs((s) => s.openSections[id] ?? defaultOpen)
  const setSectionOpen = usePrefs((s) => s.setSectionOpen)
  return (
    <section className="flex flex-col gap-2">
      <h3>
        <button
          onClick={() => setSectionOpen(id, !open)}
          aria-expanded={open}
          className="flex items-center gap-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase hover:text-foreground"
        >
          <ChevronRight className={cn('size-3.5 transition-transform', open && 'rotate-90')} />
          {title}
          {count !== undefined && <span className="font-normal normal-case">({count})</span>}
        </button>
      </h3>
      {open && children}
    </section>
  )
}
