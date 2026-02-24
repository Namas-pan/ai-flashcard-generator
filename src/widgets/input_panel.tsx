import { useState, useCallback } from 'react';
import { usePlugin, renderWidget, useRunAsync } from '@remnote/plugin-sdk';
import { CardType, InputSource, DEFAULT_CARD_TYPES, SETTINGS_KEYS } from '../types';
import { createAIService } from '../services/aiService';
import { CardGenerator, getOrCreateFlashcardsFolder } from '../services/cardGenerator';
import { parseDocument, validateText, preprocessText } from '../services/documentParser';

/**
 * 输入面板组件 - 提供三种文本输入方式
 */
function InputPanel() {
    const plugin = usePlugin();

    // 状态
    const [activeTab, setActiveTab] = useState<InputSource>('paste');
    const [pasteText, setPasteText] = useState('');
    const [urlInput, setUrlInput] = useState('');
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successCount, setSuccessCount] = useState<number | null>(null);

    // 选中的卡片类型
    const [enabledTypes, setEnabledTypes] = useState<CardType[]>(DEFAULT_CARD_TYPES);

    // 存放位置: 文件夹名称（精确匹配已有文档或创建新的）
    const [folderName, setFolderName] = useState<string>('');

    // 拖拽上传状态
    const [isDragging, setIsDragging] = useState(false);

    // 拖拽事件处理
    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);

        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            const file = files[0];
            const validTypes = ['.txt', '.md', '.pdf'];
            const ext = '.' + file.name.split('.').pop()?.toLowerCase();
            if (validTypes.includes(ext)) {
                setSelectedFile(file);
                setActiveTab('upload');
            } else {
                setError('不支持的文件格式，请上传 TXT, MD 或 PDF 文件');
            }
        }
    };

    // 获取设置 - 优先从 storage 读取，否则使用默认值
    const settings = useRunAsync(async () => {
        try {
            const provider = await plugin.storage.getSynced(SETTINGS_KEYS.AI_PROVIDER) ||
                await plugin.settings.getSetting(SETTINGS_KEYS.AI_PROVIDER) || 'openai';
            const apiKey = await plugin.storage.getSynced(SETTINGS_KEYS.API_KEY) ||
                await plugin.settings.getSetting(SETTINGS_KEYS.API_KEY) || '';
            const model = await plugin.storage.getSynced(SETTINGS_KEYS.MODEL) ||
                await plugin.settings.getSetting(SETTINGS_KEYS.MODEL) || 'gpt-4';
            const apiUrl = await plugin.storage.getSynced(SETTINGS_KEYS.API_URL) ||
                await plugin.settings.getSetting(SETTINGS_KEYS.API_URL) || 'https://api.openai.com/v1';
            const maxCards = await plugin.storage.getSynced(SETTINGS_KEYS.MAX_CARDS) ||
                await plugin.settings.getSetting(SETTINGS_KEYS.MAX_CARDS) || 10;

            return { provider, apiKey, model, apiUrl, maxCards };
        } catch (err) {
            console.error('加载设置失败:', err);
            return { provider: 'openai', apiKey: '', model: 'gpt-4', apiUrl: 'https://api.openai.com/v1', maxCards: 10 };
        }
    }, []);

    // 处理文件选择
    const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            setSelectedFile(file);
            setError(null);
        }
    }, []);

    // 切换卡片类型
    const toggleCardType = useCallback((cardType: CardType) => {
        setEnabledTypes(prev =>
            prev.includes(cardType)
                ? prev.filter(t => t !== cardType)
                : [...prev, cardType]
        );
    }, []);

    // 生成卡片
    const handleGenerate = useCallback(async () => {
        setError(null);
        setSuccessCount(null);

        // 验证设置
        if (!settings?.apiKey) {
            setError('请先在设置中配置 API Key');
            return;
        }

        if (enabledTypes.length === 0) {
            setError('请至少选择一种卡片类型');
            return;
        }

        setIsLoading(true);

        try {
            // 获取文本内容
            let text = '';
            let isUrlMode = false;

            if (activeTab === 'paste') {
                text = pasteText;
            } else if (activeTab === 'upload' && selectedFile) {
                text = await parseDocument(selectedFile);
            } else if (activeTab === 'selection') {
                // 获取当前选中的文本
                const selection = await plugin.editor.getSelectedText();
                text = String(selection || '');
            } else if (activeTab === 'url') {
                const rawInput = urlInput.trim();
                if (!rawInput) {
                    throw new Error('请输入 URL 链接');
                }
                // 解析多行 URL
                const urls = rawInput
                    .split('\n')
                    .map(line => line.trim())
                    .filter(line => line.length > 0);

                const invalidUrls = urls.filter(u => !/^https?:\/\/.+/i.test(u));
                if (invalidUrls.length > 0) {
                    throw new Error(`以下链接格式无效（需以 http:// 或 https:// 开头）：\n${invalidUrls.join('\n')}`);
                }
                isUrlMode = true;
            }

            // 验证文本（URL 模式下跳过，因为传给 AI 的是链接而非正文）
            if (!isUrlMode) {
                const validation = validateText(text);
                if (!validation.valid) {
                    throw new Error(validation.error);
                }

                // 预处理文本
                text = preprocessText(text);
            }

            // 调用 AI 服务
            const aiService = createAIService({
                provider: settings.provider as 'openai' | 'claude',
                apiKey: String(settings.apiKey),
                model: String(settings.model),
                apiUrl: String(settings.apiUrl),
                maxCards: Number(settings.maxCards),
            });

            let allCards: import('../types').FlashcardData[] = [];

            if (isUrlMode) {
                // 批量处理多个 URL
                const urls = urlInput.trim().split('\n').map(l => l.trim()).filter(l => l.length > 0);
                const errors: string[] = [];

                for (let i = 0; i < urls.length; i++) {
                    setError(null);
                    // 更新加载提示，显示当前进度
                    const response = await aiService.generateFlashcardsFromUrl(urls[i], enabledTypes);
                    if (response.success && response.cards) {
                        allCards = allCards.concat(response.cards);
                    } else {
                        errors.push(`链接 ${i + 1}: ${response.error || '生成失败'}`);
                    }
                }

                if (allCards.length === 0) {
                    throw new Error('所有链接均未能生成卡片\n' + errors.join('\n'));
                }

                if (errors.length > 0) {
                    // 部分成功时记录警告
                    console.warn('部分链接处理失败:', errors);
                }
            } else {
                const response = await aiService.generateFlashcards(text, enabledTypes);
                if (!response.success || !response.cards) {
                    throw new Error(response.error || '生成失败');
                }
                allCards = response.cards;
            }

            // 根据用户输入的文件夹名称确定存放位置
            let parentRemId: string | undefined = undefined;

            const targetFolderName = folderName.trim() || 'AI 生成的记忆卡片';

            // 尝试查找已存在的文件夹，如果不存在则创建
            const folder = await getOrCreateFlashcardsFolder(plugin, targetFolderName);
            parentRemId = folder?._id;

            // 创建卡片
            const generator = new CardGenerator(plugin);
            const createdRems = await generator.createFlashcards(
                allCards,
                parentRemId
            );

            setSuccessCount(createdRems.length);

            // 清空输入
            if (activeTab === 'paste') {
                setPasteText('');
            } else if (activeTab === 'url') {
                setUrlInput('');
            }

            // 显示成功消息
            await plugin.app.toast(`成功创建 ${createdRems.length} 张卡片！`);

        } catch (err) {
            const message = err instanceof Error ? err.message : '生成失败';
            setError(message);
        } finally {
            setIsLoading(false);
        }
    }, [activeTab, pasteText, selectedFile, urlInput, enabledTypes, settings, plugin, folderName]);

    // 现代化样式
    const styles = {
        container: {
            padding: '20px',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            maxWidth: '480px',
            backgroundColor: 'var(--bg-primary, #fff)',
            borderRadius: '12px',
        },
        header: {
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '20px',
            fontWeight: '600' as const,
            marginBottom: '20px',
            color: 'var(--text-color, #1a1a2e)',
            paddingBottom: '16px',
            borderBottom: '1px solid var(--border-color, #e5e7eb)',
        },
        headerIcon: {
            fontSize: '24px',
        },
        tabs: {
            display: 'flex',
            gap: '6px',
            marginBottom: '20px',
            backgroundColor: 'var(--bg-secondary, #f5f5f5)',
            padding: '4px',
            borderRadius: '10px',
        },
        tab: (active: boolean) => ({
            flex: 1,
            padding: '10px 12px',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            backgroundColor: active ? 'white' : 'transparent',
            color: active ? 'var(--primary-color, #4A90D9)' : 'var(--text-secondary, #6b7280)',
            fontWeight: active ? '600' as const : '500' as const,
            fontSize: '13px',
            boxShadow: active ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            transition: 'all 0.2s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
        }),
        section: {
            marginBottom: '20px',
        },
        sectionTitle: {
            fontSize: '13px',
            fontWeight: '600' as const,
            color: 'var(--text-secondary, #6b7280)',
            marginBottom: '10px',
            textTransform: 'uppercase' as const,
            letterSpacing: '0.5px',
        },
        textarea: {
            width: '100%',
            minHeight: '120px',
            padding: '14px',
            border: '2px solid var(--border-color, #e5e7eb)',
            borderRadius: '10px',
            fontSize: '14px',
            resize: 'vertical' as const,
            fontFamily: 'inherit',
            boxSizing: 'border-box' as const,
            backgroundColor: 'var(--bg-primary, #fff)',
            color: 'var(--text-color, #1a1a2e)',
            transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
            outline: 'none',
        },
        fileUploadArea: (dragging: boolean) => ({
            display: 'block',
            width: '100%',
            boxSizing: 'border-box' as const,
            border: `2px dashed ${dragging ? 'var(--primary-color, #4A90D9)' : 'var(--border-color, #e5e7eb)'}`,
            borderRadius: '10px',
            padding: '24px 20px',
            textAlign: 'center' as const,
            backgroundColor: dragging ? 'rgba(74, 144, 217, 0.08)' : 'var(--bg-secondary, #f9fafb)',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            transform: dragging ? 'scale(1.01)' : 'scale(1)',
        }),
        fileUploadIcon: {
            fontSize: '32px',
            marginBottom: '8px',
        },
        fileUploadText: {
            fontSize: '13px',
            color: 'var(--text-secondary, #6b7280)',
        },
        fileUploadHint: {
            fontSize: '11px',
            color: 'var(--text-secondary, #9ca3af)',
            marginTop: '4px',
        },
        hiddenInput: {
            display: 'none',
        },
        selectedFile: {
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 14px',
            backgroundColor: 'rgba(74, 144, 217, 0.08)',
            borderRadius: '8px',
            border: '1px solid var(--primary-color, #4A90D9)',
        },
        selectedFileName: {
            flex: 1,
            fontSize: '13px',
            color: 'var(--primary-color, #4A90D9)',
            fontWeight: '500' as const,
        },
        removeFileBtn: {
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-secondary, #9ca3af)',
            fontSize: '16px',
            padding: '2px',
        },
        cardTypesGrid: {
            display: 'flex',
            flexWrap: 'wrap' as const,
            gap: '6px',
        },
        cardTypeChip: (active: boolean) => ({
            padding: '6px 12px',
            borderRadius: '16px',
            cursor: 'pointer',
            border: `1px solid ${active ? 'var(--primary-color, #4A90D9)' : 'var(--border-color, #e5e7eb)'}`,
            backgroundColor: active ? 'rgba(74, 144, 217, 0.1)' : 'var(--bg-secondary, #f5f5f5)',
            color: active ? 'var(--primary-color, #4A90D9)' : 'var(--text-color, #1a1a2e)',
            fontWeight: '500' as const,
            fontSize: '12px',
            transition: 'all 0.15s ease',
            whiteSpace: 'nowrap' as const,
        }),
        folderInput: {
            width: '100%',
            padding: '12px 14px',
            border: '2px solid var(--border-color, #e5e7eb)',
            borderRadius: '10px',
            fontSize: '14px',
            backgroundColor: 'var(--bg-primary, #fff)',
            color: 'var(--text-color, #1a1a2e)',
            boxSizing: 'border-box' as const,
            transition: 'border-color 0.2s ease',
            outline: 'none',
        },
        hint: {
            fontSize: '12px',
            color: 'var(--text-secondary, #9ca3af)',
            marginTop: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
        },
        button: {
            width: '100%',
            padding: '14px 24px',
            background: 'linear-gradient(135deg, #4A90D9 0%, #357ABD 100%)',
            color: 'white',
            border: 'none',
            borderRadius: '10px',
            fontSize: '15px',
            fontWeight: '600' as const,
            cursor: 'pointer',
            opacity: isLoading ? 0.7 : 1,
            boxShadow: '0 4px 14px rgba(74, 144, 217, 0.35)',
            transition: 'all 0.2s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
        },
        alert: (type: 'error' | 'success') => ({
            marginTop: '16px',
            padding: '12px 16px',
            borderRadius: '10px',
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: type === 'error' ? '#fef2f2' : '#f0fdf4',
            color: type === 'error' ? '#dc2626' : '#16a34a',
            border: `1px solid ${type === 'error' ? '#fecaca' : '#bbf7d0'}`,
        }),
        info: {
            fontSize: '13px',
            color: 'var(--text-secondary, #9ca3af)',
            padding: '12px',
            backgroundColor: 'var(--bg-secondary, #f9fafb)',
            borderRadius: '8px',
            textAlign: 'center' as const,
        },
        // 兼容旧代码
        cardTypes: { marginBottom: '20px' },
        cardTypeLabel: { fontSize: '13px', fontWeight: '600' as const, color: 'var(--text-secondary, #6b7280)', marginBottom: '10px', textTransform: 'uppercase' as const, letterSpacing: '0.5px' },
        checkboxGroup: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' },
        checkbox: { display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' },
        locationRow: { marginTop: '8px' },
        select: { padding: '8px 12px', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '14px' },
        error: { color: '#dc2626', marginTop: '16px', padding: '12px 16px', backgroundColor: '#fef2f2', borderRadius: '10px', border: '1px solid #fecaca' },
        success: { color: '#16a34a', marginTop: '16px', padding: '12px 16px', backgroundColor: '#f0fdf4', borderRadius: '10px', border: '1px solid #bbf7d0' },
    };

    const cardTypeNames: Record<CardType, string> = {
        'basic': '基础问答',
        'basic-reverse': '双向问答',
        'cloze': '填空',
        'list': '列表',
        'descriptor': '描述',
    };

    return (
        <div style={styles.container}>
            {/* 标题头部 */}
            <div style={styles.header}>
                <span style={styles.headerIcon}>🎴</span>
                <span>AI 卡片生成器</span>
            </div>

            {/* 输入源选项卡 */}
            <div style={styles.tabs}>
                <button
                    style={styles.tab(activeTab === 'selection')}
                    onClick={() => setActiveTab('selection')}
                >
                    📝 选中文本
                </button>
                <button
                    style={styles.tab(activeTab === 'paste')}
                    onClick={() => setActiveTab('paste')}
                >
                    📋 粘贴
                </button>
                <button
                    style={styles.tab(activeTab === 'upload')}
                    onClick={() => setActiveTab('upload')}
                >
                    📁 上传
                </button>
                <button
                    style={styles.tab(activeTab === 'url')}
                    onClick={() => setActiveTab('url')}
                >
                    🔗 链接
                </button>
            </div>

            {/* 输入区域 */}
            <div style={styles.section}>
                {activeTab === 'selection' && (
                    <div style={styles.info}>
                        💡 在 RemNote 中选中要转换为卡片的文本，然后点击下方生成按钮
                    </div>
                )}

                {activeTab === 'paste' && (
                    <textarea
                        style={styles.textarea}
                        placeholder="在此粘贴要转换为卡片的文本内容..."
                        value={pasteText}
                        onChange={(e) => setPasteText(e.target.value)}
                    />
                )}

                {activeTab === 'upload' && (
                    <div>
                        {selectedFile ? (
                            <div style={styles.selectedFile}>
                                <span>📎</span>
                                <span style={styles.selectedFileName}>{selectedFile.name}</span>
                                <button
                                    style={styles.removeFileBtn}
                                    onClick={() => setSelectedFile(null)}
                                >
                                    ✕
                                </button>
                            </div>
                        ) : (
                            <label
                                style={styles.fileUploadArea(isDragging)}
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onDrop={handleDrop}
                            >
                                <input
                                    type="file"
                                    accept=".txt,.md,.pdf"
                                    onChange={handleFileChange}
                                    style={styles.hiddenInput}
                                />
                                <div style={styles.fileUploadIcon}>{isDragging ? '📥' : '📁'}</div>
                                <div style={styles.fileUploadText}>
                                    {isDragging ? '松开鼠标上传文件' : '拖拽文件到此处或点击选择'}
                                </div>
                                <div style={styles.fileUploadHint}>支持 TXT, MD, PDF</div>
                            </label>
                        )}
                    </div>
                )}

                {activeTab === 'url' && (
                    <div>
                        <textarea
                            style={styles.textarea}
                            placeholder={'每行输入一个链接，支持批量处理\n例如：\nhttps://example.com/article1\nhttps://example.com/article2'}
                            value={urlInput}
                            onChange={(e) => setUrlInput(e.target.value)}
                        />
                        <div style={styles.hint}>
                            💡 每行一个链接，AI 将逐个读取并生成卡片（需模型支持联网）
                        </div>
                    </div>
                )}
            </div>

            {/* 卡片类型选择 - 使用 Chip 样式 */}
            <div style={styles.section}>
                <div style={styles.sectionTitle}>卡片类型</div>
                <div style={styles.cardTypesGrid}>
                    {(Object.keys(cardTypeNames) as CardType[]).map(cardType => (
                        <div
                            key={cardType}
                            style={styles.cardTypeChip(enabledTypes.includes(cardType))}
                            onClick={() => toggleCardType(cardType)}
                        >
                            {enabledTypes.includes(cardType) ? '✓ ' : ''}{cardTypeNames[cardType]}
                        </div>
                    ))}
                </div>
            </div>

            {/* 存放位置 */}
            <div style={styles.section}>
                <div style={styles.sectionTitle}>📁 存放位置</div>
                <input
                    type="text"
                    style={styles.folderInput}
                    placeholder="输入文件夹名称..."
                    value={folderName}
                    onChange={(e) => setFolderName(e.target.value)}
                />
                <div style={styles.hint}>
                    💡 留空则存放在「AI 生成的记忆卡片」
                </div>
            </div>

            {/* 生成按钮 */}
            <button
                style={styles.button}
                onClick={handleGenerate}
                disabled={isLoading}
            >
                {isLoading ? '⏳ 生成中...' : '✨ 生成卡片'}
            </button>

            {/* 错误提示 */}
            {error && (
                <div style={styles.alert('error')}>
                    ❌ {error}
                </div>
            )}

            {/* 成功提示 */}
            {successCount !== null && (
                <div style={styles.alert('success')}>
                    ✅ 成功创建 {successCount} 张卡片！
                </div>
            )}
        </div>
    );
}

// 导出渲染函数 - Widget ID 与 registerWidget 中的 ID 必须匹配
renderWidget(InputPanel);
