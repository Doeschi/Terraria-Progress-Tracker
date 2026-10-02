// Widths in px of the resizable side panes (ResizablePane): limits and default.

export interface PaneLimits {
  min: number
  max: number
  /** the default width */
  initial: number
}

export const SIDEBAR_WIDTH: PaneLimits = { min: 260, max: 560, initial: 352 }
export const DETAIL_WIDTH: PaneLimits = { min: 320, max: 760, initial: 448 }
