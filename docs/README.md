# AI Flashcard Generator

使用 AI（OpenAI / Claude）从文本自动生成 RemNote 记忆卡片。

## ✨ 功能特性

- **多 AI 支持**：OpenAI 和 Claude，支持自定义模型和 API URL
- **多输入方式**：选中文本、粘贴文本、上传文档（TXT/MD/PDF）
- **全卡片类型**：
  - Basic 基础问答卡 (`>>` / `<>`)
  - Cloze 填空卡 (`{{}}`)
  - List 列表卡 (`>>>`)
  - Descriptor 描述卡 (`;;`)

## 🚀 快速开始

### 安装

1. 克隆项目：
```bash
git clone <repo-url>
cd ai-flashcard-generator
```

2. 安装依赖：
```bash
npm install
```

3. 启动开发服务器：
```bash
npm run dev
```

4. 在 RemNote 中加载插件：
   - 打开 RemNote → Settings → Plugins
   - 点击 "Build a plugin"
   - 输入开发服务器地址：`http://localhost:5173`

### 配置

1. 在插件设置中配置：
   - **AI 服务提供商**：选择 `openai` 或 `claude`
   - **API Key**：输入对应服务的 API Key
   - **模型名称**：如 `gpt-4`、`claude-3-sonnet-20240229`
   - **API URL**：可自定义（支持代理）

## 📖 使用方法

### 方式一：选中文本生成

1. 在 RemNote 中选中一段文本
2. 运行命令：`/AI 生成卡片 (选中文本)`
3. 或使用右键菜单

### 方式二：使用输入面板

1. 运行命令：`/AI 生成卡片 (打开面板)`
2. 在面板中选择输入方式：
   - 粘贴文本
   - 上传文档
   - 选中文本
3. 选择要生成的卡片类型
4. 点击生成

## 🔧 开发

```bash
# 开发模式
npm run dev

# 构建
npm run build

# 代码检查
npm run lint
```

## 📄 许可

MIT License
