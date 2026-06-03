export async function getSubDirectoryHandle(
  parentHandle: FileSystemDirectoryHandle,
  dirName: string,
  options?: { create?: boolean },
): Promise<FileSystemDirectoryHandle> {
  return parentHandle.getDirectoryHandle(dirName, options)
}

export async function fileExists(
  dirHandle: FileSystemDirectoryHandle,
  fileName: string,
): Promise<boolean> {
  try {
    await dirHandle.getFileHandle(fileName)
    return true
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') {
      return false
    }
    throw error
  }
}

export async function directoryExists(
  dirHandle: FileSystemDirectoryHandle,
  dirName: string,
): Promise<boolean> {
  try {
    await dirHandle.getDirectoryHandle(dirName)
    return true
  } catch (error) {
    if (error instanceof DOMException && error.name === 'NotFoundError') {
      return false
    }
    throw error
  }
}

export async function calculateHash(text: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(text)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function moveFile(
  fileHandle: FileSystemFileHandle,
  fromDirHandle: FileSystemDirectoryHandle,
  toDirHandle: FileSystemDirectoryHandle,
): Promise<FileSystemFileHandle> {
  if (await fileExists(toDirHandle, fileHandle.name)) {
    throw new Error(`目标位置已存在文件 "${fileHandle.name}"。`)
  }

  const file = await fileHandle.getFile()
  const content = await file.text()
  const newFileHandle = await toDirHandle.getFileHandle(file.name, { create: true })
  const writable = await newFileHandle.createWritable()
  await writable.write(content)
  await writable.close()
  await fromDirHandle.removeEntry(file.name)
  return newFileHandle
}
