const ICON_PX = 96

/**
 * Load any browser-renderable image (data URL or object URL, PNG/JPEG/SVG…)
 * and return a square PNG data URL, center-cropped and scaled to 96px, so a
 * multi-megabyte upload or generated image fits comfortably in localStorage.
 */
export function downscaleImage(src: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const side = Math.min(img.naturalWidth || ICON_PX, img.naturalHeight || ICON_PX)
      const sx = ((img.naturalWidth || side) - side) / 2
      const sy = ((img.naturalHeight || side) - side) / 2
      const canvas = document.createElement("canvas")
      canvas.width = ICON_PX
      canvas.height = ICON_PX
      const ctx = canvas.getContext("2d")
      if (!ctx) { reject(new Error("Canvas unavailable")); return }
      ctx.imageSmoothingQuality = "high"
      ctx.drawImage(img, sx, sy, side, side, 0, 0, ICON_PX, ICON_PX)
      resolve(canvas.toDataURL("image/png"))
    }
    img.onerror = () => reject(new Error("Could not read that image"))
    img.src = src
  })
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error("Could not read that file"))
    reader.readAsDataURL(file)
  })
}
