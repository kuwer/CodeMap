// src/extension.ts
// ─────────────────────────────────────────────────────────────
// This is the ENTRY POINT of the VS Code extension.
// VS Code calls `activate()` when the extension loads, and
// `deactivate()` when it unloads.
// ─────────────────────────────────────────────────────────────

import * as vscode from 'vscode';
import { ProjectGraphPanel } from './panels/ProjectGraphPanel';
import { FileGraphPanel } from './panels/FileGraphPanel';

// `activate` is called once when the extension first activates.
// We register our two commands here.
export function activate(context: vscode.ExtensionContext) {
  console.log('CodeMap extension is now active!');

  // ── Command 1: Show full project graph ──────────────────────
  // Triggered via Command Palette → "CodeMap: Show Project Graph"
  const showProjectGraph = vscode.commands.registerCommand(
    'codemap.showGraph',
    () => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspaceRoot) {
        vscode.window.showErrorMessage('CodeMap: Please open a project folder first.');
        return;
      }
      // Opens the WebView panel showing the full project structure
      ProjectGraphPanel.createOrShow(context.extensionUri, workspaceRoot);
    }
  );

  // ── Command 2: Show call graph for the current/right-clicked file ──
  // Triggered via right-click menu on any .js or .ts file
  const showFileGraph = vscode.commands.registerCommand(
    'codemap.showFileGraph',
    (uri?: vscode.Uri) => {
      // `uri` is provided when triggered from explorer right-click.
      // If triggered from command palette, fall back to the active editor.
      const filePath = uri?.fsPath ?? vscode.window.activeTextEditor?.document.uri.fsPath;

      if (!filePath) {
        vscode.window.showErrorMessage('CodeMap: No file selected.');
        return;
      }
      if (!filePath.endsWith('.js') && !filePath.endsWith('.ts') && 
    !filePath.endsWith('.tsx') && !filePath.endsWith('.jsx')) {
        vscode.window.showErrorMessage('CodeMap: Only .js, .ts, .tsx, and .jsx files are supported.');
        return;
      }

      // Opens the WebView panel showing functions and calls for this file
      FileGraphPanel.createOrShow(context.extensionUri, filePath);
    }
  );

  // Register both commands so VS Code knows about them
  context.subscriptions.push(showProjectGraph, showFileGraph);
}

// Called when the extension is deactivated (VS Code closes, etc.)
export function deactivate() {}
