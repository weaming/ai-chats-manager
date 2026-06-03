import { marked } from 'marked'
import markedKatex from 'marked-katex-extension'
import hljs from 'highlight.js/lib/common'

export function setupMarkdownRenderer() {
  marked.use(
    markedKatex({
      throwOnError: false,
    }),
  )
  marked.use({
    renderer: {
      code({ text, lang }: any) {
        const validLang = !!(lang && hljs.getLanguage(lang))
        const highlighted = validLang
          ? hljs.highlight(text, { language: lang }).value
          : hljs.highlightAuto(text).value
        return `<pre class="hljs"><code class="hljs language-${lang || 'text'}">${highlighted}</code></pre>`
      },
    },
  })
}

/**
 * Markdown 格式修复工具
 *
 * 主要用于修复 Markdown 标记（如粗体）与文本之间的空格问题
 */

/**
 * 修复 Markdown 文本中的空格问题
 * 主要处理：
 * 1. 中文/标点与加粗标记 ** 之间添加空格
 * 2. 修复水平分割线 --- 被误认为是标题的问题
 */
export function fixMarkdownSpacing(text: string): string {
  const placeholders: string[] = []
  const placeholderFn = (match: string) => {
    const id = `__CODE_BLOCK_${placeholders.length}__`
    placeholders.push(match)
    return id
  }

  // 0. 保护代码块 和 LaTeX 公式块
  // 先替换代码块（无论是行内还是块级），避免内容被后续规则误伤
  // 同时也保护 $$ ... $$ 块级公式
  // 使用非贪婪匹配
  let result = text
    .replace(/(`{3,})[\s\S]*?\1/g, placeholderFn)
    .replace(/(`+)([\s\S]*?)\1/g, placeholderFn)
    .replace(/(\$\$[\s\S]*?\$\$)/g, placeholderFn) // 保护 LaTeX 块级公式

  // 1. 修复引号/括号等右侧符号后的加粗的问题 (泛化为所有中文右侧符号)
  // 这一步必须在最前面执行，避免被下面的左侧加空格规则干扰 (导致变成 "Symbol **" 从而不匹配这里的规则)
  result = result.replace(/([”’）》】〉！…？])\*\*([^\s])/g, '$1** $2')

  // 2. 左侧加空格 (Left Space)
  // 修复 "标点符号" + "**" 混排的问题 (如: "你好。**世界**" -> "你好。 **世界**")
  // 注意：不再包含中文字符，避免破坏正常的中文句子节奏 (如: "根据**天气**")
  result = result.replace(/([。，、！？…（）：；,.!?;:\)\(\]\}])\*\*([^\s])/g, '$1 **$2')

  // 3. 修复中文与粗体混排的问题 (如: "根据**天气**预报" -> "根据 **天气** 预报")
  // "marked" 库需要分隔符才能识别粗体
  // 用户指定使用普通空格

  // 左侧空格: 中文 + **
  result = result.replace(/([\u4e00-\u9fa5])\*\*/g, '$1 **')

  // 右侧空格: ** + 中文
  result = result.replace(/\*\*([\u4e00-\u9fa5])/g, '** $1')

  // 4. 最后修复粗体内部的多余空格
  // 这一步必须在最后执行，以清理掉上面可能过度添加的"内部"空格
  result = result.replace(/\*\*\s*([^\*]+?)\s*\*\*/g, '**$1**')

  // 5. 修复水平分割线被误认为是标题 (当 --- 跟在文字后面没有空行时)
  // 确保 --- 前面有空行
  result = result.replace(/([^\n])\n---/g, '$1\n\n---')

  // 6. 还原代码块
  placeholders.forEach((content, index) => {
    // 使用函数返回content，防止content中包含特殊的replace字符（如$'、$1等）
    result = result.replace(`__CODE_BLOCK_${index}__`, () => content)
  })

  return result
}
