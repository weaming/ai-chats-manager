<script setup lang="ts">
import { computed, nextTick, ref, watch, onMounted, onUnmounted } from 'vue';
import type { PropType } from 'vue';
import { useFileSystem, type FullConversationTurn } from '../composables/useFileSystem';
import { useDragDrop } from '../composables/useDragDrop';
import { marked } from 'marked';
import { prepareShareData } from '../utils/imageGenerator';
import { useShareStore } from '../stores/shareStore';
import { fixMarkdownSpacing } from '../utils/markdownUtils'; // Import fix utility
import { diffChars, type DiffPart } from '../utils/simpleDiff';
import ChatTurn from './ChatTurn.vue';
import { useTheme } from '../composables/useTheme';

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
const { availableThemes, currentTheme, applyTheme, showAllThemes } = useTheme();
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

const isDropRedundant = (dropIndex: number) => {
    if (!draggedTurnState.value) return true;

    const sourceIndices = draggedTurnState.value.indices;
    // Dropping on source is redundant
    if (sourceIndices.includes(dropIndex)) return true;

    // Simulate reorder using indices
    const currentIndices = conversation.value.map((_, i) => i);
    const newIndices = [...currentIndices];
    const itemsToMove: number[] = [];

    // Remove
    for (let i = sourceIndices.length - 1; i >= 0; i--) {
        const sourceIndex = sourceIndices[i]!;
        const [removed] = newIndices.splice(sourceIndex, 1);
        if (removed !== undefined) itemsToMove.unshift(removed);
    }

    // Insert
    let insertIndex = dropIndex;
    const itemsRemovedBeforeDrop = sourceIndices.filter(idx => idx < dropIndex).length;
    insertIndex -= itemsRemovedBeforeDrop;

    newIndices.splice(insertIndex, 0, ...itemsToMove);

    // Compare
    return newIndices.every((val, idx) => val === currentIndices[idx]);
};

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

// --- Markdown Fix Logic ---
const showFixModal = ref(false);
const showRawDiff = ref(false); // Toggle for Diff View
const isSortingMode = ref(false);

const toggleSortingMode = () => {
    isSortingMode.value = !isSortingMode.value;
};

const handleFixModalKeyDown = (event: KeyboardEvent) => {
    if (!showFixModal.value) return;
    
    if (event.key === 'Escape') {
        event.stopPropagation();
        closeFixModal();
    } else if (event.key === 'Enter') {
        if (!isLoading.value) {
            applyFixes();
        }
    }
};

watch(showFixModal, (newVal) => {
    if (newVal) {
        window.addEventListener('keydown', handleFixModalKeyDown);
    } else {
        window.removeEventListener('keydown', handleFixModalKeyDown);
    }
});

interface FixPreviewItem {
    index: number;
    question: string | null;
    originalAnswer: string;
    fixedAnswer: string;
    diffs?: DiffPart[];
}
const fixPreviewData = ref<FixPreviewItem[]>([]);

const handleCheckFormatting = () => {
    const selectedIndices = selectionState.value.map(s => s.index);
    if (selectedIndices.length === 0) return;

    const fixes: FixPreviewItem[] = [];
    
    selectedIndices.forEach(index => {
        const turn = conversation.value[index];
        if (!turn) return;
        
        const originalAnswer = turn.answer;
        const fixedAnswer = fixMarkdownSpacing(originalAnswer);
        
        // Only include if there is actually a change
        if (originalAnswer !== fixedAnswer) {
            fixes.push({
                index,
                question: turn.question,
                originalAnswer,
                fixedAnswer,
                diffs: diffChars(originalAnswer, fixedAnswer)
            });
        }
    });

    if (fixes.length === 0) {
        alert('未检测到需要修复的格式问题。');
        return;
    }

    fixPreviewData.value = fixes;
    showFixModal.value = true;
};

const applyFixes = async () => {
    // Apply changes locally
    const updatedConversation = [...conversation.value];
    
    fixPreviewData.value.forEach(item => {
        const turn = updatedConversation[item.index];
        if (turn) {
            updatedConversation[item.index] = {
                ...turn,
                answer: item.fixedAnswer
            };
        }
    });
    
    isLoading.value = true;
    try {
        await updateConversation(props.fileHandle, updatedConversation);
        // Clear selection and close modal
        selectionState.value = [];
        showFixModal.value = false;
        fixPreviewData.value = [];
        await loadConversation();
    } catch (e) {
        console.error("修复保存失败:", e);
        alert('保存修复内容失败。');
    } finally {
        isLoading.value = false;
    }
};

const closeFixModal = () => {
    showFixModal.value = false;
    fixPreviewData.value = [];
    showRawDiff.value = false; // Reset toggle
};

const handleDragOver = (event: DragEvent, index: number) => {
    // Only handle if dragging a turn
    if (!draggedTurnState.value) return;
    
    event.preventDefault(); // Allow drop
    event.dataTransfer!.dropEffect = 'move';
    
    if (dropTargetIndex.value !== index) {
        dropTargetIndex.value = index;
    }
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
    
    // Set global state with slight delay to prevent drag cancellation due to layout shift
    // (Browser needs to initialize drag image from current DOM geometry before we compact it)
    setTimeout(() => {
        draggedTurnState.value = {
            indices: indicesToDrag,
            data: indicesToDrag.map(i => conversation.value[i]), // Full data
        };
    }, 0);
    
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

     if (!draggedTurnState.value) {
         return;
     }

     const sourceIndices = draggedTurnState.value.indices;
     
     // 1. Validate: Cannot drop ON any of the source items (no-op)
     if (sourceIndices.includes(dropIndex)) {
         return;
     }

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
     
     // 5. Optimization: Check if order actually changed
     const isOrderChanged = newConversation.some((turn, index) => turn !== conversation.value[index]);
     if (!isOrderChanged) {
         console.log('Drop ignored: Order unchanged');
         return;
     }

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

const moveUp = async (index: number) => {
    if (index === 0) return;
    
    // 保存当前滚动位置
    const container = document.querySelector('.viewer-content');
    const scrollTop = container?.scrollTop || 0;
    
    const newConversation = [...conversation.value];
    const item = newConversation[index]!;
    newConversation.splice(index, 1);
    newConversation.splice(index - 1, 0, item);
    
    // 不设置 isLoading,避免触发界面重新渲染导致滚动重置
    error.value = null;
    try {
        // 先更新本地状态,实现即时响应
        conversation.value = newConversation;
        
        // 恢复滚动位置
        await nextTick();
        if (container) {
            container.scrollTop = scrollTop;
        }
        
        // 后台保存到文件系统
        await updateConversation(props.fileHandle, newConversation);
    } catch (e) {
        console.error("上移失败:", e);
        error.value = e instanceof Error ? e.message : '上移时发生未知错误。';
        // 如果保存失败,重新加载以恢复正确状态
        await loadConversation();
    }
};

const moveDown = async (index: number) => {
    if (index >= conversation.value.length - 1) return;
    
    // 保存当前滚动位置
    const container = document.querySelector('.viewer-content');
    const scrollTop = container?.scrollTop || 0;
    
    const newConversation = [...conversation.value];
    const item = newConversation[index]!;
    newConversation.splice(index, 1);
    newConversation.splice(index + 1, 0, item);
    
    // 不设置 isLoading,避免触发界面重新渲染导致滚动重置
    error.value = null;
    try {
        // 先更新本地状态,实现即时响应
        conversation.value = newConversation;
        
        // 恢复滚动位置
        await nextTick();
        if (container) {
            container.scrollTop = scrollTop;
        }
        
        // 后台保存到文件系统
        await updateConversation(props.fileHandle, newConversation);
    } catch (e) {
        console.error("下移失败:", e);
        error.value = e instanceof Error ? e.message : '下移时发生未知错误。';
        // 如果保存失败,重新加载以恢复正确状态
        await loadConversation();
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


const shareStore = useShareStore();

const handleGenerateImageClick = () => {
    // Construct RenderedTurn array for the generator
    const turnsForImage = renderedConversation.value.map(turn => ({
        ...turn,
    })) as any[];
    
    // Prepare data
    const data = prepareShareData(selectionState.value, turnsForImage);
    if (data.length === 0) return;
    
    // Save to store
    shareStore.setPreviewTurns(data);
    
    // Open preview in new tab
    window.open('/share-preview', '_blank');
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

// ESC 键取消编辑
const handleKeyDown = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement;
    const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

    // 1. ESC to cancel editing OR clear selection OR exit sorting mode
    if (event.key === 'Escape') {
        if (editingTurn.value !== null) {
             cancelEditing();
             return;
        }
        if (isSortingMode.value) {
            isSortingMode.value = false;
            return;
        }
        if (selectionState.value.length > 0) {
            selectionState.value = [];
            return;
        }
    }

    // 2. 'e' to edit selected (if single selection)
    if ((event.key === 'e' || event.key === 'E') && !isInput) {
        if (editingTurn.value === null && selectionState.value.length === 1) {
            event.preventDefault();
            startEditing(selectionState.value[0]!.index);
            return;
        }
    }

    // 3. Delete/Backspace to delete selected items
    // Only if not in an input/textarea and not editing a turn
    if ((event.key === 'Delete' || event.key === 'Backspace') && !isInput && selectionState.value.length > 0) {
        handleDeleteSelected();
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
    window.addEventListener('keydown', handleKeyDown);
});

onUnmounted(() => {
    emitter.$off('turn-transfer-complete', handleTransferComplete);
    window.removeEventListener('keydown', handleKeyDown);
});
</script>

<template>
  <div class="conversation-viewer">
    <div class="viewer-header">
      <h2>{{ formattedFileName }}</h2>
      <div style="display: flex; gap: 10px; align-items: center;">
        <!-- Theme Selector -->
        <div class="theme-controls">
          <label class="toggle-all-themes">
            <input type="checkbox" v-model="showAllThemes" />
            <span class="label-text">全部主题</span>
          </label>
          <select 
            :value="currentTheme" 
            @change="(e) => applyTheme((e.target as HTMLSelectElement).value)"
            class="theme-select"
            title="选择代码高亮主题"
          >
            <option 
              v-for="theme in availableThemes" 
              :key="theme.value" 
              :value="theme.value"
              :disabled="(theme as any).disabled"
            >
              {{ theme.name }}
            </option>
          </select>
        </div>

        <button @click="toggleSortingMode" :class="{ 'active-btn': isSortingMode }">{{ isSortingMode ? '退出排序' : '排序' }}</button>
        <button @click="handleSelectAll" :disabled="isAllSelected">全选</button>
        <button @click="handleClearSelection" :disabled="selectionState.length === 0">清空</button>
        <button @click="handleCheckFormatting" :disabled="selectionState.length === 0" title="检查选中内容是否有Markdown格式问题">修复格式</button>
        <button @click="handleDeleteSelected" :disabled="selectionState.length === 0" class="danger-btn">删除</button>
        <button @click="handleGenerateImageClick" :disabled="selectionState.length === 0">分享</button>
      </div>
    </div>
    <div class="viewer-content">
      <div v-if="isLoading" class="status-message">正在加载对话...</div>
      <div v-else-if="error" class="status-message error"><strong>加载失败:</strong> {{ error }}</div>
      <div v-else class="chat-log" :class="{ 'is-dragging': !!draggedTurnState || isSortingMode }" @dragend="handleGlobalDragEnd">
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
          @move-up="moveUp(index)"
          @move-down="moveDown(index)"
          
          @dragstart="handleTurnDragStart($event, index)"
          @dragover="handleDragOver($event, index)"
          @drop="handleDrop($event, index)"
          :is-global-dragging="!!draggedTurnState || isSortingMode"
          :class="{ 'drop-target': dropTargetIndex === index && !isDropRedundant(index) }"
        />
        
        <!-- End Drop Zone -->
        <div 
           class="drop-zone-end"
           @dragover="handleDragOver($event, conversation.length)"
           @drop="handleDrop($event, conversation.length)"
           :class="{ active: dropTargetIndex === conversation.length && !isDropRedundant(conversation.length) }"
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
                @keydown.meta.enter="addTurn"
                @keydown.ctrl.enter="addTurn"
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



  <!-- Markdown Fix Preview Modal -->
  <div v-if="showFixModal" class="modal-overlay">
      <div class="modal-content fix-modal">
          <div class="modal-header">
              <h3>格式修复预览</h3>
               <div class="header-actions">
                   <label class="toggle-switch">
                       <input type="checkbox" v-model="showRawDiff">
                       <span class="slider"></span>
                       <span class="label-text">显示源码对比</span>
                   </label>
                   <button class="close-btn" @click="closeFixModal">×</button>
               </div>
          </div>
          <div class="modal-body">
              <p class="hint">检测到以下 {{ fixPreviewData.length }} 处格式问题，请确认修复：</p>
              <div class="fix-list">
                  <div v-for="(item, idx) in fixPreviewData" :key="idx" class="fix-item">
                      <div class="fix-source">
                          <strong>问题 #{{ item.index + 1 }}</strong>
                          <span v-if="item.question"> (Q: {{ item.question.substring(0, 20) }}...)</span>
                      </div>
                      <div class="diff-container" v-if="!showRawDiff">
                        <div class="diff-box original">
                            <div class="diff-label">原内容</div>
                            <div class="markdown-preview" v-html="marked(item.originalAnswer)"></div>
                        </div>
                        <div class="diff-arrow">➡️</div>
                        <div class="diff-box fixed">
                            <div class="diff-label">修复后</div>
                            <div class="markdown-preview" v-html="marked(item.fixedAnswer)"></div>
                        </div>
                      </div>
                      
                      <!-- Raw Diff View -->
                      <div class="diff-container raw-mode" v-else>
                          <div class="diff-box">
                              <div class="diff-label">源码差异</div>
                              <pre class="code-diff"><code><template v-for="(part, pIdx) in item.diffs" :key="pIdx"><span :class="'diff-' + part.type">{{ part.value }}</span></template></code></pre>
                          </div>
                      </div>
                  </div>
              </div>
          </div>
          <div class="modal-footer">
              <button class="cancel-btn" @click="closeFixModal">取消</button>
              <button class="confirm-btn" @click="applyFixes" :disabled="isLoading">
                  {{ isLoading ? '应用中...' : '确认应用修复' }}
              </button>
          </div>
      </div>
  </div>
</template>

<style scoped>
/* Fix Modal Styles */
.modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.header-actions {
    display: flex;
    gap: 15px;
    align-items: center;
}

.header-actions button {
  background-color: var(--primary-color);
  color: white;
  border: none;
  border-radius: 4px;
  padding: 8px 16px;
  cursor: pointer;
  font-size: 0.9rem;
  min-width: 100px; /* Wider for easier clicking */
  display: flex;
  align-items: center;
  justify-content: center;
}

.toggle-switch {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    font-size: 0.9em;
    user-select: none;
}

.code-diff {
    background: #f6f8fa;
    padding: 10px;
    border-radius: 4px;
    white-space: pre-wrap;
    font-family: monospace;
    margin: 0;
    overflow-x: auto;
    font-size: 1.1em; /* Increased from 0.9em */
    line-height: 1.6;
}

.diff-added {
    background-color: #acf2bd;
    color: #1a7f37;
    text-decoration: none;
}

.diff-removed {
    background-color: #ffdce0;
    color: #cf222e;
    text-decoration: line-through;
}

/* ... existing styles ... */
.fix-modal {
    max-width: 80vw;
    max-height: 90vh;
    width: 90%;
}

.fix-list {
    overflow-y: auto;
    max-height: 60vh;
    padding: 10px;
    background: #f8f9fa;
    border-radius: 6px;
}

.fix-item {
    margin-bottom: 20px;
    padding: 15px;
    background: white;
    border: 1px solid #e9ecef;
    border-radius: 6px;
}

.fix-source {
    margin-bottom: 10px;
    font-size: 0.9em;
    color: #6c757d;
}

.diff-container {
    display: flex;
    align-items: stretch;
    gap: 10px;
}

.diff-box {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
}

.diff-label {
    font-size: 0.8rem;
    font-weight: bold;
    margin-bottom: 5px;
    color: #495057;
}

.markdown-preview {
    padding: 10px;
    border-radius: 4px;
    font-size: 0.85rem;
    margin: 0;
    flex: 1;
    overflow-x: auto;
    line-height: 1.5;
}

.diff-box.fixed .markdown-preview {
    background: #e6fffa;
    border: 1px solid #b2f5ea;
}

.diff-box.original .markdown-preview {
    background: #fff5f5;
    border: 1px solid #fed7d7;
}

/* Basic styling for markdown content inside preview */
.markdown-preview :deep(p) {
    margin: 0.5em 0;
}
.markdown-preview :deep(ul), .markdown-preview :deep(ol) {
    padding-left: 20px;
    margin: 0.5em 0;
}
.markdown-preview :deep(code) {
    background: rgba(0,0,0,0.05);
    padding: 2px 4px;
    border-radius: 3px;
    font-family: monospace;
}
.markdown-preview :deep(pre) {
    background: #f8f9fa;
    padding: 10px;
    border-radius: 4px;
    overflow-x: auto;
    margin: 0.5em 0;
}

.diff-arrow {
    display: flex;
    align-items: center;
    font-size: 1.2rem;
    color: #adb5bd;
}

.modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2000;
}
.modal-content {
    background: white;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    display: flex;
    flex-direction: column;
}
.modal-header {
    padding: 15px 20px;
    border-bottom: 1px solid #eee;
    display: flex;
    justify-content: space-between;
    align-items: center;
}
.modal-body {
    padding: 20px;
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}
.modal-footer {
    padding: 15px 20px;
    border-top: 1px solid #eee;
    display: flex;
    justify-content: flex-end;
    gap: 10px;
}
.close-btn {
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    line-height: 1;
}
.confirm-btn {
    background: var(--primary-color);
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 4px;
    cursor: pointer;
}
.confirm-btn:hover {
    filter: brightness(90%);
}
.cancel-btn {
    background: white;
    border: 1px solid #ced4da;
    padding: 8px 16px;
    border-radius: 4px;
    cursor: pointer;
}

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
/* Theme Controls */
.theme-controls {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-right: 8px;
    border-right: 1px solid #e9ecef;
    padding-right: 12px;
}

.theme-select {
    padding: 6px 10px;
    border-radius: 4px;
    border: 1px solid #ced4da;
    background-color: white;
    font-size: 13px;
    color: #495057;
    cursor: pointer;
    outline: none;
    max-width: 140px;
}
.theme-select:focus {
    border-color: var(--primary-color);
}

.toggle-all-themes {
    display: flex;
    align-items: center;
    cursor: pointer;
    white-space: nowrap;
}

.toggle-all-themes .label-text {
    font-size: 13px;
    margin-left: 4px;
    color: #6c757d;
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

.active-btn {
    background-color: var(--primary-color);
    color: white;
    border: none;
}

.chat-log {
    display: flex;
    flex-direction: column;
    gap: 40px; /* Increase spacing between turns */
    padding-top: 10px; /* Ensure space for first item drop indicator */
}

/* Global dragging state styles */
.chat-log.is-dragging {
    gap: 10px; /* Reduced gap during drag */
}

/* ChatTurn styles (Deep selector or if ChatTurn is root, we can style it via class passed from parent) */
/* Since ChatTurn is a component, the class 'drop-target' falls through to its root element */
:deep(.chat-turn) {
    position: relative;
    /* Ensure transition for gap change if possible? No, gap is on parent. */
}

:deep(.chat-turn.drop-target::before) {
    content: '';
    position: absolute;
    top: -5px; /* Half of 10px gap */
    left: 0;
    right: 0;
    height: 2px;
    background-color: var(--primary-color);
    z-index: 10;
    pointer-events: none;
}


</style>
