// src/parser/astParser.ts
// ─────────────────────────────────────────────────────────────
// This is the BRAIN of CodeMap.
//
// It reads a JavaScript or TypeScript file and uses Babel's
// parser to build an AST (Abstract Syntax Tree) — a structured
// representation of the code.
//
// From the AST we extract:
//   - Every function defined in the file (FunctionNode)
//   - Every call made inside each function (who calls whom)
//
// WHY AST instead of regex?
//   Regex breaks on nested functions, arrow functions, etc.
//   AST parsing understands the actual structure of the code.
// ─────────────────────────────────────────────────────────────

import * as fs from 'fs';
import * as path from 'path';
import { parse, ParserPlugin } from '@babel/parser';
import traverse from '@babel/traverse';
import { Node } from '@babel/types';

// ── Types ─────────────────────────────────────────────────────

export interface FunctionNode {
  id: string;          // Unique ID: "filename::functionName"
  name: string;        // Human-readable function name
  filePath: string;    // Absolute path to the file
  fileName: string;    // Just the filename (e.g. "auth.ts")
  startLine: number;   // Line where the function starts
  endLine: number;     // Line where the function ends
  calls: string[];     // Names of functions this function calls
}

export interface ParseResult {
  filePath: string;
  fileName: string;
  functions: FunctionNode[];
  error?: string;      // Set if parsing failed
}

// ── Main parse function ───────────────────────────────────────

export function parseFile(filePath: string): ParseResult {
  const fileName = path.basename(filePath);
  const baseResult = { filePath, fileName, functions: [] };

  // Step 1: Read the file
  let code: string;
  try {
    code = fs.readFileSync(filePath, 'utf-8');
  } catch (e) {
    return { ...baseResult, error: `Cannot read file: ${e}` };
  }

  // Step 2: Parse into AST
  // We enable many plugins so both JS and TS are handled
  let ast: ReturnType<typeof parse>;
  try {
    const plugins: ParserPlugin[] = [
      'jsx',
      'decorators-legacy',
      'classProperties',
      'optionalChaining',
      'nullishCoalescingOperator',
    ];

    // Add TypeScript plugin for .ts / .tsx files
    if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
      plugins.push('typescript');
    }

    ast = parse(code, {
      sourceType: 'module',   // treat as ES module (import/export)
      errorRecovery: true,    // don't crash on minor syntax errors
      plugins,
    });
  } catch (e) {
    return { ...baseResult, error: `Parse error: ${e}` };
  }

  // Step 3: Walk the AST and collect functions
  const functions: FunctionNode[] = [];

  // Helper: create a unique ID for a function
  const makeId = (name: string) => `${fileName}::${name}`;

  // Helper: get line numbers safely
  const getLines = (node: Node) => ({
    startLine: node.loc?.start.line ?? 0,
    endLine: node.loc?.end.line ?? 0,
  });

  // We track the "current function" as we walk nested scopes
  const functionStack: FunctionNode[] = [];

  traverse(ast, {
    // ── Detect function declarations: function foo() {} ──────
    FunctionDeclaration: {
      enter(nodePath) {
        const name = nodePath.node.id?.name ?? '(anonymous)';
        const fn: FunctionNode = {
          id: makeId(name),
          name,
          filePath,
          fileName,
          calls: [],
          ...getLines(nodePath.node),
        };
        functions.push(fn);
        functionStack.push(fn);
      },
      exit() { functionStack.pop(); }
    },

    // ── Detect arrow functions & function expressions ─────────
    // e.g. const foo = () => {} or const foo = function() {}
    VariableDeclarator: {
      enter(nodePath) {
        const init = nodePath.node.init;
        if (
          init &&
          (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression')
        ) {
          const nameNode = nodePath.node.id;
          const name = nameNode && nameNode.type === 'Identifier'
            ? nameNode.name
            : '(anonymous)';

          const fn: FunctionNode = {
            id: makeId(name),
            name,
            filePath,
            fileName,
            calls: [],
            ...getLines(init),
          };
          functions.push(fn);
          functionStack.push(fn);
        }
      },
      exit(nodePath) {
        const init = nodePath.node.init;
        if (
          init &&
          (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression')
        ) {
          functionStack.pop();
        }
      }
    },

    // ── Detect class methods ──────────────────────────────────
    // e.g. class Foo { bar() {} }
    ClassMethod: {
      enter(nodePath) {
        const keyNode = nodePath.node.key;
        const name = keyNode.type === 'Identifier' ? keyNode.name : '(method)';
        const fn: FunctionNode = {
          id: makeId(name),
          name,
          filePath,
          fileName,
          calls: [],
          ...getLines(nodePath.node),
        };
        functions.push(fn);
        functionStack.push(fn);
      },
      exit() { functionStack.pop(); }
    },

    // ── Detect function calls inside functions ────────────────
    // Whenever we see foo() or this.foo() or obj.method(),
    // we record it as a call from the current function.
    CallExpression(nodePath) {
      const currentFn = functionStack[functionStack.length - 1];
      if (!currentFn) return; // call is at module level, not inside a function

      const callee = nodePath.node.callee;
      let calledName: string | null = null;

      if (callee.type === 'Identifier') {
        // Simple call: foo()
        calledName = callee.name;
      } else if (callee.type === 'MemberExpression') {
        // Method call: obj.foo() or this.foo()
        const prop = callee.property;
        calledName = prop.type === 'Identifier' ? prop.name : null;
      }

      if (calledName && !currentFn.calls.includes(calledName)) {
        currentFn.calls.push(calledName);
      }
    },
  });

  return { filePath, fileName, functions };
}
