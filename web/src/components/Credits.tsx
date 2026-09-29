import { Scale, Sparkles } from 'lucide-react'

/** Data source, license and trademark note. `withIcon`: as a block with icon (start page). */
export function Credits({ withIcon = false }: { withIcon?: boolean }) {
  const text = (
    <>
      Item data and icons from the{' '}
      <a
        className="underline underline-offset-2 hover:text-foreground"
        href="https://terraria.wiki.gg/"
        target="_blank"
        rel="noreferrer"
      >
        Terraria Wiki
      </a>
      , licensed under{' '}
      <a
        className="underline underline-offset-2 hover:text-foreground"
        href="https://creativecommons.org/licenses/by-nc-sa/4.0/"
        target="_blank"
        rel="noreferrer"
      >
        CC BY-NC-SA 4.0
      </a>
      . Terraria is a trademark of Re-Logic; this is an unofficial fan project.
    </>
  )
  if (!withIcon) return <p className="text-xs text-muted-foreground">{text}</p>
  return (
    <p className="flex items-center gap-2 text-xs text-muted-foreground">
      <Scale className="size-4 shrink-0" />
      <span>{text}</span>
    </p>
  )
}

/** Note that the app was built with AI assistance (start page). */
export function AiNotice() {
  return (
    <p className="flex items-center gap-2 text-xs text-muted-foreground">
      <Sparkles className="size-4 shrink-0" />
      <span>
        This web app was built with the help of AI (Claude by Anthropic). Mistakes are possible – if something looks
        wrong, check the Terraria Wiki.
      </span>
    </p>
  )
}
