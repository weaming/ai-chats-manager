<script setup lang="ts">
import { ref, watch, computed, onBeforeUpdate } from 'vue';
import type { PropType } from 'vue';
import { useFileSystem, type FullConversationTurn } from '../composables/useFileSystem';
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
const conversation = ref<FullConversationTurn[]>([]);
const isLoading = ref(false);
const error = ref<string | null>(null);
const editingTurn = ref<{ index: number } | null>(null);


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

const renderedConversation = computed(() => {
  let questionCounter = 0;
  return conversation.value.map((turn, index) => {
    const hasQuestion = turn.question && turn.question.trim().length > 0;
    if (hasQuestion) {
      questionCounter++;
    }
    return {
      ...turn,
      // We only render markdown when not editing that specific turn
      answer: (editingTurn.value?.index === index ? turn.answer : marked(turn.answer)) as string,
      index: index,
      questionNumber: hasQuestion ? questionCounter : 0,
    };
  });
});

const formattedFileName = computed(() => {
    return props.fileHandle.name.replace('.json', '');
});

const loadConversation = async () => {
  isLoading.value = true;
  error.value = null;
  conversation.value = [];
  editingTurn.value = null; // Reset editing state on load
  selectionState.value = []; // Reset selection
  try {
    conversation.value = await readConversation(props.fileHandle);
  } catch (e) {
    console.error(e);
    error.value = e instanceof Error ? e.message : '一个未知的错误发生了。';
  } finally {
    isLoading.value = false;
  }
};

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

watch(() => props.fileHandle, loadConversation, { immediate: true });
</script>

<template>
  <div class="conversation-viewer">
    <div class="viewer-header">
      <h2>{{ formattedFileName }}</h2>
      <div style="display: flex; gap: 10px;">
        <button @click="handleSelectAll">全选</button>
        <button @click="generateImage" :disabled="selectionState.length === 0">分享</button>
      </div>
    </div>
    <div class="viewer-content">
      <div v-if="isLoading" class="status-message">正在加载对话...</div>
      <div v-else-if="error" class="status-message error"><strong>加载失败:</strong> {{ error }}</div>
      <div v-else class="chat-log">
        <ChatTurn 
          v-for="(turn, index) in renderedConversation" 
          :key="index"
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
        />
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
