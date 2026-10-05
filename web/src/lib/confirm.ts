import type { ReactNode } from 'react'
import { create } from 'zustand'

export interface ConfirmOptions {
  title: string
  description?: ReactNode
  confirmLabel?: string
  destructive?: boolean
}

export interface Choice<T extends string = string> {
  id: T
  label: string
  destructive?: boolean
}

interface ConfirmState {
  options: (ConfirmOptions & { choices?: Choice[] }) | null
  /** 'ok' for the confirm button, the id of a choice, null for cancel */
  resolve: ((answer: string | null) => void) | null
}

export const useConfirmStore = create<ConfirmState>()(() => ({ options: null, resolve: null }))

/** Promise-based confirmation dialog: `if (await confirm({...})) ...` */
export function confirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => useConfirmStore.setState({ options, resolve: (answer) => resolve(answer === 'ok') }))
}

/** The same dialog with several answers instead of one confirm button; null when cancelled. */
export function choose<T extends string>(
  options: Omit<ConfirmOptions, 'confirmLabel' | 'destructive'>,
  choices: Choice<T>[],
): Promise<T | null> {
  return new Promise((resolve) =>
    useConfirmStore.setState({ options: { ...options, choices }, resolve: (answer) => resolve(answer as T | null) }),
  )
}
