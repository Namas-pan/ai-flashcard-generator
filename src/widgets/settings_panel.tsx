import { useState, useEffect, useCallback } from 'react';
import { usePlugin, renderWidget } from '@remnote/plugin-sdk';
import { SETTINGS_KEYS, DEFAULT_SETTINGS, AIProvider } from '../types';

/**
 * 设置面板组件 - 配置 AI 服务参数
 */
function SettingsPanel() {
    const plugin = usePlugin();

    // 状态
    const [provider, setProvider] = useState<AIProvider>(DEFAULT_SETTINGS.provider);
    const [apiKey, setApiKey] = useState('');
    const [model, setModel] = useState(DEFAULT_SETTINGS.model);
    const [apiUrl, setApiUrl] = useState(DEFAULT_SETTINGS.apiUrl);
    const [maxCards, setMaxCards] = useState(DEFAULT_SETTINGS.maxCards);
    const [saved, setSaved] = useState(false);

    // 加载已保存的设置
    useEffect(() => {
        const loadSettings = async () => {
            const savedProvider = await plugin.settings.getSetting(SETTINGS_KEYS.AI_PROVIDER);
            const savedApiKey = await plugin.settings.getSetting(SETTINGS_KEYS.API_KEY);
            const savedModel = await plugin.settings.getSetting(SETTINGS_KEYS.MODEL);
            const savedApiUrl = await plugin.settings.getSetting(SETTINGS_KEYS.API_URL);
            const savedMaxCards = await plugin.settings.getSetting(SETTINGS_KEYS.MAX_CARDS);

            if (savedProvider === 'openai' || savedProvider === 'claude') {
                setProvider(savedProvider);
            }
            if (savedApiKey) setApiKey(String(savedApiKey));
            if (savedModel) setModel(String(savedModel));
            if (savedApiUrl) setApiUrl(String(savedApiUrl));
            if (savedMaxCards) setMaxCards(Number(savedMaxCards));
        };
        loadSettings();
    }, [plugin]);

    // 保存设置 - 使用 storage API
    const handleSave = useCallback(async () => {
        // 使用 storage API 保存设置
        await plugin.storage.setSession(SETTINGS_KEYS.AI_PROVIDER, provider);
        await plugin.storage.setSession(SETTINGS_KEYS.API_KEY, apiKey);
        await plugin.storage.setSession(SETTINGS_KEYS.MODEL, model);
        await plugin.storage.setSession(SETTINGS_KEYS.API_URL, apiUrl);
        await plugin.storage.setSession(SETTINGS_KEYS.MAX_CARDS, maxCards);

        // 同时保存到 synced storage（跨设备同步）
        await plugin.storage.setSynced(SETTINGS_KEYS.AI_PROVIDER, provider);
        await plugin.storage.setSynced(SETTINGS_KEYS.API_KEY, apiKey);
        await plugin.storage.setSynced(SETTINGS_KEYS.MODEL, model);
        await plugin.storage.setSynced(SETTINGS_KEYS.API_URL, apiUrl);
        await plugin.storage.setSynced(SETTINGS_KEYS.MAX_CARDS, maxCards);

        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        await plugin.app.toast('设置已保存！');
    }, [plugin, provider, apiKey, model, apiUrl, maxCards]);

    // 样式
    const styles = {
        container: {
            padding: '16px',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            maxWidth: '400px',
        },
        header: {
            fontSize: '18px',
            fontWeight: 'bold' as const,
            marginBottom: '16px',
            color: 'var(--text-color)',
        },
        formGroup: {
            marginBottom: '16px',
        },
        label: {
            display: 'block',
            fontSize: '14px',
            fontWeight: 'bold' as const,
            marginBottom: '6px',
            color: 'var(--text-color)',
        },
        description: {
            fontSize: '12px',
            color: 'var(--text-secondary)',
            marginBottom: '6px',
        },
        input: {
            width: '100%',
            padding: '10px',
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
            fontSize: '14px',
            boxSizing: 'border-box' as const,
        },
        select: {
            width: '100%',
            padding: '10px',
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
            fontSize: '14px',
            boxSizing: 'border-box' as const,
        },
        button: {
            width: '100%',
            padding: '12px 24px',
            backgroundColor: saved ? '#38a169' : 'var(--primary-color, #4A90D9)',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '14px',
            fontWeight: 'bold' as const,
            cursor: 'pointer',
        },
        divider: {
            height: '1px',
            background: 'var(--border-color)',
            margin: '20px 0',
        },
    };

    const handleProviderChange = (value: string) => {
        if (value === 'openai' || value === 'claude') {
            setProvider(value);
        }
    };

    return (
        <div style={styles.container}>
            <div style={styles.header}>⚙️ AI 卡片生成器设置</div>

            {/* AI 提供商 */}
            <div style={styles.formGroup}>
                <label style={styles.label}>AI 服务提供商</label>
                <select
                    style={styles.select}
                    value={provider}
                    onChange={(e) => handleProviderChange(e.target.value)}
                >
                    <option value="openai">OpenAI</option>
                    <option value="claude">Claude</option>
                </select>
            </div>

            {/* API Key */}
            <div style={styles.formGroup}>
                <label style={styles.label}>API Key</label>
                <div style={styles.description}>输入你的 API 密钥</div>
                <input
                    type="password"
                    style={styles.input}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-xxx..."
                />
            </div>

            {/* 模型名称 */}
            <div style={styles.formGroup}>
                <label style={styles.label}>模型名称</label>
                <div style={styles.description}>
                    OpenAI: gpt-4, gpt-3.5-turbo | Claude: claude-3-sonnet-20240229
                </div>
                <input
                    type="text"
                    style={styles.input}
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="gpt-4"
                />
            </div>

            {/* API URL */}
            <div style={styles.formGroup}>
                <label style={styles.label}>API URL</label>
                <div style={styles.description}>自定义 API 端点（可选，支持代理）</div>
                <input
                    type="text"
                    style={styles.input}
                    value={apiUrl}
                    onChange={(e) => setApiUrl(e.target.value)}
                    placeholder="https://api.openai.com/v1"
                />
            </div>

            {/* 最大卡片数 */}
            <div style={styles.formGroup}>
                <label style={styles.label}>每次最大生成卡片数</label>
                <input
                    type="number"
                    style={styles.input}
                    value={maxCards}
                    onChange={(e) => setMaxCards(Number(e.target.value))}
                    min={1}
                    max={50}
                />
            </div>

            <div style={styles.divider} />

            {/* 保存按钮 */}
            <button style={styles.button} onClick={handleSave}>
                {saved ? '✓ 已保存' : '💾 保存设置'}
            </button>
        </div>
    );
}

// 导出渲染函数
renderWidget(SettingsPanel);
