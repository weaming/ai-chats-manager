<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import type { PropType } from 'vue';
import type { FullConversationTurn } from '../composables/useFileSystem';
import { useDragDrop } from '../composables/useDragDrop';
import { marked } from 'marked';

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
    },
    isGlobalDragging: {
        type: Boolean,
        default: false
    },
    index: {
        type: Number,
        required: true
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
// Helper to get plain text snippet from HTML
// Helper to get plain text snippet from HTML/Markdown
const getSnippet = (content: string) => {
    if (!content) return '';
    
    // Ensure content is rendered to HTML first (even if double-rendered, standard markdown parsers handle HTML blocks)
    // This handles cases where parent might not have rendered it, or if we want to be sure.
    // However, since ConversationViewer alreayd renders it, this might be redundant but safe.
    // Wait, if ConversationViewer renders it, it's HTML. marked(HTML) -> HTML. 
    // If it's pure text, marked(text) -> <p>text</p>.
    // So safe.
    
    const html = marked.parse(content) as string;

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const text = doc.body.textContent || '';
    
    return text.trim().split('\n')[0]?.substring(0, 100); // 100 chars max
};


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
    // We can also delay this slightly if needed, but usually instant clear is fine.
    // However, if we delayed start, let's keep end instant to restore view ASAP.
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
        :class="[`mode-${layoutMode}`, { 'compact-mode': isGlobalDragging }]"
        :id="'turn-' + index"
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
                <!-- Hide actions during global drag -->
                <template v-if="!isGlobalDragging">
                    <button class="edit-btn" @click.stop="$emit('edit-start')">✏️</button>
                    <button class="move-btn move-up-btn" @click.stop="$emit('move-up')" title="上移">⬆️</button>
                    <button class="move-btn move-down-btn" @click.stop="$emit('move-down')" title="下移">⬇️</button>
                </template>
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
                        <span class="question-text">{{ getSnippet(turn.question || '') }}</span>
                    </div>
                </div>
                
                <!-- Normal Answer View: Show if NOT dragging OR if dragging but no question (we'll show snippet instead handled below) -->
                <!-- Actually user said: "If no question, show first line of text". "If question exists, hide answer". -->
                
                <div v-if="turn.answer && (!isGlobalDragging || (!turn.question && isGlobalDragging))" class="chat-bubble answer" 
                    :class="{ 'compact-view': isGlobalDragging }">
                    
                    <!-- Standard Markdown View -->
                    <div v-if="!isGlobalDragging" class="bubble-content markdown-body" :class="{ active: selection?.answer }"
                        v-html="turn.answer"></div>
                        
                    <!-- Dragging View: Snippet only if NO question (otherwise hidden entirely by v-if above) -->
                    <div v-else class="bubble-content snippet-content" :class="{ active: selection?.answer }">
                        {{ getSnippet(turn.answer) }}...
                    </div>
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
    /* No opacity change requested */
    background-color: #f8f9fa; /* Optional: slight background change instead? Or nothing. Keeping nothing as requested. */
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



.chat-bubble {
  display: flex;
  width: 100%; /* Bubbles now take full width of the right column */
  align-items: flex-start;
}

.bubble-content {
  padding: 16px 20px; /* Increased from 12px 18px */
  border-radius: 18px;
  line-height: 26px; /* Increased from 1.6 (approx 24px) */
  font-size: 16px; /* Explicitly set to match export */
  border: 2px solid var(--border-color);
  background-clip: padding-box;
  width: 100%;
  overflow: hidden; /* Clip full-bleed children like code blocks */
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
    font-size: 1rem;
    line-height: 1.6;
    resize: vertical;
    box-sizing: border-box;
    overflow-x: hidden;
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

/* Table styles for markdown-body */
:deep(.markdown-body table) {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 16px;
  display: block;
  overflow-x: auto;
}

:deep(.markdown-body th),
:deep(.markdown-body td) {
  border: 1px solid #ddd;
  padding: 8px 12px;
  text-align: left;
}

:deep(.markdown-body th) {
  background-color: #f8f8f8;
  font-weight: bold;
}

/* Export Mode Adjustments - Now Default */
/* We keep mode-export class for any specific overrides if needed, but base styles are now synced */
.chat-turn.mode-export .bubble-content {
  color: #1f1f1f;
  border-width: 1px;
}


/* Markdown content - Synced with Gemini Official Styles for ALL modes */
:deep(.markdown-body) {
  font-size: 16px;
  line-height: 26px;
  color: #1f1f1f;
}

:deep(.markdown-body h1) {
  font-size: 16px;
  line-height: 22px;
  margin-top: 1em;
  margin-bottom: 0.5em;
  font-weight: 700;
}

:deep(.markdown-body h2) {
  font-size: 16px;
  line-height: 22px;
  margin-top: 1em;
  margin-bottom: 0.5em;
  font-weight: 700;
}

:deep(.markdown-body h3) {
  font-size: 16px;
  line-height: 22px;
  margin-top: 0.8em;
  margin-bottom: 0.5em;
  font-weight: 700;
}

:deep(.markdown-body h4) {
  font-size: 16px;
  line-height: 22px;
  margin-top: 0.8em;
  margin-bottom: 0.5em;
  font-weight: 700;
}

:deep(.markdown-body p) {
  font-size: 16px;
  line-height: 26px;
  margin-bottom: 1em;
  font-weight: 400;
}

:deep(.markdown-body ul),
:deep(.markdown-body ol) {
  font-size: 16px;
  line-height: 26px;
  margin-bottom: 1em;
  padding-left: 2em;
}

:deep(.markdown-body li) {
  font-size: 16px;
  line-height: 26px;
  margin-bottom: 0.3em;
  font-weight: 400;
}

:deep(.markdown-body ol p),
:deep(.markdown-body li p) {
  margin: 0;
}

:deep(.markdown-body code:not(.hljs)) {
  font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
  font-size: 0.875em;
  padding: 2px 6px;
  border-radius: 4px;
}

:deep(.markdown-body pre) {
  padding: 0;
  border-radius: 0; /* No radius for full-width look */
  overflow-x: auto;
  margin: 1em -20px; /* Negative margin to span full bubble width (parent padding is 20px) */
  border: none;
}

/* Compact mode layout adjustment */
.chat-turn.compact-mode :deep(.markdown-body pre) {
  margin-left: -12px; /* Standardize with 12px padding */
  margin-right: -12px;
}

:deep(.markdown-body pre code) {
  /* Reset inline code styles for block code */
  padding: 16px; /* Restore padding overridden by high specificity */
  border: none;
  
  /* Ensure block display for proper padding/background */
  display: block; 
  
  /* Let highlight.js theme handle fonts */
  font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
  font-size: 14px;
  line-height: 20px;
}

:deep(.markdown-body strong),
:deep(.markdown-body b) {
  font-weight: 700;
}

:deep(.markdown-body em) {
  font-style: italic;
}

:deep(.markdown-body blockquote) {
  border-left: 3px solid #d0d7de;
  padding-left: 1em;
  margin-left: 0;
  border-left: 3px solid #d0d7de;
  padding-left: 1em;
  margin-left: 0;
  color: #57606a;
}

:deep(.markdown-body hr) {
  height: 0.25em;
  padding: 0;
  margin: 24px 0;
  background-color: #e1e4e8; /* Lighter color */
  border: 0;
  height: 1px; /* Thinner */
}

/* Table styles for export mode - Match Gemini */
.chat-turn.mode-export :deep(.markdown-body table) {
  font-size: 14px;
  line-height: 20px;
}

.chat-turn.mode-export :deep(.markdown-body th),
.chat-turn.mode-export :deep(.markdown-body td) {
  font-size: 14px;
  line-height: 20px;
  padding: 8px 12px;
}

/* Fix for long code lines in export mode: force wrap */
.chat-turn.mode-export :deep(.markdown-body pre),
.chat-turn.mode-export :deep(.markdown-body pre code) {
  white-space: pre-wrap;
  word-wrap: break-word;
  overflow-x: hidden; /* Hide scrollbar in image */
}

/* Compact Mode for Dragging */
.chat-turn.compact-mode {
    gap: 5px; /* Reduced from 15px */
    margin-bottom: 0; /* Let parent gap handle spacing */
}

.chat-turn.compact-mode .chat-bubble.question {
    margin-bottom: 4px; /* Reduced from 15px */
}

.chat-turn.compact-mode .bubble-content {
    padding: 8px 12px; /* Slightly reduced padding */
    min-height: auto;
}

/* Ensure number stays aligned */
.chat-turn.compact-mode .turn-controls {
    padding-top: 10px; 
}



.snippet-content {
    color: #6c757d;
    font-style: italic;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    padding: 8px 18px; /* Reduced padding */
    background-color: #f8f9fa;
}
</style>
