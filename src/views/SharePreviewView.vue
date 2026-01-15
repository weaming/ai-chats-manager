<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useShareStore } from '../stores/shareStore';
import SharePreview from '../components/SharePreview.vue';
import { downloadElementAsPng } from '../utils/imageGenerator';
import { useTheme } from '../composables/useTheme';

const shareStore = useShareStore();
const dlLoading = ref(false);
const { availableThemes, currentTheme, applyTheme, showAllThemes } = useTheme();

onMounted(() => {
    shareStore.loadFromStorage();
});

const handleDownload = async () => {
    const element = document.querySelector('.share-preview-container') as HTMLElement;
    if (!element) return;

    dlLoading.value = true;
    try {
        // Wait for potential rendering/fonts
        await document.fonts.ready;
        await new Promise(resolve => setTimeout(resolve, 500));
        await downloadElementAsPng(element);
        // Automatically close after successful download
        handleClose();
    } catch (e) {
        console.error('Download failed', e);
        alert('生成图片失败');
    } finally {
        dlLoading.value = false;
    }
};

const handleClose = () => {
    window.close();
};
</script>

<template>
  <div class="share-preview-page">
    <div class="preview-toolbar">
      <div class="toolbar-content">
        <h2>分享预览</h2>
        <div class="actions">
          <label class="toggle-all-themes">
            <input type="checkbox" v-model="showAllThemes" />
            <span style="font-size: 14px; margin: 0 8px; color: #495057; display: flex; align-items: center;">全部代码主题</span>
          </label>
          <select 
            :value="currentTheme" 
            @change="(e) => applyTheme((e.target as HTMLSelectElement).value)"
            class="theme-select"
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
          <button class="secondary-btn" @click="handleClose">关闭</button>
          <button class="primary-btn" @click="handleDownload" :disabled="dlLoading">
            {{ dlLoading ? '生成中...' : '下载图片' }}
          </button>
        </div>
      </div>
    </div>
    
    <div class="preview-body">
      <div v-if="shareStore.previewTurns.length > 0" class="preview-container">
        <SharePreview :turns="shareStore.previewTurns" />
      </div>
      <div v-else class="no-data">
        <p>暂无预览数据，请从主页面重新点击分享。</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.share-preview-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: #f1f3f5;
}

.preview-toolbar {
  background: white;
  border-bottom: 1px solid var(--border-color);
  padding: 10px 20px;
  position: sticky;
  top: 0;
  z-index: 100;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}

.toolbar-content {
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.toolbar-content h2 {
  margin: 0;
  font-size: 1.2rem;
  color: #495057;
}

.actions {
  display: flex;
  gap: 10px;
}

.preview-body {
  flex: 1;
  overflow-y: auto;
  padding: 40px 20px;
  display: flex;
  justify-content: center;
}

.preview-container {
  box-shadow: 0 10px 30px rgba(0,0,0,0.1);
  background: white;
  /* Ensure fixed width to match generated PNG expectations */
  width: 800px;
}

.no-data {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #adb5bd;
}

.primary-btn {
  background-color: var(--primary-color);
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
}

.primary-btn:hover {
  filter: brightness(90%);
}

.primary-btn:disabled {
  background-color: #a5d6a7;
  cursor: not-allowed;
}

.secondary-btn {
  background: white;
  border: 1px solid #ced4da;
  padding: 8px 16px;
  cursor: pointer;
}

.theme-select {
  padding: 8px 12px;
  border-radius: 4px;
  border: 1px solid #ced4da;
  background-color: white;
  font-size: 14px;
  color: #495057;
  cursor: pointer;
  outline: none;
}
.theme-select:focus {
  border-color: var(--primary-color);
}

.toggle-all-themes {
  display: flex;
  align-items: center;
  cursor: pointer;
}
</style>
