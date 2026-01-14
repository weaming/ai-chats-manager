import { getSubDirectoryHandle, calculateHash } from '../utils/fileSystemUtils';

export async function migrateDataV2(rootHandle: FileSystemDirectoryHandle) {
    const MIGRATION_FLAG = 'dataMigrationV2Done';
    if (localStorage.getItem(MIGRATION_FLAG) === 'true' || !rootHandle) {
        return;
    }

    console.log("开始V2数据迁移 (修复JSON和Markdown文件名)...");
    try {
        const chatsDirHandle = await getSubDirectoryHandle(rootHandle, 'chats', { create: true });
        const markdownDirHandle = await getSubDirectoryHandle(rootHandle, 'markdown', { create: true });
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
                    await processJsonFile(entry as FileSystemFileHandle);
                } else if (entry.kind === 'directory') {
                    await traverse(entry as FileSystemDirectoryHandle);
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
