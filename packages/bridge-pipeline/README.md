# figma-html-bridge

English | [简体中文](./README.zh-CN.md)

**Convert Figma designs to HTML/CSS automatically.**

This package transforms Figma design data into clean, production-ready HTML and CSS code. It works by converting Figma's internal structure into an intermediate representation (IR), then rendering that as semantic HTML.

---

## Installation

```bash
npm install figma-html-bridge
```

---

## Usage

This package is designed to work with Figma plugin data. For complete implementation, working examples, and documentation, see:

👉 **[Figma-Bridge Repository](https://github.com/kingkongshot/Figma-Bridge)**

The repository includes:
- **Complete Figma Plugin** - Extract design data with all required properties
- **Backend Server** - Full integration example using this package
- **Live Examples** - Real-world usage and data flow
- **CLI Tools** - Testing and debugging utilities

---

## What's Included

```typescript
import {
  figmaToHtml,           // Main: Figma data → HTML
  compositionToIR,       // Convert to intermediate representation
  normalizeComposition,  // Prepare raw Figma data
  normalizeHtml,         // Clean up generated HTML
  extractFontsFromComposition, // Extract font metadata
  FontCollector          // Font collection utility
} from 'figma-html-bridge';

// TypeScript types
import type {
  FigmaNode,
  CompositionInput,
  FigmaStyle,
  FigmaPaint
} from 'figma-html-bridge';
```

Full API documentation and usage examples: **[See Repository](https://github.com/kingkongshot/Figma-Bridge)**

---

## Project Status

⚠️ **Version 0.1.0** - Early development stage

This package is functional but still evolving. APIs may change in future releases.

---

## License

MIT © kingkongshot

See [LICENSE](./LICENSE) for details.
