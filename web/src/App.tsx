import { useEffect } from 'react'
import { Loader2, Plus } from 'lucide-react'
import { useActivePlaythrough, useStore } from '@/store'
import { useUi } from '@/ui'
import { useTrackerView } from '@/hooks/useTrackerView'
import { Button } from '@/components/ui/button'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ConfirmDialogHost } from '@/components/ConfirmDialog'
import { AboutLink } from '@/components/About'
import { BestiaryFilterSidebar, FilterSidebar } from '@/components/FilterSidebar'
import { BestiaryList } from '@/components/BestiaryList'
import { useBestiaryView } from '@/hooks/useBestiaryView'
import { useAutosave } from '@/hooks/useAutosave'
import { ItemList } from '@/components/ItemList'
import { ItemDetailPanel, ItemDetailSheet } from '@/components/ItemDetail'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { TopBar } from '@/components/TopBar'
import { WelcomeScreen } from '@/components/WelcomeScreen'
import { AreasDialog } from '@/components/dialogs/AreasDialog'
import { ChestSearchDialog } from '@/components/dialogs/ChestSearchDialog'
import { PlaythroughDialog } from '@/components/dialogs/PlaythroughDialog'
import { SyncDialog } from '@/components/dialogs/SyncDialog'

export default function App() {
  const data = useStore((s) => s.data)
  const dataError = useStore((s) => s.dataError)
  const hasDoc = useStore((s) => !!s.doc)
  const loadData = useStore((s) => s.loadData)

  useEffect(() => {
    void loadData()
  }, [loadData])

  // warn before leaving with unsaved changes
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (useStore.getState().dirty) e.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  let content: React.ReactNode
  if (dataError) content = <CenteredMessage>Could not load the item data: {dataError}</CenteredMessage>
  else if (!data)
    content = (
      <CenteredMessage>
        <Loader2 className="size-5 animate-spin" /> Loading item data…
      </CenteredMessage>
    )
  else if (!hasDoc) content = <WelcomeScreen />
  else content = <Tracker />

  return (
    <TooltipProvider delayDuration={400}>
      {content}
      <PlaythroughDialog />
      <AreasDialog />
      <SyncDialog />
      <ChestSearchDialog />
      <ConfirmDialogHost />
      <Toaster position="bottom-right" />
    </TooltipProvider>
  )
}

function BestiaryScreen() {
  const view = useBestiaryView()
  return (
    <div className="flex min-h-0 flex-1">
      <aside className="hidden w-[22rem] shrink-0 flex-col overflow-y-auto border-r bg-sidebar md:flex">
        <BestiaryFilterSidebar facets={view.facets} groupTallies={view.groupTallies} available={view.available} />
        <div className="mt-auto p-4">
          <AboutLink />
        </div>
      </aside>
      <main className="min-w-0 flex-1">
        <BestiaryList view={view} />
      </main>
    </div>
  )
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-svh items-center justify-center gap-2 p-4 text-muted-foreground">{children}</div>
}

function Tracker() {
  useAutosave()
  const pt = useActivePlaythrough()
  const view = useTrackerView()
  const openDialog = useUi((s) => s.open)
  // wide screens: details docked right of the table; narrow: as overlay
  const docked = useMediaQuery('(min-width: 1024px)')
  const mode = useStore((s) => s.mode)

  return (
    <div className="flex h-svh flex-col">
      <TopBar view={view} />
      {pt && view && mode === 'bestiary' ? (
        <BestiaryScreen />
      ) : pt && view ? (
        <div className="flex min-h-0 flex-1">
          <aside className="hidden w-[22rem] shrink-0 flex-col overflow-y-auto border-r bg-sidebar md:flex">
            <FilterSidebar facets={view.facets} groupTallies={view.groupTallies} available={view.available} />
            <div className="mt-auto p-4">
              <AboutLink />
            </div>
          </aside>
          <main className="flex min-w-0 flex-1">
            <div className="min-w-0 flex-1">
              <ItemList view={view} />
            </div>
            {docked && <ItemDetailPanel />}
          </main>
          {!docked && <ItemDetailSheet />}
        </div>
      ) : (
        <div className="grid flex-1 place-items-center p-4">
          <div className="flex max-w-sm flex-col items-center gap-3 text-center">
            <h2 className="text-lg font-semibold">No playthrough yet</h2>
            <p className="text-sm text-muted-foreground">
              A tracking file can hold several playthroughs, each with its own platform and progress.
            </p>
            <Button onClick={() => openDialog({ type: 'newPlaythrough' })}>
              <Plus /> Create playthrough
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
