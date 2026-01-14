/// <reference types="vite/client" />

interface FileSystemDirectoryHandle {
    values(): AsyncIterableIterator<FileSystemHandle>;
    queryPermission(descriptor: { mode: 'read' | 'readwrite' }): Promise<'granted' | 'denied' | 'prompt'>;
}

interface Window {
    showDirectoryPicker(options?: { mode: 'read' | 'readwrite' }): Promise<FileSystemDirectoryHandle>;
}
