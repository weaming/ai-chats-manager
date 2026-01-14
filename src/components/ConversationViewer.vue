<script setup lang="ts">
import { ref, watch, computed, onBeforeUpdate } from 'vue';
import type { PropType } from 'vue';
import { useFileSystem, type FullConversationTurn } from '../composables/useFileSystem';
import { marked } from 'marked';
import { toPng } from 'html-to-image';

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
const editingTurn = ref<{ index: number; question: string | null; answer: string } | null>(null);
const editingTurnHeight = ref(0);
const turnRefs = ref<HTMLElement[]>([]);

const setTurnRef = (el: any) => {
  if (el) {
    turnRefs.value.push(el);
  }
};

onBeforeUpdate(() => {
  turnRefs.value = [];
});


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

const startEditing = (turn: FullConversationTurn, index: number) => {
    // Get the height of the turn element before we hide it
    const turnEl = turnRefs.value[index];
    if (turnEl) {
        editingTurnHeight.value = turnEl.offsetHeight;
    }

    // Need to get the raw markdown, not the rendered HTML
    const originalTurn = conversation.value[index];
    editingTurn.value = {
        index,
        question: originalTurn.question,
        answer: originalTurn.answer,
    };
    // Also, clear selection for this turn
    selectionState.value = selectionState.value.filter(s => s.index !== index);
};

const cancelEditing = () => {
    editingTurn.value = null;
    editingTurnHeight.value = 0;
};

const saveEditing = async () => {
    if (!editingTurn.value) return;

    const { index, question, answer } = editingTurn.value;
    
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
        editingTurnHeight.value = 0;
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
      answer: editingTurn.value?.index === index ? turn.answer : marked(turn.answer),
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
  const element = document.getElementById('share-container');
  if (!element) return;

  // 1. Get all the CSS rules from the document
  let css = '';
  for (let i = 0; i < document.styleSheets.length; i++) {
    const sheet = document.styleSheets[i];
    try {
      if (sheet.cssRules) {
        for (let j = 0; j < sheet.cssRules.length; j++) {
          css += sheet.cssRules[j].cssText;
        }
      }
    } catch (e) {
      console.warn("Can't read the css rules of: " + sheet.href, e);
    }
  }

  // 2. Build the HTML content
  let contentHtml = '';
  // Get the selected and rendered turns
  const selectedRenderedTurns = selectionState.value
    .sort((a, b) => a.index - b.index)
    .map(selection => {
      // Find the corresponding rendered turn, which includes questionNumber and pre-marked answer
      const renderedTurn = renderedConversation.value[selection.index];
      return {
        selection,
        turn: renderedTurn
      };
    })
    .filter(item => item.turn); // Filter out any potentially undefined turns

  selectedRenderedTurns.forEach(item => {
    const selection = item.selection;
    const turn = item.turn; // Use the rendered turn here, which includes questionNumber and marked answer
    
    if (turn) {
      // Add more spacing between turns
      contentHtml += `<div style="margin-bottom: 30px;">`; // Increased spacing for the whole turn
      if (selection.question && turn.question) {
        contentHtml += `<div style="background-color: #e9ecef; padding: 10px; border-radius: 5px; margin-bottom: 10px; display: flex; align-items: flex-start;">`;
        if (turn.questionNumber > 0 && selectedRenderedTurns.length > 1) {
            // Replicate the .question-number styling for the generated image
            contentHtml += `<span style="background-color: #f1f3f5; border: 1px solid #dee2e6; border-radius: 50%; color: #495057; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 500; height: 24px; width: 24px; flex-shrink: 0; margin-right: 8px; /* Slightly increased margin for better spacing */">${turn.questionNumber}</span>`;
        }
        contentHtml += `<div style="flex-grow: 1; font-size: 1.3rem;">${turn.question}</div></div>`;
      }
      // The answer part needs to use the already marked-up answer from renderedTurn
      if (selection.answer) {
        contentHtml += `<div class="markdown-body">${turn.answer}</div>`; // Use turn.answer which is already marked(turn.answer)
      }
      contentHtml += `</div>`; // Close the turn spacing div
    }
  });

  // 3. Inject styles and content
  element.innerHTML = `<style>${css}</style>${contentHtml}`;
  
  // 4. Temporarily make the element visible for rendering
  element.style.visibility = 'visible';
  element.style.position = 'absolute'; // Changed from fixed to absolute to avoid potential viewport issues with very large content
  element.style.top = '0';
  element.style.left = '0';
  element.style.width = '800px'; // Ensure width is maintained for consistency
  element.style.height = 'auto'; // Ensure height is allowed to expand

  // Add a small delay to allow the browser to render the dynamically injected content
  await new Promise(resolve => setTimeout(resolve, 100));

  try {
    const dataUrl = await toPng(element, {
      cacheBust: true,
      skipAutoScale: true,
      pixelRatio: 3, // A pixelRatio of 2 provides good clarity without excessively large file sizes
      // No explicit width/height here, let html-to-image calculate based on element's rendered size
    });
    const link = document.createElement('a');
    link.download = `ai-chat-${Date.now()}.png`;
    link.href = dataUrl;
    link.click();
  } catch (error) {
    console.error('oops, something went wrong!', error);
  } finally {
    // 5. Hide the element again
    element.style.visibility = 'hidden';
    element.style.top = '-9999px';
  }
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
      question: turn.question && turn.question.trim().length > 0, // Only select question if it exists
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
        <div 
          v-for="(turn, index) in renderedConversation" 
          :key="index" 
          class="chat-turn"
          :ref="setTurnRef"
        >
          <!-- Left Column: Controls -->
          <div class="turn-controls">
            <template v-if="editingTurn?.index !== index">
              <span v-if="turn.questionNumber > 0" class="question-number">{{ turn.questionNumber }}</span>
              <button v-if="turn.questionNumber > 0" class="edit-btn" @click.stop="startEditing(turn, index)">✏️</button>
            </template>
          </div>

          <!-- Right Column: Content -->
          <div class="turn-content">
            <!-- Viewing Mode -->
            <div v-if="editingTurn?.index !== index" @click="handleTurnClick(index)">
              <div 
                v-if="turn.questionNumber > 0" 
                class="chat-bubble question"
                @click.stop="handleQuestionClick(index)"
              >
                <div class="bubble-content" :class="{ active: getTurnSelection(index)?.question }">{{ turn.question }}</div>
              </div>
              <div class="chat-bubble answer">
                <div class="bubble-content markdown-body" :class="{ active: getTurnSelection(index)?.answer }" v-html="turn.answer"></div>
              </div>
            </div>

            <!-- Editing Mode -->
            <div v-else class="editing-view" :style="{ minHeight: editingTurnHeight + 'px' }">
               <div v-if="editingTurn.question !== null" class="editing-group">
                  <label>问题</label>
                  <textarea v-model="editingTurn.question" rows="3"></textarea>
               </div>
               <div class="editing-group answer-group">
                  <label>回答</label>
                  <textarea v-model="editingTurn.answer" class="answer-textarea"></textarea>
               </div>
               <div class="editing-actions">
                  <button class="primary-btn" @click="saveEditing">保存</button>
                  <button class="secondary-btn" @click="cancelEditing">取消</button>
               </div>
            </div>
          </div>
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

.chat-log {
  display: flex;
  flex-direction: column;
  gap: 20px; /* Spacing between each turn */
}

.chat-turn {
  display: flex;
  gap: 15px; /* Space between left and right columns */
}

.turn-controls {
  flex-shrink: 0;
  width: 40px; /* Fixed width for the left column */
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start; /* Align to the top */
  padding-top: 5px; /* Align with the top of the bubble */
}

.turn-content {
  flex-grow: 1;
}

.edit-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 16px;
  padding: 5px 0;
  margin-top: 5px; /* Space between number and button */
  color: #6c757d;
}
.edit-btn:hover {
  color: var(--primary-color);
}

.chat-bubble {
  display: flex;
  width: 100%; /* Bubbles now take full width of the right column */
  align-items: flex-start;
}

.bubble-content {
  padding: 12px 18px;
  border-radius: 18px;
  line-height: 1.6;
  border: 2px solid var(--border-color);
  background-clip: padding-box;
  width: 100%;
}

.bubble-content.active {
    border-color: var(--primary-color);
}

.question-number {
  background-color: #f1f3f5;
  border: 1px solid #dee2e6;
  border-radius: 50%;
  color: #495057;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 500;
  height: 24px;
  width: 24px;
  flex-shrink: 0;
}

/* Question and Answer bubbles are now left-aligned by default */
.chat-bubble.question {
  margin-bottom: 15px; /* Space between Q and A */
}
.question .bubble-content {
  background-color: #e9ecef;
  color: #343a40;
}

.answer .bubble-content {
  background-color: #f8f9fa;
  color: #212529;
}

/* Editing View Styles */
.editing-view {
    padding: 15px;
    border: 1px dashed var(--primary-color);
    border-radius: 8px;
    background-color: #f8f9fa;
    display: flex;
    flex-direction: column;
}
.editing-group {
    margin-bottom: 15px;
}
.editing-group.answer-group {
    flex-grow: 1;
    display: flex;
    flex-direction: column;
}
.editing-group label {
    display: block;
    margin-bottom: 5px;
    font-weight: 500;
    color: #495057;
}
.editing-group textarea {
    width: 100%;
    padding: 10px;
    border-radius: 4px;
    border: 1px solid #ced4da;
    font-family: inherit;
    font-size: 14px;
    line-height: 1.5;
    resize: vertical;
}
.editing-group textarea.answer-textarea {
    flex-grow: 1;
}
.editing-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 15px;
}
.editing-actions button {
    padding: 8px 16px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
}
.editing-actions .primary-btn {
    background-color: var(--primary-color);
    color: white;
}
.editing-actions .secondary-btn {
    background-color: #6c757d;
    color: white;
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
