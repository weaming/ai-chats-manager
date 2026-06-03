import type { FullConversationTurn } from '../composables/useFileSystem'

type MarkdownSectionRole = 'question' | 'answer' | null

// 预编译正则表达式以提高性能
const HEADING_PATTERN = /^#+/
const QUESTION_HEADING_PATTERN = /\b(you\s+asked|user|question|prompt|asked)\b|提问|问题/i
const ANSWER_HEADING_PATTERN = /\b(ai|assistant|answer|response|responded)\b|回答|助手/i
const METADATA_PATTERN = /^(message\s+time|from|time|date|sent|created\s+at|消息时间|发送时间)\s*:/i

function parseGeminiMarkdown(text: string): FullConversationTurn[] {
  const turns: FullConversationTurn[] = []
  const lines = text.split('\n')

  let currentQuestion: string | null = null
  let currentRole: MarkdownSectionRole = null
  let currentQuestionLines: string[] = []
  let currentAnswerLines: string[] = []

  const saveQuestion = () => {
    const question = cleanQuestionBlock(currentQuestionLines)
    currentQuestion = question || null
    currentQuestionLines = []
  }

  const saveAnswer = () => {
    const answer = cleanAnswerBlock(currentAnswerLines)
    if (answer) {
      turns.push({
        question: currentQuestion,
        answer,
      })
    }

    currentQuestion = null
    currentAnswerLines = []
  }

  for (const line of lines) {
    const headingRole = getHeadingRole(line)

    if (headingRole === 'question') {
      if (currentAnswerLines.length > 0) {
        saveAnswer()
      }

      currentRole = 'question'
      currentQuestion = null
      currentQuestionLines = []
      continue
    }

    if (headingRole === 'answer') {
      if (currentRole === 'question') {
        saveQuestion()
      }

      currentRole = 'answer'
      currentAnswerLines = []
      continue
    }

    if (currentRole === 'question') {
      currentQuestionLines.push(line)
      continue
    }

    if (currentRole === 'answer') {
      currentAnswerLines.push(line)
    }
  }

  // 保存最后一个回答
  if (currentAnswerLines.length > 0) {
    saveAnswer()
  }

  return turns
}

function getHeadingRole(line: string): MarkdownSectionRole {
  if (!HEADING_PATTERN.test(line)) {
    return null
  }

  const heading = line.replace(/^#+\s*/, '').trim()

  if (QUESTION_HEADING_PATTERN.test(heading)) {
    return 'question'
  }

  if (ANSWER_HEADING_PATTERN.test(heading)) {
    return 'answer'
  }

  return null
}

function cleanQuestionBlock(lines: string[]): string {
  return trimSeparators(lines)
    .filter((line) => {
      const trimmedLine = line.trim()

      if (!trimmedLine) {
        return true
      }

      return !METADATA_PATTERN.test(trimmedLine.replace(/^>\s*/, ''))
    })
    .join('\n')
    .trim()
}

function cleanAnswerBlock(lines: string[]): string {
  return cleanAdvertisement(trimSeparators(lines).join('\n'))
}

function trimSeparators(lines: string[]): string[] {
  let startIndex = 0
  let endIndex = lines.length

  while (startIndex < endIndex && isSkippableBoundaryLine(lines[startIndex] || '')) {
    startIndex++
  }

  while (endIndex > startIndex && isSkippableBoundaryLine(lines[endIndex - 1] || '')) {
    endIndex--
  }

  return lines.slice(startIndex, endIndex)
}

function isSkippableBoundaryLine(line: string): boolean {
  const trimmedLine = line.trim()
  return !trimmedLine || trimmedLine === '---'
}

// 辅助函数:清理广告信息和尾部分隔符
function cleanAdvertisement(text: string): string {
  const lines = text.split('\n')

  // 定义要移除的模式(从最长到最短检查)
  const patterns = [
    {
      len: 3,
      check: (l: string[]) =>
        l[0] === '---' && l[1] === '' && (l[2]?.toLowerCase() || '').includes('powered by'),
    },
    {
      len: 2,
      check: (l: string[]) => l[0] === '---' && (l[1]?.toLowerCase() || '').includes('powered by'),
    },
    {
      len: 2,
      check: (l: string[]) => l[0] === '' && l[1] === '---',
    },
    {
      len: 1,
      check: (l: string[]) => l[0] === '---',
    },
  ]

  // 按顺序检查各种模式
  for (const pattern of patterns) {
    if (lines.length >= pattern.len) {
      const lastN = lines.slice(-pattern.len).map((l) => l?.trim() || '')
      if (pattern.check(lastN)) {
        return lines.slice(0, -pattern.len).join('\n').trim()
      }
    }
  }

  return text.trim()
}

function parseGeminiJSON(jsonText: string): FullConversationTurn[] {
  try {
    const data = JSON.parse(jsonText)

    // 格式 1: Gemini Exporter 格式 {metadata: {...}, messages: [{role, say}]}
    if (data.messages && Array.isArray(data.messages)) {
      const turns: FullConversationTurn[] = []
      let currentQuestion: string | null = null

      for (const msg of data.messages) {
        if (msg.role === 'Prompt' && msg.say) {
          currentQuestion = msg.say
        } else if (msg.role === 'Response' && msg.say) {
          turns.push({
            question: currentQuestion,
            answer: msg.say,
          })
          currentQuestion = null
        }
      }
      return turns
    }

    // 格式 2: 直接数组格式 [{question, answer}]
    if (Array.isArray(data)) {
      return data
        .map((item: any) => ({
          question: item.question || item.user || item.prompt || null,
          answer: item.answer || item.response || item.text || '',
        }))
        .filter((turn) => turn.answer.trim())
    }

    // 格式 3: 嵌套对话格式 {conversation: [...]}
    if (data.conversation && Array.isArray(data.conversation)) {
      return parseGeminiJSON(JSON.stringify(data.conversation))
    }

    return []
  } catch (e) {
    console.error('Failed to parse JSON:', e)
    return []
  }
}

function parseGeminiPlainText(text: string): FullConversationTurn[] {
  const turns: FullConversationTurn[] = []

  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim())

  let currentQuestion: string | null = null

  for (const para of paragraphs) {
    const trimmed = para.trim()

    if (trimmed.length < 20) {
      continue
    }

    const isQuestion =
      trimmed.endsWith('?') ||
      trimmed.endsWith('?') ||
      trimmed.match(/^(请|如何|为什么|怎么|能否|可以)/)

    if (isQuestion) {
      currentQuestion = trimmed
    } else {
      turns.push({
        question: currentQuestion,
        answer: trimmed,
      })
      currentQuestion = null
    }
  }

  return turns
}

export function parseGeminiContent(text: string): FullConversationTurn[] {
  if (!text || !text.trim()) {
    return []
  }

  const trimmed = text.trim()

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const jsonResult = parseGeminiJSON(trimmed)
    if (jsonResult.length > 0) {
      return jsonResult
    }
  }

  if (trimmed.includes('#')) {
    const markdownResult = parseGeminiMarkdown(trimmed)
    if (markdownResult.length > 0) {
      return markdownResult
    }
  }

  return parseGeminiPlainText(trimmed)
}
