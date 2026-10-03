// Terraria rarity colors (https://terraria.wiki.gg/wiki/Rarity)
export const RARITIES: Record<number, { name: string; color: string }> = {
  [-13]: { name: 'Master', color: '#ff9600' },
  [-12]: { name: 'Expert', color: 'conic-gradient(#ff5050, #ffdc50, #50ff78, #50c8ff, #b450ff, #ff5050)' },
  [-11]: { name: 'Quest', color: '#ffaf00' },
  [-1]: { name: 'Gray', color: '#828282' },
  0: { name: 'White', color: '#e6e6e6' },
  1: { name: 'Blue', color: '#9696ff' },
  2: { name: 'Green', color: '#96ff96' },
  3: { name: 'Orange', color: '#ffc896' },
  4: { name: 'Light Red', color: '#ff9696' },
  5: { name: 'Pink', color: '#ff96ff' },
  6: { name: 'Light Purple', color: '#d2a0ff' },
  7: { name: 'Lime', color: '#96ff0a' },
  8: { name: 'Yellow', color: '#ffff0a' },
  9: { name: 'Cyan', color: '#05c8ff' },
  10: { name: 'Red', color: '#ff2864' },
  11: { name: 'Purple', color: '#b428ff' },
}

// ------------------------------------------------------------ tooltip icons

/** Platform icons in item tooltips: "{icon:playstation}" markers (pipeline: TOOLTIP_ICONS), the
 * files in public/icons/platforms/. Black logos are inverted in dark mode. */
export const TOOLTIP_ICONS: Record<string, { file: string; name: string; invert?: boolean; pixel?: boolean }> = {
  desktop: { file: 'desktop.png', name: 'Desktop', pixel: true },
  console: { file: 'console.png', name: 'Console', pixel: true },
  mobile: { file: 'mobile.png', name: 'Mobile', pixel: true },
  playstation: { file: 'playstation.svg', name: 'PlayStation', invert: true },
  'xbox-one': { file: 'xbox-one.svg', name: 'Xbox One' },
  xbox: { file: 'xbox.svg', name: 'Xbox' },
  switch: { file: 'switch.svg', name: 'Nintendo Switch' },
  '3ds': { file: '3ds.svg', name: 'Nintendo 3DS', invert: true },
  wiiu: { file: 'wiiu.png', name: 'Wii U' },
}
const ICON_MARKER = /\{icon:([a-z0-9-]+)\}/g

/** The tooltip as plain text (table column, sorting): the icons by name. */
export const tooltipPlain = (text?: string) =>
  text?.replace(ICON_MARKER, (_, id: string) => TOOLTIP_ICONS[id]?.name ?? '')
