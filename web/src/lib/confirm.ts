import { create } from 'zustand'

export interface ConfirmOptions {
  title: string
  description?: string
  confirmLabel?: string
  destructive?: boolean
}

interface ConfirmState {
  options: ConfirmOptions | null
  resolve: ((ok: boolean) => void) | null
}

export const useConfirmStore = create<ConfirmState>()(() => ({ options: null, resolve: null }))

/** Promise-based confirmation dialog: `if (await confirm({...})) ...` */
export function confirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => useConfirmStore.setState({ options, resolve }))
}
