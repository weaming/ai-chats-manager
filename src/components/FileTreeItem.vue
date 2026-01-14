<script setup lang="ts">
import { ref, computed } from 'vue';
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
  }
});

const emit = defineEmits(['file-click', 'delete-entry', 'rename-entry', 'move-entry']);
const isDropTarget = ref(false);

const { sourceParentHandle: dragSourceParentHandle } = useDragDrop();

const formatName = (name: string) => {
    return name.endsWith('.json') ? name.slice(0, -5) : name;
};

const handleItemClick = (entry: FileSystemEntry) => {
  if (entry.kind === 'file') {
    emit('file-click', { entry, path: joinPath(props.path, entry.name) });
  }
};

const handleDeleteClick = (entry: FileSystemEntry) => {
  emit('delete-entry', { entry, parentHandle: props.parentHandle });
};

const handleRenameClick = (entry: FileSystemEntry) => {
  emit('rename-entry', { entry, parentHandle: props.parentHandle });
};

// --- Drag and Drop Handlers ---

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
    isDropTarget.value = false;
};

const handleDragOver = (event: DragEvent, entry: FileSystemEntry) => {
  event.preventDefault();
  if (entry.kind === 'directory') {
    isDropTarget.value = true;
  }
};

const handleDragLeave = () => {
  isDropTarget.value = false;
};

const handleDrop = (event: DragEvent, targetEntry: FileSystemEntry) => {
  event.preventDefault();
  event.stopPropagation();
  isDropTarget.value = false;
  
  if (event.dataTransfer && dragSourceParentHandle.value) {
    const data = JSON.parse(event.dataTransfer.getData('text/plain'));
    if (data.kind === 'file') {
      
      let targetDirHandle = props.parentHandle;
      if (targetEntry.kind === 'directory') {
          targetDirHandle = targetEntry.handle;
      }

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

const handleChildFileClick = (event: { entry: FileEntry, path: string }) => {
    emit('file-click', event);
};
</script>

<template>
  <ul class="file-tree">
    <li 
      v-for="entry in entries" 
      :key="entry.name" 
      :class="['tree-item', entry.kind, { 
          'drop-target': isDropTarget && entry.kind === 'directory',
          'active': entry.kind === 'file' && selectedFile?.name === entry.name 
      }]"
      :draggable="entry.kind === 'file'"
      @dragstart="handleDragStart($event, entry)"
      @dragend="handleDragEnd"
      @dragover="handleDragOver($event, entry)"
      @dragleave="handleDragLeave"
      @drop="handleDrop($event, entry)"
    >
      <div class="item-content" @click="handleItemClick(entry)">
        <span class="icon">{{ entry.kind === 'directory' ? '📁' : '📄' }}</span>
        <span class="name">{{ formatName(entry.name) }}</span>
        <button class="action-btn rename-btn" @click.stop="handleRenameClick(entry)">✏️</button>
        <button class="action-btn delete-btn" @click.stop="handleDeleteClick(entry)">🗑️</button>
      </div>
      <FileTreeItem
        v-if="entry.kind === 'directory' && entry.children.length > 0"
        :entries="entry.children"
        :parent-handle="entry.handle"
        :selected-file="selectedFile"
        :path="joinPath(path, entry.name)"
        @file-click="handleChildFileClick"
        @delete-entry="$emit('delete-entry', $event)"
        @rename-entry="$emit('rename-entry', $event)"
        @move-entry="$emit('move-entry', $event)"
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

.drop-target > .item-content {
    background-color: #d4edda; /* Light green to indicate drop target */
}
</style>
