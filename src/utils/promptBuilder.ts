import { CardType, FlashcardData } from '../types';

/**
 * 构建 AI Prompt，指导模型生成指定类型的卡片
 */
export function buildPrompt(text: string, cardTypes: CardType[], maxCards: number): string {
    const cardTypeDescriptions = getCardTypeDescriptions(cardTypes);

    return `你是一个专业的教育内容分析师。请分析以下文本，提取关键知识点并生成记忆卡片。

## 任务说明
1. 仔细阅读文本内容，识别重要的知识点、概念、定义、关系等
2. 为每个知识点选择最合适的卡片类型
3. 确保问题清晰具体，答案准确简洁
4. 生成 ${maxCards} 张以内的卡片

## 可用的卡片类型
${cardTypeDescriptions}

## 输出格式
请严格按照以下 JSON 格式输出，不要添加任何其他内容：
\`\`\`json
[
  {"type": "卡片类型", "front": "问题/正面", "back": "答案/反面"},
  {"type": "cloze", "front": "", "back": "", "clozeText": "完整句子，关键词用{{双大括号}}包裹"}
]
\`\`\`

## 注意事项
- type 必须是以下之一：${cardTypes.map(t => `"${t}"`).join(', ')}
- cloze 类型的卡片必须包含 clozeText 字段
- list 类型的 back 字段必须是字符串数组
- 确保 JSON 格式正确，可以被解析

## 待分析的文本内容
${text}`;
}

/**
 * 获取卡片类型描述
 */
function getCardTypeDescriptions(cardTypes: CardType[]): string {
    const descriptions: Record<CardType, string> = {
        'basic': `**basic（基础问答卡）**
  - 用途：简单的问答对
  - 格式：{"type": "basic", "front": "问题", "back": "答案"}
  - 示例：{"type": "basic", "front": "什么是光合作用？", "back": "植物利用阳光、水和二氧化碳制造葡萄糖和氧气的过程"}`,

        'basic-reverse': `**basic-reverse（双向问答卡）**
  - 用途：需要双向记忆的概念对
  - 格式：{"type": "basic-reverse", "front": "概念A", "back": "概念B"}
  - 示例：{"type": "basic-reverse", "front": "中国首都", "back": "北京"}`,

        'cloze': `**cloze（填空卡）**
  - 用途：记忆句子中的关键词或短语
  - 格式：{"type": "cloze", "front": "", "back": "", "clozeText": "句子，关键词用{{双大括号}}包裹"}
  - 示例：{"type": "cloze", "front": "", "back": "", "clozeText": "光合作用主要发生在植物细胞的{{叶绿体}}中"}`,

        'list': `**list（列表卡）**
  - 用途：需要记忆多个相关项目
  - 格式：{"type": "list", "front": "问题", "back": ["项目1", "项目2", "项目3"]}
  - 示例：{"type": "list", "front": "列举三原色", "back": ["红色", "绿色", "蓝色"]}`,

        'descriptor': `**descriptor（描述卡）**
  - 用途：定义某个概念的具体属性
  - 格式：{"type": "descriptor", "front": "属性名", "back": "属性值"}
  - 示例：{"type": "descriptor", "front": "化学符号", "back": "H2O"}`,
    };

    return cardTypes
        .filter(type => descriptions[type])
        .map(type => descriptions[type])
        .join('\n\n');
}

/**
 * 解析 AI 响应，提取卡片数据
 */
export function parseAIResponse(response: string): FlashcardData[] {
    try {
        // 尝试提取 JSON 块
        const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
        const jsonStr = jsonMatch ? jsonMatch[1] : response;

        // 清理可能的格式问题
        const cleanedJson = jsonStr
            .trim()
            .replace(/,\s*]/g, ']')  // 移除尾部逗号
            .replace(/,\s*}/g, '}'); // 移除对象尾部逗号

        const parsed = JSON.parse(cleanedJson);

        if (!Array.isArray(parsed)) {
            throw new Error('响应格式错误：期望数组');
        }

        // 验证和规范化每张卡片
        return parsed
            .filter(card => isValidCard(card))
            .map(card => normalizeCard(card as unknown as Record<string, unknown>));

    } catch (error) {
        console.error('解析 AI 响应失败:', error);
        console.error('原始响应:', response);
        return [];
    }
}

/**
 * 验证卡片数据是否有效
 */
function isValidCard(card: unknown): card is FlashcardData {
    if (typeof card !== 'object' || card === null) return false;

    const c = card as Record<string, unknown>;

    // 验证类型字段
    const validTypes: CardType[] = ['basic', 'basic-reverse', 'cloze', 'list', 'descriptor'];
    if (!validTypes.includes(c.type as CardType)) return false;

    // cloze 类型需要 clozeText
    if (c.type === 'cloze') {
        return typeof c.clozeText === 'string' && c.clozeText.includes('{{');
    }

    // list 类型需要数组 back
    if (c.type === 'list') {
        return typeof c.front === 'string' && Array.isArray(c.back);
    }

    // 其他类型需要 front 和 back 字符串
    return typeof c.front === 'string' && typeof c.back === 'string';
}

/**
 * 规范化卡片数据
 */
function normalizeCard(card: Record<string, unknown>): FlashcardData {
    const base: FlashcardData = {
        type: card.type as CardType,
        front: String(card.front || ''),
        back: card.type === 'list'
            ? (card.back as string[]).map(String)
            : String(card.back || ''),
    };

    if (card.type === 'cloze' && card.clozeText) {
        base.clozeText = String(card.clozeText);
    }

    return base;
}
