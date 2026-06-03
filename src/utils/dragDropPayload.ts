interface FileDragPayload {
  name: string
  kind: 'file'
}

export function parseFileDragPayload(dataTransfer: DataTransfer | null): FileDragPayload | null {
  if (!dataTransfer) {
    return null
  }

  const rawPayload = dataTransfer.getData('text/plain')
  if (!rawPayload) {
    return null
  }

  try {
    const payload = JSON.parse(rawPayload)
    if (payload?.kind !== 'file' || typeof payload.name !== 'string' || !payload.name.trim()) {
      return null
    }

    return {
      name: payload.name,
      kind: 'file',
    }
  } catch {
    return null
  }
}
