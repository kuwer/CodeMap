# ⬡ CodeMap — Codebase Visualizer for VS Code

> **Instantly understand any Node.js / TypeScript project.** CodeMap parses your codebase using AST analysis and renders an interactive, color-coded call graph — so new developers can onboard in minutes, not days.

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)
![VS Code](https://img.shields.io/badge/VS%20Code%20Extension-007ACC?style=flat&logo=visualstudiocode&logoColor=white)
![D3.js](https://img.shields.io/badge/D3.js-F9A03C?style=flat&logo=d3dotjs&logoColor=white)
![Babel](https://img.shields.io/badge/Babel%20AST-F9DC3E?style=flat&logo=babel&logoColor=black)
![License](https://img.shields.io/badge/license-MIT-green?style=flat)

---

## 🎯 The Problem

When a developer joins a new project, they spend days just trying to understand the codebase — which files depend on which, where data flows, what to read first. Existing tools either show a flat file tree (useless) or are expensive SaaS products (overkill).

**CodeMap solves this inside VS Code, for free, in seconds.**

---

## ✨ Features

### 🗺 Interactive Project Graph
Scan your entire project and visualize every file, function, and cross-file dependency as a live D3 force graph. Color-coded by folder so you instantly see your architecture layers.

![Project Graph](https://raw.githubusercontent.com/kuwer/CodeMap/main/assets/project-graph.png)

### 🎯 Onboarding Path Generator
Click **"Onboarding Path"** and CodeMap analyzes the call graph topology to recommend a reading order for new developers — with numbered badges animating onto nodes and plain-English reasoning for each step.

> *"Start with `KeystoreRepo.ts` — central hub used by 5 files. Then `utils.ts` — shared utility with 0 outgoing calls..."*

![Onboarding Path](https://raw.githubusercontent.com/kuwer/CodeMap/main/assets/onboarding-path.png)

### ⚡ Single File Call Graph
Right-click any `.js`, `.ts`, `.jsx`, or `.tsx` file → **"CodeMap: Show Call Graph"**. See every function in that file and exactly which functions call which, rendered as curved D3 arrows.

### 🔍 Search & Navigate
Type any filename or function name in the search box — matched nodes highlight instantly, everything else fades. Click any node in the Onboarding panel to pan and zoom the graph directly to that file.

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- VS Code 1.85+

### Installation (Development)

```bash
git clone https://github.com/kuwer/CodeMap.git
cd CodeMap
npm install
code .
```

Press **F5** in VS Code → a new **Extension Development Host** window opens.

Open any Node.js or TypeScript project in that window, then:

| Action | How |
|---|---|
| Full project graph | `Ctrl+Shift+P` → `CodeMap: Show Project Graph` |
| Single file graph | Right-click any `.js`/`.ts` file → `CodeMap: Show Call Graph for This File` |
| Onboarding path | Click **🎯 Onboarding Path** button in the header |
| Search | Type in the search box (top left) |
| Zoom | Scroll wheel or +/− buttons (top right) |
| Drag nodes | Click and drag any node to rearrange |

---

## 🧠 How It Works

```
User triggers command
        ↓
extension.ts — registers commands, opens WebView panel
        ↓
projectScanner.ts — walks directory tree, skips node_modules/dist/out
        ↓
astParser.ts — Babel parses each file into AST, traverses to find:
   • FunctionDeclaration, ArrowFunctionExpression, ClassMethod
   • CallExpression inside each function (who calls whom)
        ↓
projectScanner.ts — stitches cross-file call edges using function index
        ↓
ProjectGraphPanel.ts — converts to D3 nodes + links, injects into WebView
        ↓
D3.js force simulation — renders interactive graph in VS Code WebView
        ↓
Onboarding algorithm — topological scoring (fan-in × 2 − fan-out + fn count)
                        → sorted reading order with plain-English reasoning
```

---

## 🏗 Project Structure

```
CodeMap/
├── src/
│   ├── extension.ts              ← Entry point, command registration
│   ├── parser/
│   │   ├── astParser.ts          ← Babel AST parser (functions + calls)
│   │   └── projectScanner.ts     ← Directory walker + cross-file linker
│   │                                + Onboarding path generator
│   └── panels/
│       ├── ProjectGraphPanel.ts  ← Full project WebView (D3 force graph)
│       └── FileGraphPanel.ts     ← Single file WebView (call graph)
├── .vscode/
│   ├── launch.json               ← F5 debug config
│   └── tasks.json                ← Auto-compile on save
├── package.json                  ← Extension manifest
└── tsconfig.json
```

---

## 🛠 Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Extension shell | VS Code Extension API | Native integration, WebView support |
| Language | TypeScript | Type safety, matches target audience |
| AST Parsing | `@babel/parser` + `@babel/traverse` | Handles JS, TS, JSX, TSX with error recovery |
| Graph rendering | D3.js v7 | Force simulation, fully interactive |
| Build | TypeScript Compiler (`tsc`) | Zero config, fast |

---

## 🗺 Roadmap

- [x] **Phase 1** — AST parsing + interactive D3 call graph
- [x] **Phase 2** — Color-coded folder grouping, glow effects, search, zoom controls
- [x] **Phase 3** — Onboarding Path: animated reading-order trail with reasoning
- [ ] **Phase 4** — Complexity Heatmap: node size + color scaled by connection count
- [ ] **Phase 5** — Dependency Risk Score: warning badges on high fan-in nodes
- [ ] **Phase 6** — Git Blame Overlay: recency + authorship on each file node
- [ ] **Phase 7** — AI sidebar: natural language questions about any function

---

## 🧪 Test It On A Real Project

Want to see CodeMap on a complex codebase? Try it on this open-source Node.js + TypeScript backend:

```bash
git clone https://github.com/afteracademy/nodejs-backend-architecture-typescript.git
```

Open that folder in the Extension Development Host window. You'll see `BlogRepo.ts`, `UserRepo.ts`, `KeystoreRepo.ts` and their full call relationships instantly.

---

## 📦 Publishing (Future)

```bash
npm install -g @vscode/vsce
vsce package        # → codemap-0.0.1.vsix
vsce publish        # → VS Code Marketplace
```

---

## 🤝 Contributing

PRs welcome! If you find a bug or have a feature idea, open an issue.

---

## 📄 License

MIT © [Kuwer Bhendarkar](https://github.com/kuwer)
