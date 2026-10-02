import { useStore } from '@/store'
import { useUi } from '@/ui'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { WikiIcon } from '../common'

// "Item data updated" (REQUIREMENTS DU5): what changed in the item data since the opened progress
// file was last used – renamed items (checkmarks moved along), new items, and the file's items
// that no longer exist.

/** Names shown per list before "… and N more". */
const SHOWN = 30

export function DataUpdateDialog() {
  const dialog = useUi((s) => s.dialog)
  const close = useUi((s) => s.close)
  const openDetail = useUi((s) => s.openDetail)
  const data = useStore((s) => s.data)
  const report = dialog.type === 'dataUpdate' ? dialog.report : null
  if (!data) return null
  const name = (key: string) => data.itemsByKey.get(key)?.name ?? key
  const items = (keys: string[]) => (
    <ul className="flex flex-col gap-0.5">
      {keys.slice(0, SHOWN).map((k) => {
        const item = data.itemsByKey.get(k)
        return (
          <li key={k}>
            <button
              type="button"
              disabled={!item}
              onClick={() => {
                close()
                openDetail(k)
              }}
              className="flex items-center gap-2 text-left text-sm enabled:hover:underline"
            >
              <WikiIcon src={item?.icon} alt="" size={20} />
              {name(k)}
            </button>
          </li>
        )
      })}
      {keys.length > SHOWN && <li className="text-xs text-muted-foreground">… and {keys.length - SHOWN} more</li>}
    </ul>
  )
  return (
    <Dialog open={!!report} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Item data updated</DialogTitle>
          <DialogDescription>
            {report?.from
              ? `The item data changed since this file was last used (${report.from} → ${report.to}).`
              : `This file is now used with the item data of ${report?.to}.`}
          </DialogDescription>
        </DialogHeader>
        {report && (
          <div className="flex flex-col gap-4">
            {report.renamed.length > 0 && (
              <section className="flex flex-col gap-1.5">
                <h3 className="text-sm font-medium">Renamed ({report.renamed.length})</h3>
                <p className="text-xs text-muted-foreground">Your checkmarks moved along.</p>
                {items(report.renamed.map((r) => r.to))}
              </section>
            )}
            {report.missing.length > 0 && (
              <section className="flex flex-col gap-1.5">
                <h3 className="text-sm font-medium">No longer in the data ({report.missing.length})</h3>
                <p className="text-xs text-muted-foreground">
                  Checked or ignored in this file, but removed from the wiki data. They stay in the file in case they
                  come back, but count nowhere.
                </p>
                <ul className="flex flex-col gap-0.5 text-sm">
                  {report.missing.slice(0, SHOWN).map((m) => (
                    <li key={m.key}>
                      {m.name}{' '}
                      <span className="text-xs text-muted-foreground">({m.checked ? 'checked' : 'ignored'})</span>
                    </li>
                  ))}
                  {report.missing.length > SHOWN && (
                    <li className="text-xs text-muted-foreground">… and {report.missing.length - SHOWN} more</li>
                  )}
                </ul>
              </section>
            )}
            {report.added.length > 0 && (
              <section className="flex flex-col gap-1.5">
                <h3 className="text-sm font-medium">New items ({report.added.length})</h3>
                {items(report.added)}
              </section>
            )}
          </div>
        )}
        <DialogFooter>
          <Button onClick={close}>OK</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
