import { toPng } from 'html-to-image'
import type { FullConversationTurn } from '../composables/useFileSystem'

// Re-export specific interfaces if needed by consumers
interface Selection {
  index: number
  question: boolean
  answer: boolean
}

interface RenderedTurn extends FullConversationTurn {
  index: number
  questionNumber: number
}

// 1. Prepare Data Logic
export const prepareShareData = (
  selectionState: Selection[],
  renderedConversation: RenderedTurn[],
) => {
  // Filter and map to the structure SharePreview expects
  const selectedItems = selectionState
    .filter((s) => s.question || s.answer)
    .sort((a, b) => a.index - b.index)
    .map((selection) => {
      const originalTurn = renderedConversation[selection.index]
      if (!originalTurn) return null
      return { selection, originalTurn }
    })
    .filter((item): item is { selection: Selection; originalTurn: RenderedTurn } => !!item)

  // Create view-models where unselected parts are hidden
  const turnsToRender = selectedItems.map((item, index, arr) => {
    const { selection, originalTurn } = item
    const turnCopy = { ...originalTurn }

    // Hide unselected parts
    if (!selection.question) {
      turnCopy.question = null
    }
    if (!selection.answer) {
      turnCopy.answer = ''
    }

    // Renumber for export:
    // If only 1 item, hide the number (0). Otherwise start from 1.
    turnCopy.questionNumber = arr.length === 1 ? 0 : index + 1

    return {
      selection,
      turn: turnCopy,
    }
  })

  return turnsToRender
}

// 2. Download Logic from an isolated clone
export const downloadElementAsPng = async (originalElement: HTMLElement) => {
  // 1. Create an isolated clone
  const clone = originalElement.cloneNode(true) as HTMLElement

  // Ensure the clone is visible but off-screen and has no parent-inherited constraints
  const container = document.createElement('div')
  container.style.position = 'fixed'
  container.style.left = '-9999px'
  container.style.top = '0'
  container.style.zIndex = '-10000'
  container.style.padding = '0'
  container.style.margin = '0'
  container.style.background = 'white'

  // Force reset any inherited styles that might cause gaps or truncation
  clone.style.width = '800px'
  clone.style.height = 'auto'
  clone.style.overflow = 'visible'
  clone.style.margin = '0'
  clone.style.display = 'block'

  container.appendChild(clone)
  document.body.appendChild(container)

  try {
    // Wait for fonts and all internal images to be ready
    await document.fonts.ready
    await new Promise((resolve) => setTimeout(resolve, 300))

    const dataUrl = await toPng(clone, {
      cacheBust: true,
      skipAutoScale: true,
      pixelRatio: 2,
      backgroundColor: 'white',
      // Do NOT pass width/height here; let html-to-image measure the isolated block
    })

    const link = document.createElement('a')
    link.download = `chat-${Date.now()}.png`
    link.href = dataUrl
    link.click()
  } catch (error) {
    console.error('oops, something went wrong!', error)
    throw error
  } finally {
    // Cleanup
    document.body.removeChild(container)
  }
}

/* 
   Deprecated: generateAndDownloadImage 
   The logic is now split into prepareShareData + rendering in Vue component + downloadElementAsPng
*/
