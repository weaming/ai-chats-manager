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
    <div v-if="$slots.header" class="share-header">
      <slot name="header"></slot>
    </div>
    <div v-for="(item, idx) in turns" :key="idx" class="share-item">
      <ChatTurn 
        :turn="item.turn" 
        :raw-turn="item.turn" 
        :index="item.turn.index"
        layout-mode="export"
      />
    </div>
    <div v-if="$slots.footer" class="share-footer">
      <slot name="footer"></slot>
    </div>
  </div>
</template>

<style scoped>
.share-preview-container {
  padding: 20px;
  background: white;
  width: 800px;
  box-sizing: border-box;
  /* Ensure text rendering is identical */
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  color: #212529;
}

.share-item {
  margin-bottom: 20px;
}

.share-item:last-child {
  margin-bottom: 0;
}

.share-header {
  margin-bottom: 20px;
}
.share-footer {
  margin-top: 20px;
}
</style>
