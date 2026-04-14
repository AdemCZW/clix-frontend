/**
 * 圖片壓縮工具 — 壓縮但保持高畫質
 * 最大寬度 1920px，JPEG 品質 85%，PNG 保持原格式
 */
export async function compressImage(
  file: File,
  maxWidth = 1920,
  quality = 0.85
): Promise<File> {
  // 小於 500KB 不壓縮
  if (file.size < 500 * 1024) return file

  // 非圖片不處理
  if (!file.type.startsWith('image/')) return file

  // GIF 不壓縮（會失去動畫）
  if (file.type === 'image/gif') return file

  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      let { width, height } = img

      // 如果寬度不超過 maxWidth 且檔案小於 2MB，不壓縮
      if (width <= maxWidth && file.size < 2 * 1024 * 1024) {
        resolve(file)
        return
      }

      // 等比縮放
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width)
        width = maxWidth
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, width, height)

      // PNG 保持 PNG，其他轉 JPEG
      const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
      const outputQuality = file.type === 'image/png' ? undefined : quality

      canvas.toBlob(
        (blob) => {
          if (!blob || blob.size >= file.size) {
            // 壓縮後反而更大，用原檔
            resolve(file)
            return
          }
          const compressed = new File([blob], file.name, {
            type: outputType,
            lastModified: Date.now(),
          })
          resolve(compressed)
        },
        outputType,
        outputQuality
      )
    }
    img.onerror = () => resolve(file) // 失敗時用原檔
    img.src = URL.createObjectURL(file)
  })
}
