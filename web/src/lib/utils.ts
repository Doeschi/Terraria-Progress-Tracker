export { cn } from 'cn'

/** A touch screen (coarse pointer): bigger targets, 16 px inputs, no automatic focus (MO6). */
export const isTouchScreen = () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
