/** A row of the detail panel that opens another card (an item, NPC or source): the whole row is
 * clickable, not only its name. Not when text in it was selected (copying a chance stays
 * possible) or the click was on a link or button of its own (wiki link, the name). */
export function cardRow(onOpen: (() => void) | undefined): {
  onClick?: (e: React.MouseEvent) => void
  className?: string
} {
  if (!onOpen) return {}
  return {
    onClick: (e) => {
      if ((e.target as HTMLElement).closest('a, button')) return
      if (window.getSelection()?.toString()) return
      onOpen()
    },
    className: 'cursor-pointer hover:bg-muted/50',
  }
}
