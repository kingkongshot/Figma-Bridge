# figma-html-bridge

[English](./README.md) | 简体中文

**自动将 Figma 设计转换为 HTML/CSS。**

这个包能将 Figma 设计数据转换为干净、可用于生产环境的 HTML 和 CSS 代码。它通过将 Figma 的内部结构转换为中间表示（IR），然后渲染为语义化的 HTML 来工作。

---

## 安装

```bash
npm install figma-html-bridge
```

---

## 使用

这个包设计为配合 Figma 插件数据使用。完整实现、工作示例和文档请查看：

👉 **[Figma-Bridge 仓库](https://github.com/kingkongshot/Figma-Bridge)**

仓库包含：
- **完整 Figma 插件** - 提取设计数据及所有必需属性
- **后端服务器** - 使用本包的完整集成示例
- **实际案例** - 真实的使用场景和数据流
- **CLI 工具** - 测试和调试工具

---

## 包含内容

```typescript
import {
  figmaToHtml,           // 主函数：Figma 数据 → HTML
  compositionToIR,       // 转换为中间表示
  normalizeComposition,  // 准备原始 Figma 数据
  normalizeHtml,         // 清理生成的 HTML
  extractFontsFromComposition, // 提取字体元数据
  FontCollector          // 字体收集工具
} from 'figma-html-bridge';

// TypeScript 类型
import type {
  FigmaNode,
  CompositionInput,
  FigmaStyle,
  FigmaPaint
} from 'figma-html-bridge';
```

完整 API 文档和使用示例：**[查看仓库](https://github.com/kingkongshot/Figma-Bridge)**

---

## 项目状态

⚠️ **版本 0.1.0** - 早期开发阶段

这个包功能可用但仍在持续演进。未来版本中 API 可能会有变化。

---

## 许可证

MIT © kingkongshot

详见 [LICENSE](./LICENSE)。
