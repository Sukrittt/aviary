// Web-only. Mobile gets a base64 JPEG straight from expo-image-picker at
// quality 0.5; a browser hands over a File or a live <video> frame, so both
// go through a canvas to land in the same shape the scan route accepts.

// A phone photo can be 12MP, and the route caps the body at ~4.5MB. Capping
// the long edge keeps every bill well under that and still legible to the model.
const MAX_EDGE = 2000
const QUALITY = 0.7

/** Expense photos are just for looking back at, so they go smaller than a bill the model has to read. */
export const PHOTO_ENCODING = { maxEdge: 1280, quality: 0.8 }

function encode(source: CanvasImageSource, width: number, height: number, { maxEdge = MAX_EDGE, quality = QUALITY } = {}): string {
  const scale = Math.min(1, maxEdge / Math.max(width, height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas unavailable')
  // JPEG has no alpha: a transparent screenshot would otherwise encode black.
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', quality)
}

/** A data URL: shown as the bill preview during review, and the base64 after its comma is what gets sent. */
export async function dataUrlFromFile(file: File, opts?: { maxEdge: number; quality: number }): Promise<string> {
  const bitmap = await createImageBitmap(file)
  try {
    return encode(bitmap, bitmap.width, bitmap.height, opts)
  } finally {
    bitmap.close()
  }
}

export function dataUrlFromVideo(video: HTMLVideoElement): string {
  return encode(video, video.videoWidth, video.videoHeight)
}

export function base64Of(dataUrl: string): string {
  return dataUrl.slice(dataUrl.indexOf(',') + 1)
}
