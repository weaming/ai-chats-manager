import { type Ref } from 'vue';
import type { FullConversationTurn, FileSystemEntry, FileEntry } from './useFileSystem';
import { getSubDirectoryHandle, calculateHash, moveFile } from '../utils/fileSystemUtils';

export function useConversationIO(rootHandle: Ref<FileSystemDirectoryHandle | null>, emitter: any) {

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
            throw new Error('请先选择一个用于保存对话的根目录。');
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
            throw error;
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
        readConversation,
        saveConversation,
        deleteConversation,
        renameConversation,
        updateConversation
    };
}
