import { useIntro } from '@/lib/intros'
import { CollapsibleSection } from './RecipeSections'

/** The introduction of the wiki page of an item or bestiary entry: the text before the page's
 * first heading (ID4, ND6). A page of several items (Paintings, an armor set) is about all of
 * them - the heading names the page. */
export function IntroSection({ page, name, url }: { page: string; name: string; url: string }) {
  const blocks = useIntro(page)
  if (!blocks) return null
  return (
    <CollapsibleSection id="about" title={page === name ? 'About' : `About ${page}`}>
      <div className="flex flex-col gap-2 text-sm">
        {blocks.map((block, n) =>
          typeof block === 'string' ? (
            <p key={n}>{block}</p>
          ) : (
            <ul key={n} className="flex list-disc flex-col gap-0.5 pl-5">
              {block.map((entry, i) => (
                <li key={i}>{entry}</li>
              ))}
            </ul>
          ),
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        From the{' '}
        <a className="underline underline-offset-2 hover:text-foreground" href={url} target="_blank" rel="noreferrer">
          Terraria Wiki
        </a>
      </p>
    </CollapsibleSection>
  )
}
