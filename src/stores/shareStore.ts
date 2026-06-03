import { defineStore } from 'pinia'

interface Selection {
  index: number
  question: boolean
  answer: boolean
}

interface ShareTurn {
  selection: Selection
  turn: {
    index: number
    question: string | null
    answer: string
    questionNumber: number
    [key: string]: any
  }
}

export const useShareStore = defineStore('share', {
  state: () => ({
    previewTurns: [] as ShareTurn[],
  }),
  actions: {
    setPreviewTurns(turns: ShareTurn[]) {
      this.previewTurns = turns
      // Also persist to localStorage for new tab recovery
      localStorage.setItem('share_preview_data', JSON.stringify(turns))
    },
    loadFromStorage() {
      const saved = localStorage.getItem('share_preview_data')
      if (saved) {
        try {
          this.previewTurns = JSON.parse(saved)
        } catch (e) {
          console.error('Failed to load share preview data', e)
        }
      }
    },
  },
})
