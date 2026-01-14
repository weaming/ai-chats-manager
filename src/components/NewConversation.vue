<script setup lang="ts">
import { ref, computed, nextTick, watch, onMounted, onUnmounted } from 'vue';
import { useFileSystem, type FullConversationTurn } from '../composables/useFileSystem';
import ChatTurn from './ChatTurn.vue';
import { marked } from 'marked';
import { parseGeminiContent } from '../utils/geminiParser';

const emit = defineEmits(['conversation-created']);

const { rootHandle, saveConversation } = useFileSystem();

const currentQuestion = ref('');
const currentAnswer = ref('');
const conversationTurns = ref<FullConversationTurn[]>([]);
const editingTurn = ref<{ index: number } | null>(null);

const showImportModal = ref(false);
const importText = ref('');
const fileInputRef = ref<HTMLInputElement | null>(null);

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

// ESC 键取消编辑
const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && editingTurn.value !== null) {
        cancelEditing();
    }
};

onMounted(() => {
    window.addEventListener('keydown', handleKeyDown);
});

onUnmounted(() => {
    window.removeEventListener('keydown', handleKeyDown);
});

const saveEditing = (index: number, payload: { question: string | null; answer: string }) => {
    const { question, answer } = payload;
    conversationTurns.value[index] = { question, answer };
    editingTurn.value = null;
};

const deleteTurn = (index: number) => {
    if (!confirm('确定要删除这个问答回合吗?')) return;
    conversationTurns.value.splice(index, 1);
    if (editingTurn.value?.index === index) {
        editingTurn.value = null;
    }
};

const moveUp = (index: number) => {
    if (index === 0) return;
    // 使用 splice 确保 Vue 能检测到变化
    const item = conversationTurns.value[index]!;
    conversationTurns.value.splice(index, 1);
    conversationTurns.value.splice(index - 1, 0, item);
};

const moveDown = (index: number) => {
    if (index >= conversationTurns.value.length - 1) return;
    // 使用 splice 确保 Vue 能检测到变化
    const item = conversationTurns.value[index]!;
    conversationTurns.value.splice(index, 1);
    conversationTurns.value.splice(index + 1, 0, item);
};

const clearAllTurns = () => {
    if (!confirm('确定要清空所有对话吗？')) return;
    conversationTurns.value = [];
    editingTurn.value = null;
};

const openImportModal = () => {
    showImportModal.value = true;
    importText.value = '';
};

const closeImportModal = () => {
    showImportModal.value = false;
    importText.value = '';
};

const importFromText = () => {
    if (!importText.value.trim()) {
        alert('请粘贴要导入的内容');
        return;
    }

    try {
        const parsedTurns = parseGeminiContent(importText.value);
        
        if (parsedTurns.length === 0) {
            alert('无法解析内容\n\n可能原因:\n• 文本中没有找到问题/回答标记\n• 格式不符合已知模式\n\n请查看下方帮助文本了解支持的格式');
            return;
        }

        conversationTurns.value.push(...parsedTurns);
        closeImportModal();
        scrollToBottom();
    } catch (error) {
        console.error('Import error:', error);
        alert('导入失败\n\n错误: ' + (error instanceof Error ? error.message : '未知错误') + '\n\n请检查内容格式或联系开发者');
    }
};

const triggerFileInput = () => {
    fileInputRef.value?.click();
};

const handleFileUpload = async (event: Event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    
    if (!file) return;
    
    const isJsonOrMd = file.name.endsWith('.json') || file.name.endsWith('.md');
    if (!isJsonOrMd) {
        alert('请选择 JSON 或 Markdown 格式的文件');
        return;
    }
    
    try {
        const text = await file.text();
        const parsedTurns = parseGeminiContent(text);
        
        if (parsedTurns.length === 0) {
            alert(`无法解析文件: ${file.name}\n\n可能原因:\n• 文件中没有找到问题/回答标记\n• 格式不符合已知模式\n\n请确认文件是由 AI Exporter 或 Gemini Exporter 导出的`);
            return;
        }
        
        conversationTurns.value.push(...parsedTurns);
        closeImportModal();
        scrollToBottom();
        
        // Reset file input
        if (input) input.value = '';
    } catch (error) {
        console.error('File import error:', error);
        alert(`文件导入失败: ${file.name}\n\n错误: ` + (error instanceof Error ? error.message : '未知错误') + '\n\n请检查文件格式或联系开发者');
        if (input) input.value = '';
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
        <div class="header-actions">
            <button v-if="conversationTurns.length > 0" class="clear-btn" @click="clearAllTurns">
                🗑️ 清空
            </button>
            <button class="import-btn" @click="openImportModal" :disabled="!rootHandle">
                📥 从文本导入
            </button>
            <button class="save-btn" @click="completeConversation" :disabled="!rootHandle || conversationTurns.length === 0">
                完成创建
            </button>
        </div>
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
              @move-up="moveUp(index)"
              @move-down="moveDown(index)"
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

    <!-- Import Modal -->
    <div v-if="showImportModal" class="modal-overlay" @click="closeImportModal">
        <div class="modal-content" @click.stop>
            <div class="modal-header">
                <h3>从文本导入对话</h3>
                <button class="close-btn" @click="closeImportModal">✕</button>
            </div>
            <div class="modal-body">
                <p class="modal-hint">
                    <strong>📥 支持的格式:</strong>
                    <br>• <strong>文件上传:</strong> JSON 或 Markdown 格式 (推荐)
                    <br>• <strong>文本粘贴:</strong> 任意对话文本
                    <br>
                    <br><strong>🔍 智能识别逻辑:</strong>
                    <br>系统会自动识别以下关键词:
                    <br>• 问题标记: <code>Prompt</code>, <code>Question</code>, <code>Asked</code>, <code>提问</code>, <code>问题</code>
                    <br>• 回答标记: <code>Response</code>, <code>Responded</code>, <code>Answer</code>, <code>回答</code>, <code>助手</code>
                    <br>
                    <br><strong>🔌 推荐扩展:</strong>
                    <br>• <a href="https://chromewebstore.google.com/detail/kagjkiiecagemklhmhkabbalfpbianbe" target="_blank">AI Exporter</a> - 支持  ChatGPT, Gemini, Claude, DeepSeek, Grok
                    <br>• <a href="https://chromewebstore.google.com/detail/jfepajhaapfonhhfjmamediilplchakk" target="_blank">Gemini Exporter</a> - 专用于 Gemini
                </p>
                <div class="import-options">
                    <button class="file-upload-btn" @click="triggerFileInput">
                        📁 选择文件 (Markdown/JSON)
                    </button>
                    <span class="or-divider">或</span>
                </div>
                <input 
                    type="file" 
                    ref="fileInputRef"
                    accept=".json,.md"
                    @change="handleFileUpload"
                    style="display: none;"
                />
                <textarea 
                    v-model="importText" 
                    placeholder="粘贴 Gemini 对话内容..." 
                    class="import-textarea"
                    rows="15"
                ></textarea>
            </div>
            <div class="modal-footer">
                <button class="cancel-btn" @click="closeImportModal">取消</button>
                <button class="confirm-btn" @click="importFromText">导入</button>
            </div>
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
    border-radius: 8px;
    position: relative;
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

.header-actions {
    display: flex;
    gap: 10px;
}

.import-btn {
    padding: 8px 16px;
    background-color: #007bff;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 500;
}
.import-btn:disabled {
    background-color: #6c757d;
    cursor: not-allowed;
    opacity: 0.6;
}
.import-btn:not(:disabled):hover {
    background-color: #0056b3;
}

.save-btn {
    padding: 8px 16px;
    background-color: #28a745;
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

.clear-btn {
    padding: 8px 16px;
    background-color: #dc3545;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    transition: background-color 0.2s;
}

.clear-btn:hover {
    background-color: #c82333;
}

/* Modal Styles */
.modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
}

.modal-content {
    background-color: white;
    border-radius: 8px;
    width: 90%;
    max-width: 700px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

.modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 15px 20px;
    border-bottom: 1px solid var(--border-color);
}

.modal-header h3 {
    margin: 0;
    font-size: 1.1rem;
    color: #333;
}

.close-btn {
    background: none;
    border: none;
    font-size: 1.5rem;
    color: #6c757d;
    cursor: pointer;
    padding: 0;
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
}
.close-btn:hover {
    color: #333;
}

.modal-body {
    flex-grow: 1;
    padding: 20px;
    overflow-y: auto;
}

.modal-hint {
    margin: 0 0 15px 0;
    padding: 12px;
    background-color: #f8f9fa;
    border-left: 3px solid #007bff;
    font-size: 0.85rem;
    color: #495057;
    line-height: 1.8;
}

.modal-hint code {
    background-color: #e9ecef;
    padding: 2px 6px;
    border-radius: 3px;
    font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
    font-size: 0.8rem;
    color: #d63384;
}

.modal-hint a {
    color: #007bff;
    text-decoration: none;
}

.modal-hint a:hover {
    text-decoration: underline;
}

.import-options {
    display: flex;
    align-items: center;
    gap: 15px;
    margin-bottom: 15px;
}

.file-upload-btn {
    padding: 10px 20px;
    background-color: #28a745;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-weight: 500;
    font-size: 14px;
    transition: background-color 0.2s;
}
.file-upload-btn:hover {
    background-color: #218838;
}

.or-divider {
    font-size: 0.9rem;
    color: #6c757d;
    font-weight: 500;
}

.import-textarea {
    width: 100%;
    padding: 12px;
    border: 1px solid #ced4da;
    border-radius: 6px;
    resize: vertical;
    font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
    font-size: 13px;
    line-height: 1.5;
    min-height: 300px;
}
.import-textarea:focus {
    outline: none;
    border-color: var(--primary-color);
    box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.1);
}

.modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    padding: 15px 20px;
    border-top: 1px solid var(--border-color);
}

.cancel-btn,
.confirm-btn {
    padding: 8px 20px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 500;
}

.cancel-btn {
    background-color: #6c757d;
    color: white;
}
.cancel-btn:hover {
    background-color: #5a6268;
}

.confirm-btn {
    background-color: #007bff;
    color: white;
}
.confirm-btn:hover {
    background-color: #0056b3;
}

</style>
