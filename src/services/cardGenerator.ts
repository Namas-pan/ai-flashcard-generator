import { RNPlugin } from '@remnote/plugin-sdk';
import { FlashcardData } from '../types';

// RemNote SDK 返回的 Rem 对象类型（使用 any 因为 SDK 未直接导出类型）
type RemObject = {
    _id: string;
    [key: string]: unknown;
};

/**
 * 卡片生成器 - 将 AI 生成的卡片数据转换为 RemNote Rem
 */
export class CardGenerator {
    private plugin: RNPlugin;

    constructor(plugin: RNPlugin) {
        this.plugin = plugin;
    }

    /**
     * 批量创建卡片
     * @param cards 卡片数据数组
     * @param parentRemId 父级 Rem ID（可选，不提供则创建在当前文档根目录）
     */
    async createFlashcards(cards: FlashcardData[], parentRemId?: string): Promise<RemObject[]> {
        const createdRems: RemObject[] = [];

        for (const card of cards) {
            try {
                const rem = await this.createSingleCard(card, parentRemId);
                if (rem) {
                    createdRems.push(rem);
                }
            } catch (error) {
                console.error('创建卡片失败:', error, card);
            }
        }

        return createdRems;
    }

    /**
     * 创建单张卡片
     */
    private async createSingleCard(card: FlashcardData, parentRemId?: string): Promise<RemObject | undefined> {
        switch (card.type) {
            case 'basic':
                return this.createBasicCard(card, parentRemId, false);
            case 'basic-reverse':
                return this.createBasicCard(card, parentRemId, true);
            case 'cloze':
                return this.createClozeCard(card, parentRemId);
            case 'list':
                return this.createListCard(card, parentRemId);
            case 'descriptor':
                return this.createDescriptorCard(card, parentRemId);
            default:
                console.warn('未知卡片类型:', card.type);
                return undefined;
        }
    }

    /**
     * 创建基础问答卡片
     * 正向: 问题 >> 答案
     * 双向: 问题 <> 答案
     */
    private async createBasicCard(
        card: FlashcardData,
        parentRemId?: string,
        bidirectional: boolean = false
    ): Promise<RemObject | undefined> {
        const separator = bidirectional ? ' <> ' : ' >> ';
        const markdown = `${card.front}${separator}${card.back}`;

        return await this.plugin.rem.createSingleRemWithMarkdown(markdown, parentRemId) as RemObject | undefined;
    }

    /**
     * 创建填空卡片
     * 格式: 句子包含 {{填空内容}}
     */
    private async createClozeCard(
        card: FlashcardData,
        parentRemId?: string
    ): Promise<RemObject | undefined> {
        if (!card.clozeText) {
            console.warn('Cloze 卡片缺少 clozeText');
            return undefined;
        }

        // RemNote 的 Cloze 语法使用 {{ }}
        // 确保格式正确
        let clozeText = card.clozeText;

        // 如果使用的是 {{c1::text}} 格式，转换为 RemNote 格式 {{text}}
        clozeText = clozeText.replace(/\{\{c\d+::(.*?)\}\}/g, '{{$1}}');

        return await this.plugin.rem.createSingleRemWithMarkdown(clozeText, parentRemId) as RemObject | undefined;
    }

    /**
     * 创建列表卡片
     * 格式: 问题 >>>
     *   - 答案1
     *   - 答案2
     */
    private async createListCard(
        card: FlashcardData,
        parentRemId?: string
    ): Promise<RemObject | undefined> {
        const backItems = Array.isArray(card.back) ? card.back : [card.back];

        // 创建父级 Rem（问题）
        const parentRem = await this.plugin.rem.createSingleRemWithMarkdown(
            `${card.front} >>>`,
            parentRemId
        ) as RemObject | undefined;

        if (!parentRem) {
            console.warn('创建列表卡片父级失败');
            return undefined;
        }

        // 创建子项（答案列表）
        for (const item of backItems) {
            await this.plugin.rem.createSingleRemWithMarkdown(item, parentRem._id);
        }

        return parentRem;
    }

    /**
     * 创建描述卡片
     * 格式: 属性名 ;; 属性值
     */
    private async createDescriptorCard(
        card: FlashcardData,
        parentRemId?: string
    ): Promise<RemObject | undefined> {
        const markdown = `${card.front} ;; ${card.back}`;

        return await this.plugin.rem.createSingleRemWithMarkdown(markdown, parentRemId) as RemObject | undefined;
    }
}

/**
 * 获取用于存放生成卡片的父级 Rem
 * 如果不存在则创建
 */
export async function getOrCreateFlashcardsFolder(
    plugin: RNPlugin,
    folderName: string = 'AI 生成的卡片'
): Promise<RemObject | undefined> {
    // 尝试查找已存在的文件夹
    const existingRems = await plugin.rem.findByName([folderName], null);

    if (existingRems) {
        return existingRems as unknown as RemObject;
    }

    // 创建新文件夹
    const folderRem = await plugin.rem.createSingleRemWithMarkdown(`# ${folderName}`, undefined);

    // 将其设置为文档，使其显示在侧边栏
    if (folderRem) {
        await folderRem.setIsDocument(true);
    }

    return folderRem as RemObject | undefined;
}
