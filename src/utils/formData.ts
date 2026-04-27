export function toFormData(payload: Record<string, unknown>) {
  const fd = new FormData()

  Object.entries(payload).forEach(([key, val]) => {
    if (val === null || val === undefined) return

    if (val instanceof File) {
      fd.append(key, val)
      return
    }

    if (typeof val === 'boolean') {
      fd.append(key, val ? 'true' : 'false')
      return
    }

    fd.append(key, String(val))
  })

  return fd
}