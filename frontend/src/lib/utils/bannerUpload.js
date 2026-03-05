const TARGET_BANNER_WIDTH = 1200
const TARGET_BANNER_HEIGHT = 500
const TARGET_BANNER_RATIO = TARGET_BANNER_WIDTH / TARGET_BANNER_HEIGHT
const MAX_BANNER_FILE_SIZE_BYTES = 2 * 1024 * 1024
const QUALITY_STEPS = [0.92, 0.86, 0.8, 0.74, 0.68, 0.62, 0.56, 0.5]

const createImageBitmapFromFile = (file) =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("Unable to read selected image"))
    }
    image.src = url
  })

const canvasToBlob = (canvas, mimeType, quality) =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Unable to optimize selected image"))
          return
        }
        resolve(blob)
      },
      mimeType,
      quality
    )
  })

const fileNameWithoutExtension = (name = "banner") => {
  const trimmed = String(name).trim()
  const lastDot = trimmed.lastIndexOf(".")
  if (lastDot <= 0) return trimmed || "banner"
  return trimmed.slice(0, lastDot)
}

const formatKb = (bytes) => `${Math.round(Number(bytes || 0) / 1024)}KB`

export const optimizeBannerForUpload = async (file) => {
  if (!file || !String(file.type || "").startsWith("image/")) {
    throw new Error("Please upload a valid image file (JPG/PNG)")
  }

  const image = await createImageBitmapFromFile(file)
  const originalWidth = image.naturalWidth || image.width || 0
  const originalHeight = image.naturalHeight || image.height || 0
  if (!originalWidth || !originalHeight) {
    throw new Error("Unable to read image dimensions")
  }

  const sourceRatio = originalWidth / originalHeight
  let sourceX = 0
  let sourceY = 0
  let sourceWidth = originalWidth
  let sourceHeight = originalHeight

  if (sourceRatio > TARGET_BANNER_RATIO) {
    sourceWidth = Math.round(originalHeight * TARGET_BANNER_RATIO)
    sourceX = Math.round((originalWidth - sourceWidth) / 2)
  } else if (sourceRatio < TARGET_BANNER_RATIO) {
    sourceHeight = Math.round(originalWidth / TARGET_BANNER_RATIO)
    sourceY = Math.round((originalHeight - sourceHeight) / 2)
  }

  const canvas = document.createElement("canvas")
  canvas.width = TARGET_BANNER_WIDTH
  canvas.height = TARGET_BANNER_HEIGHT
  const context = canvas.getContext("2d")
  if (!context) {
    throw new Error("Unable to process image in this browser")
  }

  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    TARGET_BANNER_WIDTH,
    TARGET_BANNER_HEIGHT
  )

  let optimizedBlob = null
  for (const quality of QUALITY_STEPS) {
    const candidate = await canvasToBlob(canvas, "image/jpeg", quality)
    optimizedBlob = candidate
    if (candidate.size <= MAX_BANNER_FILE_SIZE_BYTES) break
  }

  if (!optimizedBlob) {
    throw new Error("Unable to optimize selected image")
  }

  if (optimizedBlob.size > MAX_BANNER_FILE_SIZE_BYTES) {
    throw new Error("Unable to keep banner below 2MB. Please upload a lighter image.")
  }

  const outputFileName = `${fileNameWithoutExtension(file.name)}-banner.jpg`
  const optimizedFile = new File([optimizedBlob], outputFileName, {
    type: "image/jpeg",
    lastModified: Date.now(),
  })

  const previewUrl = URL.createObjectURL(optimizedFile)
  const sourceRatioLabel = sourceRatio.toFixed(2)
  const summary = `Auto-adjusted ${originalWidth}x${originalHeight} (${sourceRatioLabel}:1) -> ${TARGET_BANNER_WIDTH}x${TARGET_BANNER_HEIGHT} (2.4:1), ${formatKb(file.size)} -> ${formatKb(optimizedFile.size)}`

  return {
    file: optimizedFile,
    previewUrl,
    summary,
    original: {
      width: originalWidth,
      height: originalHeight,
      size: file.size,
      ratio: sourceRatio,
    },
    optimized: {
      width: TARGET_BANNER_WIDTH,
      height: TARGET_BANNER_HEIGHT,
      size: optimizedFile.size,
      ratio: TARGET_BANNER_RATIO,
    },
  }
}

export const BANNER_UPLOAD_SPEC = {
  width: TARGET_BANNER_WIDTH,
  height: TARGET_BANNER_HEIGHT,
  ratio: TARGET_BANNER_RATIO,
  maxFileSizeBytes: MAX_BANNER_FILE_SIZE_BYTES,
}
