<script setup lang="ts">
import { ref, watch, computed, onMounted, onUnmounted } from 'vue';
import { useFileSystem } from '../composables/useFileSystem';
import { useEventBus } from '../composables/useEventBus';
import type { FileSystemEntry, FileEntry, DirectoryEntry } from '../composables/useFileSystem';
import { useDragDrop } from '../composables/useDragDrop';
import FileTreeItem from './FileTreeItem.vue';

const props = defineProps({
  selectedFile: {
    type: Object as () => FileEntry | null,
    default: null,
  },
});

const { 
    rootHandle, listDirectory, selectDirectory, 
    deleteConversation, renameConversation, createDirectory, 
    deleteDirectory, renameDirectory, moveConversation, mergeConversations,
    readConversation, updateConversation
} = useFileSystem();
const emitter = useEventBus();
const fileTree = ref<FileSystemEntry[]>([]);
const isLoading = ref(false);
const emit = defineEmits(['file-click', 'file-deleted']);
const isDragOverRoot = ref(false);

const { sourceParentHandle: dragSourceParentHandle } = useDragDrop();

const chatsDirHandle = ref<FileSystemDirectoryHandle | null>(null);
const isSelectionMode = ref(false);

interface SelectedFile extends FileEntry {
    parentHandle: FileSystemDirectoryHandle | null;
    path: string;
}
const selectedFilesToMerge = ref<SelectedFile[]>([]);

const selectionOrder = computed(() => {
    const order: Record<string, number> = {};
    selectedFilesToMerge.value.forEach((file, index) => {
        order[file.name] = index + 1;
    });
    return order;
});

const toggleSelectionMode = () => {
    isSelectionMode.value = !isSelectionMode.value;
    selectedFilesToMerge.value = [];
    if (isSelectionMode.value) {
        // If we have a currently selected file (props.selectedFile), 
        // maybe add it as the first one?
        // Let's decide NOT to auto-select, to avoid confusion.
        // User starts fresh.
    }
};

const handleMerge = async () => {
    if (selectedFilesToMerge.value.length < 2) return;
    if (!chatsDirHandle.value) return;

    if (!confirm(`确定要将 ${selectedFilesToMerge.value.length - 1} 个对话合并到 "${selectedFilesToMerge.value[0]!.name}" 吗？\n被合并的源文件将被删除。`)) {
        return;
    }

    try {
        const target = selectedFilesToMerge.value[0]!;
        const sources = selectedFilesToMerge.value.slice(1);
        
        await mergeConversations(
            target.handle, 
            sources.map(f => ({ handle: f.handle, parentHandle: f.parentHandle || chatsDirHandle.value! }))
        );
        
        
        const targetPath = target.path; // Store before reset

        // After merge, reset selection mode
        isSelectionMode.value = false;
        selectedFilesToMerge.value = [];
        
        // alert('合并成功！'); // Removed as requested
        
        // Auto-open the merged file
        emit('file-click', { entry: target, path: targetPath, parentHandle: target.parentHandle });

    } catch (e) {
        console.error("合并失败", e);
        alert(`合并失败: ${(e as Error).message}`);
    }
};

watch(rootHandle, async () => {
    if (!rootHandle.value) {
        chatsDirHandle.value = null;
        return;
    }
    try {
        chatsDirHandle.value = await rootHandle.value.getDirectoryHandle('chats');
    } catch (e) {
        console.error("Failed to get chats directory", e);
        chatsDirHandle.value = null;
    }
}, { immediate: true });

const selectButtonText = computed(() => rootHandle.value ? '切换目录' : '选择目录');

const loadFileTree = async () => {
  if (!rootHandle.value) {
    fileTree.value = [];
    return;
  }
  isLoading.value = true;
  try {
    fileTree.value = await listDirectory();
  } catch (error) {
    console.error("无法加载对话列表:", error);
    fileTree.value = [];
  } finally {
    isLoading.value = false;
  }
};

const handleFileClick = (event: { entry: FileEntry, path: string, parentHandle: FileSystemDirectoryHandle | null }) => {
  if (isSelectionMode.value) {
      const index = selectedFilesToMerge.value.findIndex(f => f.name === event.entry.name);
      if (index !== -1) {
          // Deselect
          selectedFilesToMerge.value.splice(index, 1);
      } else {
          // Select
          selectedFilesToMerge.value.push({ ...event.entry, parentHandle: event.parentHandle, path: event.path });
      }
  } else {
      emit('file-click', event);
  }
};

const handleDeleteEntry = async ({ entry, parentHandle }: { entry: FileSystemEntry; parentHandle: FileSystemDirectoryHandle | null }) => {
    const confirmationMessage = entry.kind === 'directory' 
        ? `您确定要删除文件夹 "${entry.name}" 及其所有内容吗？此操作无法撤销。`
        : `您确定要删除 "${entry.name}" 吗？此操作无法撤销。`;

    if (!confirm(confirmationMessage)) return;

    try {
        const resolvedParentHandle = await (parentHandle || chatsDirHandle.value);
        if (!resolvedParentHandle) throw new Error("无法找到父目录。");

        if (entry.kind === 'file') {
            await deleteConversation(entry.handle, resolvedParentHandle);
            // Check if we deleted the currently selected file. 
            // Props update is reactive, but we can emit event.
            // Actually, we should check if the deleted entry matches props.selectedFile
            if (props.selectedFile && props.selectedFile.name === entry.name) {
                 emit('file-deleted');
            }
        } else if (entry.kind === 'directory') {
            await deleteDirectory(entry.handle, resolvedParentHandle);
        }
    } catch (error) {
        console.error("删除失败:", error);
        alert(`删除 "${entry.name}" 失败: ${(error as Error).message}`);
    }
};

const handleRenameEntry = async ({ entry, parentHandle }: { entry: FileSystemEntry; parentHandle: FileSystemDirectoryHandle | null }) => {
    const currentName = entry.name.replace('.json', '');
    const newName = prompt('请输入新的名称:', currentName);

    if (!newName || newName.trim() === '' || newName === currentName) {
        return;
    }

    try {
        const resolvedParentHandle = await (parentHandle || chatsDirHandle.value);
        if (!resolvedParentHandle) throw new Error("无法找到父目录。");

        if (entry.kind === 'file') {
            await renameConversation(entry.handle, newName, resolvedParentHandle);
        } else if (entry.kind === 'directory') {
            await renameDirectory(entry.handle, newName, resolvedParentHandle);
        }
    } catch (error) {
        console.error("重命名失败:", error);
        alert(`重命名 "${entry.name}" 失败: ${(error as Error).message}`);
    }
};

const handleCreateDirectory = async () => {
    const dirName = prompt("请输入新文件夹的名称:");
    if (!dirName || dirName.trim() === '') return;

    try {
        await createDirectory(dirName);
    } catch (error) {
        console.error("创建文件夹失败:", error);
        alert(`创建文件夹 "${dirName}" 失败: ${(error as Error).message}`);
    }
};

const handleMoveEntry = async ({ sourceName, sourceParentHandle, targetDirHandle }: { sourceName: string; sourceParentHandle: FileSystemDirectoryHandle | null; targetDirHandle: FileSystemDirectoryHandle; }) => {
    try {
        const resolvedParentHandle = await (sourceParentHandle || chatsDirHandle.value);
        if (!resolvedParentHandle) throw new Error("无法找到源父目录。");
        if (await resolvedParentHandle.isSameEntry(targetDirHandle)) return; // Cannot move into same folder

        await moveConversation(sourceName, resolvedParentHandle, targetDirHandle);
    } catch (error) {
        console.error("移动文件失败:", error);
        alert(`移动文件 "${sourceName}" 失败: ${(error as Error).message}`);
    }
};



const handleTurnDrop = async ({ targetEntry, turnData, sourceIndices }: { targetEntry: FileEntry; turnData: any[]; sourceIndices?: number[] }) => {
    try {
        // ... (existing logic)
        // Read target file
        const conversation = await readConversation(targetEntry.handle);
        // Append new turns
        if (Array.isArray(turnData)) {
             conversation.push(...turnData);
        } else {
             // Fallback if legacy logic somehow fires
             conversation.push(turnData);
        }
        
        // Save
        await updateConversation(targetEntry.handle, conversation);
        
        // Notify success to trigger source removal
        emitter.$emit('turn-transfer-complete', { sourceIndices });
        
        // alert(`已移动到 "${targetEntry.name}"`); // Optional feedback
        // Refresh if we are viewing the target? Handled by file system watcher if we had one, or manual reload.
        // If target is current file, Viewer handles it via load?
        // Actually Viewer watches fileHandle. If we write to it, fileHandle doesn't change, but data does.
        // If we are moving TO current file, we should reload.
        // But drag usually implies FROM source.
        
    } catch (e) {
        console.error("Failed to move turn", e);
        alert("移动失败: " + (e as Error).message);
    }
};

const handleRootDragOver = (event: DragEvent) => {
    event.preventDefault();
    if (dragSourceParentHandle.value) {
        isDragOverRoot.value = true;
    }
};

const handleRootDragLeave = (event: DragEvent) => {
    // Check if we are really leaving the container
    const currentTarget = event.currentTarget as HTMLElement;
    const relatedTarget = event.relatedTarget as HTMLElement;

    if (currentTarget.contains(relatedTarget)) {
        // We are entering a child element, do not disable drag over
        return;
    }
    
    isDragOverRoot.value = false;
};


const handleRootDrop = async (event: DragEvent) => {
    event.preventDefault();
    isDragOverRoot.value = false;

    if (!dragSourceParentHandle.value || !chatsDirHandle.value) return;

    // Check if data is valid
     if (event.dataTransfer) {
        try {
            const data = JSON.parse(event.dataTransfer.getData('text/plain'));
            if (data.kind === 'file') {
                 await handleMoveEntry({
                    sourceName: data.name,
                    sourceParentHandle: dragSourceParentHandle.value,
                    targetDirHandle: chatsDirHandle.value
                 });
            }
        } catch (e) {
            console.warn("Invalid drop data", e);
        }
    }
    
    // Clear global state is handled by dragend in DragSource, but good to be safe? 
    // No, DragSource (FileTreeItem) `dragend` will fire.
};

onMounted(() => {
    emitter.$on('file-system-changed', loadFileTree);
});

onUnmounted(() => {
    emitter.$off('file-system-changed', loadFileTree);
});

watch(rootHandle, loadFileTree, { immediate: true });
</script>

<template>
  <div class="conversation-browser">
    <div class="header">
      <h2>对话列表</h2>
      <div class="header-actions">
        <button @click="toggleSelectionMode" :class="{ active: isSelectionMode }" title="多选模式" style="font-size: 1rem;">
             {{ isSelectionMode ? '取消多选' : '多选' }}
        </button>
        <button v-if="isSelectionMode" @click="handleMerge" :disabled="selectedFilesToMerge.length < 2" title="合并" style="font-size: 1rem;">
            合并 ({{ selectedFilesToMerge.length }})
        </button>
        <button @click="handleCreateDirectory" :disabled="!rootHandle" title="新建文件夹">📁+</button>
      </div>
    </div>

    <div class="directory-selection-controls">
        <div v-if="rootHandle" class="directory-info">
            当前目录: <strong>{{ rootHandle.name }}</strong>
        </div>
        <button @click="selectDirectory">{{ selectButtonText }}</button>
    </div>

    <div 
      class="file-list-container"
      :class="{ 'drop-target': isDragOverRoot }"
      @dragover="handleRootDragOver"
      @dragleave="handleRootDragLeave"
      @drop="handleRootDrop"
    >
      <div v-if="!rootHandle" class="placeholder">
        请选择一个目录来开始。
      </div>
      <div v-else-if="isLoading" class="placeholder">
        正在加载文件...
      </div>
      <div v-else-if="fileTree.length === 0" class="placeholder">
        "chats" 目录为空或不存在。
      </div>
      <FileTreeItem 
        v-else 
        :entries="fileTree" 
        :parent-handle="chatsDirHandle"
        :selected-file="selectedFile"
        path=""
        :selection-order="selectionOrder"
        @file-click="handleFileClick"
        @delete-entry="handleDeleteEntry"
        @rename-entry="handleRenameEntry"
        @move-entry="handleMoveEntry"
        @turn-drop="handleTurnDrop"
      />
    </div>
  </div>
</template>
<style scoped>
.conversation-browser {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background-color: #fff;
  padding: 20px;
}

.header {
  flex-shrink: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

h2 {
  margin: 0;
  color: #333;
  font-size: 1.5rem;
}

.header-actions {
    display: flex;
    gap: 10px;
}

.header-actions button {
  background: none;
  border: none;
  font-size: 1.2rem;
  cursor: pointer;
  padding: 5px;
}

.directory-selection-controls {
  flex-shrink: 0;
  padding-bottom: 15px;
  border-bottom: 1px solid var(--border-color);
  margin-bottom: 15px;
  text-align: center;
}

.directory-info {
  font-size: 12px;
  color: #6c757d;
  margin-bottom: 10px;
  word-break: break-all;
}

.directory-selection-controls button {
  width: 100%;
  padding: 10px 15px;
  border: none;
  border-radius: 4px;
  background-color: #007bff;
  color: white;
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.directory-selection-controls button:hover {
  background-color: #0056b3;
}

.header-actions button.active {
    color: var(--primary-color);
    font-weight: bold;
}

.file-list-container {
  flex-grow: 1;
  overflow-y: auto;
  min-height: 100px;
  padding: 10px;
  background-color: #f8f9fa;
  border: 1px solid var(--border-color);
  border-radius: 6px;
}

.placeholder {
  text-align: center;
  color: #6c757d;
  padding: 30px;
}

.file-list-container.drop-target {
    background-color: #e9ecef;
    border: 2px dashed #007bff;
}
</style>
