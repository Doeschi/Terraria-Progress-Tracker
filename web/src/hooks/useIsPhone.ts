import { useMediaQuery } from './useMediaQuery'

/** Phones (below 640 px width): the slim top bar, the compact list header and cards instead of
 * tables (REQUIREMENTS MO). */
export const useIsPhone = () => useMediaQuery('(max-width: 639px)')
