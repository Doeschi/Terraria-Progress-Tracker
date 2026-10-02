import { create } from 'zustand'

// Completion easter eggs (G8): what the active playthrough has completed - set by
// useProgressEggs, read by the header (gold star on "Bestiary", golden tree logo) and the
// playthrough menu ("Watch the credits again") - and whether the end credits are showing.

export const useTrophies = create<{
  /** all items obtained */
  items: boolean
  /** all bestiary entries unlocked */
  bestiary: boolean
  /** both (without a bestiary in the game version: the items alone) */
  all: boolean
}>()(() => ({ items: false, bestiary: false, all: false }))

export const useEndCredits = create<{ open: boolean; show(): void; close(): void }>()((set) => ({
  open: false,
  show: () => set({ open: true }),
  close: () => set({ open: false }),
}))
