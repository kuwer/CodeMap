// src/panels/FileGraphPanel.ts
// ─────────────────────────────────────────────────────────────
// Creates a VS Code WebView panel for a SINGLE FILE's call graph.
//
// WebView = a sandboxed browser tab inside VS Code.
// We inject D3.js from a CDN to render an interactive graph.
//
// Flow:
//   1. User right-clicks a .ts/.js file → "CodeMap: Show Call Graph"
//   2. We parse the file with astParser
//   3. We render a WebView with an interactive D3 force graph
//   4. Nodes = functions, Edges = function calls
// ─────────────────────────────────────────────────────────────

import * as vscode from 'vscode';
import * as path from 'path';
import { parseFile } from '../parser/astParser';

export class FileGraphPanel {
  // Track the current panel so we don't open duplicates
  public static currentPanel: FileGraphPanel | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private readonly _filePath: string;
  private _disposables: vscode.Disposable[] = [];

  // ── Static factory: create or reuse the panel ─────────────
  public static createOrShow(extensionUri: vscode.Uri, filePath: string) {
    const column = vscode.window.activeTextEditor
      ? vscode.ViewColumn.Beside   // Open beside current editor
      : vscode.ViewColumn.One;

    // If panel already exists, just update it with the new file
    if (FileGraphPanel.currentPanel) {
      FileGraphPanel.currentPanel._update(filePath);
      FileGraphPanel.currentPanel._panel.reveal(column);
      return;
    }

    // Create a new WebView panel
    const panel = vscode.window.createWebviewPanel(
      'codemapFileGraph',              // internal ID
      'CodeMap: File Graph',           // panel title
      column,
      {
        enableScripts: true,           // allow JavaScript in the WebView
        // Allow loading resources from the extension's media folder
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
      }
    );

    FileGraphPanel.currentPanel = new FileGraphPanel(panel, filePath);
  }

  private constructor(panel: vscode.WebviewPanel, filePath: string) {
    this._panel = panel;
    this._filePath = filePath;

    // Initial render
    this._update(filePath);

    // Listen for panel being closed by the user
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
  }

  // ── Update the panel with a new file's data ───────────────
  private _update(filePath: string) {
    const fileName = path.basename(filePath);
    this._panel.title = `CodeMap: ${fileName}`;

    // Parse the file to get functions & calls
    const result = parseFile(filePath);

    if (result.error) {
      this._panel.webview.html = this._getErrorHtml(result.error);
      return;
    }

    // Build graph data for D3
    // Nodes: one per function
    // Links: one per call relationship
    const nodes = result.functions.map(fn => ({
      id: fn.id,
      name: fn.name,
      startLine: fn.startLine,
      endLine: fn.endLine,
    }));

    // Build a set of known function IDs to filter out external calls
    const knownIds = new Set(nodes.map(n => n.id));

    const links: Array<{ source: string; target: string }> = [];
    for (const fn of result.functions) {
      for (const calledName of fn.calls) {
        const targetId = `${fileName}::${calledName}`;
        if (knownIds.has(targetId)) {
          links.push({ source: fn.id, target: targetId });
        }
      }
    }

    this._panel.webview.html = this._getWebviewContent(fileName, nodes, links);
  }

  // ── Generate the full HTML for the WebView ────────────────
  private _getWebviewContent(
    fileName: string,
    nodes: Array<{ id: string; name: string; startLine: number; endLine: number }>,
    links: Array<{ source: string; target: string }>
  ): string {
    // Safely serialize data for injection into the HTML
    const graphData = JSON.stringify({ nodes, links });

    return /* html */ `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>CodeMap</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #1e1e2e;
      color: #cdd6f4;
      font-family: 'Segoe UI', sans-serif;
      overflow: hidden;
    }
    #header {
      padding: 12px 20px;
      background: #181825;
      border-bottom: 1px solid #313244;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    #header h2 { font-size: 14px; font-weight: 600; color: #89b4fa; }
    #header span { font-size: 12px; color: #6c7086; }
    #graph { width: 100vw; height: calc(100vh - 48px); }
    .node circle {
      fill: #313244;
      stroke: #89b4fa;
      stroke-width: 2px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .node circle:hover { fill: #89b4fa; }
    .node circle.highlighted { fill: #a6e3a1; stroke: #a6e3a1; }
    .node text {
      font-size: 11px;
      fill: #cdd6f4;
      pointer-events: none;
      text-anchor: middle;
      dominant-baseline: central;
    }
    .link {
      stroke: #45475a;
      stroke-width: 1.5px;
      fill: none;
      marker-end: url(#arrow);
    }
    .link.highlighted { stroke: #a6e3a1; stroke-width: 2.5px; }
    #tooltip {
      position: fixed;
      background: #181825;
      border: 1px solid #313244;
      border-radius: 8px;
      padding: 10px 14px;
      font-size: 12px;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.15s;
      z-index: 10;
      max-width: 220px;
    }
    #tooltip .fn-name { font-weight: 700; color: #89b4fa; margin-bottom: 4px; }
    #tooltip .fn-lines { color: #6c7086; font-size: 11px; }
    #empty {
      display: flex;
      align-items: center;
      justify-content: center;
      height: calc(100vh - 48px);
      color: #6c7086;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div id="header">
    <h2>📁 ${fileName}</h2>
    <span id="stats-label"></span>
  </div>
  <div id="graph"></div>
  <div id="tooltip">
    <div class="fn-name" id="tt-name"></div>
    <div class="fn-lines" id="tt-lines"></div>
  </div>

  <!-- D3.js from CDN -->
  <script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js"></script>
  <script>
    const graphData = ${graphData};
    const { nodes, links } = graphData;

    // Show empty state if no functions found
    if (nodes.length === 0) {
      document.getElementById('graph').innerHTML =
        '<div id="empty">No functions detected in this file.</div>';
    } else {
      document.getElementById('stats-label').textContent =
        nodes.length + ' functions · ' + links.length + ' calls';

      const W = window.innerWidth;
      const H = window.innerHeight - 48;

      const svg = d3.select('#graph')
        .append('svg')
        .attr('width', W)
        .attr('height', H);

      // Arrow marker for directed edges
      svg.append('defs').append('marker')
        .attr('id', 'arrow')
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 22)
        .attr('refY', 0)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-5L10,0L0,5')
        .attr('fill', '#45475a');

      // Highlighted arrow marker
      svg.select('defs').append('marker')
        .attr('id', 'arrow-highlight')
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 22)
        .attr('refY', 0)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-5L10,0L0,5')
        .attr('fill', '#a6e3a1');

      // Container for zoom/pan
      const container = svg.append('g');

      // Zoom behaviour
      svg.call(d3.zoom().scaleExtent([0.2, 3]).on('zoom', e => {
        container.attr('transform', e.transform);
      }));

      // Force simulation — nodes repel each other, links pull connected nodes together
      const simulation = d3.forceSimulation(nodes)
  .force('link', d3.forceLink(links).id(d => d.id).distance(100))
  .force('charge', d3.forceManyBody().strength(-200))
  .force('center', d3.forceCenter(W / 2, H / 2))
  .force('collision', d3.forceCollide(50))
  .alphaDecay(0.04);  // slows down settling so nodes don't overshoot

      // Draw links (arrows)
      const link = container.append('g')
        .selectAll('path')
        .data(links)
        .join('path')
        .attr('class', 'link');

      // Draw nodes
      const node = container.append('g')
        .selectAll('g')
        .data(nodes)
        .join('g')
        .attr('class', 'node')
        .call(
          d3.drag()
            .on('start', (event, d) => {
              if (!event.active) simulation.alphaTarget(0.3).restart();
              d.fx = d.x; d.fy = d.y;
            })
            .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y; })
            .on('end', (event, d) => {
              if (!event.active) simulation.alphaTarget(0);
              d.fx = null; d.fy = null;
            })
        );

      node.append('circle').attr('r', 20);
      node.append('text').text(d => d.name.length > 10 ? d.name.slice(0, 9) + '…' : d.name);

      // Tooltip on hover
      const tooltip = document.getElementById('tooltip');
      node
        .on('mouseover', (event, d) => {
          document.getElementById('tt-name').textContent = d.name;
          document.getElementById('tt-lines').textContent =
            'Lines ' + d.startLine + ' – ' + d.endLine;
          tooltip.style.opacity = '1';

          // Highlight connected links
          link
            .classed('highlighted', l => l.source.id === d.id || l.target.id === d.id)
            .attr('marker-end', l =>
              (l.source.id === d.id || l.target.id === d.id)
                ? 'url(#arrow-highlight)'
                : 'url(#arrow)'
            );
          node.select('circle').classed('highlighted', n => n.id === d.id);
        })
        .on('mousemove', event => {
          tooltip.style.left = (event.clientX + 14) + 'px';
          tooltip.style.top  = (event.clientY - 10) + 'px';
        })
        .on('mouseout', () => {
          tooltip.style.opacity = '0';
          link.classed('highlighted', false).attr('marker-end', 'url(#arrow)');
          node.select('circle').classed('highlighted', false);
        });

      // Update positions every simulation tick
      simulation.on('tick', () => {
        link.attr('d', d => {
          const dx = d.target.x - d.source.x;
          const dy = d.target.y - d.source.y;
          const dr = Math.sqrt(dx * dx + dy * dy) * 1.5;
          return 'M' + d.source.x + ',' + d.source.y +
                 'A' + dr + ',' + dr + ' 0 0,1 ' +
                 d.target.x + ',' + d.target.y;
        });
        node.attr('transform', d => 'translate(' + d.x + ',' + d.y + ')');
      });
    }
  </script>
</body>
</html>`;
  }

  private _getErrorHtml(error: string): string {
    return `<html><body style="background:#1e1e2e;color:#f38ba8;padding:20px;font-family:monospace;">
      <h3>Parse Error</h3><pre>${error}</pre></body></html>`;
  }

  public dispose() {
    FileGraphPanel.currentPanel = undefined;
    this._panel.dispose();
    this._disposables.forEach(d => d.dispose());
  }
}
