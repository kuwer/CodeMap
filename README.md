# CodeMap — Project Visualizer VS Code Extension

> Visualize any Node.js / TypeScript project's structure, function call graphs,
> and cross-file dependencies. Built for developers onboarding to new codebases.

---

## What it does

| Feature | Description |
|---|---|
| **Project Overview** | Scans your entire project and shows every file + function as an interactive D3 graph |
| **File Call Graph** | Right-click any `.js` or `.ts` file → see which functions call which, with interactive arrows |
| **Hover tooltips** | Hover any node to see function name, line numbers, and highlight all connected calls |
| **Drag & zoom** | Fully interactive — drag nodes, scroll to zoom, pan around |

---

## Project Structure

\`\`\`
codemap/
├── src/
│   ├── extension.ts          ← Entry point. Registers VS Code commands.
│   ├── parser/
│   │   ├── astParser.ts      ← Core engine. Parses JS/TS files into function + call data.
│   │   └── projectScanner.ts ← Walks the folder tree, calls astParser on every file.
│   └── panels/
│       ├── FileGraphPanel.ts    ← WebView: single file call graph (D3 force graph)
│       └── ProjectGraphPanel.ts ← WebView: full project overview (files + functions)
├── .vscode/
│   ├── launch.json           ← Runs the extension in debug mode (F5)
│   └── tasks.json            ← Auto-compiles TypeScript on save
├── package.json              ← Extension manifest + dependencies
└── tsconfig.json             ← TypeScript config
\`\`\`

---

## Setup — First Time

### Prerequisites
- Node.js 18+ installed
- VS Code installed
- Git installed

### Steps

\`\`\`bash
# 1. Clone the repo
git clone <your-repo-url>
cd codemap

# 2. Install dependencies
npm install

# 3. Open in VS Code
code .
\`\`\`

---

## Running the Extension (Development)

1. Open the `codemap` folder in VS Code
2. Press **F5** → this opens a new VS Code window called "Extension Development Host"
3. In the NEW window, open any Node.js or TypeScript project folder
4. Use the extension:

### Command 1 — Full Project Graph
- Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
- Type: `CodeMap: Show Project Graph`
- Hit Enter → a graph of your entire project opens

### Command 2 — Single File Call Graph
- In the Explorer panel, **right-click** any `.js` or `.ts` file
- Click `CodeMap: Show Call Graph for This File`
- The call graph for that file opens beside your editor

---

## How it works — Technical Flow

\`\`\`
User triggers command
       ↓
extension.ts (command handler)
       ↓
projectScanner.ts → collectFiles() → finds all .js/.ts files
       ↓
astParser.ts → parse() → Babel AST → traverse()
  - Detects: FunctionDeclaration, ArrowFunctionExpression, ClassMethod
  - Detects: CallExpression inside each function
       ↓
Returns: { functions[], callEdges[] }
       ↓
Panel (FileGraphPanel / ProjectGraphPanel)
  → Converts data to D3 nodes + links
  → Injects into WebView HTML
  → D3 force simulation renders interactive graph
\`\`\`

---

## Phase Roadmap

- [x] **Phase 1** — Core extension: AST parsing + D3 call graph
- [ ] **Phase 2** — AI sidebar: ask questions about any function (Claude/OpenAI API)
- [ ] **Phase 3** — Onboarding path generator: AI recommends reading order for new devs
- [ ] **Phase 4** — Complexity heatmap: highlights most interconnected files

---

## Tech Stack

| Layer | Technology |
|---|---|
| Extension shell | VS Code Extension API |
| Language | TypeScript |
| AST Parsing | `@babel/parser` + `@babel/traverse` |
| Graph rendering | D3.js v7 (force simulation) |
| Build | `tsc` (TypeScript compiler) |

---

## Publishing to VS Code Marketplace (later)

\`\`\`bash
npm install -g @vscode/vsce
vsce package        # creates a .vsix file
vsce publish        # publishes to marketplace (needs publisher account)
\`\`\`
