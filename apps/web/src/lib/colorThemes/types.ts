export interface TerminalColors {
  background: string
  foreground: string
  cursor: string
  selectionBackground: string
  black: string; red: string; green: string; yellow: string
  blue: string; magenta: string; cyan: string; white: string
  brightBlack: string; brightRed: string; brightGreen: string
  brightYellow: string; brightBlue: string; brightMagenta: string
  brightCyan: string; brightWhite: string
}

export interface ColorTheme {
  id: string
  name: string
  /** Preview colors: [background, sidebar, accent, foreground] */
  preview: [string, string, string, string]
  vars: Record<string, string>
  terminal: TerminalColors
  /** If true, this theme is designed for light mode */
  light?: boolean
}
