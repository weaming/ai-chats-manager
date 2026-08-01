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

  test('回答正文中含 AI 等关键词的子标题不被误判为分隔符', () => {
    const markdown = `> From: https://gemini.google.com/app/example

# you asked

message time: 2026-08-01 17:25:31

这数据的职位，我适合哪些

---

# gemini response

针对岗位数据分析如下：

### 1. Agent Harness 团队

内容 A

---

### 2. AI 产品经理 (AI 产品方向)

内容 B

---

# you asked

message time: 2026-08-01 17:39:46

整体分析职位描述

---

# gemini response

## 一、内部组织架构

### 2. AI 核心系统部 (AI Systems & Infra)

核心职责说明。

---
Powered by [AI Exporter](https://saveai.net)
`

    const turns = parseGeminiContent(markdown)

    expect(turns).toEqual([
      {
        question: '这数据的职位，我适合哪些',
        answer:
          '针对岗位数据分析如下：\n\n### 1. Agent Harness 团队\n\n内容 A\n\n---\n\n### 2. AI 产品经理 (AI 产品方向)\n\n内容 B',
      },
      {
        question: '整体分析职位描述',
        answer: '## 一、内部组织架构\n\n### 2. AI 核心系统部 (AI Systems & Infra)\n\n核心职责说明。',
      },
    ])
  })
})
