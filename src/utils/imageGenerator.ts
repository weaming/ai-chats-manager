import { toPng } from 'html-to-image';
import type { FullConversationTurn } from '../composables/useFileSystem';

interface Selection {
    index: number;
    question: boolean;
    answer: boolean;
}

interface RenderedTurn extends FullConversationTurn {
    index: number;
    questionNumber: number;
}

import { createApp, h, nextTick } from 'vue';
import SharePreview from '../components/SharePreview.vue';

export const generateAndDownloadImage = async (
    selectionState: Selection[],
    renderedConversation: RenderedTurn[]
) => {
    const element = document.getElementById('share-container');
    if (!element) return;

    // 1. Prepare data
    // Filter and map to the structure SharePreview expects
    const selectedItems = selectionState
        .sort((a, b) => a.index - b.index)
        .map(selection => {
            const originalTurn = renderedConversation[selection.index];
            if (!originalTurn) return null;
            return { selection, originalTurn };
        })
        .filter((item): item is { selection: Selection, originalTurn: RenderedTurn } => !!item);
    
    // Create view-models where unselected parts are hidden
    const turnsToRender = selectedItems.map((item, _, arr) => {
        const { selection, originalTurn } = item;
        const turnCopy = { ...originalTurn };

        // Hide unselected parts
        if (!selection.question) {
            turnCopy.question = null;
        }
        if (!selection.answer) {
            turnCopy.answer = '';
        }

        // Handle question number display rule:
        // Only show if original number > 0 AND we are exporting more than 1 item
        if (arr.length <= 1) {
            turnCopy.questionNumber = 0;
        }

        return {
            selection,
            turn: turnCopy
        };
    });

    if (turnsToRender.length === 0) return;

    // 2. Clear container
    element.innerHTML = '';

    // 3. Create temporary App
    const tempApp = createApp({
        render() {
            return h(SharePreview, {
                turns: turnsToRender
            });
        }
    });

    // 4. Mount
    const mountNode = document.createElement('div');
    element.appendChild(mountNode);
    tempApp.mount(mountNode);

    // 5. Setup visibility for capture
    // Use fixed position and move it far off-screen to avoid "flash" or layout shifts
    element.style.position = 'fixed';
    element.style.left = '-9999px'; 
    element.style.top = '0';
    element.style.visibility = 'visible';
    element.style.zIndex = '-1000';
    
    // Wait for render
    await nextTick();
    await new Promise(resolve => setTimeout(resolve, 300)); // Extra buffer for fonts/images

    try {
        const dataUrl = await toPng(element.firstElementChild as HTMLElement, {
            cacheBust: true,
            skipAutoScale: true,
            pixelRatio: 3, 
        });
        const link = document.createElement('a');
        link.download = `chat-${Date.now()}.png`;
        link.href = dataUrl;
        link.click();
    } catch (error) {
        console.error('oops, something went wrong!', error);
    } finally {
        // 6. Cleanup
        tempApp.unmount();
        element.style.visibility = 'hidden';
        element.innerHTML = '';
        element.style.top = '-9999px';
    }
};
