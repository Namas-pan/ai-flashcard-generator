// AI 提供商类型
export type AIProvider = 'openai' | 'claude';

// 卡片类型
export type CardType =
    | 'basic'           // 基础问答卡 (>>)
    | 'basic-reverse'   // 双向问答卡 (<>)
    | 'cloze'           // 填空卡 {{}}
    | 'list'            // 列表卡 (>>>)
    | 'descriptor';     // 描述卡 (;;)

// 生成的卡片数据
export interface FlashcardData {
    type: CardType;
    front: string;           // 问题/正面/属性名
    back: string | string[]; // 答案（List 类型为数组）
    clozeText?: string;      // Cloze 完整文本（包含 {{}} 标记）
}

// AI 设置
export interface AISettings {
    provider: AIProvider;
    apiKey: string;
    model: string;
    apiUrl: string;  // 自定义 API URL
    maxCards: number; // 每次生成的最大卡片数量
}

// 输入源类型
export type InputSource = 'selection' | 'upload' | 'paste';

// 生成请求
export interface GenerateRequest {
    text: string;
    source: InputSource;
    cardTypes: CardType[];
}

// AI 响应格式
export interface AIResponse {
    success: boolean;
    cards?: FlashcardData[];
    error?: string;
}

// 插件设置存储键
export const SETTINGS_KEYS = {
    AI_PROVIDER: 'aiProvider',
    API_KEY: 'apiKey',
    MODEL: 'model',
    API_URL: 'apiUrl',
    MAX_CARDS: 'maxCards',
    ENABLED_CARD_TYPES: 'enabledCardTypes',
    TARGET_FOLDER: 'targetFolder',  // 卡片存放的目标文件夹
} as const;

// 默认设置值
export const DEFAULT_SETTINGS: AISettings = {
    provider: 'openai',
    apiKey: '',
    model: 'gpt-4',
    apiUrl: 'https://api.openai.com/v1',
    maxCards: 10,
};

// 默认启用的卡片类型
export const DEFAULT_CARD_TYPES: CardType[] = ['basic', 'cloze', 'list'];
