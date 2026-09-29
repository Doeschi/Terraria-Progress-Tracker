import { create } from 'zustand'

// Which dialog is open. Kept separate from the data store.

/** part of the sync dialog to show first */
export type SyncSection = 'items' | 'bestiary'

export type DialogState =
  | { type: 'none' }
  | { type: 'newPlaythrough' }
  /** thenSync: part of attaching a new world - the sync dialog follows when it closes;
   * returnTo: opened from another dialog ("Manage areas…") - it opens again when this closes */
  | { type: 'areas'; thenSync?: boolean; returnTo?: DialogState }
  | { type: 'sync'; section?: SyncSection }
  | { type: 'chestSearch'; itemKey?: string }

interface UiState {
  dialog: DialogState
  /** item shown in the detail panel (independent of dialogs, e.g. chest search opens on top) */
  detailKey: string | null
  /** items shown before in the detail panel (last = previous); cleared when it closes */
  detailHistory: string[]
  /** a world file is being read (shared by every place that loads worlds) */
  worldLoading: boolean
  open(d: DialogState): void
  close(): void
  openDetail(key: string): void
  /** show the previous item again */
  detailBack(): void
  closeDetail(): void
}

export const useUi = create<UiState>()((set, get) => ({
  dialog: { type: 'none' },
  detailKey: null,
  detailHistory: [],
  worldLoading: false,
  open: (dialog) => set({ dialog }),
  close: () => set({ dialog: { type: 'none' } }),
  openDetail: (key) => {
    const { detailKey, detailHistory } = get()
    if (key === detailKey) return
    set({ detailKey: key, detailHistory: detailKey ? [...detailHistory, detailKey] : [] })
  },
  detailBack: () => {
    const history = get().detailHistory
    if (history.length) set({ detailKey: history[history.length - 1], detailHistory: history.slice(0, -1) })
  },
  closeDetail: () => set({ detailKey: null, detailHistory: [] }),
}))
