import { useStore } from '@/store'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

// "About": data source, licenses, trademark note, libraries and the AI notice in one place.
// Opened from the ⚙ menu (About…) and from the sidebar's "License & credits".

const REPO = 'https://github.com/Doeschi/Terraria-Progress-Tracker'

const LIBRARIES: { name: string; url: string; what: string }[] = [
  {
    name: 'terraria-world-file',
    url: 'https://github.com/cokolele/terraria-world-file-ts',
    what: 'reading world files',
  },
  { name: 'React', url: 'https://react.dev/', what: 'user interface' },
  { name: 'TanStack Table & Virtual', url: 'https://tanstack.com/', what: 'the item table' },
  { name: 'Zustand', url: 'https://github.com/pmndrs/zustand', what: 'app state' },
  { name: 'Fuse.js', url: 'https://www.fusejs.io/', what: 'fuzzy search' },
  { name: 'Zod', url: 'https://zod.dev/', what: 'checking progress files' },
  {
    name: 'browser-fs-access',
    url: 'https://github.com/GoogleChromeLabs/browser-fs-access',
    what: 'opening and saving files',
  },
  { name: 'idb-keyval', url: 'https://github.com/jakearchibald/idb-keyval', what: 'remembering the last file' },
  { name: 'shadcn/ui, Radix UI, Tailwind CSS', url: 'https://ui.shadcn.com/', what: 'components and styling' },
  { name: 'Lucide', url: 'https://lucide.dev/', what: 'icons' },
  { name: 'Sonner', url: 'https://sonner.emilkowal.ski/', what: 'notifications' },
]

function A({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a className="underline underline-offset-2 hover:text-foreground" href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  )
}

function Part({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1">
      <h3 className="text-xs font-semibold tracking-wide text-foreground uppercase">{title}</h3>
      <div className="text-sm text-muted-foreground">{children}</div>
    </section>
  )
}

/** The About dialog; `children` is its trigger (a button or a link-like text), or it is opened
 * from outside with `open` / `onOpenChange` (the ⚙ menu). */
export function AboutDialog({
  children,
  open,
  onOpenChange,
}: {
  children?: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {children && <DialogTrigger asChild>{children}</DialogTrigger>}
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>About Terraria Progress Tracker</DialogTitle>
          <DialogDescription>
            Your progress on items and bestiary entries, per playthrough. Everything runs in your browser; progress and
            game files are never uploaded – except the progress file to your own Google Drive, if you choose to save it
            there.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Part title="Data and icons">
            Item, recipe, drop, shop and bestiary data, the "About" texts and all icons come from the{' '}
            <A href="https://terraria.wiki.gg/">Terraria Wiki</A> and are licensed under{' '}
            <A href="https://creativecommons.org/licenses/by-nc-sa/4.0/">CC BY-NC-SA 4.0</A>. This also applies to the
            generated data files and the icon sprite sheets of this app.
            <DataVersion />
          </Part>
          <Part title="Code">
            The source code is on <A href={REPO}>GitHub</A> under the{' '}
            <A href={`${REPO}/blob/main/LICENSE`}>MIT License</A>. How the data is built is explained in the{' '}
            <A href={`${REPO}#how-the-data-is-built`}>README</A>.
          </Part>
          <Part title="Trademark">
            Terraria is a trademark of Re-Logic. This is an unofficial fan project, not affiliated with or endorsed by
            Re-Logic.
          </Part>
          <Part title="Built with">
            <ul className="flex flex-col gap-0.5">
              {LIBRARIES.map((l) => (
                <li key={l.name}>
                  <A href={l.url}>{l.name}</A> – {l.what}
                </li>
              ))}
            </ul>
          </Part>
          <Part title="AI notice">
            This web app was built with the help of AI (Claude by Anthropic). Mistakes are possible – if something looks
            wrong, check the Terraria Wiki.
          </Part>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** The version of the item data (DU3): when it was downloaded, the newest game version in it. */
function DataVersion() {
  const meta = useStore((s) => s.data?.meta)
  if (!meta?.dataVersion) return null
  return (
    <span className="mt-1 block text-xs text-muted-foreground">
      Item data: downloaded {meta.dataVersion}, game version {meta.gameVersion}.
    </span>
  )
}

/** One line at the bottom of the filter sidebar. */
export function AboutLink() {
  return (
    <p className="text-xs text-muted-foreground">
      Data and icons from the Terraria Wiki (CC BY-NC-SA 4.0) · unofficial fan project ·{' '}
      <AboutDialog>
        <button className="underline underline-offset-2 hover:text-foreground">License & credits</button>
      </AboutDialog>
    </p>
  )
}
