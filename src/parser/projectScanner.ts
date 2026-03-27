// src/parser/projectScanner.ts
// ─────────────────────────────────────────────────────────────
// Walks a project directory, finds all JS/TS files, and runs
// the AST parser on each one. Returns a full picture of the
// project: all files, all functions, all call relationships.
// ─────────────────────────────────────────────────────────────

import * as fs from 'fs';
import * as path from 'path';
import { parseFile, ParseResult, FunctionNode } from './astParser';

// Directories we always skip — no useful code here
const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'out', 'build',
  '.next', '.nuxt', 'coverage', '.vscode', '__pycache__',
]);

// File extensions we parse
const SUPPORTED_EXTENSIONS = ['.js', '.ts', '.jsx', '.tsx'];

// ── Types ─────────────────────────────────────────────────────

export interface ProjectScanResult {
  rootPath: string;
  files: ParseResult[];           // One ParseResult per file
  allFunctions: FunctionNode[];   // Flat list of every function found
  // Cross-file call edges: { from: "fileA::foo", to: "fileB::bar" }
  callEdges: Array<{ from: string; to: string }>;
  stats: {
    totalFiles: number;
    totalFunctions: number;
    totalCalls: number;
    parseErrors: number;
  };
}

// ── Scanner ───────────────────────────────────────────────────

export function scanProject(rootPath: string): ProjectScanResult {
  // Step 1: Collect all supported files recursively
  const filePaths = collectFiles(rootPath);

  // Step 2: Parse every file
  const files: ParseResult[] = filePaths.map(fp => parseFile(fp));

  // Step 3: Build a flat index of all functions across all files
  // Key: function name (e.g. "getUserById")
  // Value: array of FunctionNodes with that name (could be in multiple files)
  const allFunctions: FunctionNode[] = files.flatMap(f => f.functions);
  const functionIndex = new Map<string, FunctionNode[]>();

  for (const fn of allFunctions) {
    const existing = functionIndex.get(fn.name) ?? [];
    existing.push(fn);
    functionIndex.set(fn.name, existing);
  }

  // Step 4: Build call edges
  // For each function, check which of its `calls` match a known function.
  // This lets us draw arrows between functions across files.
  const callEdges: Array<{ from: string; to: string }> = [];

  for (const fn of allFunctions) {
    for (const calledName of fn.calls) {
      const targets = functionIndex.get(calledName);
      if (targets) {
        for (const target of targets) {
          // Avoid self-loops
          if (target.id !== fn.id) {
            callEdges.push({ from: fn.id, to: target.id });
          }
        }
      }
    }
  }

  const parseErrors = files.filter(f => f.error).length;

  return {
    rootPath,
    files,
    allFunctions,
    callEdges,
    stats: {
      totalFiles: files.length,
      totalFunctions: allFunctions.length,
      totalCalls: callEdges.length,
      parseErrors,
    },
  };
}

// ── Helper: recursively collect file paths ────────────────────

function collectFiles(dir: string): string[] {
  const results: string[] = [];

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results; // Skip directories we can't read
  }

  for (const entry of entries) {
    // Skip ignored directories
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) {
        results.push(...collectFiles(path.join(dir, entry.name)));
      }
      continue;
    }

    // Only include supported file types
    if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (SUPPORTED_EXTENSIONS.includes(ext)) {
        results.push(path.join(dir, entry.name));
      }
    }
  }

  return results;
}

// ── Onboarding Path Generator ─────────────────────────────────
// Uses topological sort on the file-level call graph to determine
// the best reading order for a new developer.
//
// Logic:
//   - fan-in  = how many OTHER files call functions in this file
//   - fan-out = how many OTHER files this file calls into
//   - Foundation files (high fan-in, low fan-out) → read FIRST
//   - Entry point files (high fan-out, low fan-in) → read LAST
//   - Score = fan-in - fan-out (higher = read earlier)

export interface OnboardingStep {
  filePath: string;
  fileName: string;
  order: number;
  reason: string;
  fanIn: number;
  fanOut: number;
  score: number;
}

export function generateOnboardingPath(result: ProjectScanResult): OnboardingStep[] {
  // Build file-level call graph
  // For each cross-file call edge, map source file → target file
  const fileCallMap = new Map<string, Set<string>>(); // file → files it calls
  const fileCalledBy = new Map<string, Set<string>>(); // file → files that call it

  // Initialize maps for all files
  for (const file of result.files) {
    if (!fileCallMap.has(file.filePath))   fileCallMap.set(file.filePath, new Set());
    if (!fileCalledBy.has(file.filePath))  fileCalledBy.set(file.filePath, new Set());
  }

  // Build a lookup: functionId → filePath
  const fnToFile = new Map<string, string>();
  for (const file of result.files) {
    for (const fn of file.functions) {
      fnToFile.set(fn.id, file.filePath);
    }
  }

  // Walk call edges and build file-level relationships
  for (const edge of result.callEdges) {
    const fromFile = fnToFile.get(edge.from);
    const toFile   = fnToFile.get(edge.to);
    if (fromFile && toFile && fromFile !== toFile) {
      fileCallMap.get(fromFile)?.add(toFile);
      fileCalledBy.get(toFile)?.add(fromFile);
    }
  }

  // Score every file
  const steps: OnboardingStep[] = [];

  for (const file of result.files) {
    // Skip files with no functions — not interesting for onboarding
    if (file.functions.length === 0) continue;

    const fanIn  = fileCalledBy.get(file.filePath)?.size ?? 0;
    const fanOut = fileCallMap.get(file.filePath)?.size  ?? 0;
    const score  = (fanIn * 2) - fanOut + file.functions.length * 0.1;

    const reason = buildReason(file.fileName, fanIn, fanOut, file.functions.length);

    steps.push({
      filePath: file.filePath,
      fileName: file.fileName,
      order: 0, // assigned below
      reason,
      fanIn,
      fanOut,
      score,
    });
  }

  // Sort: highest score first (foundations before entry points)
  steps.sort((a, b) => b.score - a.score);

  // Assign order numbers, cap at top 10 for readability
  const topSteps = steps.slice(0, 10);
  topSteps.forEach((s, i) => { s.order = i + 1; });

  return topSteps;
}

function buildReason(fileName: string, fanIn: number, fanOut: number, fnCount: number): string {
  if (fanIn === 0 && fanOut === 0) {
    return 'Standalone module — good starting point to understand isolated logic.';
  }
  if (fanIn >= 4) {
    return fanOut === 0
      ? 'Core foundation — ' + fanIn + ' files depend on this. Understand it first.'
      : 'Central hub — used by ' + fanIn + ' files, calls into ' + fanOut + ' others.';
  }
  if (fanIn >= 2) {
    return 'Shared utility — called by ' + fanIn + ' files. Read before its dependents.';
  }
  if (fanOut >= 4) {
    return 'Orchestrator — coordinates ' + fanOut + ' other modules. Read last.';
  }
  if (fnCount >= 8) {
    return 'Feature-rich file with ' + fnCount + ' functions — core domain logic.';
  }
  return 'Used by ' + fanIn + ' file' + (fanIn !== 1 ? 's' : '') + ', calls ' + fanOut + ' other' + (fanOut !== 1 ? 's' : '') + '.';
}

