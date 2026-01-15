<script setup lang="ts">
import { useTheme } from '../composables/useTheme';

const { availableThemes, currentTheme, applyTheme, showAllThemes } = useTheme();
</script>

<template>
  <div class="theme-selector">
    <button 
      @click="showAllThemes = !showAllThemes" 
      :class="['toggle-all-btn', { 'active-btn': showAllThemes }]"
      title="查看所有可用的 Highlight.js 主题"
    >
      全部主题
    </button>
    <select 
      :value="currentTheme" 
      @change="(e) => applyTheme((e.target as HTMLSelectElement).value)"
      class="theme-select"
      title="选择代码高亮主题"
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
  </div>
</template>

<style scoped>
.theme-selector {
  display: flex;
  align-items: center;
  gap: 10px;
}

.toggle-all-btn {
  background-color: white;
  border: 1px solid #ced4da;
  color: #495057;
  padding: 6px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85rem;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.toggle-all-btn:hover {
  background-color: #f8f9fa;
  border-color: #adb5bd;
}

.toggle-all-btn.active-btn {
  background-color: #e7f5ff;
  border-color: #339af0;
  color: #1c7ed6;
  font-weight: 500;
}

.toggle-all-btn.active-btn:hover {
  background-color: #d0ebff;
  border-color: #228be6;
  color: #0b7285;
}

.theme-select {
  padding: 6px 10px;
  border-radius: 4px;
  border: 1px solid #ced4da;
  background-color: white;
  font-size: 13px;
  color: #495057;
  cursor: pointer;
  outline: none;
  max-width: 140px;
}

.theme-select:focus {
  border-color: var(--primary-color);
}
</style>
