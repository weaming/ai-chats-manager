<script setup lang="ts">
import { ref, computed, nextTick, watch } from 'vue';
import { useFileSystem, type FullConversationTurn } from '../composables/useFileSystem';
import ChatTurn from './ChatTurn.vue';
import { marked } from 'marked';

const emit = defineEmits(['conversation-created']);

const { rootHandle, saveConversation } = useFileSystem();

const currentQuestion = ref('');
const currentAnswer = ref('');
const conversationTurns = ref<FullConversationTurn[]>([]);
const editingTurn = ref<{ index: number } | null>(null);

// Auto-scroll to bottom when new turn added
const chatLogRef = ref<HTMLElement | null>(null);
const scrollToBottom = async () => {
    await nextTick();
    if (chatLogRef.value) {
        chatLogRef.value.scrollTop = chatLogRef.value.scrollHeight;
    }
};

const addTurn = () => {
  if (!currentAnswer.value.trim()) {
    alert('回答不能为空');
    return;
  }

  conversationTurns.value.push({
    question: currentQuestion.value.trim() || null,
    answer: currentAnswer.value.trim(),
  });

  // Reset inputs for the next turn
  currentQuestion.value = '';
  currentAnswer.value = '';
  
  scrollToBottom();
};

const completeConversation = async () => {
  // If there is content in inputs, ask to add it first
  if (currentAnswer.value.trim() || currentQuestion.value.trim()) {
      if (confirm('输入框中还有未添加的内容，是否将其添加到对话中？')) {
          addTurn();
      } else {
        // User chose not to add, check if list is valid
         if (conversationTurns.value.length === 0) return;
      }
  }

  if (conversationTurns.value.length === 0) {
    alert('对话内容不能为空');
    return;
  }

  const newFile = await saveConversation(conversationTurns.value);

  if (newFile) {
    emit('conversation-created', newFile);
    // Clear UI
    conversationTurns.value = [];
  }
};

// --- Edit / Delete Logic (Mirrors ConversationViewer) ---

const startEditing = (index: number) => {
    editingTurn.value = { index };
};

const cancelEditing = () => {
    editingTurn.value = null;
};

const saveEditing = (index: number, payload: { question: string | null; answer: string }) => {
    const { question, answer } = payload;
    conversationTurns.value[index] = { question, answer };
    editingTurn.value = null;
};

const deleteTurn = (index: number) => {
    if (!confirm('确定要删除这个问答回合吗？')) return;
    conversationTurns.value.splice(index, 1);
    if (editingTurn.value?.index === index) {
        editingTurn.value = null;
    }
};

// --- Computed ---

const renderedTurns = computed(() => {
    let questionCounter = 0;
    return conversationTurns.value.map((turn, index) => {
        // Increment sequence for every turn
        questionCounter++;
        
        return {
            ...turn,
            // Render markdown to HTML for display
            answer: (editingTurn.value?.index === index ? turn.answer : marked(turn.answer)) as string,
            index,
            questionNumber: index + 1
        };
    });
});

</script>

<template>
  <div class="new-conversation-container">
    <div class="header">
        <h2>新建对话</h2>
        <button class="save-btn" @click="completeConversation" :disabled="!rootHandle || conversationTurns.length === 0">
            完成创建
        </button>
    </div>

    <!-- Chat History Area -->
    <div class="chat-log-area" ref="chatLogRef">
        <div v-if="conversationTurns.length === 0" class="empty-state">
            <div class="empty-icon">📝</div>
            <h3>开始一个新的对话</h3>
            <p>在下方输入问题和回答，点击“添加”来构建对话。</p>
        </div>
        
        <div class="chat-log">
             <ChatTurn 
              v-for="(turn, index) in renderedTurns" 
              :key="index"
              :turn="turn"
              :raw-turn="conversationTurns[index]!"
              :index="index"
              :is-editing="editingTurn?.index === index"
              @edit-start="startEditing(index)"
              @edit-cancel="cancelEditing"
              @edit-save="(payload) => saveEditing(index, payload)"
              @delete="deleteTurn(index)"
            />
        </div>
    </div>

    <!-- Input Area -->
    <div class="input-area">
        <label>添加新问答</label>
        <div class="input-grid">
            <textarea 
                v-model="currentQuestion" 
                placeholder="用户提问 (可选)" 
                class="input-question"
                rows="2"
            ></textarea>
            <textarea 
                v-model="currentAnswer" 
                placeholder="AI 回答 (必填，支持 Markdown)" 
                class="input-answer"
                rows="4"
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
</template>

<style scoped>
.new-conversation-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    background-color: #fff;
    border-radius: 8px; /* Assuming embedded in parent padding */
}

.header {
    flex-shrink: 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 15px 20px;
    border-bottom: 1px solid var(--border-color);
}

.header h2 {
    margin: 0;
    font-size: 1.2rem;
    color: #333;
}

.save-btn {
    padding: 8px 16px;
    background-color: #28a745; /* Green for success/save */
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 500;
}
.save-btn:disabled {
    background-color: #94d3a2;
    cursor: not-allowed;
}
.save-btn:not(:disabled):hover {
    background-color: #218838;
}

.chat-log-area {
    flex-grow: 1;
    overflow-y: auto;
    padding: 20px;
    background-color: #fff;
}

.chat-log {
    display: flex;
    flex-direction: column;
    gap: 40px; /* Consitent with Viewer */
}

.empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #adb5bd;
    text-align: center;
}
.empty-icon {
    font-size: 3rem;
    margin-bottom: 15px;
}

.input-area {
    flex-shrink: 0;
    padding: 20px;
    background-color: #f8f9fa;
    border-top: 1px solid var(--border-color);
}

.input-area label {
    display: block;
    margin-bottom: 10px;
    font-weight: bold;
    color: #495057;
    font-size: 0.9rem;
}

.input-grid {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

textarea {
    width: 100%;
    padding: 10px;
    border: 1px solid #ced4da;
    border-radius: 6px;
    resize: vertical;
    font-family: inherit;
    font-size: 14px;
    line-height: 1.5;
}

textarea:focus {
    outline: none;
    border-color: var(--primary-color);
    box-shadow: 0 0 0 2px rgba(0,123,255, 0.1);
}

.input-question {
    min-height: 40px;
}
.input-answer {
    min-height: 80px;
}

.input-actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 10px;
}

.hint {
    font-size: 0.8rem;
    color: #868e96;
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
    opacity: 0.6;
    cursor: not-allowed;
}
.add-btn:not(:disabled):hover {
    background-color: #0056b3;
}

</style>
