import { AISettings, AIResponse, CardType } from '../types';
import { buildPrompt, parseAIResponse } from '../utils/promptBuilder';

/**
 * AI 服务接口
 */
export interface IAIService {
    generateFlashcards(text: string, cardTypes: CardType[]): Promise<AIResponse>;
}

/**
 * OpenAI 服务提供商
 */
export class OpenAIProvider implements IAIService {
    private settings: AISettings;

    constructor(settings: AISettings) {
        this.settings = settings;
    }

    async generateFlashcards(text: string, cardTypes: CardType[]): Promise<AIResponse> {
        const prompt = buildPrompt(text, cardTypes, this.settings.maxCards);

        try {
            const response = await fetch(`${this.settings.apiUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.settings.apiKey}`,
                },
                body: JSON.stringify({
                    model: this.settings.model,
                    messages: [
                        {
                            role: 'system',
                            content: '你是一个专业的教育内容分析助手，擅长创建高质量的记忆卡片。请始终使用中文回复。',
                        },
                        {
                            role: 'user',
                            content: prompt,
                        },
                    ],
                    temperature: 0.7,
                    max_tokens: 4000,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error?.message || `API 请求失败: ${response.status}`);
            }

            const data = await response.json();
            const content = data.choices?.[0]?.message?.content;

            if (!content) {
                throw new Error('AI 返回内容为空');
            }

            const cards = parseAIResponse(content);

            if (cards.length === 0) {
                throw new Error('无法从 AI 响应中解析出有效的卡片');
            }

            return { success: true, cards };

        } catch (error) {
            const message = error instanceof Error ? error.message : '未知错误';
            return { success: false, error: message };
        }
    }
}

/**
 * Claude (Anthropic) 服务提供商
 */
export class ClaudeProvider implements IAIService {
    private settings: AISettings;

    constructor(settings: AISettings) {
        this.settings = settings;
    }

    async generateFlashcards(text: string, cardTypes: CardType[]): Promise<AIResponse> {
        const prompt = buildPrompt(text, cardTypes, this.settings.maxCards);

        // 确定 API URL
        let apiUrl = this.settings.apiUrl;
        if (!apiUrl || apiUrl === 'https://api.openai.com/v1') {
            apiUrl = 'https://api.anthropic.com';
        }

        try {
            const response = await fetch(`${apiUrl}/v1/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': this.settings.apiKey,
                    'anthropic-version': '2023-06-01',
                },
                body: JSON.stringify({
                    model: this.settings.model || 'claude-3-sonnet-20240229',
                    max_tokens: 4000,
                    messages: [
                        {
                            role: 'user',
                            content: prompt,
                        },
                    ],
                    system: '你是一个专业的教育内容分析助手，擅长创建高质量的记忆卡片。请始终使用中文回复。',
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error?.message || `API 请求失败: ${response.status}`);
            }

            const data = await response.json();
            const content = data.content?.[0]?.text;

            if (!content) {
                throw new Error('AI 返回内容为空');
            }

            const cards = parseAIResponse(content);

            if (cards.length === 0) {
                throw new Error('无法从 AI 响应中解析出有效的卡片');
            }

            return { success: true, cards };

        } catch (error) {
            const message = error instanceof Error ? error.message : '未知错误';
            return { success: false, error: message };
        }
    }
}

/**
 * AI 服务工厂函数
 */
export function createAIService(settings: AISettings): IAIService {
    switch (settings.provider) {
        case 'claude':
            return new ClaudeProvider(settings);
        case 'openai':
        default:
            return new OpenAIProvider(settings);
    }
}
