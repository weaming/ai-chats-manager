import type { FullConversationTurn } from '../composables/useFileSystem';

// 预编译正则表达式以提高性能
const QUESTION_PATTERN = /^#+\s*(.+)?(You|User|Question|Prompt|Asked|提问|问题)/i;
const ANSWER_PATTERN = /^#+\s*(.+)?(AI|Answer|Response|Responded|回答|助手)/i;
const HEADING_PATTERN = /^#+/;

export function parseGeminiMarkdown(text: string): FullConversationTurn[] {
    const turns: FullConversationTurn[] = [];
    const lines = text.split('\n');
    
    let currentQuestion: string | null = null;
    let currentAnswer: string[] = [];
    let inAnswer = false;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        
        // 检测问题标记 (支持多种格式)
        // - 英文: You, User, Question, Prompt, Asked
        // - 中文: 提问, 问题, 我的提问
        if (QUESTION_PATTERN.test(line)) {
            // 如果有之前的回答,先保存
            if (currentAnswer.length > 0) {
                const cleanedAnswer = cleanAdvertisement(currentAnswer.join('\n'));
                turns.push({
                    question: currentQuestion,
                    answer: cleanedAnswer
                });
                currentAnswer = [];
            }
            
            // 查找问题内容 - 跳过空行,找到第一个非空行
            currentQuestion = null;
            for (let j = i + 1; j < lines.length; j++) {
                const nextLine = lines[j];
                // 如果遇到下一个标题,停止
                if (nextLine && HEADING_PATTERN.test(nextLine)) {
                    break;
                }
                // 找到第一个非空行作为问题
                if (nextLine && nextLine.trim()) {
                    currentQuestion = nextLine.trim();
                    break;
                }
            }
            inAnswer = false;
        }
        // 检测回答标记 (支持多种格式)
        // - 英文: AI, Answer, Response, Responded
        // - 中文: 回答, 助手 (不限定 AI 名称,如 "Gemini 回答", "ChatGPT 回答" 等)
        else if (ANSWER_PATTERN.test(line)) {
            inAnswer = true;
        }
        // 收集回答内容
        else if (inAnswer && line.trim()) {
            currentAnswer.push(line);
        }
        else if (inAnswer && !line.trim() && currentAnswer.length > 0) {
            currentAnswer.push(line);
        }
    }
    
    // 保存最后一个回答
    if (currentAnswer.length > 0) {
        // 清理回答内容,移除广告信息
        const cleanedAnswer = cleanAdvertisement(currentAnswer.join('\n'));
        turns.push({
            question: currentQuestion,
            answer: cleanedAnswer
        });
    }
    
    return turns;
}

// 辅助函数:清理广告信息和尾部分隔符
function cleanAdvertisement(text: string): string {
    const lines = text.split('\n');
    
    // 定义要移除的模式(从最长到最短检查)
    const patterns = [
        {
            len: 3,
            check: (l: string[]) => l[0] === '---' && l[1] === '' && (l[2]?.toLowerCase() || '').includes('powered by')
        },
        {
            len: 2,
            check: (l: string[]) => l[0] === '---' && (l[1]?.toLowerCase() || '').includes('powered by')
        },
        {
            len: 2,
            check: (l: string[]) => l[0] === '' && l[1] === '---'
        },
        {
            len: 1,
            check: (l: string[]) => l[0] === '---'
        }
    ];
    
    // 按顺序检查各种模式
    for (const pattern of patterns) {
        if (lines.length >= pattern.len) {
            const lastN = lines.slice(-pattern.len).map(l => l?.trim() || '');
            if (pattern.check(lastN)) {
                return lines.slice(0, -pattern.len).join('\n').trim();
            }
        }
    }
    
    return text.trim();
}

export function parseGeminiJSON(jsonText: string): FullConversationTurn[] {
    try {
        const data = JSON.parse(jsonText);
        
        // 格式 1: Gemini Exporter 格式 {metadata: {...}, messages: [{role, say}]}
        if (data.messages && Array.isArray(data.messages)) {
            const turns: FullConversationTurn[] = [];
            let currentQuestion: string | null = null;
            
            for (const msg of data.messages) {
                if (msg.role === 'Prompt' && msg.say) {
                    currentQuestion = msg.say;
                } else if (msg.role === 'Response' && msg.say) {
                    turns.push({
                        question: currentQuestion,
                        answer: msg.say
                    });
                    currentQuestion = null;
                }
            }
            return turns;
        }
        
        // 格式 2: 直接数组格式 [{question, answer}]
        if (Array.isArray(data)) {
            return data.map((item: any) => ({
                question: item.question || item.user || item.prompt || null,
                answer: item.answer || item.response || item.text || ''
            })).filter(turn => turn.answer.trim());
        }
        
        // 格式 3: 嵌套对话格式 {conversation: [...]}
        if (data.conversation && Array.isArray(data.conversation)) {
            return parseGeminiJSON(JSON.stringify(data.conversation));
        }
        
        return [];
    } catch (e) {
        console.error('Failed to parse JSON:', e);
        return [];
    }
}

export function parseGeminiPlainText(text: string): FullConversationTurn[] {
    const turns: FullConversationTurn[] = [];
    
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
    
    let currentQuestion: string | null = null;
    
    for (const para of paragraphs) {
        const trimmed = para.trim();
        
        if (trimmed.length < 20) {
            continue;
        }
        
        const isQuestion = trimmed.endsWith('?') || 
                          trimmed.endsWith('?') || 
                          trimmed.match(/^(请|如何|为什么|怎么|能否|可以)/);
        
        if (isQuestion) {
            currentQuestion = trimmed;
        } else {
            turns.push({
                question: currentQuestion,
                answer: trimmed
            });
            currentQuestion = null;
        }
    }
    
    return turns;
}

export function parseGeminiContent(text: string): FullConversationTurn[] {
    if (!text || !text.trim()) {
        return [];
    }
    
    const trimmed = text.trim();
    
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        const jsonResult = parseGeminiJSON(trimmed);
        if (jsonResult.length > 0) {
            return jsonResult;
        }
    }
    
    if (trimmed.includes('#')) {
        const markdownResult = parseGeminiMarkdown(trimmed);
        if (markdownResult.length > 0) {
            return markdownResult;
        }
    }
    
    return parseGeminiPlainText(trimmed);
}
