# Figma Bridge

[![MIT License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.0.0-green.svg)](package.json)

[English](README.md) | 简体中文

将 Figma 设计稿解析为 LLM 友好的 HTML/CSS，让 AI 帮助非技术人员实现设计高保真还原。

## 这是什么？

Figma Bridge 是一个专为 AI 辅助开发设计的 Figma 到代码转换工具。它将 Figma 设计解析为结构清晰、语义化的 HTML/CSS，这些代码对大语言模型（LLM）极其友好，使得 AI 能够准确理解设计意图并协助实现高保真还原。

**核心功能：**
- **LLM 友好的代码结构**：生成语义化、结构清晰的 HTML/CSS，便于 AI 理解和处理
- **实时 HTML/CSS 预览**：即时渲染，带有可视化调试覆盖层，方便验证还原度
- **精确的设计信息提取**：完整保留布局、颜色、字体、间距等设计细节
- **智能字体处理**：自动匹配字体，集成 Google Fonts

## 为什么需要 Figma Bridge？

### ❌ 没有 Figma Bridge 时
- AI 无法准确理解 Figma 设计意图，只能看截图
- 需要手动标注尺寸、测量间距、导出资源
- AI 无法像素级还原，频繁丢失细节，需要反复对话调整
- 非技术员需要阅读代码来进一步修改

### ✅ 使用 Figma Bridge 后
- Figma Bridge 自动导出 LLM 友好的结构化的、语义化的 HTML/CSS
- AI 能精确理解 Figma 设计的每个细节（布局、颜色、字体、间距）
- AI 阅读后直接生成生产级代码，做到像素级高保真的还原设计
- 设计人员可以在 figma 中直接修改设计，AI 从 Figma Bridge 获取更新后的设计数据，减少需求描述成本


## 快速开始

### 安装

```bash
# 克隆仓库
git clone https://github.com/kingkongshot/Figma-Bridge.git
cd Figma-Bridge

# 安装依赖
npm install
```

### 开发

```bash
# 启动开发服务器
npm run dev
```

服务器将在 `http://localhost:7788` 启动。在浏览器中打开此 URL 以访问预览界面。

### 使用 Figma 插件

1. 在 Figma 中打开一个画布
2. 空白处点击右键
3. 选择 plugins → development → import plugin from manifest
4. 然后选择本项目根目录的 manifest.json 文件即可完成导入
5. 然后在同级菜单选择 Brige 打开插件
6. 点击任意组件即可在浏览器中看到预览

![Figma Plugin Usage](https://github.com/kingkongshot/Figma-Bridge/blob/main/public/images/instruction1.png?raw=true)

### 查看输出

生成的 HTML/CSS 文件会自动实时保存到 `output/` 目录。你可以在浏览器中打开 `output/index.html` 查看导出结果。

## 项目结构

```
Figma-Bridge/
├── src/               # 服务端代码
├── public/            # 浏览器预览界面
├── ui.html            # Figma 插件 UI
├── code.js            # Figma 插件逻辑
└── locales/           # 国际化文件
```

## 开源协议

MIT License - 详见 [LICENSE](LICENSE) 文件

## 作者

由 [link](mailto:jojo@aisen.work) 创建

## 贡献

欢迎贡献！随时提交 issue 或 pull request。
