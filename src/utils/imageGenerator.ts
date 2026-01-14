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

export const generateAndDownloadImage = async (
    selectionState: Selection[],
    renderedConversation: RenderedTurn[]
) => {
    const element = document.getElementById('share-container');
    if (!element) return;

    // 1. Get all the CSS rules from the document
    let css = '';
    for (let i = 0; i < document.styleSheets.length; i++) {
        const sheet = document.styleSheets[i];
        try {
            if (sheet && sheet.cssRules) {
                for (let j = 0; j < sheet.cssRules.length; j++) {
                    const rule = sheet.cssRules[j];
                    if (rule) {
                        css += rule.cssText;
                    }
                }
            }
        } catch (e) {
            console.warn("Can't read the css rules of: " + (sheet ? sheet.href : 'unknown'), e);
        }
    }

    // 2. Build the HTML content
    let contentHtml = '';
    // Get the selected and rendered turns
    const selectedRenderedTurns = selectionState
        .sort((a, b) => a.index - b.index)
        .map(selection => {
            // Find the corresponding rendered turn, which includes questionNumber and pre-marked answer
            const renderedTurn = renderedConversation[selection.index];
            return {
                selection,
                turn: renderedTurn
            };
        })
        .filter(item => item.turn); // Filter out any potentially undefined turns

    selectedRenderedTurns.forEach(item => {
        const selection = item.selection;
        const turn = item.turn; // Use the rendered turn here, which includes questionNumber and marked answer

        if (turn) {
            // Add more spacing between turns
            contentHtml += `<div style="margin-bottom: 30px;">`; // Increased spacing for the whole turn
            if (selection.question && turn.question) {
                contentHtml += `<div style="background-color: #e9ecef; padding: 10px; border-radius: 5px; margin-bottom: 10px; display: flex; align-items: flex-start;">`;
                if (turn.questionNumber > 0 && selectedRenderedTurns.length > 1) {
                    // Replicate the .question-number styling for the generated image
                    contentHtml += `<span style="background-color: #f1f3f5; border: 1px solid #dee2e6; border-radius: 50%; color: #495057; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 500; height: 24px; width: 24px; flex-shrink: 0; margin-right: 8px; /* Slightly increased margin for better spacing */">${turn.questionNumber}</span>`;
                }
                contentHtml += `<div style="flex-grow: 1; font-size: 1.3rem;">${turn.question}</div></div>`;
            }
            // The answer part needs to use the already marked-up answer from renderedTurn
            if (selection.answer) {
                contentHtml += `<div class="markdown-body">${turn.answer}</div>`; // Use turn.answer which is already marked(turn.answer)
            }
            contentHtml += `</div>`; // Close the turn spacing div
        }
    });

    // 3. Inject styles and content
    element.innerHTML = `<style>${css}</style>${contentHtml}`;

    // 4. Temporarily make the element visible for rendering
    element.style.visibility = 'visible';
    element.style.position = 'absolute'; // Changed from fixed to absolute to avoid potential viewport issues with very large content
    element.style.top = '0';
    element.style.left = '0';
    element.style.width = '800px'; // Ensure width is maintained for consistency
    element.style.height = 'auto'; // Ensure height is allowed to expand

    // Add a small delay to allow the browser to render the dynamically injected content
    await new Promise(resolve => setTimeout(resolve, 100));

    try {
        const dataUrl = await toPng(element, {
            cacheBust: true,
            skipAutoScale: true,
            pixelRatio: 3, // A pixelRatio of 2 provides good clarity without excessively large file sizes
            // No explicit width/height here, let html-to-image calculate based on element's rendered size
        });
        const link = document.createElement('a');
        link.download = `gemini-chat-${Date.now()}.png`;
        link.href = dataUrl;
        link.click();
    } catch (error) {
        console.error('oops, something went wrong!', error);
    } finally {
        // 5. Hide the element again
        element.style.visibility = 'hidden';
        element.style.top = '-9999px';
    }
};
