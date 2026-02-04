/**
 * 文档解析器 - 处理不同格式的文档输入
 */

// 支持的文件类型
export type SupportedFileType = 'txt' | 'md' | 'pdf';

/**
 * 解析上传的文件内容
 */
export async function parseDocument(file: File): Promise<string> {
    const extension = getFileExtension(file.name);

    switch (extension) {
        case 'txt':
        case 'md':
            return await parseTextFile(file);
        case 'pdf':
            return await parsePDFFile(file);
        default:
            throw new Error(`不支持的文件格式: ${extension}`);
    }
}

/**
 * 获取文件扩展名
 */
function getFileExtension(filename: string): string {
    const parts = filename.split('.');
    return parts.length > 1 ? parts.pop()!.toLowerCase() : '';
}

/**
 * 解析文本文件（TXT, MD）
 */
async function parseTextFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (event) => {
            const content = event.target?.result;
            if (typeof content === 'string') {
                resolve(content);
            } else {
                reject(new Error('无法读取文件内容'));
            }
        };

        reader.onerror = () => {
            reject(new Error('读取文件失败'));
        };

        reader.readAsText(file, 'UTF-8');
    });
}

/**
 * 解析 PDF 文件
 * 注意: 这是一个简化实现，实际使用需要引入 PDF 解析库
 */
async function parsePDFFile(file: File): Promise<string> {
    // 简化实现：提示用户 PDF 支持有限
    // 在实际项目中，可以使用 pdf.js 或其他库

    console.warn('PDF 解析功能有限，建议使用 TXT 或 MD 格式');

    // 尝试作为文本读取（对于某些简单 PDF 可能有效）
    try {
        const text = await parseTextFile(file);

        // 清理可能的 PDF 格式字符
        const cleanedText = text
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '') // 移除控制字符
            .replace(/\s+/g, ' ') // 合并空白
            .trim();

        if (cleanedText.length < 50) {
            throw new Error('PDF 内容提取失败，请使用 TXT 或 MD 格式');
        }

        return cleanedText;

    } catch {
        throw new Error('PDF 解析失败，请将内容转换为 TXT 格式后重试');
    }
}

/**
 * 验证文本内容是否有效
 */
export function validateText(text: string): { valid: boolean; error?: string } {
    if (!text || typeof text !== 'string') {
        return { valid: false, error: '请提供有效的文本内容' };
    }

    const trimmedText = text.trim();

    if (trimmedText.length === 0) {
        return { valid: false, error: '文本内容为空' };
    }

    if (trimmedText.length < 20) {
        return { valid: false, error: '文本内容太短，至少需要 20 个字符' };
    }

    if (trimmedText.length > 50000) {
        return { valid: false, error: '文本内容过长，最多支持 50000 个字符' };
    }

    return { valid: true };
}

/**
 * 预处理文本，清理格式
 */
export function preprocessText(text: string): string {
    return text
        .trim()
        .replace(/\r\n/g, '\n')     // 统一换行符
        .replace(/\n{3,}/g, '\n\n') // 合并多余换行
        .replace(/\t/g, '  ');       // Tab 转空格
}
