/**
 * @fileoverview AST-based code chunker using Tree-sitter
 * Provides intelligent semantic chunking for multiple programming languages
 * using Abstract Syntax Tree parsing via WebAssembly
 */

import * as path from "path";
import * as fs from "fs";
import * as crypto from "crypto";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { encode } from "gpt-tokenizer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

// Tree-sitter types
interface TreeSitterNode {
  type: string;
  text: string;
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  children: TreeSitterNode[];
  childCount: number;
  namedChildCount: number;
  namedChildren: TreeSitterNode[];
  parent: TreeSitterNode | null;
  childForFieldName(name: string): TreeSitterNode | null;
}

interface TreeSitterTree {
  rootNode: TreeSitterNode;
}

interface TreeSitterParser {
  setLanguage(language: any): void;
  parse(input: string): TreeSitterTree;
}

// Chunk types
export interface ASTCodeChunk {
  id: string;
  filePath: string;
  content: string;
  startLine: number;
  endLine: number;
  chunkType: "function" | "class" | "method" | "interface" | "module" | "block" | "file";
  name?: string;
  language: string;
  context?: string;
  tokenCount?: number;
  parentName?: string;  // For methods: the class they belong to
}

export interface ASTChunkOptions {
  filePath: string;
  content: string;
  language: string;
  maxTokens?: number;
  chunkOverlapTokens?: number;
}

// Constants
const MAX_TOKENS_PER_CHUNK = 6000;
const DEFAULT_CHUNK_OVERLAP_TOKENS = 200;
const ABSOLUTE_MAX_TOKENS = 7500;

// Language to WASM file mapping
const LANGUAGE_WASM_MAP: Record<string, string> = {
  "typescript": "tree-sitter-typescript.wasm",
  "javascript": "tree-sitter-javascript.wasm",
  "tsx": "tree-sitter-tsx.wasm",
  "jsx": "tree-sitter-javascript.wasm",
  "python": "tree-sitter-python.wasm",
  "java": "tree-sitter-java.wasm",
  "kotlin": "tree-sitter-kotlin.wasm",
  "go": "tree-sitter-go.wasm",
  "rust": "tree-sitter-rust.wasm",
  "csharp": "tree-sitter-c_sharp.wasm",
  "c": "tree-sitter-c.wasm",
  "cpp": "tree-sitter-cpp.wasm",
  "ruby": "tree-sitter-ruby.wasm",
  "php": "tree-sitter-php.wasm",
  "scala": "tree-sitter-scala.wasm",
  "swift": "tree-sitter-swift.wasm",
  "dart": "tree-sitter-dart.wasm",
  "elixir": "tree-sitter-elixir.wasm",
  "lua": "tree-sitter-lua.wasm",
  "shell": "tree-sitter-bash.wasm",
  "bash": "tree-sitter-bash.wasm",
  "html": "tree-sitter-html.wasm",
  "css": "tree-sitter-css.wasm",
  "json": "tree-sitter-json.wasm",
  "yaml": "tree-sitter-yaml.wasm",
  "vue": "tree-sitter-vue.wasm",
  "zig": "tree-sitter-zig.wasm",
};

// Node types that represent "semantic units" we want to extract by language
const SEMANTIC_NODE_TYPES: Record<string, string[]> = {
  "java": [
    "class_declaration",
    "interface_declaration",
    "enum_declaration",
    "method_declaration",
    "constructor_declaration",
    "annotation_type_declaration",
  ],
  "kotlin": [
    "class_declaration",
    "object_declaration",
    "function_declaration",
    "property_declaration",
    "companion_object",
  ],
  "typescript": [
    "class_declaration",
    "function_declaration",
    "method_definition",
    "arrow_function",
    "interface_declaration",
    "type_alias_declaration",
    "export_statement",
  ],
  "javascript": [
    "class_declaration",
    "function_declaration",
    "method_definition",
    "arrow_function",
    "export_statement",
  ],
  "python": [
    "class_definition",
    "function_definition",
    "decorated_definition",
  ],
  "go": [
    "function_declaration",
    "method_declaration",
    "type_declaration",
    "type_spec",
  ],
  "rust": [
    "function_item",
    "impl_item",
    "struct_item",
    "enum_item",
    "trait_item",
    "mod_item",
  ],
  "csharp": [
    "class_declaration",
    "method_declaration",
    "interface_declaration",
    "struct_declaration",
    "property_declaration",
  ],
  "php": [
    "class_declaration",
    "method_declaration",
    "function_definition",
    "interface_declaration",
  ],
  "ruby": [
    "class",
    "method",
    "module",
    "singleton_method",
  ],
  "scala": [
    "class_definition",
    "object_definition",
    "function_definition",
    "trait_definition",
  ],
  "swift": [
    "class_declaration",
    "function_declaration",
    "protocol_declaration",
    "struct_declaration",
  ],
};

// Cache for loaded languages
// Using 'any' types because web-tree-sitter's TypeScript types don't work well with dynamic imports
let ParserClass: any = null;
let LanguageClass: any = null;
const loadedLanguages: Map<string, any> = new Map();
let treeSitterInitialized = false;

/**
 * Counts tokens in text using tiktoken-compatible tokenizer
 */
function countTokens(text: string): number {
  try {
    return encode(text).length;
  } catch {
    return Math.ceil(text.length / 4);
  }
}

/**
 * Generates unique ID for a chunk
 */
function generateChunkId(filePath: string, content: string, startLine: number): string {
  const data = `${filePath}:${startLine}:${content.substring(0, 500)}`;
  return crypto.createHash("sha256").update(data).digest("hex").substring(0, 16);
}

/**
 * Initializes Tree-sitter WASM module
 */
async function initTreeSitter(): Promise<boolean> {
  if (treeSitterInitialized && ParserClass && LanguageClass) {
    return true;
  }

  try {
    // Dynamic import of web-tree-sitter
    const TreeSitterModule = await import("web-tree-sitter") as any;
    
    // Handle different export formats across web-tree-sitter versions:
    // - v0.20.x: exports Parser as default, Language is Parser.Language
    // - v0.26.x: exports Parser and Language as separate named exports
    if (TreeSitterModule.Parser) {
      // v0.26.x style: named exports
      ParserClass = TreeSitterModule.Parser;
      LanguageClass = TreeSitterModule.Language;
    } else if (TreeSitterModule.default) {
      // v0.20.x style: default export is Parser, Language is a static property
      ParserClass = TreeSitterModule.default;
      LanguageClass = null; // Will use ParserClass.Language after init
    } else {
      throw new Error('Could not find Parser in web-tree-sitter module');
    }
    
    if (!ParserClass) {
      throw new Error('Parser class not found in web-tree-sitter module');
    }
    
    // Initialize the WASM module
    if (typeof ParserClass.init === 'function') {
      await ParserClass.init();
    }
    
    // For v0.20.x, Language becomes available after init
    if (!LanguageClass && ParserClass.Language) {
      LanguageClass = ParserClass.Language;
    }
    
    if (!LanguageClass) {
      throw new Error('Language class not found in web-tree-sitter module');
    }
    
    treeSitterInitialized = true;
    console.error("[AST Chunker] Tree-sitter initialized successfully");
    return true;
  } catch (error) {
    console.error(`[AST Chunker] Failed to initialize Tree-sitter: ${error}`);
    treeSitterInitialized = false;
    ParserClass = null;
    LanguageClass = null;
    return false;
  }
}

/**
 * Gets the WASM file path for a language
 */
function getWasmPath(language: string): string | null {
  const wasmFile = LANGUAGE_WASM_MAP[language.toLowerCase()];
  if (!wasmFile) {
    return null;
  }

  // Build comprehensive list of possible paths
  // The compiled JS runs from dist/common/, so we need to account for various scenarios:
  // 1. Local development: dist/common/../node_modules = dist/node_modules (wrong)
  // 2. Local development: __dirname/../../node_modules = node_modules (correct)
  // 3. NPM installed package: need to resolve from the package location
  // 4. Global install or monorepo: process.cwd() based paths
  
  const possiblePaths: string[] = [
    // From dist/common/ go up two levels to project root then into node_modules
    path.join(__dirname, "..", "..", "node_modules", "tree-sitter-wasms", "out", wasmFile),
    // From current working directory
    path.join(process.cwd(), "node_modules", "tree-sitter-wasms", "out", wasmFile),
    // From dist/ go up one level (in case __dirname is dist/)
    path.join(__dirname, "..", "node_modules", "tree-sitter-wasms", "out", wasmFile),
    // Three levels up (for nested structures like dist/common/subdir)
    path.join(__dirname, "..", "..", "..", "node_modules", "tree-sitter-wasms", "out", wasmFile),
  ];

  // Try to use require.resolve to find the package (works in most Node.js scenarios)
  try {
    const treeSitterWasmsPath = require.resolve("tree-sitter-wasms/package.json");
    const packageDir = path.dirname(treeSitterWasmsPath);
    possiblePaths.unshift(path.join(packageDir, "out", wasmFile));
  } catch {
    // Package not found via require.resolve, continue with file-based search
  }

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  console.error(`[AST Chunker] WASM file not found for ${language}: ${wasmFile}`);
  console.error(`[AST Chunker] Searched paths: ${possiblePaths.map(p => `\n  - ${p}`).join('')}`);
  return null;
}

/**
 * Loads a language parser
 */
async function loadLanguage(language: string): Promise<any | null> {
  if (!ParserClass || !LanguageClass) {
    console.error("[AST Chunker] Parser or Language not initialized");
    return null;
  }

  const langKey = language.toLowerCase();
  
  if (loadedLanguages.has(langKey)) {
    return loadedLanguages.get(langKey) || null;
  }

  const wasmPath = getWasmPath(langKey);
  if (!wasmPath) {
    return null;
  }

  console.error(`[AST Chunker] Attempting to load WASM from: ${wasmPath}`);

  try {
    // Use the Language.load static method
    const lang = await LanguageClass.load(wasmPath);
    loadedLanguages.set(langKey, lang);
    console.error(`[AST Chunker] Loaded language: ${language}`);
    return lang;
  } catch (error) {
    console.error(`[AST Chunker] Failed to load language ${language}: ${error instanceof Error ? error.message : error}`);
    if (error instanceof Error && error.stack) {
      console.error(`[AST Chunker] Stack: ${error.stack}`);
    }
    return null;
  }
}

/**
 * Extracts the name of a node based on language and node type
 */
function extractNodeName(node: TreeSitterNode, language: string): string | undefined {
  // Try common patterns for different languages
  const namePatterns = [
    () => node.childForFieldName("name")?.text,
    () => node.childForFieldName("identifier")?.text,
    () => node.namedChildren.find(c => c.type === "identifier")?.text,
    () => node.namedChildren.find(c => c.type === "name")?.text,
    () => node.namedChildren.find(c => c.type === "type_identifier")?.text,
    () => {
      // For Java/Kotlin methods, the name is often the first identifier
      if (language === "java" || language === "kotlin") {
        for (const child of node.namedChildren) {
          if (child.type === "identifier") {
            return child.text;
          }
        }
      }
      return undefined;
    },
  ];

  for (const pattern of namePatterns) {
    const name = pattern();
    if (name) return name;
  }

  return undefined;
}

/**
 * Gets the parent class/interface name for a method
 */
function getParentClassName(node: TreeSitterNode): string | undefined {
  let current = node.parent;
  while (current) {
    if (
      current.type.includes("class") ||
      current.type.includes("interface") ||
      current.type.includes("struct") ||
      current.type.includes("impl") ||
      current.type === "object_declaration"
    ) {
      return extractNodeName(current, "");
    }
    current = current.parent;
  }
  return undefined;
}

/**
 * Determines chunk type from AST node type
 */
function getChunkType(nodeType: string): ASTCodeChunk["chunkType"] {
  if (nodeType.includes("class") || nodeType.includes("struct")) return "class";
  if (nodeType.includes("interface") || nodeType.includes("trait") || nodeType.includes("protocol")) return "interface";
  if (nodeType.includes("method")) return "method";
  if (nodeType.includes("function") || nodeType.includes("arrow")) return "function";
  if (nodeType.includes("module") || nodeType.includes("mod")) return "module";
  return "block";
}

/**
 * Recursively finds all semantic nodes in the AST
 */
function findSemanticNodes(
  node: TreeSitterNode,
  language: string,
  sourceLines: string[],
  results: Array<{
    node: TreeSitterNode;
    type: string;
    name?: string;
    parentName?: string;
    startLine: number;
    endLine: number;
    content: string;
  }>
): void {
  const semanticTypes = SEMANTIC_NODE_TYPES[language] || [];

  if (semanticTypes.includes(node.type)) {
    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;
    const content = sourceLines.slice(startLine - 1, endLine).join("\n");
    const name = extractNodeName(node, language);
    const parentName = getParentClassName(node);

    results.push({
      node,
      type: node.type,
      name,
      parentName,
      startLine,
      endLine,
      content,
    });
  }

  // Recurse into children
  for (const child of node.namedChildren) {
    findSemanticNodes(child, language, sourceLines, results);
  }
}

/**
 * Extracts context (imports, package declarations, etc.) from source
 */
function extractContext(content: string, language: string): string {
  const lines = content.split("\n");
  const contextLines: string[] = [];
  const maxContextLines = 15;

  const importPatterns: Record<string, RegExp[]> = {
    java: [/^package\s/, /^import\s/],
    kotlin: [/^package\s/, /^import\s/],
    typescript: [/^import\s/, /^export\s.*from/],
    javascript: [/^import\s/, /^export\s.*from/, /^const\s+\w+\s*=\s*require/],
    python: [/^import\s/, /^from\s+\w+\s+import/],
    go: [/^package\s/, /^import\s/],
    rust: [/^use\s/, /^mod\s/],
    csharp: [/^using\s/, /^namespace\s/],
    php: [/^namespace\s/, /^use\s/],
    ruby: [/^require\s/, /^require_relative\s/],
    scala: [/^package\s/, /^import\s/],
    swift: [/^import\s/],
  };

  const patterns = importPatterns[language] || [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const isImport = patterns.some(p => p.test(trimmed));
    const isComment = trimmed.startsWith("//") || trimmed.startsWith("#") || 
                      trimmed.startsWith("/*") || trimmed.startsWith("*");

    if (isImport || isComment) {
      contextLines.push(line);
      if (contextLines.length >= maxContextLines) break;
    } else if (contextLines.length > 0 && !isImport) {
      // Stop when we hit non-import code
      break;
    }
  }

  return contextLines.join("\n");
}

/**
 * Splits a chunk that exceeds token limit
 */
function splitLargeChunk(
  chunk: ASTCodeChunk,
  maxTokens: number,
  overlapTokens: number
): ASTCodeChunk[] {
  const tokenCount = countTokens(chunk.content);
  
  if (tokenCount <= maxTokens) {
    return [{ ...chunk, tokenCount }];
  }

  console.error(
    `[AST Chunker] Splitting large chunk: ${chunk.filePath} (${chunk.name || "unnamed"}) - ${tokenCount} tokens`
  );

  const subChunks: ASTCodeChunk[] = [];
  const lines = chunk.content.split("\n");
  
  let currentLines: string[] = [];
  let currentTokens = 0;
  let subChunkStartLine = chunk.startLine;
  let subChunkIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineTokens = countTokens(line + "\n");

    if (currentTokens + lineTokens > maxTokens && currentLines.length > 0) {
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
        parentName: chunk.parentName,
      });

      subChunkIndex++;

      // Calculate overlap
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
      parentName: chunk.parentName,
    });
  }

  console.error(`[AST Chunker] Split into ${subChunks.length} sub-chunks`);
  return subChunks;
}

/**
 * Main AST-based chunking function
 */
export async function chunkWithAST(options: ASTChunkOptions): Promise<ASTCodeChunk[]> {
  const maxTokens = options.maxTokens || MAX_TOKENS_PER_CHUNK;
  const overlapTokens = options.chunkOverlapTokens || DEFAULT_CHUNK_OVERLAP_TOKENS;
  const language = options.language.toLowerCase();

  // Initialize Tree-sitter
  const initialized = await initTreeSitter();
  if (!initialized) {
    console.error(`[AST Chunker] Tree-sitter not available, falling back to token-based chunking`);
    return [];  // Return empty to signal fallback needed
  }

  // Load language
  const lang = await loadLanguage(language);
  if (!lang) {
    console.error(`[AST Chunker] Language ${language} not supported, falling back`);
    return [];  // Return empty to signal fallback needed
  }

  // Create parser and parse
  if (!ParserClass) {
    console.error(`[AST Chunker] Parser class not available`);
    return [];
  }
  
  const parser = new ParserClass();
  parser.setLanguage(lang);
  
  let tree: TreeSitterTree;
  try {
    tree = parser.parse(options.content);
  } catch (error) {
    console.error(`[AST Chunker] Parse error for ${options.filePath}: ${error}`);
    return [];  // Fallback needed
  }

  const sourceLines = options.content.split("\n");
  const context = extractContext(options.content, language);

  // Find all semantic nodes
  const semanticNodes: Array<{
    node: TreeSitterNode;
    type: string;
    name?: string;
    parentName?: string;
    startLine: number;
    endLine: number;
    content: string;
  }> = [];

  findSemanticNodes(tree.rootNode, language, sourceLines, semanticNodes);

  console.error(`[AST Chunker] Found ${semanticNodes.length} semantic nodes in ${options.filePath}`);

  // If no semantic nodes found, treat as single file chunk
  if (semanticNodes.length === 0) {
    const tokenCount = countTokens(options.content);
    const chunk: ASTCodeChunk = {
      id: generateChunkId(options.filePath, options.content, 1),
      filePath: options.filePath,
      content: options.content,
      startLine: 1,
      endLine: sourceLines.length,
      chunkType: "file",
      language: options.language,
      context,
      tokenCount,
    };

    // Split if too large
    if (tokenCount > maxTokens) {
      return splitLargeChunk(chunk, maxTokens, overlapTokens);
    }
    return [chunk];
  }

  // Convert semantic nodes to chunks
  const chunks: ASTCodeChunk[] = [];

  for (const node of semanticNodes) {
    const tokenCount = countTokens(node.content);
    const chunkType = getChunkType(node.type);

    const chunk: ASTCodeChunk = {
      id: generateChunkId(options.filePath, node.content, node.startLine),
      filePath: options.filePath,
      content: node.content,
      startLine: node.startLine,
      endLine: node.endLine,
      chunkType,
      name: node.name,
      language: options.language,
      context,
      tokenCount,
      parentName: node.parentName,
    };

    // Split if chunk is too large
    if (tokenCount > maxTokens) {
      const subChunks = splitLargeChunk(chunk, maxTokens, overlapTokens);
      chunks.push(...subChunks);
    } else {
      chunks.push(chunk);
    }
  }

  // Final validation
  const validatedChunks: ASTCodeChunk[] = [];
  for (const chunk of chunks) {
    const tokens = chunk.tokenCount ?? countTokens(chunk.content);
    
    if (tokens > ABSOLUTE_MAX_TOKENS) {
      console.error(`[AST Chunker] ⚠️ Chunk still exceeds absolute max, force splitting: ${chunk.name}`);
      const subChunks = splitLargeChunk(chunk, ABSOLUTE_MAX_TOKENS, overlapTokens);
      validatedChunks.push(...subChunks);
    } else {
      validatedChunks.push({ ...chunk, tokenCount: tokens });
    }
  }

  console.error(`[AST Chunker] Created ${validatedChunks.length} chunks from ${options.filePath}`);
  return validatedChunks;
}

/**
 * Checks if a language is supported by AST chunking
 */
export function isLanguageSupportedByAST(language: string): boolean {
  return LANGUAGE_WASM_MAP.hasOwnProperty(language.toLowerCase());
}

/**
 * Gets list of supported languages
 */
export function getSupportedLanguages(): string[] {
  return Object.keys(LANGUAGE_WASM_MAP);
}

/**
 * Cleanup function to free Tree-sitter resources
 */
export function disposeASTChunker(): void {
  loadedLanguages.clear();
  treeSitterInitialized = false;
  ParserClass = null;
  LanguageClass = null;
  console.error("[AST Chunker] Disposed");
}
