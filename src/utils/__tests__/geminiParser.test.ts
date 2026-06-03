import { describe, expect, test } from 'bun:test'

import { parseGeminiContent } from '../geminiParser'

describe('parseGeminiContent', () => {
  test('解析带 message time 元数据的 Gemini Markdown 导出', () => {
    const markdown = `> From: https://gemini.google.com/app/example

# you asked

message time: 2026-06-03 18:51:49

第一轮问题

---

# gemini response

第一轮回答

### 子标题应保留

正文内容

---

# you asked

message time: 2026-06-03 18:57:18

第二轮问题

---

# gemini response

第二轮回答
`

    const turns = parseGeminiContent(markdown)

    expect(turns).toEqual([
      {
        question: '第一轮问题',
        answer: '第一轮回答\n\n### 子标题应保留\n\n正文内容',
      },
      {
        question: '第二轮问题',
        answer: '第二轮回答',
      },
    ])
  })

  test('解析带模型名前缀的中文回答标题', () => {
    const markdown = `# 我的提问

问题内容

# Gemini 回答

回答内容
`

    const turns = parseGeminiContent(markdown)

    expect(turns).toEqual([
      {
        question: '问题内容',
        answer: '回答内容',
      },
    ])
  })
})
