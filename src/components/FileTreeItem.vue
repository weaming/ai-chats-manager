<script setup lang="ts">
import { ref, computed, nextTick } from 'vue';
import type { PropType } from 'vue';
import type { FileSystemEntry, DirectoryEntry, FileEntry } from '../composables/useFileSystem';
import { useDragDrop } from '../composables/useDragDrop';
import { joinPath } from '../utils/path';

const props = defineProps({
  entries: {
    type: Array as PropType<FileSystemEntry[]>,
    required: true,
  },
  parentHandle: {
    type: Object as PropType<FileSystemDirectoryHandle | null>,
    default: null,
  },
  selectedFile: {
    type: Object as PropType<FileEntry | null>,
    default: null,
  },
  path: {
    type: String,
    default: '',
  },
  selectionOrder: {
    type: Object as PropType<Record<string, number>>,
    default: () => ({}),
  }
});

const emit = defineEmits(['file-click', 'delete-entry', 'rename-entry', 'move-entry', 'turn-drop']);
const editingName = ref<string | null>(null); // name of entry being edited
const editValue = ref('');
const renameInput = ref<HTMLInputElement | null>(null);
const itemContent = ref<HTMLElement | null>(null);

const { sourceParentHandle: dragSourceParentHandle } = useDragDrop();

const formatName = (name: string) => {
    return name.endsWith('.json') ? name.slice(0, -5) : name;
};

const handleItemClick = (entry: FileSystemEntry) => {
  if (entry.kind === 'file') {
    emit('file-click', { entry, path: joinPath(props.path, entry.name), parentHandle: props.parentHandle });
  }
};

const handleDeleteClick = (entry: FileSystemEntry) => {
  emit('delete-entry', { entry, parentHandle: props.parentHandle });
};

const vFocus = {
  mounted: (el: HTMLInputElement) => {
    el.focus();
    el.select();
  }
};

const handleRenameClick = (entry: FileSystemEntry) => {
  editingName.value = entry.name;
  editValue.value = formatName(entry.name);
};

const focusItem = (name: string) => {
    // Since itemContent is in a v-for, it's an array of elements
    // We need to find the one matching the entry name
    if (Array.isArray(itemContent.value)) {
        const el = itemContent.value.find((i: any) => i.dataset.name === name);
        el?.focus();
    } else if (itemContent.value && itemContent.value.dataset.name === name) {
        itemContent.value.focus();
    }
};

const commitRename = async (entry: FileSystemEntry) => {
    if (!editingName.value) return;
    const finalNewName = editValue.value.trim();
    if (finalNewName && finalNewName !== formatName(entry.name)) {
        emit('rename-entry', { entry, newName: finalNewName, parentHandle: props.parentHandle });
    }
    const oldName = editingName.value;
    editingName.value = null;
    await nextTick();
    if (oldName) focusItem(oldName);
};

const cancelRename = async () => {
    const oldName = editingName.value;
    editingName.value = null;
    await nextTick();
    if (oldName) focusItem(oldName);
};

// --- Drag and Drop Handlers ---

const { draggedTurnState, dropTargetKey } = useDragDrop();

const handleFileDragOver = (event: DragEvent, entry: FileEntry) => {
    // Check if dragging a turn
    if (draggedTurnState.value) {
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer!.dropEffect = 'move';
        dropTargetKey.value = entry.name;
    }
};

const handleFileDrop = (event: DragEvent, entry: FileEntry) => {
    if (draggedTurnState.value) {
        event.preventDefault();
        event.stopPropagation(); // Prevent bubbling to root
        dropTargetKey.value = null;
        emit('turn-drop', { 
            targetEntry: entry, 
            turnData: draggedTurnState.value.data,
            sourceIndices: draggedTurnState.value.indices 
        });
    }
};

const handleDragStart = (event: DragEvent, entry: FileSystemEntry) => {
  if (event.dataTransfer) {
    event.stopPropagation();
    dragSourceParentHandle.value = props.parentHandle;
    event.dataTransfer.setData('text/plain', JSON.stringify({
      name: entry.name,
      kind: entry.kind,
    }));
    event.dataTransfer.effectAllowed = 'move';
  }
};

const handleDragEnd = () => {
    dragSourceParentHandle.value = null;
    dropTargetKey.value = null;
};

const handleDragOver = (event: DragEvent, entry: FileSystemEntry) => {
  event.preventDefault();
  if (entry.kind === 'directory') {
    dropTargetKey.value = entry.name;
  }
};

const handleDragLeave = (event: DragEvent) => {
  // Simple clear works for now, but in complex nested lists it might flicker.
  // We can add a check if relatedTarget is inside the element, but for now simple clear.
  // Actually, dragleave fires when entering a child (icon, text). 
  // CSS pointer-events: none on children helps, or checking relatedTarget.
  // For now, let's just clear. If it flickers, we fix.
  // Wait, if I drag over child text, parent fires dragleave?
  // Yes. This needs fix.
  // Alternative: Remove dragleave clearing and rely on 'drop'. 
  // But if I drag OUT, it stays stuck.
  // Let's rely on CSS mostly? No, we need state for class.
  // Better: Check event.currentTarget vs event.explicitOriginalTarget?
  // Standard way: check if relatedTarget is contained.
  // But Vue event handler wrapper...
  // Let's stay primitive for this step to match previous logic, just updating var name.
  
  // Previous logic: isDropTarget.value = false;
  // New: dropTargetName.value = null;
  // prevent defaulting immediately
};

const handleItemDragLeave = (event: DragEvent, entry: FileSystemEntry) => {
   // Specific handler for item-content
   const target = event.target as HTMLElement;
   const related = event.relatedTarget as HTMLElement;
   if (related && target.contains(related)) return; // Still inside
   
   if (dropTargetKey.value === entry.name) {
       dropTargetKey.value = null;
   }
};

const handleDrop = (event: DragEvent, targetEntry: FileSystemEntry) => {
  event.preventDefault();
  event.stopPropagation();
  dropTargetKey.value = null;
  
  if (event.dataTransfer && dragSourceParentHandle.value) {
    const data = JSON.parse(event.dataTransfer.getData('text/plain'));
    if (data.kind === 'file') {
      
      let targetDirHandle = props.parentHandle;
      if (targetEntry.kind === 'directory') {
          // If dropped on a directory, that directory is the target
          targetDirHandle = targetEntry.handle as FileSystemDirectoryHandle;
      }
      
      // If we dropped file A onto file B, targetDirHandle is parent handle (default)
      // Implementation logic:
      // If drag onto directory -> move into directory.
      // If drag onto file -> move into parent directory of file (sibling).
      
      // Previous logic seemed to assume targetEntry is directory for 'drop' handler?
      // Template: @drop handles directory. File handles FileDrop.
      // So this handleDrop is for Directory drops (for file moves).
      // Logic seems ok.
      
      if (targetDirHandle) {
          emit('move-entry', {
            sourceName: data.name,
            sourceParentHandle: dragSourceParentHandle.value,
            targetDirHandle: targetDirHandle,
          });
      }
    }
  }
  dragSourceParentHandle.value = null;
};


const handleChildFileClick = (event: { entry: FileEntry, path: string, parentHandle: FileSystemDirectoryHandle | null }) => {
    emit('file-click', event);
};
</script>

<template>
  <ul class="file-tree">
    <li 
      v-for="entry in entries" 
      :key="entry.name" 
      :class="['tree-item', entry.kind, { 
          'drop-target': dropTargetKey === entry.name && entry.kind === 'directory',
          'active': entry.kind === 'file' && selectedFile?.name === entry.name 
      }]"
      :draggable="entry.kind === 'file' && editingName !== entry.name"
      @dragstart="handleDragStart($event, entry)"
      @dragend="handleDragEnd"
      @dragover="handleDragOver($event, entry)"
      @dragleave="handleDragLeave"
      @drop="handleDrop($event, entry)"
    >
      <div 
        ref="itemContent"
        :data-name="entry.name"
        class="item-content" 
        :tabindex="editingName === entry.name ? -1 : 0"
        :class="{ 
            'active': entry.kind === 'file' && selectedFile?.name === entry.name,
            'drop-target': dropTargetKey === entry.name
        }"
        @click="handleItemClick(entry)"
        @dblclick.prevent.stop="handleRenameClick(entry)"
        @keydown.enter.prevent.stop="handleRenameClick(entry)"
        :draggable="entry.kind === 'file' && editingName !== entry.name"
        @dragstart="handleDragStart($event, entry)"
        @dragend="handleDragEnd"
        @dragover="(e) => entry.kind === 'directory' ? handleDragOver(e, entry) : handleFileDragOver(e, entry as FileEntry)"
        @dragleave="(e) => handleItemDragLeave(e, entry)"
        @drop="(e) => entry.kind === 'directory' ? handleDrop(e, entry) : handleFileDrop(e, entry as FileEntry)"
      >
        <span class="icon">{{ entry.kind === 'directory' ? '📁' : '📄' }}</span>
        <input 
          v-if="editingName === entry.name"
          ref="renameInput"
          v-model="editValue"
          v-focus
          class="rename-input"
          @click.stop
          @keydown.enter.stop="commitRename(entry)"
          @keydown.esc.stop.prevent="cancelRename"
          @blur="commitRename(entry)"
        />
        <span v-else class="name">{{ formatName(entry.name) }}</span>
        <span v-if="selectionOrder[entry.name]" class="selection-badge">{{ selectionOrder[entry.name] }}</span>
        <button class="action-btn delete-btn" @click.stop="handleDeleteClick(entry)">🗑️</button>
      </div>
      <FileTreeItem
        v-if="entry.kind === 'directory' && entry.children.length > 0"
        :entries="entry.children"
        :parent-handle="entry.handle"
        :selected-file="selectedFile"
        :path="joinPath(path, entry.name)"
        :selection-order="selectionOrder"
        @file-click="handleChildFileClick"
        @delete-entry="$emit('delete-entry', $event)"
        @rename-entry="$emit('rename-entry', $event)"
        @move-entry="$emit('move-entry', $event)"
        @turn-drop="$emit('turn-drop', $event)"
      />
    </li>
  </ul>
</template>

<style scoped>
.file-tree {
  list-style-type: none;
  padding-left: 20px;
  margin: 0;
}

.item-content {
  display: flex;
  align-items: center;
  padding: 8px 10px;
  border-radius: 4px;
  transition: background-color 0.2s ease, color 0.2s;
  cursor: pointer;
}

.item-content:hover {
  background-color: #e9ecef;
}

.item-content:focus {
  outline: 2px solid var(--primary-color);
  outline-offset: -2px;
  background-color: #f0f7ff;
}

.tree-item.active > .item-content {
    background-color: var(--primary-color);
    color: #fff;
}

.tree-item.active > .item-content .name {
    color: #fff;
}

.icon {
  margin-right: 8px;
}

.name {
  font-size: 14px;
  color: #212529;
  flex-grow: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file .name {
  color: #007bff;
}

.rename-input {
    flex-grow: 1;
    font-size: 14px;
    padding: 2px 4px;
    border: 1px solid var(--primary-color);
    border-radius: 4px;
    outline: none;
    background: white;
    color: #333;
    width: 0; /* Let flex-grow handle it */
}

.action-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  visibility: hidden;
  opacity: 0;
  transition: opacity 0.2s;
  padding: 5px;
}

.item-content:hover .action-btn {
  visibility: visible;
  opacity: 1;
}

.rename-btn {
    color: #17a2b8;
}
.delete-btn {
  color: #dc3545;
}

.tree-item.active .action-btn {
    color: #fff;
}


.action-btn:hover {
    filter: brightness(1.2);
}

.item-content.drop-target {
    background-color: #d4edda; /* Light green to indicate drop target */
    color: #155724;
}

.selection-badge {
    background-color: var(--primary-color);
    color: white;
    border-radius: 50%;
    width: 20px;
    height: 20px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: bold;
    margin-right: 8px;
}
</style>
