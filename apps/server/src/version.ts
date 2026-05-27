declare const __PKG_VERSION__: string
export const SERVER_VERSION = typeof __PKG_VERSION__ !== "undefined" ? __PKG_VERSION__ : "dev"
