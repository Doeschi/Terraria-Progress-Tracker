import { ListFilter } from 'lucide-react'
import { useStore } from '@/store'
import { isSourceOption } from '@/lib/sources'
import { Button } from '@/components/ui/button'

/** "Show its items in the table" (REQUIREMENTS FL18): the item list filtered to an NPC, container
 * or set ("npc:…", "src:…", "set:…") via the group "Sources & sets". */
export function ShowItemsButton({ id, label = 'Show items' }: { id: string; label?: string }) {
  const data = useStore((s) => s.data)!
  const showSourceItems = useStore((s) => s.showSourceItems)
  if (!isSourceOption(data, id)) return null
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => showSourceItems(id)}
      title="Show its items in the table (filter “Sources & sets”)"
    >
      <ListFilter /> {label}
    </Button>
  )
}
