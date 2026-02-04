import {
    declareIndexPlugin,
    ReactRNPlugin,
    WidgetLocation,
} from '@remnote/plugin-sdk';
import { SETTINGS_KEYS, DEFAULT_SETTINGS, DEFAULT_CARD_TYPES } from '../types';
import { createAIService } from '../services/aiService';
import { CardGenerator, getOrCreateFlashcardsFolder } from '../services/cardGenerator';
import { validateText, preprocessText } from '../services/documentParser';
// 注意：不要在这里导入 Widget 文件，它们是独立的入口点

/**
 * AI Flashcard Generator 插件入口
 */
async function onActivate(plugin: ReactRNPlugin) {
    // ========== 注册设置项 ==========

    // AI 提供商选择（下拉框）
    await plugin.settings.registerDropdownSetting({
        id: SETTINGS_KEYS.AI_PROVIDER,
        title: 'AI 服务提供商',
        description: '选择使用的 AI 服务',
        defaultValue: DEFAULT_SETTINGS.provider,
        options: [
            { key: 'openai', value: 'openai', label: 'OpenAI (GPT-4, GPT-3.5)' },
            { key: 'claude', value: 'claude', label: 'Claude (Anthropic)' },
        ],
    });

    // API Key
    await plugin.settings.registerStringSetting({
        id: SETTINGS_KEYS.API_KEY,
        title: 'API Key',
        description: '输入你的 API Key（OpenAI 或 Claude）',
        defaultValue: '',
    });

    // 模型名称
    await plugin.settings.registerStringSetting({
        id: SETTINGS_KEYS.MODEL,
        title: '模型名称',
        description: '例如: gpt-4, gpt-3.5-turbo, claude-3-sonnet-20240229',
        defaultValue: DEFAULT_SETTINGS.model,
    });

    // API URL
    await plugin.settings.registerStringSetting({
        id: SETTINGS_KEYS.API_URL,
        title: 'API URL',
        description: '自定义 API 端点（支持代理或本地部署）',
        defaultValue: DEFAULT_SETTINGS.apiUrl,
    });

    // 最大卡片数
    await plugin.settings.registerNumberSetting({
        id: SETTINGS_KEYS.MAX_CARDS,
        title: '每次生成最大卡片数',
        description: '限制每次生成的卡片数量',
        defaultValue: DEFAULT_SETTINGS.maxCards,
    });

    // 目标文件夹
    await plugin.settings.registerStringSetting({
        id: SETTINGS_KEYS.TARGET_FOLDER,
        title: '卡片存放文件夹',
        description: '生成的卡片将存放在此文件夹中（留空则存放在当前文档下）',
        defaultValue: 'AI 生成的记忆卡片',
    });

    // ========== 注册 Widget ==========

    // 注册输入面板 Widget（使用 Popup 位置）
    await plugin.app.registerWidget('input_panel', WidgetLocation.Popup, {
        dimensions: { width: 500, height: 600 },
    });

    // 注册设置面板 Widget（使用 Popup 位置）
    await plugin.app.registerWidget('settings_panel', WidgetLocation.Popup, {
        dimensions: { width: 400, height: 500 },
    });

    // ========== 注册命令 ==========

    // 从选中文本生成卡片
    await plugin.app.registerCommand({
        id: 'generate-from-selection',
        name: 'AI 生成卡片 (选中文本)',
        description: '从当前选中的文本生成记忆卡片',
        action: async () => {
            await generateFromSelection(plugin);
        },
    });

    // 打开输入面板
    await plugin.app.registerCommand({
        id: 'open-input-panel',
        name: 'AI 生成卡片 (打开面板)',
        description: '打开卡片生成面板，支持粘贴文本或上传文档',
        action: async () => {
            plugin.widget.openPopup('input_panel');
        },
    });

    // 打开设置面板
    await plugin.app.registerCommand({
        id: 'open-settings-panel',
        name: 'AI 卡片生成器 - 设置',
        description: '打开设置面板，配置 API Key 和模型',
        action: async () => {
            plugin.widget.openPopup('settings_panel');
        },
    });

    // ========== 注册右键菜单 ==========

    await plugin.app.registerCommand({
        id: 'generate-context-menu',
        name: '生成记忆卡片',
        description: '从选中文本生成卡片',
        action: async () => {
            await generateFromSelection(plugin);
        },
    });

    console.log('AI Flashcard Generator 插件已加载');
}

/**
 * 从选中文本生成卡片
 */
async function generateFromSelection(plugin: ReactRNPlugin) {
    try {
        // 获取选中文本
        const selectedText = await plugin.editor.getSelectedText();

        if (!selectedText) {
            await plugin.app.toast('请先选中要转换的文本');
            return;
        }

        // 验证文本
        const selectedString = String(selectedText || '');
        const validation = validateText(selectedString);
        if (!validation.valid) {
            await plugin.app.toast(validation.error || '文本无效');
            return;
        }

        // 获取设置 - 优先从 storage 读取
        const provider = await plugin.storage.getSynced(SETTINGS_KEYS.AI_PROVIDER) as string ||
            await plugin.settings.getSetting(SETTINGS_KEYS.AI_PROVIDER) as string || 'openai';
        const apiKey = await plugin.storage.getSynced(SETTINGS_KEYS.API_KEY) as string ||
            await plugin.settings.getSetting(SETTINGS_KEYS.API_KEY) as string;
        const model = await plugin.storage.getSynced(SETTINGS_KEYS.MODEL) as string ||
            await plugin.settings.getSetting(SETTINGS_KEYS.MODEL) as string || 'gpt-4';
        const apiUrl = await plugin.storage.getSynced(SETTINGS_KEYS.API_URL) as string ||
            await plugin.settings.getSetting(SETTINGS_KEYS.API_URL) as string || 'https://api.openai.com/v1';
        const maxCards = await plugin.storage.getSynced(SETTINGS_KEYS.MAX_CARDS) as number ||
            await plugin.settings.getSetting(SETTINGS_KEYS.MAX_CARDS) as number || 10;

        if (!apiKey) {
            await plugin.app.toast('请先在设置中配置 API Key');
            return;
        }

        await plugin.app.toast('正在生成卡片...');

        // 预处理文本
        const processedText = preprocessText(selectedString);

        // 创建 AI 服务
        const aiService = createAIService({
            provider: provider as 'openai' | 'claude',
            apiKey,
            model,
            apiUrl,
            maxCards,
        });

        // 生成卡片
        const response = await aiService.generateFlashcards(
            processedText,
            DEFAULT_CARD_TYPES
        );

        if (!response.success || !response.cards) {
            await plugin.app.toast(`生成失败: ${response.error}`);
            return;
        }

        // 获取目标文件夹设置
        const targetFolder = await plugin.settings.getSetting(SETTINGS_KEYS.TARGET_FOLDER) as string || 'AI 生成的记忆卡片';

        // 获取或创建卡片文件夹
        const folder = targetFolder ? await getOrCreateFlashcardsFolder(plugin, targetFolder) : undefined;

        // 创建卡片
        const generator = new CardGenerator(plugin);
        const createdRems = await generator.createFlashcards(
            response.cards,
            folder?._id
        );

        await plugin.app.toast(`成功创建 ${createdRems.length} 张卡片！`);

    } catch (error) {
        const message = error instanceof Error ? error.message : '未知错误';
        console.error('生成卡片失败:', error);
        await plugin.app.toast(`错误: ${message}`);
    }
}

async function onDeactivate(_: ReactRNPlugin) {
    console.log('AI Flashcard Generator 插件已卸载');
}

declareIndexPlugin(onActivate, onDeactivate);
