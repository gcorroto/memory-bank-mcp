/**
 * @fileoverview Intelligent code chunker for Memory Bank
 * Fragments code intelligently using AST parsing when possible
 */

import * as fs from "fs";
import { parse } from "@babel/parser";
import traverseLib from "@babel/traverse";
import * as crypto from "crypto";
import { getEncoding } from "js-tiktoken";

// Handle traverse library export
const traverse = typeof traverseLib === 'function' ? traverseLib : (traverseLib as any).default;

// Initialize tokenizer
const enc = getEncoding("cl100k_base");

/**
 * Enforces token limits on chunks, splitting them if necessary
 */
function enforceTokenLimits(chunks: CodeChunk[], maxTokens: number = 8000): CodeChunk[] {
  const result: CodeChunk[] = [];

  for (const chunk of chunks) {
    const tokens = enc.encode(chunk.content);
    if (tokens.length <= maxTokens) {
      result.push(chunk);
    } else {
      // Split into smaller chunks
      const content = chunk.content;
      const lines = content.split('\n');

      let currentChunkLines: string[] = [];
      let currentTokens = 0;
      let startLine = chunk.startLine;
      let partIndex = 1;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineTokens = enc.encode(line + '\n').length;

        if (currentTokens + lineTokens > maxTokens) {
          // Push current chunk
          if (currentChunkLines.length > 0) {
            const subContent = currentChunkLines.join('\n');
            result.push({
              ...chunk,
              id: `${chunk.id}-${partIndex}`,
              content: subContent,
              startLine: startLine,
              endLine: startLine + currentChunkLines.length - 1,
              name: chunk.name ? `${chunk.name} (Part ${partIndex})` : undefined
            });
            partIndex++;
            startLine += currentChunkLines.length;
            currentChunkLines = [];
            currentTokens = 0;
          }
        }

        currentChunkLines.push(line);
        currentTokens += lineTokens;
      }

      // Remaining
      if (currentChunkLines.length > 0) {
        const subContent = currentChunkLines.join('\n');
        result.push({
          ...chunk,
          id: `${chunk.id}-${partIndex}`,
          content: subContent,
          startLine: startLine,
          endLine: chunk.endLine, // Best effort
          name: chunk.name ? `${chunk.name} (Part ${partIndex})` : undefined
        });
      }
    }
  }

  return result;
}

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
 * Chunks HTML/Vue/Svelte code by extracting script/style blocks
 */
function chunkHtml(options: Required<ChunkOptions>): CodeChunk[] {
  const chunks: CodeChunk[] = [];
  const content = options.content;
  const context = extractContext(content, options.language);

  // Helper to add chunks from other languages
  const addSubChunks = (subContent: string, subLang: string, offsetLine: number) => {
    // If language is not supported for semantic chunking, it will fall back to fixed size
    // We need to adjust line numbers relative to the file
    const subOptions = {
      ...options,
      content: subContent,
      language: subLang,
    };

    // We use the main chunkCode router to handle the sub-content
    // This allows reusing JS/TS/CSS logic
    let subChunks: CodeChunk[] = [];
    if (subLang === "typescript" || subLang === "javascript" || subLang === "ts" || subLang === "js") {
      subChunks = chunkTypeScriptJavaScript(subOptions);
    } else if (subLang === "css" || subLang === "scss" || subLang === "sass") {
      subChunks = chunkCss(subOptions);
    } else {
      subChunks = chunkByFixedSize(subOptions);
    }

    subChunks.forEach(chunk => {
      chunk.startLine += offsetLine;
      chunk.endLine += offsetLine;
      // Regenerate ID to ensure it includes the correct line numbers and file context
      chunk.id = generateChunkId(options.filePath, chunk.content, chunk.startLine);
      chunks.push(chunk);
    });
  };

  // 1. Extract <script> blocks
  const scriptRegex = /<script\s*(?:lang=["']([\w-]+)["'])?\s*(?:setup)?\s*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = scriptRegex.exec(content)) !== null) {
    const langIdx = match[1] || "javascript"; // Default to JS
    const scriptContent = match[2];

    // Normalize language
    let subLang = langIdx.toLowerCase();
    if (subLang === "ts") subLang = "typescript";
    if (subLang === "js") subLang = "javascript";

    // Calculate start line
    const preMatch = content.substring(0, match.index);
    const startLine = preMatch.split("\n").length - 1; // 0-indexed adjustment for calc

    addSubChunks(scriptContent, subLang, startLine);
  }

  // 2. Extract <style> blocks
  const styleRegex = /<style\s*(?:lang=["']([\w-]+)["'])?\s*(?:scoped)?\s*>([\s\S]*?)<\/style>/gi;
  while ((match = styleRegex.exec(content)) !== null) {
    const langIdx = match[1] || "css"; // Default to CSS
    const styleContent = match[2];

    // Normalize language
    let subLang = langIdx.toLowerCase();

    // Calculate start line
    const preMatch = content.substring(0, match.index);
    const startLine = preMatch.split("\n").length - 1;

    addSubChunks(styleContent, subLang, startLine);
  }

  // 3. Process the template/HTML structure (rest of file or specific template block)
  // For Vue, we might look for <template>, for pure HTML it's the whole file
  // For simplicity, we'll try to find <template> first, if not, treat whole file (minus script/style) as HTML structure
  // But removing script/style from content to chunk remainder is complex with line numbers.
  // Instead, we will just chunk the whole file as "html" fixed chunks, 
  // but we can be smarter: split by top-level tags if possible?
  // Given complexity, falling back to fixed-size chunking for the *entire* file content 
  // but labeled as "template" might be redundant with the script/style chunks.
  // Better approach: Regex for <template> block in Vue/Svelte

  const templateRegex = /<template>([\s\S]*?)<\/template>/i;
  const templateMatch = templateRegex.exec(content);

  if (templateMatch) {
    const templateContent = templateMatch[1];
    const preMatch = content.substring(0, templateMatch.index);
    const startLine = preMatch.split("\n").length - 1;

    // Chunk template as HTML (fixed size for now, strict AST for HTML is hard without lib)
    addSubChunks(templateContent, "html", startLine);
  } else if (options.language === "html") {
    // For pure HTML files, just use fixed size chunking but exclude script/style if possible?
    // Actually, letting it chunk the whole file by fixed size is a safe fallback for the "structure"
    // The script/style chunks will strictly point to logic/styles.
    // Overlapping coverage is acceptable.

    // Let's rely on fixed partitioning for HTML content
    const htmlChunks = chunkByFixedSize({
      ...options,
      language: "html"
    });
    // We only add these if we are sure we aren't duplicating too much logic?
    // Actually duplication is fine, vector search handles it. 
    // But better to separate concerns.

    chunks.push(...htmlChunks);
  }

  return chunks;
}

/**
 * Chunks CSS/SCSS code by parsing rule blocks
 */
function chunkCss(options: Required<ChunkOptions>): CodeChunk[] {
  const chunks: CodeChunk[] = [];
  const lines = options.content.split("\n");
  const context = extractContext(options.content, options.language);

  let currentChunk: string[] = [];
  let chunkStartLine = 1;
  let braceDepth = 0;
  let inComment = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith("/*") && !inComment) inComment = true;
    if (trimmed.endsWith("*/") && inComment) inComment = false;

    // Count braces to detect block boundaries
    // Simple heuristic, might fail on complex strings containing braces
    const openBraces = (line.match(/\{/g) || []).length;
    const closeBraces = (line.match(/\}/g) || []).length;

    braceDepth += openBraces - closeBraces;

    currentChunk.push(line);

    // If we are at root level (depth 0) and have content, and just closed a block or ended a property
    if (braceDepth === 0 && !inComment && currentChunk.length > 0) {
      const chunkContent = currentChunk.join("\n").trim();

      // Don't chunk empty lines
      if (chunkContent.length > 0 && chunkContent !== "}") {
        // Only finalize chunk if it looks like a complete rule or directive
        // i.e. ends with } or ;
        if (chunkContent.endsWith("}") || chunkContent.endsWith(";")) {
          chunks.push({
            id: generateChunkId(options.filePath, chunkContent, chunkStartLine),
            filePath: options.filePath,
            content: chunkContent,
            startLine: chunkStartLine,
            endLine: i + 1,
            chunkType: "block", // CSS rule
            language: options.language,
            context,
          });

          currentChunk = [];
          chunkStartLine = i + 2; // Next line
        }
      }
    }

    // Safety break for very large chunks
    if (currentChunk.join("\n").length > (options.maxChunkSize * 2)) {
      // Force split if rule is too massive
      const chunkContent = currentChunk.join("\n");
      // Validate content before pushing
      if (chunkContent.trim().length > 0 && chunkContent.trim() !== "}") {
        chunks.push({
          id: generateChunkId(options.filePath, chunkContent, chunkStartLine),
          filePath: options.filePath,
          content: chunkContent,
          startLine: chunkStartLine,
          endLine: i + 1,
          chunkType: "block",
          language: options.language,
          context,
        });
      }
      currentChunk = [];
      chunkStartLine = i + 2;
      braceDepth = 0; // Reset to avoid getting stuck
    }
  }

  // Remaining
  // Remaining
  if (currentChunk.length > 0) {
    const chunkContent = currentChunk.join("\n");
    // Validate content before pushing
    if (chunkContent.trim().length > 0 && chunkContent.trim() !== "}") {
      chunks.push({
        id: generateChunkId(options.filePath, chunkContent, chunkStartLine),
        filePath: options.filePath,
        content: chunkContent,
        startLine: chunkStartLine,
        endLine: lines.length,
        chunkType: "block",
        language: options.language,
        context,
      });
    }
  }

  return chunks;
}

/**
 * Chunks JSON files by parsing structure
 */
function chunkJson(options: Required<ChunkOptions>): CodeChunk[] {
  const chunks: CodeChunk[] = [];
  // Context for JSON is usually not useful (just start of file)
  const context = "";

  try {
    const json = JSON.parse(options.content);

    if (Array.isArray(json)) {
      // Chunk array items
      json.forEach((item, index) => {
        const itemStr = JSON.stringify(item, null, 2);
        // We can't easily get exact lines from JSON.parse
        // So we approximate or just treat as logical chunks without strict line mapping
        // For semantic search, the content is what matters.
        // Line numbers will be approximate (0-0 or 1-1) unless we re-search the string in content

        // Let's try to locate the item in string roughly? expensive.
        // We will just create chunks with content.
        chunks.push({
          id: generateChunkId(options.filePath, itemStr, index), // index as salt
          filePath: options.filePath,
          content: itemStr,
          startLine: 1, // Unknown
          endLine: 1, // Unknown
          chunkType: "block",
          name: `[${index}]`,
          language: "json",
          context,
        });
      });
    } else if (typeof json === "object" && json !== null) {
      // Chunk top-level keys
      Object.keys(json).forEach((key) => {
        const val = json[key];
        const valStr = JSON.stringify(val, null, 2);
        const chunkContent = `"${key}": ${valStr}`;

        if (chunkContent.length > options.maxChunkSize) {
          // If value is huge, maybe we should recurse or fixed-chunk it?
          // For now, let's just push it.
        }

        chunks.push({
          id: generateChunkId(options.filePath, chunkContent, 0),
          filePath: options.filePath,
          content: chunkContent,
          startLine: 1,
          endLine: 1,
          chunkType: "block",
          name: key,
          language: "json",
          context,
        });
      });
    } else {
      // Primitive, single chunk
      chunks.push({
        id: generateChunkId(options.filePath, options.content, 1),
        filePath: options.filePath,
        content: options.content,
        startLine: 1,
        endLine: options.content.split("\n").length,
        chunkType: "file",
        language: "json",
      });
    }
  } catch (e) {
    // Fallback to fixed size if invalid JSON
    return chunkByFixedSize(options);
  }

  return chunks;
}

/**
 * Chunks Java code (Spring Boot support) using brace tracking and regex
 */
function chunkJava(options: Required<ChunkOptions>): CodeChunk[] {
  const chunks: CodeChunk[] = [];
  const lines = options.content.split("\n");
  const context = extractContext(options.content, options.language);

  let currentChunk: string[] = [];
  let chunkStartLine = 1;
  let braceDepth = 0;
  let inClass = false;
  let inMethod = false;
  let className: string | undefined;
  let methodName: string | undefined;
  let chunkBaseDepth = 0;
  let annotations: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip comments for logic but include in chunk
    const isComment = trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*");

    // Track strict brace depth
    const openBraces = (line.match(/\{/g) || []).length;
    const closeBraces = (line.match(/\}/g) || []).length;

    // Check for annotations
    if (trimmed.startsWith("@") && !isComment) {
      if (currentChunk.length === 0 && annotations.length === 0) {
        chunkStartLine = i + 1;
      }
      annotations.push(line);
      // Annotations are part of the next chunk
      currentChunk.push(line);
      continue;
    }

    // Detect Class/Interface
    const classMatch = trimmed.match(/(?:public|protected|private)?\s*(?:static)?\s*(?:class|interface|enum)\s+(\w+)/);
    if (classMatch && !isComment) {
      // If we are already in a chunk (e.g. previous class ended), push it
      // But if we are just starting (annotations only), keep going
      if (currentChunk.length > annotations.length && braceDepth === chunkBaseDepth) {
        const content = currentChunk.join("\n");
        chunks.push({
          id: generateChunkId(options.filePath, content, chunkStartLine),
          filePath: options.filePath,
          content,
          startLine: chunkStartLine,
          endLine: i,
          chunkType: inClass ? "class" : "file", // inner class
          name: className,
          language: options.language,
          context
        });
        currentChunk = [...annotations]; // Start new chunk with potential accumulated annotations
        chunkStartLine = i + 1 - annotations.length;
      } else if (currentChunk.length === 0) {
        chunkStartLine = i + 1;
      }

      inClass = true;
      inMethod = false;
      className = classMatch[1];
      chunkBaseDepth = braceDepth;
      annotations = [];
    }

    // Detect Method (heuristic: access modifier + type + name + (args) + {)
    // Avoid control structures like if/for/while/switch/catch
    const methodMatch = trimmed.match(/(?:public|protected|private)\s+(?:[\w<>?\[\]]+\s+)(\w+)\s*\(/);
    const isControlFlow = /^(if|for|while|switch|catch|try)\b/.test(trimmed);

    if (methodMatch && !isControlFlow && !isComment) {
      // if we are inside a class, this is a method chunk
      if (braceDepth === chunkBaseDepth + 1) { // Direct member of class
        // Previous logical block (fields, etc) ends here
        if (currentChunk.length > annotations.length) {
          const content = currentChunk.join("\n");
          chunks.push({
            id: generateChunkId(options.filePath, content, chunkStartLine),
            filePath: options.filePath,
            content,
            startLine: chunkStartLine,
            endLine: i,
            chunkType: "block",
            name: className, // Context of class
            language: options.language,
            context
          });
        }
        currentChunk = [...annotations];
        chunkStartLine = i + 1 - annotations.length;

        methodName = methodMatch[1];
        inMethod = true;
        annotations = [];
      }
    }

    currentChunk.push(line);
    braceDepth += openBraces - closeBraces;

    // Check if block ended (method or class)
    // We close the chunk if we return to the depth where we started THIS chunk
    // But we need to handle the case where we just closed the class itself

    // Logic: If we are in a method, and brace depth returns to class level -> method closed
    if (inMethod && braceDepth === chunkBaseDepth + 1 && closeBraces > 0) {
      const content = currentChunk.join("\n");
      chunks.push({
        id: generateChunkId(options.filePath, content, chunkStartLine),
        filePath: options.filePath,
        content,
        startLine: chunkStartLine,
        endLine: i + 1,
        chunkType: "method",
        name: methodName,
        language: options.language,
        context
      });
      currentChunk = [];
      inMethod = false;
      methodName = undefined;
      chunkStartLine = i + 2;
    }
    // If brace depth returns to chunkBaseDepth -> class closed
    else if (inClass && braceDepth === chunkBaseDepth && closeBraces > 0) {
      const content = currentChunk.join("\n");
      chunks.push({
        id: generateChunkId(options.filePath, content, chunkStartLine),
        filePath: options.filePath,
        content,
        startLine: chunkStartLine,
        endLine: i + 1,
        chunkType: "class",
        name: className,
        language: options.language,
        context
      });
      currentChunk = [];
      inClass = false;
      className = undefined;
      chunkStartLine = i + 2;
    }

    // Safety break for very large chunks
    if (currentChunk.join("\n").length > (options.maxChunkSize * 3)) {
      // If a single method is massive, we have to split it.
      // enforceTokenLimits will handle strict splitting, but we should probably 
      // force a commit here to avoid memory pressure if it's crazy huge
    }

    if (closeBraces > 0 && annotations.length > 0) chunks.push(...[]); // no-op just to use variable
    if (openBraces > 0) annotations = []; // Clear annotations if we opened a brace (they were consumed)
  }

  // Remaining content
  if (currentChunk.length > 0) {
    const content = currentChunk.join("\n");
    if (content.trim().length > 0) {
      chunks.push({
        id: generateChunkId(options.filePath, content, chunkStartLine),
        filePath: options.filePath,
        content,
        startLine: chunkStartLine,
        endLine: lines.length,
        chunkType: "file",
        language: options.language,
        context
      });
    }
  }

  // Fallback if regex failed to find anything
  if (chunks.length === 0) {
    return chunkByFixedSize(options);
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

  // Force fixed-size chunking for minified files to prevent context length errors
  if (fullOptions.filePath.includes(".min.")) {
    const rawChunks = chunkByFixedSize(fullOptions);
    return enforceTokenLimits(rawChunks);
  }

  // Route to appropriate chunking strategy
  let chunks: CodeChunk[] = [];
  if (fullOptions.language === "typescript" || fullOptions.language === "javascript") {
    chunks = chunkTypeScriptJavaScript(fullOptions);
  } else if (fullOptions.language === "python") {
    chunks = chunkPython(fullOptions);
  } else if (["html", "vue", "svelte"].includes(fullOptions.language)) {
    chunks = chunkHtml(fullOptions);
  } else if (["css", "scss", "sass", "less"].includes(fullOptions.language)) {
    chunks = chunkCss(fullOptions);
  } else if (fullOptions.language === "json") {
    chunks = chunkJson(fullOptions);
  } else if (fullOptions.language === "java") {
    chunks = chunkJava(fullOptions);
  } else {
    // For other languages, use fixed-size chunking
    chunks = chunkByFixedSize(fullOptions);
  }

  return enforceTokenLimits(chunks);
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
