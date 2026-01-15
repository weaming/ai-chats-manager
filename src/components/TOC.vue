<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';

interface TOCItem {
  index: number;
  questionNumber: number;
  text: string;
}

const props = defineProps({
  items: {
    type: Array as () => TOCItem[],
    required: true,
  },
  activeIndex: {
    type: Number,
    default: -1,
  },
});

const emit = defineEmits<{
  (e: 'jump-to', index: number): void;
}>();

// Constants
const STORAGE_KEY = 'smart-toc-settings';
const DEFAULT_WIDTH = 500;
const DEFAULT_POSITION = { x: 45, y: 100 }; // Default position, pushed in and down

// State
const position = ref({ ...DEFAULT_POSITION });
const size = ref({ width: DEFAULT_WIDTH });
const isCollapsed = ref(false);
const isDragging = ref(false);
const isResizing = ref(false);
const startOffset = ref({ x: 0, y: 0 });
const startWidth = ref(0);

// Load settings
const loadSettings = () => {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (parsed.position) position.value = parsed.position;
      if (parsed.width) size.value.width = parsed.width;
      if (parsed.isCollapsed !== undefined) isCollapsed.value = parsed.isCollapsed;
    } catch (e) {
      console.error('Failed to load TOC settings:', e);
    }
  }
};

// Save settings
const saveSettings = () => {
  const settings = {
    position: position.value,
    width: size.value.width,
    isCollapsed: isCollapsed.value
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
};

onMounted(() => {
  loadSettings();
});

// Dragging logic
const handleMouseDown = (e: MouseEvent) => {
  if ((e.target as HTMLElement).closest('.toc-header')) {
    isDragging.value = true;
    startOffset.value = {
      x: e.clientX + position.value.x,
      y: e.clientY - position.value.y
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }
};

const handleMouseMove = (e: MouseEvent) => {
  if (!isDragging.value) return;
  position.value.x = startOffset.value.x - e.clientX;
  position.value.y = e.clientY - startOffset.value.y;
  
  // Bounds
  position.value.x = Math.max(0, Math.min(window.innerWidth - (isCollapsed.value ? 50 : size.value.width), position.value.x));
  position.value.y = Math.max(0, Math.min(window.innerHeight - 100, position.value.y));
  saveSettings();
};

const handleMouseUp = () => {
  isDragging.value = false;
  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('mouseup', handleMouseUp);
};

// Resizing logic
const handleResizeStart = (e: MouseEvent) => {
  e.stopPropagation();
  e.preventDefault();
  isResizing.value = true;
  startOffset.value = { x: e.clientX, y: e.clientY };
  startWidth.value = size.value.width;
  document.addEventListener('mousemove', handleResizeMove);
  document.addEventListener('mouseup', handleResizeUp);
};

const handleResizeMove = (e: MouseEvent) => {
  if (!isResizing.value) return;
  // deltaX is positive when dragging to the left
  const deltaX = startOffset.value.x - e.clientX;
  const newWidth = Math.max(250, Math.min(800, startWidth.value + deltaX));
  
  // Calculate how much width actually changed
  const actualDeltaX = newWidth - size.value.width;
  
  // Update width
  size.value.width = newWidth;
  
  // To keep the right edge fixed when resizing from the left, 
  // we would usually not change 'right'. 
  // BUT the user is dragging the 'left' edge, and we are using 'right' for positioning.
  // Actually, if we use 'right', changing 'width' automatically expands to the left.
  // So NO 'position.x' update is needed if we stick to 'right'.
  
  saveSettings();
};

const handleResizeUp = () => {
  isResizing.value = false;
  document.removeEventListener('mousemove', handleResizeMove);
  document.removeEventListener('mouseup', handleResizeUp);
};

const toggleCollapse = () => {
  isCollapsed.value = !isCollapsed.value;
  saveSettings();
};

const handleItemClick = (index: number) => {
  emit('jump-to', index);
};

// Watch for internal scroll synchronization
const tocListRef = ref<HTMLElement | null>(null);
watch(() => props.activeIndex, (newIndex) => {
    if (newIndex !== -1 && tocListRef.value) {
        const activeEl = tocListRef.value.querySelector('.toc-item.active');
        if (activeEl) {
            activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }
});
</script>

<template>
  <div 
    class="smart-toc" 
    v-if="items.length > 1"
    :style="{ 
      right: position.x + 'px', 
      top: position.y + 'px', 
      width: isCollapsed ? '80px' : size.width + 'px',
      height: isCollapsed ? '80px' : 'auto'
    }"
    :class="{ 
      'is-dragging': isDragging, 
      'is-resizing': isResizing,
      'is-collapsed': isCollapsed 
    }"
  >
    <div class="toc-header" @mousedown="handleMouseDown">
      <div class="header-main">
        <span class="toc-title">目录</span>
        <span class="toc-count" v-if="!isCollapsed">{{ items.length }}</span>
      </div>
      <button class="collapse-btn" @click.stop="toggleCollapse" :title="isCollapsed ? '展开' : '折叠'">
        {{ isCollapsed ? '◀' : '▶' }}
      </button>
    </div>
    
    <div class="toc-list-container" ref="tocListRef" v-show="!isCollapsed">
      <ul class="toc-list">
        <li 
          v-for="item in items" 
          :key="item.index"
          :class="{ active: item.index === activeIndex }"
          @mousedown.stop
          @click="handleItemClick(item.index)"
          class="toc-item"
        >
          <span class="item-number">{{ item.questionNumber }}</span>
          <span class="item-text" :title="item.text">{{ item.text }}</span>
        </li>
      </ul>
    </div>

    <!-- Bottom-Left Resizer -->
    <div 
      class="resizer-bottom-left" 
      v-if="!isCollapsed" 
      @mousedown="handleResizeStart"
      title="调整大小"
    >
      <div class="resizer-cues">
        <span></span>
        <span></span>
        <span></span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.smart-toc {
  position: absolute;
  max-height: calc(100vh - 120px);
  background: rgba(255, 255, 255, 0.82);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  z-index: 2000;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.06);
  transition: box-shadow 0.3s ease, width 0.3s cubic-bezier(0.4, 0, 0.2, 1), height 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s;
  user-select: none;
  overflow: hidden; /* Prevent children from spilling out during animations */
}

.smart-toc.is-collapsed {
  width: 90px !important;
  height: 50px !important;
  background: rgba(255, 255, 255, 0.9);
}

.smart-toc.is-dragging {
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.12);
  cursor: grabbing;
}

.smart-toc.is-resizing {
  transition: box-shadow 0.3s ease, opacity 0.3s;
}

.toc-header {
  padding: 0 18px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.04);
  cursor: grab;
  flex-shrink: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 56px; /* Increased from 48px */
  width: 100%;
  box-sizing: border-box;
}

.is-collapsed .toc-header {
  border-bottom: none;
  height: 50px;
  padding: 0 14px;
}

.header-main {
  display: flex;
  align-items: center;
  gap: 12px;
  pointer-events: none;
  flex-grow: 1;
  overflow: hidden;
}

.toc-title {
  font-size: 15px; /* Slightly larger */
  font-weight: 700;
  color: #111;
  white-space: nowrap;
}

.toc-count {
  font-size: 11px;
  color: #777;
  background: rgba(0, 0, 0, 0.05);
  padding: 2px 10px;
  border-radius: 12px;
}

.collapse-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 6px;
  color: #999;
  font-size: 12px;
  transition: color 0.2s, transform 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 28px;
  height: 28px;
}

.collapse-btn:hover {
  color: var(--primary-color);
  transform: scale(1.1);
}

.toc-list-container {
  overflow-y: auto;
  padding: 16px 5px; /* Increased from 8px */
  flex-grow: 1;
}

.toc-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.toc-item {
  padding: 10px 20px; /* Increased from 8px 16px */
  display: flex;
  align-items: flex-start;
  gap: 14px; /* Increased from 12px */
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 14px;
  line-height: 1.5;
}

.toc-item:hover {
  background-color: rgba(0, 123, 255, 0.04);
}

.toc-item.active {
  background-color: rgba(0, 123, 255, 0.07);
  color: var(--primary-color);
  font-weight: 600;
}

.item-number {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.04);
  border-radius: 6px;
  font-size: 11px;
  color: #666;
  margin-top: 1px;
}

.active .item-number {
  background: var(--primary-color);
  color: white;
}

.item-text {
  flex-grow: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: #333;
}

.active .item-text {
  color: var(--primary-color);
}

/* Bottom-Left Resizer */
.resizer-bottom-left {
  position: absolute;
  left: 3px;
  bottom: 3px;
  width: 16px;
  height: 16px;
  cursor: nesw-resize;
  display: flex;
  align-items: flex-end;
  justify-content: flex-start;
}

.resizer-cues {
  width: 100%;
  height: 100%;
  position: relative;
  opacity: 0.5;
  transition: opacity 0.2s;
}

.resizer-bottom-left:hover .resizer-cues {
  opacity: 1;
}

.resizer-cues span {
  position: absolute;
  display: block;
  background: #888;
  height: 1.5px;
  border-radius: 1px;
  transform: rotate(45deg);
  transform-origin: left center;
}

/* Diagonal lines positioned to form a corner grip: shorter lines closer to the tip (\ orientation) */
.resizer-cues span:nth-child(1) { bottom: 4px; left: 5px; width: 4px; }
.resizer-cues span:nth-child(2) { bottom: 8px; left: 5px; width: 8px; }
.resizer-cues span:nth-child(3) { bottom: 12px; left: 5px; width: 12px; }

.toc-list-container::-webkit-scrollbar {
  width: 4px;
}

.toc-list-container::-webkit-scrollbar-track {
  background: transparent;
}

.toc-list-container::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.1);
  border-radius: 2px;
}

.toc-list-container::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 0, 0, 0.15);
}
</style>
