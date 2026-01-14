import { ref, readonly } from 'vue';
import { useEventBus } from './useEventBus';
import { get, set } from '../utils/indexedDB';

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
async function getSubDirectoryHandle(parentHandle: FileSystemDirectoryHandle, dirName: string, options?: { create?: boolean }): Promise<FileSystemDirectoryHandle> {
    return parentHandle.getDirectoryHandle(dirName, options);
}

async function calculateHash(text: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function moveFile(fileHandle: FileSystemFileHandle, fromDirHandle: FileSystemDirectoryHandle, toDirHandle: FileSystemDirectoryHandle) {
    const file = await fileHandle.getFile();
    const content = await file.text();
    const newFileHandle = await toDirHandle.getFileHandle(file.name, { create: true });
    const writable = await newFileHandle.createWritable();
    await writable.write(content);
    await writable.close();
    await fromDirHandle.removeEntry(file.name);
}

// --- Migration Logic ---
async function migrateDataV2() {
    const MIGRATION_FLAG = 'dataMigrationV2Done';
    if (localStorage.getItem(MIGRATION_FLAG) === 'true' || !rootHandle.value) {
        return;
    }

    console.log("开始V2数据迁移 (修复JSON和Markdown文件名)...");
    try {
        const chatsDirHandle = await getSubDirectoryHandle(rootHandle.value, 'chats', { create: true });
        const markdownDirHandle = await getSubDirectoryHandle(rootHandle.value, 'markdown', { create: true });
        const legacyAnswerIdRegex = /^\d+-[a-f0-9]{8}$/;

        const processJsonFile = async (fileHandle: FileSystemFileHandle) => {
            let chatData;
            try {
                const file = await fileHandle.getFile();
                chatData = JSON.parse(await file.text());
            } catch (e) {
                console.error(`迁移: 解析JSON文件失败: ${fileHandle.name}`, e);
                return;
            }
            
            let wasModified = false;
            const markdownFiles = new Map();
            for await (const entry of markdownDirHandle.values()) {
                if (entry.kind === 'file') {
                    markdownFiles.set(entry.name, entry);
                }
            }

            for (const turn of chatData) {
                if (turn.answer_id && legacyAnswerIdRegex.test(turn.answer_id)) {
                    const idPrefix = `${turn.answer_id.split('-')[0]}-`;
                    
                    // Find the markdown file by its prefix
                    let oldMarkdownHandle;
                    let oldMarkdownName;
                    for (const [name, handle] of markdownFiles.entries()) {
                        if (name.startsWith(idPrefix)) {
                            oldMarkdownHandle = handle;
                            oldMarkdownName = name;
                            break;
                        }
                    }

                    if (!oldMarkdownHandle) {
                        console.warn(`  -> 找不到与ID前缀 "${idPrefix}" 匹配的 Markdown 文件。`);
                        continue;
                    }

                    try {
                        const content = await (await oldMarkdownHandle.getFile()).text();
                        const newHash = await calculateHash(content);
                        const newAnswerId = `${idPrefix}${newHash}`;
                        const newMarkdownName = `${newAnswerId}.md`;

                        if (newMarkdownName !== oldMarkdownName) {
                            const newFileHandle = await markdownDirHandle.getFileHandle(newMarkdownName, { create: true });
                            const writable = await newFileHandle.createWritable();
                            await writable.write(content);
                            await writable.close();
                            await markdownDirHandle.removeEntry(oldMarkdownName);
                            markdownFiles.delete(oldMarkdownName); // Update our map
                            markdownFiles.set(newMarkdownName, newFileHandle);
                        }
                        
                        turn.answer_id = newAnswerId;
                        wasModified = true;
                        console.log(`  迁移: ${fileHandle.name} 中的引用 ${oldMarkdownName} -> ${newMarkdownName}`);

                    } catch (e) {
                        console.error(`  -> 处理 Markdown 文件 "${oldMarkdownName}" 时出错:`, e);
                    }
                }
            }

            if (wasModified) {
                console.log(`  -> 正在更新 JSON 文件: ${fileHandle.name}`);
                const writable = await fileHandle.createWritable();
                await writable.write(JSON.stringify(chatData, null, 2));
                await writable.close();
            }
        };

        const traverse = async (dirHandle: FileSystemDirectoryHandle) => {
            for await (const entry of dirHandle.values()) {
                if (entry.kind === 'file' && entry.name.endsWith('.json')) {
                    await processJsonFile(entry);
                } else if (entry.kind === 'directory') {
                    await traverse(entry);
                }
            }
        };

        await traverse(chatsDirHandle);
        localStorage.setItem(MIGRATION_FLAG, 'true');
        console.log("数据迁移完成。");

    } catch (error) {
        console.error("数据迁移过程中发生错误:", error);
    }
}


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
                await migrateDataV2(); // Run migration after getting handle
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
          entries.push({ name: entry.name, kind: 'file', handle: entry });
        } else if (entry.kind === 'directory') {
          const children = await listDirectory(entry);
          entries.push({ name: entry.name, kind: 'directory', handle: entry, children });
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
  
  const readConversation = async (chatFileHandle: FileSystemFileHandle): Promise<FullConversationTurn[]> => {
    if (!rootHandle.value) throw new Error("无法读取对话，因为未选择根目录。");

    try {
        const jsonFile = await chatFileHandle.getFile();
        const chatData = JSON.parse(await jsonFile.text());
        if (!Array.isArray(chatData)) throw new Error("对话文件格式不正确，应为JSON数组。");

        const markdownDirHandle = await getSubDirectoryHandle(rootHandle.value, 'markdown', { create: true });
        return Promise.all(
            chatData.map(async (turn: { question: string | null; answer_id: string }) => {
                const markdownFileName = `${turn.answer_id}.md`;
                try {
                    const markdownFileHandle = await markdownDirHandle.getFileHandle(markdownFileName);
                    const markdownFile = await markdownFileHandle.getFile();
                    return { question: turn.question, answer: await markdownFile.text() };
                } catch (fileError) {
                    console.error(`无法读取 Markdown 文件: ${markdownFileName}`, fileError);
                    return { question: turn.question, answer: `**错误：** 无法加载ID为 \`${turn.answer_id}\` 的内容。` };
                }
            })
        );
    } catch (error) {
        console.error(`读取对话失败: ${chatFileHandle.name}`, error);
        throw new Error(`读取对话 "${chatFileHandle.name}" 时发生错误。`);
    }
  };

  const saveConversation = async (conversationTurns: { question: string | null; answer: string }[]): Promise<FileEntry | null> => {
    if (!rootHandle.value) {
      alert('请先选择一个用于保存对话的根目录。');
      await selectDirectory();
      if (!rootHandle.value) return null;
    }
    try {
      const chatsDirHandle = await getSubDirectoryHandle(rootHandle.value, 'chats', { create: true });
      const markdownDirHandle = await getSubDirectoryHandle(rootHandle.value, 'markdown', { create: true });

      const conversationJson = [];
      for (const [index, turn] of conversationTurns.entries()) {
        const contentHash = await calculateHash(turn.answer);
        const answerId = `${index + 1}-${contentHash}`;
        const markdownFileName = `${answerId}.md`;

        const markdownFileHandle = await markdownDirHandle.getFileHandle(markdownFileName, { create: true });
        const writable = await markdownFileHandle.createWritable();
        await writable.write(turn.answer);
        await writable.close();
        conversationJson.push({ question: turn.question, answer_id: answerId });
      }

      const date = new Date();
      const year = date.getFullYear();
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      const timestamp = `${year}${month}${day}-${hours}${minutes}`;

      const uuid = crypto.randomUUID();
      const jsonFileName = `${timestamp}-${uuid}.json`;
      const jsonFileHandle = await chatsDirHandle.getFileHandle(jsonFileName, { create: true });
      const writable = await jsonFileHandle.createWritable();
      await writable.write(JSON.stringify(conversationJson, null, 2));
      await writable.close();
      
      emitter.$emit('file-system-changed');
      return { name: jsonFileHandle.name, kind: 'file', handle: jsonFileHandle };

    } catch (error) {
      console.error('保存对话时出错:', error);
      alert('保存对话失败，请查看控制台获取更多信息。');
      return null;
    }
  };

  const deleteConversation = async (chatFileHandle: FileSystemFileHandle, parentDirHandle: FileSystemDirectoryHandle) => {
    if (!rootHandle.value) throw new Error("无法删除对话，因为未选择根目录。");

    try {
        const jsonFile = await chatFileHandle.getFile();
        const chatData = JSON.parse(await jsonFile.text());

        const markdownDirHandle = await getSubDirectoryHandle(rootHandle.value, 'markdown');
        if (markdownDirHandle && Array.isArray(chatData)) {
            for (const turn of chatData) {
                try {
                    await markdownDirHandle.removeEntry(`${turn.answer_id}.md`);
                } catch (e) {
                    console.warn(`无法删除 Markdown 文件 ${turn.answer_id}.md (可能已被删除):`, e);
                }
            }
        }
        await parentDirHandle.removeEntry(chatFileHandle.name);
        emitter.$emit('file-system-changed');
    } catch (error) {
        console.error(`删除对话失败: ${chatFileHandle.name}`, error);
        throw new Error(`删除对话 "${chatFileHandle.name}" 时发生错误。`);
    }
  };

  const renameConversation = async (fileHandle: FileSystemFileHandle, newName: string, parentDirHandle: FileSystemDirectoryHandle) => {
    if (!rootHandle.value) throw new Error("无法重命名，因为未选择根目录。");

    let finalNewName = newName.trim();
    if (!finalNewName) throw new Error("新名称不能为空。");
    if (!finalNewName.endsWith('.json')) {
        finalNewName += '.json';
    }

    if (finalNewName === fileHandle.name) return;

    try {
        const oldFile = await fileHandle.getFile();
        const content = await oldFile.text();

        const newFileHandle = await parentDirHandle.getFileHandle(finalNewName, { create: true });
        const writable = await newFileHandle.createWritable();
        await writable.write(content);
        await writable.close();

        await parentDirHandle.removeEntry(fileHandle.name);
        emitter.$emit('file-system-changed');
    } catch (error) {
        console.error(`重命名失败: ${fileHandle.name}`, error);
        throw new Error(`重命名 "${fileHandle.name}" 为 "${finalNewName}" 时发生错误。`);
    }
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
            await deleteConversation(entry, dirHandle);
        } else if (entry.kind === 'directory') {
            await deleteDirectory(entry, dirHandle);
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
                await moveFile(entry, dirHandle, newDirHandle);
            } else if (entry.kind === 'directory') {
                await renameDirectory(entry, entry.name, newDirHandle);
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

  const updateConversation = async (chatFileHandle: FileSystemFileHandle, updatedTurns: { question: string | null; answer: string }[]) => {
    if (!rootHandle.value) {
      throw new Error("无法更新对话，因为未选择根目录。");
    }

    try {
        const markdownDirHandle = await getSubDirectoryHandle(rootHandle.value, 'markdown', { create: true });

        // 1. Read original file to get old answer_ids
        const originalFile = await chatFileHandle.getFile();
        const originalData = JSON.parse(await originalFile.text());
        const oldAnswerIds = new Set<string>(originalData.map((turn: { answer_id: string }) => turn.answer_id));

        const newConversationJson = [];
        const newAnswerIds = new Set<string>();

        // 2. Process updated turns: create new markdown files and build new JSON
        for (const [index, turn] of updatedTurns.entries()) {
            const contentHash = await calculateHash(turn.answer);
            const answerId = `${index + 1}-${contentHash}`;
            const markdownFileName = `${answerId}.md`;

            // Write the new markdown file
            const markdownFileHandle = await markdownDirHandle.getFileHandle(markdownFileName, { create: true });
            const writable = await markdownFileHandle.createWritable();
            await writable.write(turn.answer);
            await writable.close();
            
            newConversationJson.push({ question: turn.question, answer_id: answerId });
            newAnswerIds.add(answerId);
        }

        // 3. Delete old markdown files that are no longer referenced
        for (const oldId of oldAnswerIds) {
            if (!newAnswerIds.has(oldId)) {
                try {
                    await markdownDirHandle.removeEntry(`${oldId}.md`);
                    console.log(`Deleted stale markdown file: ${oldId}.md`);
                } catch (e) {
                    console.warn(`无法删除旧的 Markdown 文件 ${oldId}.md (可能已被新的替换或手动删除):`, e);
                }
            }
        }

        // 4. Overwrite the main JSON file
        const writable = await chatFileHandle.createWritable();
        await writable.write(JSON.stringify(newConversationJson, null, 2));
        await writable.close();

        emitter.$emit('file-system-changed'); // Notify UI to refresh if needed

    } catch (error) {
        console.error(`更新对话失败: ${chatFileHandle.name}`, error);
        throw new Error(`更新对话 "${chatFileHandle.name}" 时发生错误。`);
    }
  };

  return {
    rootHandle: readonly(rootHandle),
    selectDirectory,
    listDirectory,
    readConversation,
    saveConversation,
    updateConversation,
    deleteConversation,
    renameConversation,
    createDirectory,
    deleteDirectory,
    renameDirectory,
    moveConversation,
    findFileByPath,
  };
}
