// src/panels/ProjectGraphPanel.ts
import * as vscode from 'vscode';
import * as path from 'path';
import { generateOnboardingPath, scanProject } from '../parser/projectScanner';

export class ProjectGraphPanel {
  public static currentPanel: ProjectGraphPanel | undefined;

  private readonly _panel: vscode.WebviewPanel;
  private readonly _rootPath: string;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(extensionUri: vscode.Uri, rootPath: string) {
    const column = vscode.ViewColumn.One;

    if (ProjectGraphPanel.currentPanel) {
      ProjectGraphPanel.currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'codemapProjectGraph',
      'CodeMap: Project Overview',
      column,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
        retainContextWhenHidden: true,
      }
    );

    ProjectGraphPanel.currentPanel = new ProjectGraphPanel(panel, rootPath);
  }

  private constructor(panel: vscode.WebviewPanel, rootPath: string) {
    this._panel = panel;
    this._rootPath = rootPath;
    this._render();
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
  }

  private _render() {
    this._panel.webview.html = this._getLoadingHtml();

    setTimeout(() => {
      const result = scanProject(this._rootPath);
      const onboardingPath = generateOnboardingPath(result);

      const folderColors: Record<string, string> = {};
      const palette = [
        '#5e9bde', '#a78bfa', '#34d399', '#fb923c',
        '#f472b6', '#38bdf8', '#facc15', '#a3e635',
      ];
      let colorIdx = 0;

      const getColor = (folder: string) => {
        if (!folderColors[folder]) {
          folderColors[folder] = palette[colorIdx % palette.length];
          colorIdx++;
        }
        return folderColors[folder];
      };

      const nodes: Array<{
        id: string; label: string; type: 'file' | 'function';
        file?: string; group: string; color: string; fnCount?: number;
      }> = [];

      const links: Array<{ source: string; target: string; type: string }> = [];

      for (const file of result.files) {
        const relPath = path.relative(this._rootPath, file.filePath);
        const folder = path.dirname(relPath);
        const group = folder === '.' ? 'root' : folder;
        const color = getColor(group);

        nodes.push({
          id: file.filePath,
          label: file.fileName,
          type: 'file',
          group,
          color,
          fnCount: file.functions.length,
        });

        for (const fn of file.functions) {
          nodes.push({
            id: fn.id,
            label: fn.name,
            type: 'function',
            file: file.filePath,
            group,
            color,
          });
          links.push({ source: file.filePath, target: fn.id, type: 'contains' });
        }
      }

      for (const edge of result.callEdges) {
        links.push({ source: edge.from, target: edge.to, type: 'calls' });
      }

      const legend = Object.entries(folderColors).map(([folder, color]) => ({
        folder: folder === 'root' ? '/ (root)' : folder,
        color,
      }));

      this._panel.webview.html = this._getWebviewContent(
        result.stats,
        JSON.stringify({ nodes, links }),
        JSON.stringify(legend),
        JSON.stringify(onboardingPath)
      );
    }, 100);
  }

  private _getLoadingHtml(): string {
    return `<!DOCTYPE html><html><body style="background:#0f0f1a;color:#89b4fa;
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      height:100vh;font-family:'Segoe UI',sans-serif;gap:16px;">
      <div style="font-size:40px">⬡</div>
      <div style="font-size:16px;font-weight:600;">Scanning project...</div>
      <div style="font-size:12px;color:#45475a;">Building call graph</div>
    </body></html>`;
  }

  private _getWebviewContent(
    stats: { totalFiles: number; totalFunctions: number; totalCalls: number; parseErrors: number },
    graphDataJson: string,
    legendJson: string,
    onboardingJson: string 
  ): string {
    return /* html */`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #0f0f1a;
      color: #e2e8f0;
      font-family: 'Segoe UI', sans-serif;
      overflow: hidden;
      height: 100vh;
    }
    #header {
      position: fixed; top: 0; left: 0; right: 0; z-index: 100;
      height: 52px;
      background: rgba(15,15,26,0.92);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid rgba(255,255,255,0.06);
      display: flex; align-items: center;
      padding: 0 20px; gap: 16px;
    }
    .logo { font-size: 15px; font-weight: 700; color: #89b4fa; letter-spacing: -0.3px; margin-right: 8px; }
    .stat-pill {
      display: flex; align-items: center; gap: 6px;
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 20px; padding: 4px 12px;
      font-size: 12px; color: #94a3b8;
    }
    .stat-pill strong { color: #e2e8f0; font-weight: 600; }
    .stat-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
    #onboarding-btn {
      margin-left: auto;
      background: linear-gradient(135deg, rgba(167,139,250,0.15), rgba(94,155,222,0.15));
      border: 1px solid rgba(167,139,250,0.35);
      border-radius: 20px; padding: 5px 14px;
      color: #a78bfa; font-size: 12px; font-weight: 600;
      cursor: pointer; transition: all 0.2s; white-space: nowrap;
    }
    #onboarding-btn:hover { background: linear-gradient(135deg, rgba(167,139,250,0.3), rgba(94,155,222,0.3)); }
    #onboarding-btn.active { background: linear-gradient(135deg, rgba(167,139,250,0.4), rgba(94,155,222,0.4)); border-color: #a78bfa; }
    #search-wrap { position: fixed; top: 64px; left: 16px; z-index: 100; }
    #search {
      background: rgba(15,15,26,0.92);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 8px; padding: 7px 12px;
      color: #e2e8f0; font-size: 12px; width: 200px; outline: none;
    }
    #search:focus { border-color: #89b4fa; }
    #search::placeholder { color: #475569; }
    #controls {
      position: fixed; top: 64px; right: 16px; z-index: 100;
      display: flex; flex-direction: column; gap: 6px;
    }
    .ctrl-btn {
      width: 34px; height: 34px;
      background: rgba(15,15,26,0.92);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 8px; color: #94a3b8;
      font-size: 16px; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: all 0.15s;
    }
    .ctrl-btn:hover { background: rgba(137,180,250,0.15); color: #89b4fa; border-color: rgba(137,180,250,0.4); }
    #legend {
      position: fixed; bottom: 16px; left: 16px; z-index: 100;
      background: rgba(15,15,26,0.92);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 12px; padding: 12px 16px;
      max-width: 200px; max-height: 280px; overflow-y: auto;
    }
    #legend h4 { font-size: 10px; font-weight: 600; color: #475569; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 8px; }
    .legend-row { display: flex; align-items: center; gap: 8px; margin: 5px 0; font-size: 11px; color: #94a3b8; }
    .legend-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .legend-sep { height: 1px; background: rgba(255,255,255,0.06); margin: 8px 0; }
    #onboarding-panel {
      position: fixed; right: 0; top: 52px; bottom: 0;
      width: 300px; z-index: 150;
      background: rgba(10,10,20,0.97);
      border-left: 1px solid rgba(255,255,255,0.07);
      transform: translateX(100%);
      transition: transform 0.3s cubic-bezier(0.4,0,0.2,1);
      display: flex; flex-direction: column;
    }
    #onboarding-panel.open { transform: translateX(0); }
    #onboarding-header {
      padding: 16px 20px;
      border-bottom: 1px solid rgba(255,255,255,0.06);
      display: flex; flex-direction: column; gap: 4px;
    }
    #onboarding-header-row { display: flex; align-items: center; justify-content: space-between; }
    #onboarding-title { font-size: 14px; font-weight: 700; color: #a78bfa; }
    #onboarding-subtitle { font-size: 11px; color: #475569; }
    #close-onboarding { background: none; border: none; color: #475569; font-size: 20px; cursor: pointer; padding: 0; line-height: 1; }
    #close-onboarding:hover { color: #94a3b8; }
    #onboarding-steps { overflow-y: auto; flex: 1; padding: 8px 0; }
    .step-item {
      padding: 10px 20px; cursor: pointer;
      transition: background 0.15s;
      border-left: 3px solid transparent;
    }
    .step-item:hover { background: rgba(167,139,250,0.07); }
    .step-item.active { border-left-color: #a78bfa; background: rgba(167,139,250,0.08); }
    .step-row { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
    .step-badge {
      width: 22px; height: 22px; border-radius: 50%;
      background: rgba(167,139,250,0.15);
      border: 1.5px solid #a78bfa;
      display: flex; align-items: center; justify-content: center;
      font-size: 10px; font-weight: 700; color: #a78bfa; flex-shrink: 0;
    }
    .step-filename { font-size: 12px; font-weight: 600; color: #e2e8f0; }
    .step-reason { font-size: 11px; color: #64748b; line-height: 1.5; padding-left: 32px; }
    .step-tags { display: flex; gap: 6px; margin-top: 5px; padding-left: 32px; }
    .step-tag { font-size: 10px; border-radius: 4px; padding: 2px 7px; }
    #tooltip {
      position: fixed; z-index: 200;
      background: rgba(15,15,26,0.97);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 10px; padding: 10px 14px;
      pointer-events: none; opacity: 0;
      transition: opacity 0.12s;
      min-width: 160px; max-width: 240px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    }
    .tt-type { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 4px; }
    .tt-name { font-size: 13px; font-weight: 600; color: #e2e8f0; margin-bottom: 4px; word-break: break-all; }
    .tt-meta { font-size: 11px; color: #64748b; }
    .tt-badge { display: inline-block; margin-top: 6px; border-radius: 4px; padding: 2px 7px; font-size: 10px; font-weight: 600; }
    #graph { width: 100vw; height: 100vh; }
    svg { width: 100%; height: 100%; }
  </style>
</head>
<body>

<div id="header">
  <div class="logo">⬡ CodeMap</div>
  <div class="stat-pill"><div class="stat-dot" style="background:#5e9bde"></div><strong>${stats.totalFiles}</strong>&nbsp;files</div>
  <div class="stat-pill"><div class="stat-dot" style="background:#a78bfa"></div><strong>${stats.totalFunctions}</strong>&nbsp;functions</div>
  <div class="stat-pill"><div class="stat-dot" style="background:#fb923c"></div><strong>${stats.totalCalls}</strong>&nbsp;cross-file calls</div>
  ${stats.parseErrors > 0 ? `<div class="stat-pill"><div class="stat-dot" style="background:#f87171"></div><strong>${stats.parseErrors}</strong>&nbsp;errors</div>` : ''}
  <button id="onboarding-btn">🎯 Onboarding Path</button>
</div>

<div id="search-wrap">
  <input id="search" type="text" placeholder="🔍  Search file or function…" />
</div>

<div id="controls">
  <button class="ctrl-btn" id="zoom-in">+</button>
  <button class="ctrl-btn" id="zoom-out">−</button>
  <button class="ctrl-btn" id="zoom-fit">⊡</button>
</div>

<div id="legend">
  <h4>Folders</h4>
  <div id="legend-items"></div>
  <div class="legend-sep"></div>
  <div class="legend-row">
    <svg width="14" height="14" style="flex-shrink:0"><circle cx="7" cy="7" r="6" fill="#1a1a2e" stroke="#89b4fa" stroke-width="2"/><circle cx="7" cy="7" r="2" fill="#89b4fa"/></svg>
    File
  </div>
  <div class="legend-row">
    <svg width="14" height="14" style="flex-shrink:0"><circle cx="7" cy="7" r="5" fill="rgba(167,139,250,0.2)" stroke="#a78bfa" stroke-width="1.5"/></svg>
    Function
  </div>
  <div class="legend-row">
    <svg width="22" height="10" style="flex-shrink:0"><line x1="0" y1="5" x2="22" y2="5" stroke="#fb923c" stroke-width="1.5" stroke-dasharray="4,3"/></svg>
    Cross-file call
  </div>
</div>

<div id="onboarding-panel">
  <div id="onboarding-header">
    <div id="onboarding-header-row">
      <div id="onboarding-title">🎯 Onboarding Path</div>
      <button id="close-onboarding">×</button>
    </div>
    <div id="onboarding-subtitle">Suggested reading order for new developers</div>
  </div>
  <div id="onboarding-steps"></div>
</div>

<div id="tooltip">
  <div class="tt-type" id="tt-type"></div>
  <div class="tt-name" id="tt-name"></div>
  <div class="tt-meta" id="tt-meta"></div>
  <div id="tt-badge"></div>
</div>

<div id="graph"></div>

<script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js"></script>
<script>
// ── Data injected from extension ──────────────────────────
const RAW          = ${graphDataJson};
const legendData   = ${legendJson};
const onboardingPath = ${onboardingJson};

// ── Legend ────────────────────────────────────────────────
const legendEl = document.getElementById('legend-items');
legendData.forEach(function(item) {
  const row = document.createElement('div');
  row.className = 'legend-row';
  row.innerHTML = '<div class="legend-dot" style="background:' + item.color + '"></div>'
    + '<span title="' + item.folder + '">' + (item.folder.length > 18 ? item.folder.slice(0,17)+'…' : item.folder) + '</span>';
  legendEl.appendChild(row);
});

// ── Onboarding step list ──────────────────────────────────
const stepsEl = document.getElementById('onboarding-steps');
onboardingPath.forEach(function(step) {
  const el = document.createElement('div');
  el.className = 'step-item';
  el.id = 'step-' + step.order;
  el.innerHTML =
    '<div class="step-row">'
      + '<div class="step-badge">' + step.order + '</div>'
      + '<div class="step-filename">' + step.fileName + '</div>'
    + '</div>'
    + '<div class="step-reason">' + step.reason + '</div>'
    + '<div class="step-tags">'
      + '<span class="step-tag" style="background:rgba(94,155,222,0.12);color:#5e9bde;">↙ ' + step.fanIn + ' callers</span>'
      + '<span class="step-tag" style="background:rgba(251,146,60,0.12);color:#fb923c;">↗ ' + step.fanOut + ' calls</span>'
    + '</div>';
  stepsEl.appendChild(el);
});

// ── SVG setup ─────────────────────────────────────────────
const W = window.innerWidth;
const H = window.innerHeight - 52;
const svg = d3.select('#graph').append('svg');
const defs = svg.append('defs');

const glow = defs.append('filter').attr('id', 'glow')
  .attr('x', '-60%').attr('y', '-60%').attr('width', '220%').attr('height', '220%');
glow.append('feGaussianBlur').attr('in', 'SourceGraphic').attr('stdDeviation', '5').attr('result', 'blur');
const gm = glow.append('feMerge');
gm.append('feMergeNode').attr('in', 'blur');
gm.append('feMergeNode').attr('in', 'SourceGraphic');

defs.append('marker').attr('id', 'arrow-call')
  .attr('viewBox', '0 -5 10 10').attr('refX', 18).attr('refY', 0)
  .attr('markerWidth', 5).attr('markerHeight', 5).attr('orient', 'auto')
  .append('path').attr('d', 'M0,-5L10,0L0,5').attr('fill', '#fb923c').attr('opacity', '0.7');

const zoomBehavior = d3.zoom().scaleExtent([0.04, 5]).on('zoom', function(e) {
  container.attr('transform', e.transform);
});
svg.call(zoomBehavior);

const container = svg.append('g');

const nodes = RAW.nodes.map(function(d) { return Object.assign({}, d); });
const links = RAW.links.map(function(d) { return Object.assign({}, d); });

// ── Simulation ────────────────────────────────────────────
const simulation = d3.forceSimulation(nodes)
  .force('link', d3.forceLink(links).id(function(d) { return d.id; })
    .distance(function(l) { return l.type === 'contains' ? 65 : 220; })
    .strength(function(l) { return l.type === 'contains' ? 0.85 : 0.12; }))
  .force('charge', d3.forceManyBody()
    .strength(function(d) { return d.type === 'file' ? -900 : -130; }))
  .force('center', d3.forceCenter(W / 2, H / 2))
  .force('collision', d3.forceCollide(function(d) { return d.type === 'file' ? 52 : 20; }))
  .alphaDecay(0.022);

// ── Links ─────────────────────────────────────────────────
const linkSel = container.append('g')
  .selectAll('path').data(links).join('path')
  .attr('fill', 'none')
  .attr('stroke', function(d) { return d.type === 'contains' ? 'rgba(255,255,255,0.05)' : '#fb923c'; })
  .attr('stroke-width', function(d) { return d.type === 'contains' ? 1 : 1.6; })
  .attr('stroke-dasharray', function(d) { return d.type === 'calls' ? '5,4' : null; })
  .attr('opacity', function(d) { return d.type === 'contains' ? 0.4 : 0.4; })
  .attr('marker-end', function(d) { return d.type === 'calls' ? 'url(#arrow-call)' : null; });

// ── Nodes ─────────────────────────────────────────────────
const nodeSel = container.append('g')
  .selectAll('g').data(nodes).join('g')
  .style('cursor', 'pointer')
  .call(d3.drag()
    .on('start', function(e, d) { if (!e.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
    .on('drag',  function(e, d) { d.fx = e.x; d.fy = e.y; })
    .on('end',   function(e, d) { if (!e.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; })
  );

// File nodes
nodeSel.filter(function(d) { return d.type === 'file'; }).each(function(d) {
  const g = d3.select(this);
  g.append('circle').attr('r', 30).attr('fill', d.color).attr('opacity', 0.10).attr('filter', 'url(#glow)');
  g.append('circle').attr('r', 22).attr('fill', '#151524').attr('stroke', d.color).attr('stroke-width', 2.5).attr('class', 'main-ring');
  g.append('circle').attr('r', 5).attr('fill', d.color).attr('opacity', 0.9);
  g.append('text').attr('dy', 36).attr('text-anchor', 'middle')
    .attr('font-size', '10.5px').attr('font-weight', '600').attr('fill', '#e2e8f0').attr('pointer-events', 'none')
    .text(d.label.length > 16 ? d.label.slice(0,15)+'…' : d.label);
  if (d.fnCount > 0) {
    g.append('text').attr('dy', 48).attr('text-anchor', 'middle')
      .attr('font-size', '9px').attr('fill', d.color).attr('opacity', 0.65).attr('pointer-events', 'none')
      .text(d.fnCount + ' fn' + (d.fnCount !== 1 ? 's' : ''));
  }
});

// Function nodes
nodeSel.filter(function(d) { return d.type === 'function'; }).each(function(d) {
  const g = d3.select(this);
  g.append('circle').attr('r', 10)
    .attr('fill', d.color).attr('fill-opacity', 0.20)
    .attr('stroke', d.color).attr('stroke-width', 1.5).attr('stroke-opacity', 0.75);
  g.append('text').attr('dy', 21).attr('text-anchor', 'middle')
    .attr('font-size', '9px').attr('font-weight', '500').attr('fill', '#94a3b8').attr('pointer-events', 'none')
    .text(d.label.length > 13 ? d.label.slice(0,12)+'…' : d.label);
});

// ── Tooltip ───────────────────────────────────────────────
const tooltip = document.getElementById('tooltip');
const ttType  = document.getElementById('tt-type');
const ttName  = document.getElementById('tt-name');
const ttMeta  = document.getElementById('tt-meta');
const ttBadge = document.getElementById('tt-badge');

nodeSel
  .on('mouseover', function(event, d) {
    ttType.textContent = d.type === 'file' ? '📄 File' : '⚡ Function';
    ttType.style.color = d.color;
    ttName.textContent = d.label;
    if (d.type === 'file') {
      ttMeta.textContent = 'Folder: ' + (d.group === 'root' ? '/' : d.group);
      ttBadge.innerHTML = '<span class="tt-badge" style="background:' + d.color + '22;color:' + d.color + '">' + d.fnCount + ' functions</span>';
    } else {
      ttMeta.textContent = 'In: ' + (d.file ? d.file.split('/').pop() : '');
      ttBadge.innerHTML = '';
    }
    tooltip.style.opacity = '1';
    const connected = new Set([d.id]);
    links.forEach(function(l) {
      const s = l.source.id || l.source;
      const t = l.target.id || l.target;
      if (s === d.id || t === d.id) { connected.add(s); connected.add(t); }
    });
    nodeSel.style('opacity', function(n) { return connected.has(n.id) ? 1 : 0.15; });
    linkSel.style('opacity', function(l) {
      const s = l.source.id || l.source;
      const t = l.target.id || l.target;
      return (s === d.id || t === d.id) ? 0.9 : 0.04;
    });
  })
  .on('mousemove', function(e) {
    tooltip.style.left = (e.clientX + 14) + 'px';
    tooltip.style.top  = (e.clientY - 10) + 'px';
  })
  .on('mouseout', function() {
    tooltip.style.opacity = '0';
    nodeSel.style('opacity', 1);
    linkSel.style('opacity', function(l) { return l.type === 'contains' ? 0.4 : 0.4; });
  });

// ── Tick ──────────────────────────────────────────────────
simulation.on('tick', function() {
  linkSel.attr('d', function(d) {
    const sx = d.source.x, sy = d.source.y, tx = d.target.x, ty = d.target.y;
    if (d.type === 'contains') return 'M' + sx + ',' + sy + 'L' + tx + ',' + ty;
    const dx = tx - sx, dy = ty - sy;
    const dr = Math.sqrt(dx*dx + dy*dy) * 1.4;
    return 'M' + sx + ',' + sy + 'A' + dr + ',' + dr + ' 0 0,1 ' + tx + ',' + ty;
  });
  nodeSel.attr('transform', function(d) { return 'translate(' + d.x + ',' + d.y + ')'; });
});

// ── Zoom controls ─────────────────────────────────────────
document.getElementById('zoom-in').onclick  = function() { svg.transition().duration(300).call(zoomBehavior.scaleBy, 1.4); };
document.getElementById('zoom-out').onclick = function() { svg.transition().duration(300).call(zoomBehavior.scaleBy, 0.7); };
document.getElementById('zoom-fit').onclick = function() {
  svg.transition().duration(400).call(zoomBehavior.transform, d3.zoomIdentity.translate(W/2, H/2).scale(0.7));
};

// ── Search ────────────────────────────────────────────────
document.getElementById('search').addEventListener('input', function() {
  const q = this.value.toLowerCase().trim();
  if (!q) {
    nodeSel.style('opacity', 1);
    linkSel.style('opacity', function(l) { return l.type === 'contains' ? 0.4 : 0.4; });
    return;
  }
  const matched = new Set(nodes.filter(function(n) { return n.label.toLowerCase().includes(q); }).map(function(n) { return n.id; }));
  nodeSel.style('opacity', function(n) { return matched.has(n.id) ? 1 : 0.08; });
  linkSel.style('opacity', 0.04);
});

// ── Onboarding Path ───────────────────────────────────────
let onboardingActive = false;
const onboardingPanel = document.getElementById('onboarding-panel');
const onboardingBtn   = document.getElementById('onboarding-btn');

// Click step row → pan graph to that file node
document.querySelectorAll('.step-item').forEach(function(el) {
  el.addEventListener('click', function() {
    const fileName = el.querySelector('.step-filename').textContent;
    const target = nodes.find(function(n) { return n.type === 'file' && n.label === fileName; });
    if (!target || target.x === undefined) return;
    svg.transition().duration(600).call(
      zoomBehavior.transform,
      d3.zoomIdentity.translate(W/2 - target.x * 1.3, H/2 - target.y * 1.3).scale(1.3)
    );
    // Flash the node ring
    nodeSel.filter(function(n) { return n.id === target.id; })
      .select('.main-ring')
      .transition().duration(150).attr('r', 30).attr('stroke-width', 4)
      .transition().duration(150).attr('r', 22).attr('stroke-width', 2.5);
    // Highlight active step
    document.querySelectorAll('.step-item').forEach(function(s) { s.classList.remove('active'); });
    el.classList.add('active');
  });
});

function animateTrail(show) {
  // Clear all badges and highlights first
  nodeSel.selectAll('.order-badge').remove();
  nodeSel.select('.main-ring')
    .attr('stroke', function(d) { return d.color; })
    .attr('stroke-width', 2.5);
  document.querySelectorAll('.step-item').forEach(function(el) {
    el.classList.remove('active');
  });

  if (!show) return;

  onboardingPath.forEach(function(step, i) {
    setTimeout(function() {
      const target = nodes.find(function(n) { return n.type === 'file' && n.label === step.fileName; });
      if (!target) return;

      // Highlight the ring purple
      nodeSel.filter(function(n) { return n.id === target.id; })
        .select('.main-ring')
        .attr('stroke', '#a78bfa')
        .attr('stroke-width', 3.5);

      // Add numbered badge
      nodeSel.filter(function(n) { return n.id === target.id; }).each(function() {
        const g = d3.select(this);
        g.selectAll('.order-badge').remove();
        const badge = g.append('g').attr('class', 'order-badge');
        badge.append('circle').attr('cx', 18).attr('cy', -18).attr('r', 11).attr('fill', '#a78bfa');
        badge.append('text')
          .attr('x', 18).attr('y', -13)
          .attr('text-anchor', 'middle')
          .attr('font-size', '10px').attr('font-weight', '800')
          .attr('fill', '#0f0f1a').attr('pointer-events', 'none')
          .text(step.order);
      });

      // Highlight step row in panel
      const stepEl = document.getElementById('step-' + step.order);
      if (stepEl) { stepEl.classList.add('active'); }

    }, i * 250);
  });
}

onboardingBtn.addEventListener('click', function() {
  onboardingActive = !onboardingActive;
  onboardingPanel.classList.toggle('open', onboardingActive);
  onboardingBtn.classList.toggle('active', onboardingActive);
  animateTrail(onboardingActive);
});

document.getElementById('close-onboarding').addEventListener('click', function() {
  onboardingActive = false;
  onboardingPanel.classList.remove('open');
  onboardingBtn.classList.remove('active');
  animateTrail(false);
});
</script>
</body>
</html>`;
  }

  public dispose() {
    ProjectGraphPanel.currentPanel = undefined;
    this._panel.dispose();
    this._disposables.forEach(d => d.dispose());
  }
}