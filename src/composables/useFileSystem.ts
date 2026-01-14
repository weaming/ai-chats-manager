import { ref, readonly } from 'vue';
import { useEventBus } from './useEventBus';
import { get, set } from '../utils/indexedDB';
import { getSubDirectoryHandle, calculateHash, moveFile } from '../utils/fileSystemUtils';
import { migrateDataV2 } from './useDataMigration';
import { useConversationIO } from './useConversationIO';

// --- Interfaces for File System Entries and Conversation Data ---
export interface FileEntry {
  name: string;
  kind: 'file';
  handle: FileSystemFileHandle;
}

export interface DirectoryEntry {
  name: string;
  kind: 'directory';
  handle: FileSystemDirectoryHandle;
  children: FileSystemEntry[];
}

export type FileSystemEntry = FileEntry | DirectoryEntry;

// Represents a fully resolved conversation turn for display
export interface FullConversationTurn {
    question: string | null;
    answer: string; // Markdown content
}

// --- Composable ---

const rootHandle = ref<FileSystemDirectoryHandle | null>(null);
const emitter = useEventBus();

// --- Internal Helper Functions ---
// --- Internal Helper Functions removed (imported from utils) ---
// --- Migration Logic removed (imported from useDataMigration) ---


let resolveInitialization: () => void;
const initializationPromise = new Promise<void>(resolve => {
  resolveInitialization = resolve;
});

// --- Initialization on load ---
async function loadHandleFromIndexedDB() {
    try {
        const handle = await get('rootHandle');
        if (handle) {
            const options = { mode: 'readwrite' as const };
            if (await handle.queryPermission(options) === 'granted') {
                rootHandle.value = handle;
                await migrateDataV2(rootHandle.value); // Run migration after getting handle
                emitter.$emit('file-system-changed');
            } else {
                 console.warn("Permission for stored directory handle was not granted.");
            }
        }
    } catch (error) {
        console.error("Error loading directory handle from IndexedDB:", error);
    } finally {
        resolveInitialization(); // Resolve the promise whether it succeeded or failed
    }
}
loadHandleFromIndexedDB();


export function useFileSystem() {
  
  const conversationIO = useConversationIO(rootHandle, emitter);

  // --- Public API ---

  const findFileByPath = async (path: string): Promise<FileEntry | null> => {
    await initializationPromise; // Wait for initialization
    if (!rootHandle.value) {
      return null;
    }

    try {
      const chatsDirHandle = await getSubDirectoryHandle(rootHandle.value, 'chats');
      const pathParts = path.split('/').filter(p => p);
      const fileName = pathParts.pop();

      if (!fileName) {
        return null;
      }

      let currentDirHandle = chatsDirHandle;
      for (const part of pathParts) {
        currentDirHandle = await currentDirHandle.getDirectoryHandle(part);
      }

      const fileHandle = await currentDirHandle.getFileHandle(fileName);
      return { name: fileHandle.name, kind: 'file', handle: fileHandle };
    } catch (error) {
      console.error(`Error finding file by path "${path}":`, error);
      return null;
    }
  };

  const selectDirectory = async () => {
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      await set('rootHandle', handle); // Save handle to IndexedDB
      rootHandle.value = handle;
      emitter.$emit('file-system-changed');
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        console.error('选择目录时发生错误:', error);
      }
    }
  };

  const listDirectory = async (dirHandle?: FileSystemDirectoryHandle): Promise<FileSystemEntry[]> => {
    await initializationPromise;
    if (!rootHandle.value) return [];
    const targetHandle = dirHandle || await getSubDirectoryHandle(rootHandle.value, 'chats', { create: true });
    const entries: FileSystemEntry[] = [];


    try {
      for await (const entry of targetHandle.values()) {
        if (entry.kind === 'file' && entry.name.endsWith('.json')) {
          entries.push({ name: entry.name, kind: 'file', handle: entry as FileSystemFileHandle });
        } else if (entry.kind === 'directory') {
          const children = await listDirectory(entry as FileSystemDirectoryHandle);
          entries.push({ name: entry.name, kind: 'directory', handle: entry as FileSystemDirectoryHandle, children });
        }
      }
    } catch (error) {
      console.error(`Error listing directory "${targetHandle.name}":`, error);
      return [];
    }

    return entries.sort((a, b) => {
        if (a.kind === 'directory' && b.kind === 'file') {
            return -1;
        }
        if (a.kind === 'file' && b.kind === 'directory') {
            return 1;
        }
        if (a.kind === 'directory' && b.kind === 'directory') {
            return a.name.localeCompare(b.name);
        }
        // Both are files, sort by name descending (newest first)
        return b.name.localeCompare(a.name);
    });
  };

  const createDirectory = async (dirName: string, parentDirHandle?: FileSystemDirectoryHandle) => {
    if (!rootHandle.value) throw new Error("无法创建目录，因为未选择根目录。");
    const finalDirName = dirName.trim();
    if (!finalDirName) throw new Error("目录名称不能为空。");

    const parentHandle = parentDirHandle || await getSubDirectoryHandle(rootHandle.value, 'chats', { create: true });

    try {
        await parentHandle.getDirectoryHandle(finalDirName, { create: true });
        emitter.$emit('file-system-changed');
    } catch (error) {
        console.error(`创建目录 "${finalDirName}" 失败:`, error);
        throw new Error(`创建目录 "${finalDirName}" 失败。`);
    }
  };

  const deleteDirectory = async (dirHandle: FileSystemDirectoryHandle, parentDirHandle: FileSystemDirectoryHandle) => {
    if (!rootHandle.value) throw new Error("无法删除目录，因为未选择根目录。");
    
    for await (const entry of dirHandle.values()) {
        if (entry.kind === 'file') {
            await conversationIO.deleteConversation(entry as FileSystemFileHandle, dirHandle);
        } else if (entry.kind === 'directory') {
            await deleteDirectory(entry as FileSystemDirectoryHandle, dirHandle);
        }
    }
    await parentDirHandle.removeEntry(dirHandle.name);
    emitter.$emit('file-system-changed');
  };

  const renameDirectory = async (dirHandle: FileSystemDirectoryHandle, newName: string, parentDirHandle: FileSystemDirectoryHandle) => {
    if (!rootHandle.value) throw new Error("无法重命名，因为未选择根目录。");
    const finalNewName = newName.trim();
    if (!finalNewName || finalNewName === dirHandle.name) return;

    try {
        const newDirHandle = await parentDirHandle.getDirectoryHandle(finalNewName, { create: true });
        for await (const entry of dirHandle.values()) {
            if (entry.kind === 'file') {
                await moveFile(entry as FileSystemFileHandle, dirHandle, newDirHandle);
            } else if (entry.kind === 'directory') {
                await renameDirectory(entry as FileSystemDirectoryHandle, entry.name, newDirHandle);
            }
        }
        await parentDirHandle.removeEntry(dirHandle.name);
        emitter.$emit('file-system-changed');
    } catch (error) {
        console.error(`重命名目录 "${dirHandle.name}" 失败:`, error);
        throw new Error(`重命名目录 "${dirHandle.name}" 为 "${finalNewName}" 失败。`);
    }
  };

  const moveConversation = async (sourceName: string, sourceParentHandle: FileSystemDirectoryHandle, targetDirHandle: FileSystemDirectoryHandle) => {
    if (!rootHandle.value) throw new Error("无法移动，因为未选择根目录。");

    try {
      const sourceFileHandle = await sourceParentHandle.getFileHandle(sourceName);
      await moveFile(sourceFileHandle, sourceParentHandle, targetDirHandle);
      emitter.$emit('file-system-changed');
    } catch (error) {
      console.error(`移动文件 "${sourceName}" 失败:`, error);
      throw new Error(`移动文件 "${sourceName}" 失败。`);
    }
  };

  const findLatestFile = async (): Promise<{ entry: FileEntry, path: string } | null> => {
      await initializationPromise;
      if (!rootHandle.value) return null;

      let latestFile: { entry: FileEntry, path: string, time: number } | null = null;
      
      const scanDir = async (dirHandle: FileSystemDirectoryHandle, currentPath: string) => {
          for await (const entry of dirHandle.values()) {
              if (entry.kind === 'file' && entry.name.endsWith('.json')) {
                  const file = await (entry as FileSystemFileHandle).getFile();
                  if (!latestFile || file.lastModified > latestFile.time) {
                      latestFile = { 
                          entry: { name: entry.name, kind: 'file', handle: entry as FileSystemFileHandle },
                          path: currentPath ? `${currentPath}/${entry.name}` : entry.name,
                          time: file.lastModified
                      };
                  }
              } else if (entry.kind === 'directory') {
                   const subPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
                   await scanDir(entry as FileSystemDirectoryHandle, subPath);
              }
          }
      };

      try {
           const chatsDirHandle = await getSubDirectoryHandle(rootHandle.value, 'chats', { create: true });
           await scanDir(chatsDirHandle, '');
           if (latestFile) {
               // Verify type is not narrowed to never
               const found: { entry: FileEntry, path: string, time: number } = latestFile; 
               return { entry: found.entry, path: found.path };
           }
           return null;
      } catch (e) {
          console.error("Error finding latest file:", e);
          return null;
      }
  };

  return {
    rootHandle: readonly(rootHandle),
    selectDirectory,
    listDirectory,
    findLatestFile,
    createDirectory,
    deleteDirectory,
    renameDirectory,
    moveConversation,
    findFileByPath,
    ...conversationIO,
  };
}
