<script setup lang="ts">
import { computed, nextTick, ref, watch, onMounted, onUnmounted } from 'vue';
import type { PropType } from 'vue';
import { useFileSystem, type FullConversationTurn } from '../composables/useFileSystem';
import { useDragDrop } from '../composables/useDragDrop';
import { marked } from 'marked';
import { generateAndDownloadImage } from '../utils/imageGenerator';
import ChatTurn from './ChatTurn.vue';

interface Selection {
  index: number;
  question: boolean;
  answer: boolean;
}

const props = defineProps({
  fileHandle: {
    type: Object as PropType<FileSystemFileHandle>,
    required: true,
  },
});

const { readConversation, updateConversation } = useFileSystem();
const conversation = ref<(FullConversationTurn & { id?: symbol })[]>([]);
const isLoading = ref(true);
const error = ref<string | null>(null);
const editingTurn = ref<{ index: number } | null>(null);

// Generate unique ID for Vue keys
const ensureIds = (turns: any[]) => {
    turns.forEach(turn => {
        if (!turn.id) {
            turn.id = Symbol('turn_id');
        }
    });
};

const loadConversation = async () => {
  isLoading.value = true;
  error.value = null;
  try {
    const data = await readConversation(props.fileHandle);
    ensureIds(data);
    conversation.value = data;
  } catch (e) {
    console.error("加载文件失败:", e);
    error.value = "无法加载文件，请重试。";
  } finally {
    isLoading.value = false;
  }
};


// New selection state
const selectionState = ref<Selection[]>([]);

const getTurnSelection = (index: number) => selectionState.value.find(s => s.index === index);

const handleTurnClick = (index: number) => {
    if (editingTurn.value?.index === index) return; // Don't select/deselect while editing
    const selection = getTurnSelection(index);
    if (selection) {
        // Deselect the whole turn
        selectionState.value = selectionState.value.filter(s => s.index !== index);
    } else {
        // Select the whole turn (question and answer)
        selectionState.value.push({ index, question: true, answer: true });
    }
};

const handleQuestionClick = (index: number) => {
    if (editingTurn.value?.index === index) return;

    const selection = getTurnSelection(index);

    if (selection) {
        // If the turn is already in the selection state:
        selection.question = !selection.question; // Toggle question selection

        // If, after toggling, neither question nor answer is selected, remove the turn from selectionState
        if (!selection.question && !selection.answer) {
            selectionState.value = selectionState.value.filter(s => s.index !== index);
        }
    } else {
        // If the turn is NOT in the selection state at all:
        // Select the entire turn (question and answer).
        selectionState.value.push({ index, question: true, answer: true });
    }
};

const startEditing = (index: number) => {
    editingTurn.value = { index };
    // Also, clear selection for this turn
    selectionState.value = selectionState.value.filter(s => s.index !== index);
};

const cancelEditing = () => {
    editingTurn.value = null;
};

const saveEditing = async (index: number, payload: { question: string | null; answer: string }) => {
    const { question, answer } = payload;
    
    // Create a new array with the updated turn
    const updatedConversation = conversation.value.map((turn, i) => {
        if (i === index) {
            return { ...turn, question, answer };
        }
        return turn;
    });

    isLoading.value = true;
    error.value = null;
    try {
        await updateConversation(props.fileHandle, updatedConversation);
        
        // Success, clear editing state
        editingTurn.value = null;
        // Reload the conversation to ensure UI is in sync with file system
        await loadConversation();

    } catch (e) {
        console.error("更新失败:", e);
        error.value = e instanceof Error ? e.message : '保存对话时发生未知错误。';
        // Revert local changes on failure? For now, just show error.
    } finally {
        isLoading.value = false;
    }
};

const { draggedTurnState } = useDragDrop();
const dropTargetIndex = ref<number | null>(null);

const handleDragOver = (event: DragEvent, index: number) => {
    // Only handle if dragging a turn
    if (!draggedTurnState.value) return;
    
    event.preventDefault(); // Allow drop
    event.dataTransfer!.dropEffect = 'move';
    
    dropTargetIndex.value = index;
    // We could add helper visual here, but let's stick to simple replacement logic for now
};

const handleTurnDragStart = (event: DragEvent, index: number) => {
    // If editing, ChatTurn prevents default, so this might not fire if we relied on bubbling.
    // But we are on the helper now? No, we are on ChatTurn component.
    // ChatTurn calls event.preventDefault() if editing, so dragstart won't bubble here if editing. Good.

    let indicesToDrag = [index];
    const selection = getTurnSelection(index);
    
    // If the dragged item is part of the selection, drag ALL selected items
    if (selection) {
        // Collect all selected indices
        indicesToDrag = selectionState.value.map(s => s.index).sort((a, b) => a - b);
    }
    
    // Set global state
    draggedTurnState.value = {
        indices: indicesToDrag,
        data: indicesToDrag.map(i => conversation.value[i]), // Full data
    };
    
    // Set dataTransfer
    if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        // We set the first item's text as fallback? Or summary?
        event.dataTransfer.setData('text/plain', `${indicesToDrag.length} items`);
    }
    // Visuals are handled by ChatTurn's own handler (image) and class
};

const handleDrop = async (event: DragEvent, dropIndex: number) => {
     event.preventDefault();
     dropTargetIndex.value = null;

     if (!draggedTurnState.value) return;

     const sourceIndices = draggedTurnState.value.indices;
     
     // 1. Validate: Cannot drop ON any of the source items (no-op)
     if (sourceIndices.includes(dropIndex)) return;

     // Perform Reorder
     const newConversation = [...conversation.value];
     const itemsToMove: FullConversationTurn[] = [];

     // 2. Remove items from source (Iterate backwards to preserve indices)
     for (let i = sourceIndices.length - 1; i >= 0; i--) {
        const sourceIndex = sourceIndices[i]!; // Non-null assertion as we know it exists
        const [removed] = newConversation.splice(sourceIndex, 1);
        if (removed) {
             itemsToMove.unshift(removed); // Collect in original order
        }
     }
     
     // 3. Calculate insertion index
     // We need to adjust dropIndex based on how many items *before* it were removed.
     let insertIndex = dropIndex;
     const itemsRemovedBeforeDrop = sourceIndices.filter(idx => idx < dropIndex).length;
     insertIndex -= itemsRemovedBeforeDrop;

     // 4. Insert items
     newConversation.splice(insertIndex, 0, ...itemsToMove);
     
     isLoading.value = true;
     try {
         await updateConversation(props.fileHandle, newConversation);
         await loadConversation();
         // Reset global state
         draggedTurnState.value = null;
         // Clear selection safely
         selectionState.value = [];
     } catch (e) {
         console.error("Move failed", e);
     } finally {
         isLoading.value = false;
     }
};

const handleGlobalDragEnd = () => {
    dropTargetIndex.value = null;
};

const deleteTurn = async (index: number) => {
    if (!confirm('确定要删除这个问答回合吗？此操作无法撤销。')) return;

    // Adjust selection state: remove deleted, shift subsequent indices
    selectionState.value = selectionState.value
        .filter(s => s.index !== index)
        .map(s => ({
            ...s,
            index: s.index > index ? s.index - 1 : s.index
        }));

    const updatedConversation = conversation.value.filter((_, i) => i !== index);

    isLoading.value = true;
    error.value = null;
    try {
        await updateConversation(props.fileHandle, updatedConversation);
        // Clear potential editing state if deleting the currently editing turn
        if (editingTurn.value?.index === index) {
            editingTurn.value = null;
        }
        await loadConversation();
    } catch (e) {
        console.error("删除失败:", e);
        error.value = e instanceof Error ? e.message : '删除时发生未知错误。';
    } finally {
        isLoading.value = false;
    }
};

const renderedConversation = computed(() => {
  let questionCounter = 0;
  return conversation.value.map((turn, index) => {
    // Increment for every turn regardless of question presence
    questionCounter++; 
    
    return {
      ...turn,
      // We only render markdown when not editing that specific turn
      answer: (editingTurn.value?.index === index ? turn.answer : marked(turn.answer)) as string,
      index: index,
      questionNumber: index + 1,
    };
  });
});

const formattedFileName = computed(() => {
    return props.fileHandle.name.replace('.json', '');
});

// Reordered loadConversation to top


const generateImage = async () => {
    // Construct RenderedTurn array for the generator
    // We can map renderedConversation directly, ensuring type compatibility
    const turnsForImage = renderedConversation.value.map(turn => ({
        ...turn,
    })) as any[]; // Cast to any to avoid strict type mismatch on 'answer' which might technically be Promise<string> to TS but is string here.
    
    await generateAndDownloadImage(selectionState.value, turnsForImage);
};

const isAllSelected = computed(() => {
  // Check if all available turns in renderedConversation are fully selected (Q&A)
  if (renderedConversation.value.length === 0) return false;

  return renderedConversation.value.every(turn => {
    const selection = getTurnSelection(turn.index);
    const hasQuestion = turn.question && turn.question.trim().length > 0;

    if (!selection) return false; // If no selection entry, not selected

    if (hasQuestion) {
      return selection.question && selection.answer;
    } else {
      // If no question, only answer needs to be selected
      return selection.answer;
    }
  });
});

const handleSelectAll = () => {
  if (isAllSelected.value) {
    // If all are selected, deselect all
    selectionState.value = [];
  } else {
    // Select all turns (question and answer)
    selectionState.value = renderedConversation.value.map(turn => ({
      index: turn.index,
      question: !!(turn.question && turn.question.trim().length > 0), // Explicit boolean conversion
      answer: true,
    }));
  }
};

const handleClearSelection = () => {
  selectionState.value = [];
};

const handleDeleteSelected = async () => {
    if (selectionState.value.length === 0) return;
    
    if (!confirm(`确定要删除选中的 ${selectionState.value.length} 个问答吗？此操作无法撤销。`)) return;
    
    // Get all selected indices
    const indicesToDelete = selectionState.value.map(s => s.index);
    
    // Filter out deleted items
    const newConversation = conversation.value.filter((_, i) => !indicesToDelete.includes(i));
    
    isLoading.value = true;
    try {
        await updateConversation(props.fileHandle, newConversation);
        await loadConversation();
        selectionState.value = []; // Clear selection
    } catch (e) {
         console.error("批量删除失败:", e);
         error.value = "删除失败，请重试。";
    } finally {
        isLoading.value = false;
    }
};

const currentQuestion = ref('');
const currentAnswer = ref('');

const addTurn = async () => {
    if (!currentAnswer.value.trim()) return;

    const newTurn: FullConversationTurn = {
        question: currentQuestion.value,
        answer: currentAnswer.value,
    };

    const updatedConversation = [...conversation.value, newTurn];

    isLoading.value = true;
    error.value = null;
    try {
        await updateConversation(props.fileHandle, updatedConversation);
        await loadConversation();
        
        // Reset input
        currentQuestion.value = '';
        currentAnswer.value = '';
        
        // Scroll to bottom
        nextTick(() => {
            const container = document.querySelector('.viewer-content');
            if (container) {
                container.scrollTop = container.scrollHeight;
            }
        });
    } catch (e) {
        console.error("添加失败:", e);
        error.value = e instanceof Error ? e.message : '添加时发生未知错误。';
    } finally {
        isLoading.value = false;
    }
};

import { useEventBus } from '../composables/useEventBus';

const emitter = useEventBus();

watch(() => props.fileHandle, loadConversation, { immediate: true });

// Listen for global turn transfer completion (from Browser) - Clean up logic
// Uses payload if available, or fallback to state (if valid)
const handleTransferComplete = async (payload?: { sourceIndices?: number[] }) => {
    let indices = payload?.sourceIndices;

    // Fallback? If payload missing, state might be null due to drag end race condition.
    // So payload is crucial for cross-file.
    
    if (!indices && draggedTurnState.value) {
        indices = draggedTurnState.value.indices;
    }

    if (indices && indices.length > 0) {
        // Remove all moved items
        // We filter out any index that was in the dragged set
        const newConversation = conversation.value.filter((_, i) => !indices!.includes(i));
        
        try {
             await updateConversation(props.fileHandle, newConversation);
             await loadConversation();
             // Reset local selection state
             selectionState.value = [];
             // draggedTurnState.value = null; // Handled by dragEnd
        } catch (e) {
            console.error("Cleanup usage failed", e);
        }
    }
};

onMounted(() => {
    emitter.$on('turn-transfer-complete', handleTransferComplete);
});

onUnmounted(() => {
    emitter.$off('turn-transfer-complete', handleTransferComplete);
});
</script>

<template>
  <div class="conversation-viewer">
    <div class="viewer-header">
      <h2>{{ formattedFileName }}</h2>
      <div style="display: flex; gap: 10px;">
        <button @click="handleSelectAll" :disabled="isAllSelected">全选</button>
        <button @click="handleClearSelection" :disabled="selectionState.length === 0">清空</button>
        <button @click="handleDeleteSelected" :disabled="selectionState.length === 0" class="danger-btn">删除</button>
        <button @click="generateImage" :disabled="selectionState.length === 0">分享</button>
      </div>
    </div>
    <div class="viewer-content">
      <div v-if="isLoading" class="status-message">正在加载对话...</div>
      <div v-else-if="error" class="status-message error"><strong>加载失败:</strong> {{ error }}</div>
      <div v-else class="chat-log" @dragend="handleGlobalDragEnd">
        <ChatTurn 
          v-for="(turn, index) in renderedConversation" 
          :key="(turn.id as any)"
          :turn="turn"
          :raw-turn="conversation[index]!"
          :index="index"
          :is-editing="editingTurn?.index === index"
          :selection="getTurnSelection(index)"
          @toggle-selection="handleTurnClick(index)"
          @toggle-question-selection="handleQuestionClick(index)"
          @edit-start="startEditing(index)"
          @edit-cancel="cancelEditing"
          @edit-save="(payload) => saveEditing(index, payload)"
          @delete="deleteTurn(index)"
          
          @dragstart="handleTurnDragStart($event, index)"
          @dragover="handleDragOver($event, index)"
          @drop="handleDrop($event, index)"
          :style="{ opacity: dropTargetIndex === index ? 0.5 : 1, borderTop: dropTargetIndex === index ? '2px solid var(--primary-color)' : 'none' }"
        />
        
        <!-- End Drop Zone -->
        <div 
           class="drop-zone-end"
           @dragover="handleDragOver($event, conversation.length)"
           @drop="handleDrop($event, conversation.length)"
           :class="{ active: dropTargetIndex === conversation.length }"
        ></div>
      </div>
      
      <!-- Append Turn Input Area -->
      <div class="append-turn-area">
          <div class="input-group">
            <textarea 
                v-model="currentQuestion" 
                placeholder="追加提问 (可选)" 
                class="input-question"
                rows="2"
            ></textarea>
            <textarea 
                v-model="currentAnswer" 
                placeholder="追加 AI 回答 (必填，支持 Markdown)" 
                class="input-answer"
                rows="3"
                @keydown.meta.enter="addTurn"
                @keydown.ctrl.enter="addTurn"
            ></textarea>
          </div>
          <div class="input-actions">
              <span class="hint">Cmd/Ctrl + Enter 添加</span>
              <button class="add-btn" @click="addTurn" :disabled="!currentAnswer.trim()">添加</button>
          </div>
      </div>
    </div>
  </div>

  <!-- Hidden container for image generation -->
  <div id="share-container" style="position: absolute; visibility: hidden; background: white; padding: 20px; width: 800px;">
    <!-- Content is now injected dynamically via generateImage function -->
  </div>
</template>

<style scoped>
.viewer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: #333;
  margin: 0 0 20px 0;
  padding-bottom: 15px;
  border-bottom: 1px solid var(--border-color);
}
.viewer-header h2 {
  font-size: 1.2rem;
  word-break: break-all;
  margin: 0;
}

.danger-btn {
    background-color: #dc3545; /* Red */
    color: white;
}
.danger-btn:disabled {
    background-color: #e9ecef;
    color: #adb5bd;
}

.conversation-viewer {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  padding: 20px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background-color: #fff;
}

.viewer-content {
  flex-grow: 1;
  overflow-y: auto;
  padding-right: 10px;
  display: flex;
  flex-direction: column;
}

.chat-log {
    flex-grow: 1; /* Pushes input area to bottom if content is short? No, input area is inside viewer-content, so it scrolls WITH content? 
    Wait, user usually wants input fixed at bottom? 
    "New Conversation" has fixed input. 
    If I put it inside `viewer-content` (which overflows), it will be at the end of the list. 
    "现在支持直接在对话后面新增问答" -> "Support adding Q&A *after* the conversation".
    So scrolling to find it is acceptable, or even desired if it's "part of the flow".
    BUT if the list is long, it might be annoying. 
    However, for "Append", it's usually at the bottom.
    Let's keep it in flow for now.
    */
    margin-bottom: 20px;
    display: flex;
    flex-direction: column;
}

.drop-zone-end {
    flex-grow: 1; /* Take up remaining space */
    min-height: 40px; /* Minimum clickable area */
    transition: all 0.2s;
    border-radius: 8px;
    margin-top: 10px;
}

.drop-zone-end.active {
    background-color: rgba(var(--primary-color-rgb), 0.1); /* Assuming variable exists, or just light blue */
    background-color: #e7f5ff;
    border: 2px dashed var(--primary-color);
}

.append-turn-area {
    margin-top: 20px;
    padding-top: 20px;
    border-top: 1px dashed var(--border-color);
    background-color: #f8f9fa; /* Slight background to distinguish */
    padding: 20px;
    border-radius: 8px;
}

.input-group {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 10px;
}

.input-question, .input-answer {
    width: 100%;
    padding: 10px;
    border: 1px solid #ced4da;
    border-radius: 4px;
    font-family: inherit;
    resize: vertical;
}

.input-actions {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 15px;
}

.hint {
    font-size: 0.85rem;
    color: #6c757d;
}

.add-btn {
    padding: 8px 20px;
    background-color: var(--primary-color);
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 500;
}

.add-btn:disabled {
    background-color: #a5d6a7;
    cursor: not-allowed;
}

.status-message {
  text-align: center;
  color: #6c757d;
  padding: 40px;
  font-size: 1rem;
}

.status-message.error {
    color: #dc3545;
}

.chat-log {
    display: flex;
    flex-direction: column;
    gap: 40px; /* Increase spacing between turns */
}

</style>

<!-- Global styles for rendered markdown -->
<style>
/* ... existing global markdown styles ... */
.markdown-body {
  font-size: 15px;
}
.markdown-body h1, .markdown-body h2, .markdown-body h3 {
  margin-top: 20px;
  margin-bottom: 10px;
  border-bottom: 1px solid #eee;
  padding-bottom: 5px;
}
.markdown-body p {
  margin-top: 0;
  margin-bottom: 16px;
}
.markdown-body ul, .markdown-body ol {
  padding-left: 2em;
  margin-bottom: 16px;
}
.markdown-body pre {
  background-color: #2b2b2b;
  color: #f8f8f2;
  padding: 16px;
  border-radius: 6px;
  overflow-x: auto;
}
.markdown-body code {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace;
  font-size: 85%;
  background-color: rgba(27,31,35,0.05);
  border-radius: 3px;
  padding: .2em .4em;
}
.markdown-body pre code {
  background: none;
  padding: 0;
}

.markdown-body table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 16px;
  display: block; /* Ensure table can scroll horizontally if needed */
  overflow-x: auto; /* Ensure table can scroll horizontally if needed */
}

.markdown-body th,
.markdown-body td {
  border: 1px solid #ddd;
  padding: 8px 12px;
  text-align: left;
}

.markdown-body th {
  background-color: #f8f8f8;
  font-weight: bold;
}
</style>
