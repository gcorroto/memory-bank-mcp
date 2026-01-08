/**
 * @fileoverview File scanner for Memory Bank
 * Scans workspace files respecting .gitignore and .memoryignore patterns
 */

import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import ignoreLib from "ignore";

// Handle ignore library export
const ignore = typeof ignoreLib === 'function' ? ignoreLib : (ignoreLib as any).default;

export interface FileMetadata {
  path: string;           // Relative path from workspace root
  absolutePath: string;   // Absolute path
  hash: string;           // SHA-256 hash of content
  size: number;           // File size in bytes
  mtime: Date;            // Last modified time
  language: string;       // Detected language from extension
  extension: string;      // File extension
}

export interface ScanOptions {
  rootPath: string;       // Root directory to scan
  recursive?: boolean;    // Scan recursively (default: true)
  includeHidden?: boolean; // Include hidden files (default: false)
  maxFileSize?: number;   // Max file size in bytes (default: 10MB)
}

// Language detection by file extension
const LANGUAGE_MAP: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".java": "java",
  ".c": "c",
  ".cpp": "cpp",
  ".cc": "cpp",
  ".cxx": "cpp",
  ".h": "c",
  ".hpp": "cpp",
  ".cs": "csharp",
  ".go": "go",
  ".rs": "rust",
  ".rb": "ruby",
  ".php": "php",
  ".swift": "swift",
  ".kt": "kotlin",
  ".kts": "kotlin",
  ".scala": "scala",
  ".r": "r",
  ".R": "r",
  ".sql": "sql",
  ".sh": "shell",
  ".bash": "shell",
  ".zsh": "shell",
  ".fish": "shell",
  ".md": "markdown",
  ".json": "json",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".xml": "xml",
  ".html": "html",
  ".htm": "html",
  ".css": "css",
  ".scss": "scss",
  ".sass": "sass",
  ".vue": "vue",
  ".svelte": "svelte",
};

// Binary file extensions to skip
const BINARY_EXTENSIONS = new Set([
  ".exe", ".dll", ".so", ".dylib", ".bin",
  ".pdf", ".jpg", ".jpeg", ".png", ".gif", ".svg", ".ico",
  ".mp3", ".mp4", ".avi", ".mov", ".wav",
  ".zip", ".tar", ".gz", ".rar", ".7z",
  ".db", ".sqlite", ".sqlite3",
  ".woff", ".woff2", ".ttf", ".eot",
  ".pyc", ".class", ".o", ".a",
]);

/**
 * Loads ignore patterns from .gitignore and .memoryignore files
 */
export function loadIgnorePatterns(rootPath: string): any {
  const ig = ignore();
  
  // Always ignore .git directory and .memorybank storage
  ig.add([".git", ".memorybank", "node_modules", "dist", "build", "out"]);
  
  // Load .gitignore if exists
  const gitignorePath = path.join(rootPath, ".gitignore");
  if (fs.existsSync(gitignorePath)) {
    try {
      const gitignoreContent = fs.readFileSync(gitignorePath, "utf-8");
      ig.add(gitignoreContent);
      console.error(`Loaded .gitignore patterns from ${gitignorePath}`);
    } catch (error) {
      console.error(`Warning: Could not read .gitignore: ${error}`);
    }
  }
  
  // Load .memoryignore if exists
  const memoryignorePath = path.join(rootPath, ".memoryignore");
  if (fs.existsSync(memoryignorePath)) {
    try {
      const memoryignoreContent = fs.readFileSync(memoryignorePath, "utf-8");
      ig.add(memoryignoreContent);
      console.error(`Loaded .memoryignore patterns from ${memoryignorePath}`);
    } catch (error) {
      console.error(`Warning: Could not read .memoryignore: ${error}`);
    }
  }
  
  return ig;
}

/**
 * Calculates SHA-256 hash of file content
 */
export function calculateFileHash(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(content).digest("hex");
}

/**
 * Detects language from file extension
 */
export function detectLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return LANGUAGE_MAP[ext] || "unknown";
}

/**
 * Checks if file is binary based on extension
 */
export function isBinaryFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

/**
 * Checks if file is a code file that should be indexed
 */
export function isCodeFile(filePath: string): boolean {
  if (isBinaryFile(filePath)) {
    return false;
  }
  
  const ext = path.extname(filePath).toLowerCase();
  
  // Check if it's a known code file
  if (LANGUAGE_MAP[ext]) {
    return true;
  }
  
  // Additional checks for files without extension or special cases
  const basename = path.basename(filePath);
  const codeFileNames = new Set([
    "Makefile", "Dockerfile", "Jenkinsfile", "Vagrantfile",
    "Rakefile", "Gemfile", "Podfile", "Fastfile",
  ]);
  
  return codeFileNames.has(basename);
}

/**
 * Recursively scans directory for code files
 */
function scanDirectoryRecursive(
  dirPath: string,
  rootPath: string,
  ig: any,
  options: Required<ScanOptions>,
  results: FileMetadata[]
): void {
  let entries: fs.Dirent[];
  
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch (error) {
    console.error(`Warning: Could not read directory ${dirPath}: ${error}`);
    return;
  }
  
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const relativePath = path.relative(rootPath, fullPath);
    
    // Skip hidden files if not included
    if (!options.includeHidden && entry.name.startsWith(".")) {
      continue;
    }
    
    // Check ignore patterns (use forward slashes for cross-platform compatibility)
    const relativePathForward = relativePath.split(path.sep).join("/");
    if (ig.ignores(relativePathForward)) {
      continue;
    }
    
    if (entry.isDirectory()) {
      if (options.recursive) {
        scanDirectoryRecursive(fullPath, rootPath, ig, options, results);
      }
    } else if (entry.isFile()) {
      try {
        // Check if it's a code file
        if (!isCodeFile(fullPath)) {
          continue;
        }
        
        const stats = fs.statSync(fullPath);
        
        // Check file size limit
        if (stats.size > options.maxFileSize) {
          console.error(`Skipping large file (${stats.size} bytes): ${relativePath}`);
          continue;
        }
        
        // Calculate hash and collect metadata
        const hash = calculateFileHash(fullPath);
        const language = detectLanguage(fullPath);
        const extension = path.extname(fullPath);
        
        results.push({
          path: relativePath,
          absolutePath: fullPath,
          hash,
          size: stats.size,
          mtime: stats.mtime,
          language,
          extension,
        });
      } catch (error) {
        console.error(`Warning: Could not process file ${fullPath}: ${error}`);
      }
    }
  }
}

/**
 * Scans workspace for code files
 */
export function scanFiles(options: ScanOptions): FileMetadata[] {
  const fullOptions: Required<ScanOptions> = {
    rootPath: options.rootPath,
    recursive: options.recursive !== undefined ? options.recursive : true,
    includeHidden: options.includeHidden !== undefined ? options.includeHidden : false,
    maxFileSize: options.maxFileSize || 10 * 1024 * 1024, // 10MB default
  };
  
  // Validate root path
  if (!fs.existsSync(fullOptions.rootPath)) {
    throw new Error(`Root path does not exist: ${fullOptions.rootPath}`);
  }
  
  const stats = fs.statSync(fullOptions.rootPath);
  if (!stats.isDirectory()) {
    throw new Error(`Root path is not a directory: ${fullOptions.rootPath}`);
  }
  
  console.error(`Scanning files in: ${fullOptions.rootPath}`);
  
  // Load ignore patterns
  const ig = loadIgnorePatterns(fullOptions.rootPath);
  
  // Scan files
  const results: FileMetadata[] = [];
  scanDirectoryRecursive(
    fullOptions.rootPath,
    fullOptions.rootPath,
    ig,
    fullOptions,
    results
  );
  
  console.error(`Found ${results.length} code files to index`);
  
  return results;
}

/**
 * Scans a single file and returns its metadata
 */
export function scanSingleFile(filePath: string, rootPath: string): FileMetadata | null {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File does not exist: ${filePath}`);
    }
    
    const stats = fs.statSync(filePath);
    if (!stats.isFile()) {
      throw new Error(`Path is not a file: ${filePath}`);
    }
    
    if (!isCodeFile(filePath)) {
      return null;
    }
    
    const hash = calculateFileHash(filePath);
    const language = detectLanguage(filePath);
    const extension = path.extname(filePath);
    const relativePath = path.relative(rootPath, filePath);
    
    return {
      path: relativePath,
      absolutePath: filePath,
      hash,
      size: stats.size,
      mtime: stats.mtime,
      language,
      extension,
    };
  } catch (error) {
    console.error(`Error scanning file ${filePath}: ${error}`);
    return null;
  }
}
