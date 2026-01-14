<script setup lang="ts">
import { ref, onMounted } from 'vue';
import NewConversation from './components/NewConversation.vue';
import ConversationBrowser from './components/ConversationBrowser.vue';
import ConversationViewer from './components/ConversationViewer.vue';
import type { FileEntry } from './composables/useFileSystem';
import { useFileSystem } from './composables/useFileSystem';

const selectedFile = ref<FileEntry | null>(null);
const sidebarWidth = ref(550);
const isResizing = ref(false);
const { findFileByPath, findLatestFile } = useFileSystem();

const handleFileSelected = (event: { entry: FileEntry, path: string }) => {
  selectedFile.value = event.entry;
  localStorage.setItem('lastSelectedFile', event.path);
};

const showNewConversation = () => {
  selectedFile.value = null;
  localStorage.removeItem('lastSelectedFile');
};

const autoSelectLatest = async () => {
    const latest = await findLatestFile();
    if (latest) {
        selectedFile.value = latest.entry;
        localStorage.setItem('lastSelectedFile', latest.path);
    } else {
        selectedFile.value = null; // New Conversation Mode
        localStorage.removeItem('lastSelectedFile');
    }
};

const handleConversationDeleted = async () => {
    // Current file was deleted (triggered by ConversationBrowser)
    // We should auto-select the latest remaining file
    await autoSelectLatest();
};

onMounted(async () => {
  const lastSelectedPath = localStorage.getItem('lastSelectedFile');
  if (lastSelectedPath) {
    const file = await findFileByPath(lastSelectedPath);
    if (file) {
      selectedFile.value = file;
    } else {
      // Path invalid or file deleted, auto-select latest
      await autoSelectLatest();
    }
  } else {
      // No memory, auto-select latest
      await autoSelectLatest();
  }
});

// --- Resizing Logic ---
const startResizing = (event: MouseEvent) => {
  event.preventDefault();
  isResizing.value = true;
  document.addEventListener('mousemove', resize);
  document.addEventListener('mouseup', stopResizing);
};

const resize = (event: MouseEvent) => {
  if (!isResizing.value) return;
  // Clamp width between 200 and 800 pixels
  sidebarWidth.value = Math.min(800, Math.max(200, event.clientX));
};

const stopResizing = () => {
  isResizing.value = false;
  document.removeEventListener('mousemove', resize);
  document.removeEventListener('mouseup', stopResizing);
};
</script>

<template>
  <div id="app" :class="{ 'is-resizing': isResizing }">
    <header class="app-header">
      <h1>AI对话管理</h1>
      <button @click="showNewConversation" class="new-btn">新建对话</button>
    </header>
    <main class="app-container">
      <div class="sidebar" :style="{ width: sidebarWidth + 'px' }">
        <ConversationBrowser 
            @file-click="handleFileSelected" 
            @file-deleted="handleConversationDeleted"
            :selected-file="selectedFile" 
        />
      </div>
      <div class="resizer" @mousedown="startResizing"></div>
      <div class="main-content">
        <ConversationViewer v-if="selectedFile" :file-handle="selectedFile.handle" :key="selectedFile.name" />
        <NewConversation v-else @conversation-created="handleFileSelected" />
      </div>
    </main>
  </div>
</template>

<style>
/* Global styles */
:root {
  --border-color: #dee2e6;
  --background-color: #f8f9fa;
  --text-color: #212529;
  --primary-color: #007bff;
  --resizer-width: 4px;
}

html, body {
  height: 100%;
  overflow: hidden; /* Prevent body scroll */
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  margin: 0;
  background-color: var(--background-color);
  color: var(--text-color);
}

#app {
  display: flex;
  flex-direction: column;
  height: 100vh; /* Full viewport height */
}

#app.is-resizing {
  cursor: col-resize;
  user-select: none;
}

.app-header {
  flex-shrink: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 2rem;
  background-color: #fff;
  border-bottom: 1px solid var(--border-color);
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}

.app-header h1 {
  margin: 0;
  font-size: 1.5rem;
  color: var(--primary-color);
}

.new-btn {
  padding: 8px 15px;
  border: 1px solid var(--primary-color);
  background-color: transparent;
  color: var(--primary-color);
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.2s, color 0.2s;
}

.new-btn:hover {
  background-color: var(--primary-color);
  color: #fff;
}

.app-container {
  display: flex;
  flex-grow: 1;
  padding: 1.5rem;
  overflow: hidden;
  min-height: 0;
}

.sidebar {
  flex-shrink: 0;
  display: flex; /* Allow child to fill height */
}

.resizer {
  flex-shrink: 0;
  width: var(--resizer-width);
  cursor: col-resize;
  background-color: var(--border-color);
  margin: 0 1rem;
  border-radius: 2px;
  transition: background-color 0.2s;
}
.resizer:hover {
    background-color: var(--primary-color);
}

.main-content {
  flex-grow: 1;
  min-width: 0; /* Allow content to shrink */
  display: flex; /* Allow child to fill height */
}

/* Make direct children of sidebar/main-content fill height */
.sidebar > *,
.main-content > * {
    width: 100%;
    height: 100%;
}
</style>
