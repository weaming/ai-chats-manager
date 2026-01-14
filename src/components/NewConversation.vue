<script setup lang="ts">
import { ref } from 'vue';
import { useFileSystem } from '../composables/useFileSystem';
import type { FileEntry } from '../composables/useFileSystem';

const emit = defineEmits(['conversation-created']);

// Interface for a single turn in the conversation UI
interface ConversationTurn {
  question: string | null;
  answer: string;
}

// Composable for file system access
const { rootHandle, saveConversation } = useFileSystem();

// Component state
const currentQuestion = ref('');
const currentAnswer = ref('');
const conversationTurns = ref<ConversationTurn[]>([]);

/**
 * Adds the current question/answer pair to the conversation list.
 */
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
};

/**
 * Finalizes the conversation, saves it, and emits an event.
 */
const completeConversation = async () => {
  if (currentAnswer.value.trim() || currentQuestion.value.trim()) {
    addTurn();
  }

  if (conversationTurns.value.length === 0) {
    alert('对话内容不能为空');
    return;
  }

  const newFile = await saveConversation(conversationTurns.value);

  if (newFile) {
    emit('conversation-created', newFile);
  }

  // Clear the UI for a new conversation
  conversationTurns.value = [];
};
</script>

<template>
  <div class="new-conversation-container">
    <h2>新建对话</h2>

    <!-- Input fields for question and answer -->
    <div class="input-group">
      <label for="question-input">问题 (可选):</label>
      <textarea id="question-input" v-model="currentQuestion" placeholder="请输入用户的问题"></textarea>
    </div>
    <div class="input-group">
      <label for="answer-input">回答 (必填):</label>
      <textarea id="answer-input" v-model="currentAnswer" placeholder="请输入 Gemini 的回答（Markdown 格式）"></textarea>
    </div>

    <!-- Action Buttons -->
    <div class="buttons">
      <button @click="addTurn">下一条</button>
      <button @click="completeConversation" :disabled="!rootHandle">完成</button>
    </div>

    <!-- Live Preview of the conversation -->
    <div v-if="conversationTurns.length > 0" class="preview">
      <h3>当前对话预览:</h3>
      <div v-for="(turn, index) in conversationTurns" :key="index" class="turn">
        <p v-if="turn.question"><strong>问:</strong> {{ turn.question }}</p>
        <p><strong>答:</strong> {{ turn.answer.substring(0, 100) }}...</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.new-conversation-container {
  padding: 20px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background-color: #fff;
}

h2 {
  color: #333;
  text-align: center;
  margin-bottom: 20px;
}

.input-group {
  margin-bottom: 15px;
}

label {
  display: block;
  margin-bottom: 5px;
  font-weight: bold;
  color: #555;
}

textarea {
  width: 100%;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  min-height: 250px;
  box-sizing: border-box;
  resize: vertical;
}

textarea:focus {
  border-color: #007bff;
  outline: none;
  box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
}

.buttons {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}

button {
  padding: 10px 20px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 16px;
  transition: background-color 0.2s ease, opacity 0.2s ease;
}

button:disabled {
  background-color: #ced4da;
  cursor: not-allowed;
  opacity: 0.7;
}

.buttons button:first-of-type {
  background-color: #6c757d;
  color: white;
}

.buttons button:first-of-type:hover {
  background-color: #5a6268;
}

.buttons button:last-of-type {
  background-color: #007bff;
  color: white;
}

.buttons button:last-of-type:hover {
  background-color: #0056b3;
}

.preview {
  margin-top: 30px;
  padding-top: 20px;
  border-top: 1px dashed #eee;
}

.preview h3 {
  color: #333;
  margin-bottom: 15px;
}

.turn {
  background-color: #f9f9f9;
  border: 1px solid #eee;
  border-radius: 6px;
  padding: 10px;
  margin-bottom: 10px;
}

.turn p {
  margin: 5px 0;
  line-height: 1.5;
}

.turn strong {
  color: #007bff;
}
</style>
