<script setup lang="ts">
import ChatTurn from './ChatTurn.vue';
import type { FullConversationTurn } from '../composables/useFileSystem';

export interface RenderedTurn extends FullConversationTurn {
    index: number;
    questionNumber: number;
}

// Just for type safety in props, though we don't use selection inside directly 
// because we expect pre-filtered turns.
interface Selection {
    index: number;
    question: boolean;
    answer: boolean;
}

defineProps<{
  turns: { selection: Selection, turn: RenderedTurn }[]
}>();
</script>

<template>
  <div class="share-preview-container">
    <div class="share-header"></div>
    <div v-for="(item, idx) in turns" :key="idx" class="share-item">
      <!-- 
           We use ChatTurn to render. 
           We assume 'item.turn' has been modified to only contain 
           the text we want to show (i.e. unselected parts are cleared).
      -->
      <ChatTurn 
        :turn="item.turn" 
        :raw-turn="item.turn" 
        layout-mode="export"
      />
    </div>
    <div class="share-footer"></div>
  </div>
</template>

<style scoped>
.share-preview-container {
  padding: 10px;
  background: white;
  width: 800px;
  box-sizing: border-box;
  /* Ensure text rendering is identical */
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  color: #212529;
}

.share-item {
  margin-bottom: 30px;
}

/* Optional hooks for branding */
.share-header {
  margin-bottom: 20px;
}
.share-footer {
  margin-top: 20px;
}
</style>
