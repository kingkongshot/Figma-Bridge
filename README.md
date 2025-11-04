# Figma Bridge

[![MIT License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.0.0-green.svg)](package.json)

English | [简体中文](README-zh.md)

Transform Figma designs into LLM-friendly HTML/CSS, empowering non-technical users to achieve high-fidelity design implementation with AI assistance.

## What is Figma Bridge?

Figma Bridge is a Figma-to-code conversion tool designed specifically for AI-assisted development. It parses Figma designs into clean, semantic HTML/CSS that is highly optimized for Large Language Models (LLMs), enabling AI to accurately understand design intent and assist in achieving high-fidelity implementation.

**Key Features:**
- **LLM-Friendly Code Structure**: Generates semantic, well-structured HTML/CSS that AI can easily understand and process
- **Live HTML/CSS Preview**: Real-time rendering with visual debugging overlays for instant validation
- **Precise Design Information Extraction**: Fully preserves layout, colors, fonts, spacing, and other design details
- **Smart Font Handling**: Automatic font matching with Google Fonts integration

## Why Figma Bridge?

### ❌ Without Figma Bridge
- AI cannot accurately understand Figma design intent, only sees screenshots
- Manual annotation, measurement, and asset export required
- AI cannot achieve pixel-perfect restoration, losing many details, requiring repeated dialogue adjustments
- Non-technical users need to read code for further modifications

### ✅ With Figma Bridge
- Figma Bridge automatically exports LLM-friendly, structured, semantic HTML/CSS
- AI precisely understands every Figma design detail (layout, colors, fonts, spacing)
- AI directly generates production-ready code with pixel-perfect high-fidelity design restoration
- Designers can modify designs directly in Figma, AI fetches updated design data from Figma Bridge, reducing requirement description costs

## Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/kingkongshot/Figma-Bridge.git
cd Figma-Bridge

# Install dependencies
npm install
```

### Development

```bash
# Start the development server
npm run dev
```

The server will start at `http://localhost:7788`. Open this URL in your browser to access the preview interface.

### Using the Figma Plugin

1. Open a canvas in Figma
2. Right-click on a blank area
3. Select plugins → development → import plugin from manifest
4. Select the manifest.json file from the project root directory to complete the import
5. Then select Brige from the same menu to open the plugin
6. Click on any component to see the preview in your browser

![Figma Plugin Usage](https://github.com/kingkongshot/Figma-Bridge/blob/main/public/images/instruction1.png?raw=true)

### Viewing Output

The generated HTML/CSS files are automatically saved to the `output/` directory in real-time. You can open `output/index.html` in your browser to view the exported result.

## Project Structure

```
Figma-Bridge/
├── src/               # Server-side code
├── public/            # Browser preview interface
├── ui.html            # Figma plugin UI
├── code.js            # Figma plugin logic
├── debug/             # Debug output (when BRIDGE_DEBUG=1)
└── locales/           # Internationalization files
```

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Author

Created by [link](mailto:jojo@aisen.work)

## Contributing

Contributions are welcome! Feel free to open issues or submit pull requests.
