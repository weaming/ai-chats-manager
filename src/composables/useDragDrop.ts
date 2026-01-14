import { ref } from 'vue';

const sourceParentHandle = ref<FileSystemDirectoryHandle | null>(null);
const draggedEntryName = ref<string | null>(null);

// For Chat Turn Dragging
const draggedTurnState = ref<{
    indices: number[];
    data: any[]; // FullConversationTurn[]
    sourceFilePath?: string;
} | null>(null);

export function useDragDrop() {
  return {
    sourceParentHandle,
    draggedEntryName,
    draggedTurnState
  };
}
