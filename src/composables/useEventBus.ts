import { ref } from 'vue';
import mitt from 'mitt';

type Events = {
  'file-system-changed': void;
  'turn-transfer-complete': { sourceIndices?: number[] }; // Added for turn drag-and-drop
};

const emitter = mitt<Events>();

export function useEventBus() {
  return {
    $on: emitter.on,
    $off: emitter.off,
    $emit: emitter.emit,
  };
}
