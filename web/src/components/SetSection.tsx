import { ExternalLink } from 'lucide-react'
import { useUi } from '@/ui'
import { cn } from '@/lib/utils'
import { cardRow } from '@/lib/cardRow'
import type { GameData, Item } from '@/lib/types'
import { CollapsibleSection } from './RecipeSections'
import { ObtainedMark, WikiIcon } from './common'
import { CardLink } from './DetailParts'
import { ShowItemsButton } from './ShowItemsButton'
import { SET_REF } from '@/lib/sources'

// The armor or vanity set of an item in its card (REQUIREMENTS D18c): every piece, obtained ones
// marked, the current item highlighted.

export function SetSection({ data, item, checked }: { data: GameData; item: Item; checked: Set<string> }) {
  const openDetail = useUi((s) => s.openDetail)
  const set = item.set ? data.sets.get(item.set) : undefined
  if (!set) return null
  const pieces = set.items.map((k) => data.itemsByKey.get(k)).filter((i): i is Item => !!i)
  const obtained = pieces.filter((p) => checked.has(p.key)).length
  return (
    <CollapsibleSection id="set" title={`Set: ${set.name}`}>
      <div className="-mt-1 flex items-center gap-2 text-xs text-muted-foreground">
        <span className={cn('tabular-nums', obtained === pieces.length && 'text-emerald-600 dark:text-emerald-400')}>
          {obtained} / {pieces.length} obtained
        </span>
        <span>· {set.kind === 'armor' ? 'Armor set' : 'Vanity set'}</span>
        <a
          href={set.url}
          target="_blank"
          rel="noreferrer noopener"
          className="ml-auto inline-flex items-center gap-1 hover:text-foreground"
          title={`${set.name} on the wiki`}
        >
          <ExternalLink className="size-3" /> Wiki
        </a>
      </div>
      <div>
        <ShowItemsButton id={SET_REF + set.id} label="Show the set in the table" />
      </div>
      <ul className="divide-y rounded-lg border">
        {pieces.map((p) => {
          const current = p.key === item.key
          const own = checked.has(p.key)
          const row = cardRow(current ? undefined : () => openDetail(p.key))
          return (
            <li
              key={p.key}
              {...row}
              className={cn('flex items-center gap-3 px-3 py-1.5', row.className, current && 'bg-primary/10')}
              aria-current={current || undefined}
            >
              <WikiIcon src={p.icon} alt="" size={28} />
              <div className="flex min-w-0 flex-1 items-center gap-1.5 text-sm font-medium">
                {current ? (
                  <span className={cn('truncate', own && 'text-muted-foreground')}>{p.name}</span>
                ) : (
                  <CardLink onOpen={() => openDetail(p.key)} className={cn(own && 'text-muted-foreground')}>
                    {p.name}
                  </CardLink>
                )}
                {own && <ObtainedMark />}
              </div>
              {current && <span className="shrink-0 text-xs text-muted-foreground">this item</span>}
            </li>
          )
        })}
      </ul>
    </CollapsibleSection>
  )
}
