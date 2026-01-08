/**
 * @fileoverview Intelligent code chunker for Memory Bank
 * Fragments code intelligently using AST parsing when possible
 */

import * as fs from "fs";
import { parse } from "@babel/parser";
import traverseModule from "@babel/traverse";
import * as crypto from "crypto";

// Fix for @babel/traverse default export
const traverse = traverseModule.default || traverseModule;

export interface CodeChunk {
  id: string;              // Unique hash ID
  filePath: string;        // Relative path of the file
  content: string;         // Content of the chunk
  startLine: number;       // Starting line number
  endLine: number;         // Ending line number
  chunkType: "function" | "class" | "method" | "block" | "file";
  name?: string;           // Name of function/class if applicable
  language: string;        // Programming language
  context?: string;        // Additional context (imports, etc.)
}

export interface ChunkOptions {
  filePath: string;
  content: string;
  language: string;
  maxChunkSize?: number;    // Default: 1000 characters
  chunkOverlap?: number;    // Default: 200 characters
}

/**
 * Generates unique ID for a chunk based on content and metadata
 */
function generateChunkId(filePath: string, content: string, startLine: number): string {
  const data = `${filePath}:${startLine}:${content}`;
  return crypto.createHash("sha256").update(data).digest("hex").substring(0, 16);
}

/**
 * Extracts import statements and other context from code
 */
function extractContext(content: string, language: string): string {
  const lines = content.split("\n");
  const contextLines: string[] = [];
  
  if (language === "typescript" || language === "javascript") {
    // Extract imports and top-level comments
    for (const line of lines) {
      const trimmed = line.trim();
      if (
        trimmed.startsWith("import ") ||
        trimmed.startsWith("export ") ||
        trimmed.startsWith("//") ||
        trimmed.startsWith("/*") ||
        trimmed.startsWith("*")
      ) {
        contextLines.push(line);
        if (contextLines.length >= 10) break; // Limit context
      } else if (trimmed && !trimmed.startsWith("import")) {
        break; // Stop at first non-import/comment
      }
    }
  } else if (language === "python") {
    // Extract imports and docstrings
    for (const line of lines) {
      const trimmed = line.trim();
      if (
        trimmed.startsWith("import ") ||
        trimmed.startsWith("from ") ||
        trimmed.startsWith("#") ||
        trimmed.startsWith('"""') ||
        trimmed.startsWith("'''")
      ) {
        contextLines.push(line);
        if (contextLines.length >= 10) break;
      } else if (trimmed && !trimmed.startsWith("import") && !trimmed.startsWith("from")) {
        break;
      }
    }
  }
  
  return contextLines.join("\n");
}

/**
 * Chunks TypeScript/JavaScript code using AST parsing
 */
function chunkTypeScriptJavaScript(options: Required<ChunkOptions>): CodeChunk[] {
  const chunks: CodeChunk[] = [];
  const context = extractContext(options.content, options.language);
  
  try {
    // Parse with Babel
    const ast = parse(options.content, {
      sourceType: "module",
      plugins: [
        "typescript",
        "jsx",
        "decorators-legacy",
        "classProperties",
        "classPrivateProperties",
        "classPrivateMethods",
        "exportDefaultFrom",
        "exportNamespaceFrom",
        "dynamicImport",
        "nullishCoalescingOperator",
        "optionalChaining",
        "objectRestSpread",
      ],
    });
    
    // Traverse AST to find functions, classes, and methods
    traverse(ast, {
      FunctionDeclaration(path: any) {
        const node = path.node;
        if (node.loc) {
          const lines = options.content.split("\n");
          const chunkLines = lines.slice(node.loc.start.line - 1, node.loc.end.line);
          const content = chunkLines.join("\n");
          
          chunks.push({
            id: generateChunkId(options.filePath, content, node.loc.start.line),
            filePath: options.filePath,
            content,
            startLine: node.loc.start.line,
            endLine: node.loc.end.line,
            chunkType: "function",
            name: node.id?.name,
            language: options.language,
            context,
          });
        }
      },
      
      ArrowFunctionExpression(path: any) {
        const node = path.node;
        const parent = path.parent;
        
        // Only capture named arrow functions (const foo = () => {})
        if (
          parent.type === "VariableDeclarator" &&
          parent.id.type === "Identifier" &&
          node.loc
        ) {
          const lines = options.content.split("\n");
          // Include the variable declaration line
          const startLine = parent.loc?.start.line || node.loc.start.line;
          const endLine = node.loc.end.line;
          const chunkLines = lines.slice(startLine - 1, endLine);
          const content = chunkLines.join("\n");
          
          chunks.push({
            id: generateChunkId(options.filePath, content, startLine),
            filePath: options.filePath,
            content,
            startLine,
            endLine,
            chunkType: "function",
            name: parent.id.name,
            language: options.language,
            context,
          });
        }
      },
      
      ClassDeclaration(path: any) {
        const node = path.node;
        if (node.loc) {
          const lines = options.content.split("\n");
          const chunkLines = lines.slice(node.loc.start.line - 1, node.loc.end.line);
          const content = chunkLines.join("\n");
          
          chunks.push({
            id: generateChunkId(options.filePath, content, node.loc.start.line),
            filePath: options.filePath,
            content,
            startLine: node.loc.start.line,
            endLine: node.loc.end.line,
            chunkType: "class",
            name: node.id?.name,
            language: options.language,
            context,
          });
        }
      },
      
      ClassMethod(path: any) {
        const node = path.node;
        if (node.loc && node.key.type === "Identifier") {
          const lines = options.content.split("\n");
          const chunkLines = lines.slice(node.loc.start.line - 1, node.loc.end.line);
          const content = chunkLines.join("\n");
          
          chunks.push({
            id: generateChunkId(options.filePath, content, node.loc.start.line),
            filePath: options.filePath,
            content,
            startLine: node.loc.start.line,
            endLine: node.loc.end.line,
            chunkType: "method",
            name: node.key.name,
            language: options.language,
            context,
          });
        }
      },
    });
    
    // If no chunks were extracted or file is small, treat as single chunk
    if (chunks.length === 0 || options.content.length <= options.maxChunkSize) {
      chunks.push({
        id: generateChunkId(options.filePath, options.content, 1),
        filePath: options.filePath,
        content: options.content,
        startLine: 1,
        endLine: options.content.split("\n").length,
        chunkType: "file",
        language: options.language,
        context,
      });
    }
    
  } catch (error) {
    console.error(`AST parsing failed for ${options.filePath}, falling back to fixed chunking: ${error}`);
    // Fallback to fixed chunking if AST parsing fails
    return chunkByFixedSize(options);
  }
  
  return chunks;
}

/**
 * Chunks Python code using simple pattern matching
 */
function chunkPython(options: Required<ChunkOptions>): CodeChunk[] {
  const chunks: CodeChunk[] = [];
  const lines = options.content.split("\n");
  const context = extractContext(options.content, options.language);
  
  let currentChunk: string[] = [];
  let chunkStartLine = 1;
  let inFunction = false;
  let inClass = false;
  let functionName: string | undefined;
  let className: string | undefined;
  let baseIndent = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const indent = line.length - line.trimLeft().length;
    
    // Detect function definition
    if (trimmed.startsWith("def ")) {
      // Save previous chunk if exists
      if (currentChunk.length > 0) {
        const content = currentChunk.join("\n");
        chunks.push({
          id: generateChunkId(options.filePath, content, chunkStartLine),
          filePath: options.filePath,
          content,
          startLine: chunkStartLine,
          endLine: i,
          chunkType: inClass ? "method" : "function",
          name: functionName,
          language: options.language,
          context,
        });
      }
      
      // Start new chunk
      currentChunk = [line];
      chunkStartLine = i + 1;
      inFunction = true;
      baseIndent = indent;
      
      // Extract function name
      const match = trimmed.match(/def\s+(\w+)/);
      functionName = match ? match[1] : undefined;
      
    } else if (trimmed.startsWith("class ")) {
      // Save previous chunk if exists
      if (currentChunk.length > 0) {
        const content = currentChunk.join("\n");
        chunks.push({
          id: generateChunkId(options.filePath, content, chunkStartLine),
          filePath: options.filePath,
          content,
          startLine: chunkStartLine,
          endLine: i,
          chunkType: "class",
          name: className,
          language: options.language,
          context,
        });
      }
      
      // Start new chunk
      currentChunk = [line];
      chunkStartLine = i + 1;
      inClass = true;
      baseIndent = indent;
      
      // Extract class name
      const match = trimmed.match(/class\s+(\w+)/);
      className = match ? match[1] : undefined;
      
    } else if (inFunction || inClass) {
      // Check if we're still in the same block (based on indentation)
      if (trimmed && indent <= baseIndent && !trimmed.startsWith("#")) {
        // End of current block
        const content = currentChunk.join("\n");
        chunks.push({
          id: generateChunkId(options.filePath, content, chunkStartLine),
          filePath: options.filePath,
          content,
          startLine: chunkStartLine,
          endLine: i,
          chunkType: inClass ? "class" : "function",
          name: inClass ? className : functionName,
          language: options.language,
          context,
        });
        
        currentChunk = [line];
        chunkStartLine = i + 1;
        inFunction = false;
        inClass = false;
      } else {
        currentChunk.push(line);
      }
    } else {
      currentChunk.push(line);
    }
  }
  
  // Save final chunk
  if (currentChunk.length > 0) {
    const content = currentChunk.join("\n");
    chunks.push({
      id: generateChunkId(options.filePath, content, chunkStartLine),
      filePath: options.filePath,
      content,
      startLine: chunkStartLine,
      endLine: lines.length,
      chunkType: inClass ? "class" : inFunction ? "function" : "block",
      name: inClass ? className : functionName,
      language: options.language,
      context,
    });
  }
  
  // If no chunks or very small file, return as single chunk
  if (chunks.length === 0) {
    chunks.push({
      id: generateChunkId(options.filePath, options.content, 1),
      filePath: options.filePath,
      content: options.content,
      startLine: 1,
      endLine: lines.length,
      chunkType: "file",
      language: options.language,
      context,
    });
  }
  
  return chunks;
}

/**
 * Chunks code by fixed size with overlap
 */
function chunkByFixedSize(options: Required<ChunkOptions>): CodeChunk[] {
  const chunks: CodeChunk[] = [];
  const lines = options.content.split("\n");
  const context = extractContext(options.content, options.language);
  
  let currentLines: string[] = [];
  let currentSize = 0;
  let chunkStartLine = 1;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    currentLines.push(line);
    currentSize += line.length + 1; // +1 for newline
    
    // If we've reached max chunk size
    if (currentSize >= options.maxChunkSize) {
      const content = currentLines.join("\n");
      chunks.push({
        id: generateChunkId(options.filePath, content, chunkStartLine),
        filePath: options.filePath,
        content,
        startLine: chunkStartLine,
        endLine: i + 1,
        chunkType: "block",
        language: options.language,
        context,
      });
      
      // Calculate overlap
      const overlapLines = Math.floor(options.chunkOverlap / 50); // Approximate lines
      currentLines = currentLines.slice(-overlapLines);
      currentSize = currentLines.reduce((sum, l) => sum + l.length + 1, 0);
      chunkStartLine = i + 1 - overlapLines + 1;
    }
  }
  
  // Add remaining content as final chunk
  if (currentLines.length > 0) {
    const content = currentLines.join("\n");
    chunks.push({
      id: generateChunkId(options.filePath, content, chunkStartLine),
      filePath: options.filePath,
      content,
      startLine: chunkStartLine,
      endLine: lines.length,
      chunkType: "block",
      language: options.language,
      context,
    });
  }
  
  return chunks;
}

/**
 * Main chunking function - routes to appropriate strategy based on language
 */
export function chunkCode(options: ChunkOptions): CodeChunk[] {
  const fullOptions: Required<ChunkOptions> = {
    filePath: options.filePath,
    content: options.content,
    language: options.language,
    maxChunkSize: options.maxChunkSize || 1000,
    chunkOverlap: options.chunkOverlap || 200,
  };
  
  // Route to appropriate chunking strategy
  if (fullOptions.language === "typescript" || fullOptions.language === "javascript") {
    return chunkTypeScriptJavaScript(fullOptions);
  } else if (fullOptions.language === "python") {
    return chunkPython(fullOptions);
  } else {
    // For other languages, use fixed-size chunking
    return chunkByFixedSize(fullOptions);
  }
}

/**
 * Chunks a file by reading it from disk
 */
export function chunkFile(
  filePath: string,
  language: string,
  maxChunkSize?: number,
  chunkOverlap?: number
): CodeChunk[] {
  const content = fs.readFileSync(filePath, "utf-8");
  return chunkCode({
    filePath,
    content,
    language,
    maxChunkSize,
    chunkOverlap,
  });
}
