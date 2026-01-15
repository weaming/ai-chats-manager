<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { marked } from 'marked';
import featuresDoc from '../../docs/features.md?raw';

const emit = defineEmits(['close']);

const renderedContent = ref('');

const handleKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
        emit('close');
    }
};

onMounted(() => {
    renderedContent.value = marked(featuresDoc) as string;
    window.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
    window.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-content about-modal">
      <div class="modal-header">
        <h3>关于</h3>
        <button class="close-btn" @click="$emit('close')">×</button>
      </div>
      <div class="modal-body">
        <div class="markdown-preview" v-html="renderedContent"></div>
      </div>
      <div class="modal-footer">
        <button class="confirm-btn" @click="$emit('close')">关闭</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
}

.modal-content {
    background: white;
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}

.modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 30px;
    border-bottom: 1px solid #e8e8e8;
}

.modal-header h3 {
    margin: 0;
    font-size: 1.3rem;
    color: #2c3e50;
}

.close-btn {
    background: none;
    border: none;
    font-size: 2rem;
    color: #999;
    cursor: pointer;
    padding: 0;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: background-color 0.2s, color 0.2s;
}

.close-btn:hover {
    background-color: #f0f0f0;
    color: #333;
}

.modal-footer {
    padding: 15px 30px;
    border-top: 1px solid #e8e8e8;
    display: flex;
    justify-content: flex-end;
}

.confirm-btn {
    padding: 8px 20px;
    background-color: var(--primary-color);
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    transition: opacity 0.2s;
}

.confirm-btn:hover {
    opacity: 0.9;
}

.about-modal {
    max-width: 900px;
    width: 90%;
    max-height: 85vh;
    display: flex;
    flex-direction: column;
}

.modal-body {
    overflow-y: auto;
    padding: 30px 40px;
    background-color: #fff;
    border-radius: 4px;
}

.markdown-preview {
    line-height: 1.8;
    color: #2c3e50;
    font-size: 15px;
}

:deep(.markdown-preview h1) {
    font-size: 2rem;
    font-weight: 700;
    color: var(--primary-color);
    margin-top: 0;
    margin-bottom: 1.5rem;
    padding-bottom: 0.5rem;
    border-bottom: 2px solid #e0e0e0;
}

:deep(.markdown-preview h2) {
    font-size: 1.5rem;
    font-weight: 600;
    color: #34495e;
    margin-top: 2rem;
    margin-bottom: 1rem;
    padding-bottom: 0.3rem;
    border-bottom: 1px solid #e8e8e8;
}

:deep(.markdown-preview h3) {
    font-size: 1.2rem;
    font-weight: 600;
    color: #5a6c7d;
    margin-top: 1.5rem;
    margin-bottom: 0.8rem;
}

:deep(.markdown-preview h4) {
    font-size: 1.1rem;
    font-weight: 600;
    color: #5a6c7d;
    margin-top: 1.2rem;
    margin-bottom: 0.6rem;
}

:deep(.markdown-preview p) {
    margin-bottom: 1rem;
}

:deep(.markdown-preview ul),
:deep(.markdown-preview ol) {
    padding-left: 2rem;
    margin-bottom: 1.2rem;
}

:deep(.markdown-preview li) {
    margin-bottom: 0.4rem;
    line-height: 1.7;
}

:deep(.markdown-preview ul ul),
:deep(.markdown-preview ol ul),
:deep(.markdown-preview ul ol),
:deep(.markdown-preview ol ol) {
    margin-top: 0.3rem;
    margin-bottom: 0.3rem;
}

:deep(.markdown-preview code) {
    background-color: #f5f5f5;
    padding: 3px 6px;
    border-radius: 3px;
    font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
    font-size: 0.9em;
    color: #476582;
    border: 1px solid #e8e8e8;
}

:deep(.markdown-preview pre) {
    background-color: #f6f8fa;
    padding: 16px;
    border-radius: 6px;
    overflow-x: auto;
    margin-bottom: 1.2rem;
    border: 1px solid #e1e4e8;
}

:deep(.markdown-preview pre code) {
    background-color: transparent;
    padding: 0;
    border: none;
    font-size: 0.95em;
    line-height: 1.6;
}

:deep(.markdown-preview strong) {
    font-weight: 600;
    color: #2c3e50;
}

:deep(.markdown-preview a) {
    color: var(--primary-color);
    text-decoration: none;
    border-bottom: 1px solid transparent;
    transition: border-color 0.2s;
}

:deep(.markdown-preview a:hover) {
    border-bottom-color: var(--primary-color);
}
</style>
