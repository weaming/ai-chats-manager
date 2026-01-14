<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import type { PropType } from 'vue';
import type { FullConversationTurn } from '../composables/useFileSystem';
import { useDragDrop } from '../composables/useDragDrop';

interface SelectionState {
    question: boolean;
    answer: boolean;
}

// RenderedTurn interface (implicit in parent, explicit here for safety)
interface RenderedTurn extends FullConversationTurn {
    index: number;
    questionNumber: number;
}

const props = defineProps({
    turn: {
        type: Object as PropType<RenderedTurn>,
        required: true,
    },
    rawTurn: {
        type: Object as PropType<FullConversationTurn>,
        required: true,
    },
    isEditing: {
        type: Boolean,
        default: false,
    },
    selection: {
        type: Object as PropType<SelectionState | undefined>,
        default: undefined,
    },
    layoutMode: {
        type: String as PropType<'default' | 'export'>,
        default: 'default'
    }
});

const emit = defineEmits<{
    (e: 'toggle-selection'): void;
    (e: 'toggle-question-selection'): void;
    (e: 'edit-start'): void;
    (e: 'edit-cancel'): void;
    (e: 'edit-save', payload: { question: string | null; answer: string }): void;
    (e: 'delete'): void;
    (e: 'move-up'): void;
    (e: 'move-down'): void;
}>();

const draftQuestion = ref<string>('');
const draftAnswer = ref('');
const minHeight = ref(0);
const rootEl = ref<HTMLElement | null>(null);

// Initialize drafts when entering edit mode
watch(() => props.isEditing, async (newVal) => {
    if (newVal) {
        // Measure height before switching view
        if (rootEl.value) {
            minHeight.value = rootEl.value.offsetHeight;
        }
        draftQuestion.value = props.rawTurn.question || '';
        draftAnswer.value = props.rawTurn.answer;
    } else {
        minHeight.value = 0;
    }
});

const { draggedTurnState } = useDragDrop();

// --- Drag and Drop ---
const handleDragStart = (event: DragEvent) => {
    if (props.isEditing) {
        event.preventDefault();
        return;
    }
    
    // Parent handles setting global state (draggedTurnState) and dataTransfer data
    // based on selection. We just handle the visual drag image here.

    if (event.dataTransfer) {
        // Fallback effect
        event.dataTransfer.effectAllowed = 'move';
        
        // Custom Drag Image (Question Bubble Only)
        const questionBubble = rootEl.value?.querySelector('.chat-bubble.question') as HTMLElement;
        const answerBubble = rootEl.value?.querySelector('.chat-bubble.answer') as HTMLElement;
        const dragTarget = questionBubble || answerBubble;

        if (dragTarget) {
            event.dataTransfer.setDragImage(dragTarget, 0, 0);
        }
    }
    
    // Visual feedback
    if (rootEl.value) {
        rootEl.value.classList.add('dragging');
    }
};

const handleDragEnd = () => {
    if (rootEl.value) {
        rootEl.value.classList.remove('dragging');
    }
    // Always clear global state on drag end to prevent stuck state
    draggedTurnState.value = null;
};


const handleSave = () => {
    emit('edit-save', {
        question: draftQuestion.value,
        answer: draftAnswer.value,
    });
};

const handleCancel = () => {
    emit('edit-cancel');
};
</script>

<template>
    <div 
        class="chat-turn" 
        :class="[`mode-${layoutMode}`]"
        ref="rootEl"
        :draggable="!isEditing"
        @dragstart="handleDragStart"
        @dragend="handleDragEnd"
    >
        <!-- Left Column: Controls -->
        <!-- Only show controls if in default mode or editing/drag active context -->
        <div class="turn-controls" v-if="layoutMode === 'default' || isEditing">
            <template v-if="!isEditing">
                <span v-if="layoutMode === 'default' && turn.questionNumber > 0" class="question-number">{{ turn.questionNumber }}</span>
                <button class="edit-btn" @click.stop="$emit('edit-start')">✏️</button>
                <button class="move-btn move-up-btn" @click.stop="$emit('move-up')" title="上移">⬆️</button>
                <button class="move-btn move-down-btn" @click.stop="$emit('move-down')" title="下移">⬇️</button>
                <button class="delete-btn" @click.stop="$emit('delete')" title="删除此回合">🗑️</button>
            </template>
        </div>
        <!-- In export mode with internal numbering, we can hide the sidebar column to save space -->
        
        <!-- Right Column: Content -->
        <div class="turn-content">
            <!-- Viewing Mode -->
            <div v-if="!isEditing" @click="$emit('toggle-selection')">
                <div v-if="turn.question && turn.question.trim().length > 0" class="chat-bubble question"
                    @click.stop="$emit('toggle-question-selection')">
                    <div class="bubble-content question-content" :class="{ active: selection?.question }">
                         <!-- Export Mode: Number in Bubble -->
                        <span v-if="layoutMode === 'export' && turn.questionNumber > 0" class="question-number">{{ turn.questionNumber }}</span>
                        <span class="question-text">{{ turn.question }}</span>
                    </div>
                </div>
                <div v-if="turn.answer" class="chat-bubble answer">
                    <div class="bubble-content markdown-body" :class="{ active: selection?.answer }"
                        v-html="turn.answer"></div>
                </div>
            </div>

            <!-- Editing Mode -->
            <div v-else class="editing-view" :style="{ minHeight: minHeight + 'px' }">
                <div class="editing-group">
                    <label>问题</label>
                    <textarea 
                        v-model="draftQuestion" 
                        rows="3"
                        @keydown.meta.enter="handleSave"
                        @keydown.ctrl.enter="handleSave"
                    ></textarea>
                </div>
                <div class="editing-group answer-group">
                    <label>回答</label>
                    <textarea 
                        v-model="draftAnswer" 
                        class="answer-textarea"
                        @keydown.meta.enter="handleSave"
                        @keydown.ctrl.enter="handleSave"
                    ></textarea>
                </div>
                <div class="editing-actions">
                    <button class="primary-btn" @click="handleSave">保存</button>
                    <button class="secondary-btn" @click="handleCancel">取消</button>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.chat-turn {
  display: flex;
  gap: 15px; /* Space between left and right columns */
  transition: opacity 0.2s;
}
.chat-turn.dragging {
    opacity: 0.4;
}

.turn-controls {
  flex-shrink: 0;
  width: 40px; /* Fixed width for the left column */
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start; /* Align to the top */
  padding-top: 15px; /* Align with the top of the bubble's first line of text (12px padding + 2px border + ~1px for visual centering) */
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
  opacity: 0;
  transition: all 0.2s ease;
}

.chat-turn:hover .edit-btn {
  opacity: 1;
}

.edit-btn:hover {
  color: var(--primary-color);
}

.move-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  padding: 3px 0;
  margin-top: 3px;
  color: #6c757d;
  opacity: 0;
  transition: all 0.2s ease;
}

.chat-turn:hover .move-btn {
  opacity: 1;
}

.move-btn:hover {
  color: var(--primary-color);
  transform: scale(1.2);
}

.delete-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 16px;
  padding: 5px 0;
  margin-top: 5px;
  color: #dee2e6; /* Very light gray, almost invisible */
  opacity: 0; /* Fully transparent by default */
  transition: all 0.2s ease;
}

.chat-turn:hover .delete-btn {
    opacity: 1; /* Show on hover */
    color: #dc3545; /* Red on hover */
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

.question-content {
    display: flex;
    align-items: flex-start;
    gap: 12px;
}

.question-text {
    flex-grow: 1;
    word-break: break-word;
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
