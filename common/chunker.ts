/**
 * @fileoverview Intelligent code chunker for Memory Bank
 * Fragments code intelligently using AST parsing when possible
 * Uses Tree-sitter for multi-language AST support
 * Falls back to token counting for unsupported languages
 */

import * as fs from "fs";
import { parse } from "@babel/parser";
import traverseLib from "@babel/traverse";
import * as crypto from "crypto";
import { encode } from "gpt-tokenizer";
import { chunkWithAST, isLanguageSupportedByAST, ASTCodeChunk } from "./astChunker.js";

// Handle traverse library export
const traverse = typeof traverseLib === 'function' ? traverseLib : (traverseLib as any).default;

// Constants for embedding model limits
// text-embedding-3-small has 8192 token limit
// Use 6000 for safety margin (accounting for tokenizer differences and context)
const MAX_TOKENS_PER_CHUNK = 6000;
const DEFAULT_CHUNK_OVERLAP_TOKENS = 200;
// Absolute maximum - chunks exceeding this will always be split
const ABSOLUTE_MAX_TOKENS = 7500;

export interface CodeChunk {
  id: string;              // Unique hash ID
  filePath: string;        // Relative path of the file
  content: string;         // Content of the chunk
  startLine: number;       // Starting line number
  endLine: number;         // Ending line number
  chunkType: "function" | "class" | "method" | "interface" | "module" | "block" | "file";
  name?: string;           // Name of function/class if applicable
  language: string;        // Programming language
  context?: string;        // Additional context (imports, etc.)
  tokenCount?: number;     // Token count for the chunk
  parentName?: string;     // For methods: the class they belong to
}

export interface ChunkOptions {
  filePath: string;
  content: string;
  language: string;
  maxTokens?: number;           // Default: 7500 tokens
  chunkOverlapTokens?: number;  // Default: 200 tokens
  // Legacy options (for backwards compatibility)
  maxChunkSize?: number;        // Deprecated, use maxTokens
  chunkOverlap?: number;        // Deprecated, use chunkOverlapTokens
}

/**
 * Counts tokens in a text using tiktoken-compatible tokenizer
 */
export function countTokens(text: string): number {
  try {
    return encode(text).length;
  } catch {
    // Fallback estimation: ~4 characters per token for code
    return Math.ceil(text.length / 4);
  }
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
 * Splits a chunk that exceeds the token limit into smaller chunks
 */
function splitLargeChunk(
  chunk: CodeChunk,
  maxTokens: number,
  overlapTokens: number
): CodeChunk[] {
  const tokenCount = countTokens(chunk.content);
  
  // If under limit, return as-is
  if (tokenCount <= maxTokens) {
    return [{ ...chunk, tokenCount }];
  }
  
  console.error(
    `Splitting large chunk: ${chunk.filePath} (${chunk.name || 'unnamed'}) - ${tokenCount} tokens exceeds ${maxTokens} limit`
  );
  
  const subChunks: CodeChunk[] = [];
  const lines = chunk.content.split("\n");
  
  let currentLines: string[] = [];
  let currentTokens = 0;
  let subChunkStartLine = chunk.startLine;
  let subChunkIndex = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineTokens = countTokens(line + "\n");
    
    // If single line exceeds max, we have to include it anyway (extreme edge case)
    if (lineTokens > maxTokens && currentLines.length === 0) {
      currentLines.push(line);
      currentTokens = lineTokens;
    } else if (currentTokens + lineTokens > maxTokens && currentLines.length > 0) {
      // Save current chunk
      const content = currentLines.join("\n");
      const actualTokens = countTokens(content);
      
      subChunks.push({
        id: generateChunkId(chunk.filePath, content, subChunkStartLine),
        filePath: chunk.filePath,
        content,
        startLine: subChunkStartLine,
        endLine: chunk.startLine + i - 1,
        chunkType: chunk.chunkType,
        name: chunk.name ? `${chunk.name}_part${subChunkIndex + 1}` : undefined,
        language: chunk.language,
        context: chunk.context,
        tokenCount: actualTokens,
      });
      
      subChunkIndex++;
      
      // Calculate overlap - try to include enough lines to reach overlapTokens
      let overlapLines: string[] = [];
      let overlapTokenCount = 0;
      for (let j = currentLines.length - 1; j >= 0 && overlapTokenCount < overlapTokens; j--) {
        overlapLines.unshift(currentLines[j]);
        overlapTokenCount += countTokens(currentLines[j] + "\n");
      }
      
      currentLines = [...overlapLines, line];
      currentTokens = overlapTokenCount + lineTokens;
      subChunkStartLine = chunk.startLine + i - overlapLines.length;
    } else {
      currentLines.push(line);
      currentTokens += lineTokens;
    }
  }
  
  // Save final sub-chunk
  if (currentLines.length > 0) {
    const content = currentLines.join("\n");
    const actualTokens = countTokens(content);
    
    subChunks.push({
      id: generateChunkId(chunk.filePath, content, subChunkStartLine),
      filePath: chunk.filePath,
      content,
      startLine: subChunkStartLine,
      endLine: chunk.endLine,
      chunkType: chunk.chunkType,
      name: chunk.name ? `${chunk.name}_part${subChunkIndex + 1}` : undefined,
      language: chunk.language,
      context: chunk.context,
      tokenCount: actualTokens,
    });
  }
  
  console.error(`  Split into ${subChunks.length} sub-chunks`);
  return subChunks;
}

/**
 * Processes chunks to ensure none exceed the token limit
 */
function enforceTokenLimits(
  chunks: CodeChunk[],
  maxTokens: number,
  overlapTokens: number
): CodeChunk[] {
  const result: CodeChunk[] = [];
  
  for (const chunk of chunks) {
    const splitChunks = splitLargeChunk(chunk, maxTokens, overlapTokens);
    result.push(...splitChunks);
  }
  
  return result;
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
    
    // If no chunks were extracted, treat as single chunk
    if (chunks.length === 0) {
      const tokenCount = countTokens(options.content);
      chunks.push({
        id: generateChunkId(options.filePath, options.content, 1),
        filePath: options.filePath,
        content: options.content,
        startLine: 1,
        endLine: options.content.split("\n").length,
        chunkType: "file",
        language: options.language,
        context,
        tokenCount,
      });
    }
    
  } catch (error) {
    console.error(`AST parsing failed for ${options.filePath}, falling back to fixed chunking: ${error}`);
    // Fallback to fixed chunking if AST parsing fails
    return chunkByTokens(options);
  }
  
  // Enforce token limits on all chunks
  return enforceTokenLimits(chunks, options.maxTokens, options.chunkOverlapTokens);
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
    const indent = line.length - line.trimStart().length;
    
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
  
  // Enforce token limits on all chunks
  return enforceTokenLimits(chunks, options.maxTokens, options.chunkOverlapTokens);
}

/**
 * Chunks code by token count with overlap (replacement for chunkByFixedSize)
 * NOTE: This function now enforces token limits on all chunks including the final one
 */
function chunkByTokens(options: Required<ChunkOptions>): CodeChunk[] {
  const chunks: CodeChunk[] = [];
  const lines = options.content.split("\n");
  const context = extractContext(options.content, options.language);
  
  let currentLines: string[] = [];
  let currentTokens = 0;
  let chunkStartLine = 1;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineTokens = countTokens(line + "\n");
    
    // If we've reached max tokens
    if (currentTokens + lineTokens > options.maxTokens && currentLines.length > 0) {
      const content = currentLines.join("\n");
      const actualTokens = countTokens(content);
      
      chunks.push({
        id: generateChunkId(options.filePath, content, chunkStartLine),
        filePath: options.filePath,
        content,
        startLine: chunkStartLine,
        endLine: i,
        chunkType: "block",
        language: options.language,
        context,
        tokenCount: actualTokens,
      });
      
      // Calculate overlap in lines (approximate)
      let overlapLines: string[] = [];
      let overlapTokenCount = 0;
      for (let j = currentLines.length - 1; j >= 0 && overlapTokenCount < options.chunkOverlapTokens; j--) {
        overlapLines.unshift(currentLines[j]);
        overlapTokenCount += countTokens(currentLines[j] + "\n");
      }
      
      currentLines = [...overlapLines, line];
      currentTokens = overlapTokenCount + lineTokens;
      chunkStartLine = i + 1 - overlapLines.length;
    } else {
      currentLines.push(line);
      currentTokens += lineTokens;
    }
  }
  
  // Add remaining content as final chunk
  if (currentLines.length > 0) {
    const content = currentLines.join("\n");
    const actualTokens = countTokens(content);
    
    chunks.push({
      id: generateChunkId(options.filePath, content, chunkStartLine),
      filePath: options.filePath,
      content,
      startLine: chunkStartLine,
      endLine: lines.length,
      chunkType: "block",
      language: options.language,
      context,
      tokenCount: actualTokens,
    });
  }
  
  // IMPORTANT: Enforce token limits on all chunks (including final chunk)
  // This fixes the bug where the final chunk could exceed the token limit
  return enforceTokenLimits(chunks, options.maxTokens, options.chunkOverlapTokens);
}

/**
 * Legacy function for backwards compatibility
 * @deprecated Use chunkByTokens instead
 */
function chunkByFixedSize(options: Required<ChunkOptions>): CodeChunk[] {
  return chunkByTokens(options);
}

/**
 * Converts ASTCodeChunk to CodeChunk (compatible interface)
 */
function astChunkToCodeChunk(astChunk: ASTCodeChunk): CodeChunk {
  return {
    id: astChunk.id,
    filePath: astChunk.filePath,
    content: astChunk.content,
    startLine: astChunk.startLine,
    endLine: astChunk.endLine,
    chunkType: astChunk.chunkType,
    name: astChunk.name,
    language: astChunk.language,
    context: astChunk.context,
    tokenCount: astChunk.tokenCount,
    parentName: astChunk.parentName,
  };
}

/**
 * Main async chunking function - uses Tree-sitter AST parsing for all supported languages
 * Falls back to legacy methods if AST parsing is not available
 */
export async function chunkCodeAsync(options: ChunkOptions): Promise<CodeChunk[]> {
  const fullOptions: Required<ChunkOptions> = {
    filePath: options.filePath,
    content: options.content,
    language: options.language,
    maxTokens: options.maxTokens || MAX_TOKENS_PER_CHUNK,
    chunkOverlapTokens: options.chunkOverlapTokens || DEFAULT_CHUNK_OVERLAP_TOKENS,
    maxChunkSize: options.maxChunkSize || 1000,
    chunkOverlap: options.chunkOverlap || 200,
  };

  // First, try AST-based chunking if language is supported
  if (isLanguageSupportedByAST(fullOptions.language)) {
    console.error(`[Chunker] Using AST chunking for ${fullOptions.language}: ${fullOptions.filePath}`);
    
    try {
      const astChunks = await chunkWithAST({
        filePath: fullOptions.filePath,
        content: fullOptions.content,
        language: fullOptions.language,
        maxTokens: fullOptions.maxTokens,
        chunkOverlapTokens: fullOptions.chunkOverlapTokens,
      });

      // If AST chunking succeeded, convert and return
      if (astChunks.length > 0) {
        const chunks = astChunks.map(astChunkToCodeChunk);
        console.error(`[Chunker] AST chunking created ${chunks.length} chunks`);
        return validateAndLogChunks(chunks, fullOptions.filePath);
      }
    } catch (error) {
      console.error(`[Chunker] AST chunking failed, falling back: ${error}`);
    }
  }

  // Fallback to legacy chunking methods
  console.error(`[Chunker] Using fallback chunking for ${fullOptions.language}: ${fullOptions.filePath}`);
  return chunkCodeSync(fullOptions);
}

/**
 * Synchronous chunking function - legacy fallback
 * Uses Babel for TypeScript/JavaScript, pattern matching for Python, token-based for others
 */
export function chunkCodeSync(options: ChunkOptions): CodeChunk[] {
  const fullOptions: Required<ChunkOptions> = {
    filePath: options.filePath,
    content: options.content,
    language: options.language,
    maxTokens: options.maxTokens || MAX_TOKENS_PER_CHUNK,
    chunkOverlapTokens: options.chunkOverlapTokens || DEFAULT_CHUNK_OVERLAP_TOKENS,
    maxChunkSize: options.maxChunkSize || 1000,
    chunkOverlap: options.chunkOverlap || 200,
  };
  
  // Route to appropriate chunking strategy based on language
  let chunks: CodeChunk[];
  
  if (fullOptions.language === "typescript" || fullOptions.language === "javascript") {
    chunks = chunkTypeScriptJavaScript(fullOptions);
  } else if (fullOptions.language === "python") {
    chunks = chunkPython(fullOptions);
  } else {
    // For all other languages, use token-based chunking
    chunks = chunkByTokens(fullOptions);
  }
  
  // Final validation: ensure no chunk exceeds the absolute maximum
  return validateAndLogChunks(chunks, fullOptions.filePath);
}

/**
 * Main chunking function - synchronous wrapper (for backward compatibility)
 * @deprecated Use chunkCodeAsync for better AST-based chunking
 */
export function chunkCode(options: ChunkOptions): CodeChunk[] {
  // For backward compatibility, use sync version
  // Note: This won't use AST chunking for Java/Kotlin/etc.
  // Use chunkCodeAsync for full AST support
  return chunkCodeSync(options);
}

/**
 * Validates chunks and logs warnings for any that are close to or exceed limits
 */
function validateAndLogChunks(chunks: CodeChunk[], filePath: string): CodeChunk[] {
  const result: CodeChunk[] = [];
  
  for (const chunk of chunks) {
    const tokenCount = chunk.tokenCount ?? countTokens(chunk.content);
    
    // Warning if chunk is getting close to limit
    if (tokenCount > MAX_TOKENS_PER_CHUNK) {
      console.error(
        `⚠️  Chunk in ${filePath} exceeds target limit: ${tokenCount} tokens (target: ${MAX_TOKENS_PER_CHUNK})`
      );
      
      // If it exceeds absolute maximum, split it further
      if (tokenCount > ABSOLUTE_MAX_TOKENS) {
        console.error(
          `❌ Chunk exceeds absolute maximum (${ABSOLUTE_MAX_TOKENS}), force splitting...`
        );
        const subChunks = splitLargeChunk(
          { ...chunk, tokenCount },
          ABSOLUTE_MAX_TOKENS,
          DEFAULT_CHUNK_OVERLAP_TOKENS
        );
        result.push(...subChunks);
        continue;
      }
    }
    
    result.push({ ...chunk, tokenCount });
  }
  
  return result;
}

/**
 * Chunks a file by reading it from disk
 */
export function chunkFile(
  filePath: string,
  language: string,
  maxTokens?: number,
  chunkOverlapTokens?: number
): CodeChunk[] {
  const content = fs.readFileSync(filePath, "utf-8");
  return chunkCode({
    filePath,
    content,
    language,
    maxTokens,
    chunkOverlapTokens,
  });
}

/**
 * Utility to check if content would fit in a single embedding
 */
export function wouldFitInSingleEmbedding(content: string, maxTokens = MAX_TOKENS_PER_CHUNK): boolean {
  return countTokens(content) <= maxTokens;
}

/**
 * Get the maximum tokens allowed per chunk
 */
export function getMaxTokensPerChunk(): number {
  return MAX_TOKENS_PER_CHUNK;
}
