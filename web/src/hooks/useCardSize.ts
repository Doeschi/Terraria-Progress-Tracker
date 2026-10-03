import { usePrefs } from '@/lib/prefs'

// The cards on phones (MO3, MO5) follow the density setting like the table: comfortable cards are
// taller with a bigger icon, compact ones fit more items on the screen.

const SIZES = {
  comfortable: { height: 60, icon: 32, name: 'text-sm', line: 'text-xs' },
  compact: { height: 48, icon: 24, name: 'text-[13px]', line: 'text-[11px]' },
} as const

export type CardSize = (typeof SIZES)[keyof typeof SIZES]

export function useCardSize(): CardSize {
  return SIZES[usePrefs((s) => s.layout.density)]
}
