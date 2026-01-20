/**
 * @fileoverview Index manager for Memory Bank
 * Coordinates scanning, chunking, embedding, and storage
 */

import * as fs from "fs";
import * as path from "path";
import { scanFiles, scanSingleFile, FileMetadata } from "./fileScanner.js";
import { chunkCodeAsync, CodeChunk } from "./chunker.js";
import { EmbeddingService } from "./embeddingService.js";
import { VectorStore, ChunkRecord } from "./vectorStore.js";
import { ProjectKnowledgeService, GenerationResult } from "./projectKnowledgeService.js";

/**
 * Normalizes a path to use forward slashes for consistent cross-platform behavior
 */
function normalizePath(filePath: string): string {
  return filePath.split(path.sep).join('/');
}

export interface IndexMetadata {
  version: string;
  lastIndexed: number;
  files: Record<string, {
    hash: string;
    lastIndexed: number;
    chunkCount: number;
  }>;
}

export interface IndexStats {
  totalFiles: number;
  totalChunks: number;
  lastIndexed?: Date;
  languages: Record<string, number>;
  pendingFiles?: string[];
}

export interface IndexOptions {
  rootPath: string;               // Directory/file to index
  workspaceRoot?: string;         // Workspace root for consistent path normalization
  forceReindex?: boolean;
  recursive?: boolean;
  projectId?: string;             // Project ID for multi-project support
  autoUpdateDocs?: boolean;       // Auto-update project docs after indexing
}

/**
 * Result of indexing with optional doc generation
 */
export interface IndexResult {
  filesProcessed: number;
  changedFiles: string[];
  chunksCreated: number;
  errors: string[];
  duration: number;
  docsGeneration?: GenerationResult;
}

/**
 * Index manager coordinating the entire indexing pipeline
 */
export class IndexManager {
  private embeddingService: EmbeddingService;
  private vectorStore: VectorStore;
  private metadataPath: string;
  private metadata: IndexMetadata;
  private projectKnowledgeService: ProjectKnowledgeService | null = null;
  private autoUpdateDocs: boolean = false;
  
  constructor(
    embeddingService: EmbeddingService,
    vectorStore: VectorStore,
    storagePath: string = ".memorybank"
  ) {
    this.embeddingService = embeddingService;
    this.vectorStore = vectorStore;
    this.metadataPath = path.join(storagePath, "index-metadata.json");
    this.metadata = this.loadMetadata();
    
    // Check if auto-update docs is enabled via environment variable
    this.autoUpdateDocs = process.env.MEMORYBANK_AUTO_UPDATE_DOCS === "true";
  }
  
  /**
   * Sets the Project Knowledge Service for auto-generating docs
   */
  setProjectKnowledgeService(service: ProjectKnowledgeService): void {
    this.projectKnowledgeService = service;
    console.error("Project Knowledge Service attached to Index Manager");
  }

  /**
   * Gets the Embedding Service instance
   */
  getEmbeddingService(): EmbeddingService {
    return this.embeddingService;
  }
  
  /**
   * Enables or disables auto-update of project docs after indexing
   */
  setAutoUpdateDocs(enabled: boolean): void {
    this.autoUpdateDocs = enabled;
    console.error(`Auto-update project docs: ${enabled ? "enabled" : "disabled"}`);
  }
  
  /**
   * Loads index metadata from disk
   */
  private loadMetadata(): IndexMetadata {
    try {
      console.error(`Loading metadata from: ${this.metadataPath}`);
      if (fs.existsSync(this.metadataPath)) {
        const data = fs.readFileSync(this.metadataPath, "utf-8");
        const metadata = JSON.parse(data);
        const fileCount = Object.keys(metadata.files || {}).length;
        console.error(`Loaded metadata: ${fileCount} files tracked`);
        return metadata;
      } else {
        console.error(`Metadata file not found: ${this.metadataPath}`);
      }
    } catch (error) {
      console.error(`Warning: Could not load index metadata: ${error}`);
    }
    
    return {
      version: "1.0",
      lastIndexed: 0,
      files: {},
    };
  }
  
  /**
   * Saves index metadata to disk
   */
  private saveMetadata(): void {
    try {
      const dir = path.dirname(this.metadataPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      const fileCount = Object.keys(this.metadata.files).length;
      fs.writeFileSync(this.metadataPath, JSON.stringify(this.metadata, null, 2));
      console.error(`  Saved metadata: ${fileCount} files tracked → ${this.metadataPath}`);
    } catch (error) {
      console.error(`Warning: Could not save index metadata: ${error}`);
    }
  }
  
  /**
   * Checks if a file needs reindexing
   */
  private needsReindexing(file: FileMetadata, forceReindex: boolean): boolean {
    if (forceReindex) {
      return true;
    }
    
    // Use normalized path for consistent lookup
    const normalizedPath = normalizePath(file.path);
    const fileInfo = this.metadata.files[normalizedPath];
    
    if (!fileInfo) {
      // Debug: show first few new files
      const trackedCount = Object.keys(this.metadata.files).length;
      if (trackedCount === 0) {
        console.error(`  New file (no metadata): ${normalizedPath}`);
      }
      return true; // New file
    }
    
    if (fileInfo.hash !== file.hash) {
      console.error(`  Changed file: ${normalizedPath}`);
      console.error(`    Stored hash: ${fileInfo.hash.substring(0, 16)}...`);
      console.error(`    Current hash: ${file.hash.substring(0, 16)}...`);
      return true; // File changed
    }
    
    return false;
  }
  
  /**
   * Indexes a single file
   */
  async indexFile(
    file: FileMetadata,
    forceReindex: boolean = false,
    projectId: string = "default"
  ): Promise<{ chunksCreated: number; error?: string }> {
    try {
      // Check if file needs reindexing
      if (!this.needsReindexing(file, forceReindex)) {
        console.error(`Skipping ${file.path} (no changes)`);
        return { chunksCreated: 0 };
      }
      
      console.error(`Indexing: ${file.path}`);
      
      // Read file content
      const content = fs.readFileSync(file.absolutePath, "utf-8");
      
      // Get token limits from environment or use defaults
      // text-embedding-3-small has 8192 token limit, default to 6000 for safety
      const maxTokens = parseInt(process.env.MEMORYBANK_MAX_TOKENS || "6000");
      const chunkOverlapTokens = parseInt(process.env.MEMORYBANK_CHUNK_OVERLAP_TOKENS || "200");
      
      // Chunk the code using AST-based chunking (with fallback to token-based)
      const chunks = await chunkCodeAsync({
        filePath: file.path,
        content,
        language: file.language,
        maxTokens,
        chunkOverlapTokens,
      });
      
      if (chunks.length === 0) {
        console.error(`Warning: No chunks created for ${file.path}`);
        return { chunksCreated: 0 };
      }
      
      console.error(`  Created ${chunks.length} chunks`);
      
      // Generate embeddings
      const embeddingInputs = chunks.map((chunk) => ({
        id: chunk.id,
        content: chunk.content,
      }));
      
      const embeddings = await this.embeddingService.generateBatchEmbeddings(
        embeddingInputs
      );
      
      console.error(`  Generated ${embeddings.length} embeddings`);
      
      // Prepare chunk records for storage (using snake_case for LanceDB)
      // Note: All fields must have non-undefined values for LanceDB Arrow conversion
      const timestamp = Date.now();
      const normalizedFilePath = normalizePath(file.path);
      console.error(`  Storing chunks with project_id: '${projectId}', file: '${normalizedFilePath}'`);
      const chunkRecords: ChunkRecord[] = chunks.map((chunk, i) => ({
        id: chunk.id,
        vector: embeddings[i].vector,
        file_path: normalizedFilePath,    // Use normalized path for consistency
        content: chunk.content,
        start_line: chunk.startLine,
        end_line: chunk.endLine,
        chunk_type: chunk.chunkType,
        name: chunk.name || "",           // Ensure non-undefined for LanceDB
        language: chunk.language,
        file_hash: file.hash,
        timestamp,
        context: chunk.context || "",     // Ensure non-undefined for LanceDB
        project_id: projectId,
      }));
      
      // Delete old chunks for this file using normalized path
      await this.vectorStore.deleteChunksByFile(normalizedFilePath);
      
      // Insert new chunks
      await this.vectorStore.insertChunks(chunkRecords);
      
      console.error(`  Stored ${chunkRecords.length} chunks in vector store`);
      
      // Update metadata with normalized path for consistent lookups
      this.metadata.files[normalizedFilePath] = {
        hash: file.hash,
        lastIndexed: timestamp,
        chunkCount: chunks.length,
      };
      this.metadata.lastIndexed = timestamp;
      this.saveMetadata();
      
      return { chunksCreated: chunks.length };
    } catch (error) {
      const errorMsg = `Error indexing ${file.path}: ${error}`;
      console.error(errorMsg);
      return { chunksCreated: 0, error: errorMsg };
    }
  }
  
  /**
   * Derives a project ID from the root path if not provided
   */
  private deriveProjectId(rootPath: string, providedId?: string): string {
    if (providedId) {
      return providedId;
    }
    
    // Use the directory name as project ID
    const dirName = path.basename(path.resolve(rootPath));
    // Sanitize: remove special chars, lowercase, replace spaces with dashes
    const sanitized = dirName
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    
    return sanitized || "default";
  }
  
  /**
   * Indexes multiple files or a directory
   */
  async indexFiles(options: IndexOptions): Promise<IndexResult> {
    const startTime = Date.now();
    const projectId = this.deriveProjectId(options.rootPath, options.projectId);
    const shouldAutoUpdateDocs = options.autoUpdateDocs !== undefined 
      ? options.autoUpdateDocs 
      : this.autoUpdateDocs;
    
    // Use workspaceRoot for consistent path normalization, fallback to rootPath
    const workspaceRoot = options.workspaceRoot || options.rootPath;
    
    console.error(`\n=== Starting indexing process ===`);
    console.error(`Root path: ${options.rootPath}`);
    console.error(`Workspace root: ${workspaceRoot}`);
    console.error(`Project ID: ${projectId}`);
    console.error(`Force reindex: ${options.forceReindex || false}`);
    console.error(`Auto-update docs: ${shouldAutoUpdateDocs}`);
    
    // Initialize vector store
    await this.vectorStore.initialize();
    
    // Scan files - always use workspaceRoot for consistent relative paths
    console.error(`\nScanning files...`);
    const files = scanFiles({
      rootPath: options.rootPath,
      recursive: options.recursive !== undefined ? options.recursive : true,
    });
    
    // Normalize paths to be relative to workspaceRoot, not rootPath
    // This ensures consistent paths in metadata regardless of which subfolder was indexed
    if (workspaceRoot !== options.rootPath) {
      const rootPathResolved = path.resolve(options.rootPath);
      const workspaceRootResolved = path.resolve(workspaceRoot);
      
      for (const file of files) {
        // Convert path from relative-to-rootPath to relative-to-workspaceRoot
        const absolutePath = path.join(rootPathResolved, file.path);
        file.path = path.relative(workspaceRootResolved, absolutePath);
        // Use forward slashes for consistency
        file.path = file.path.split(path.sep).join('/');
      }
      console.error(`  Normalized ${files.length} file paths to workspace root`);
    }
    
    if (files.length === 0) {
      console.error("No files found to index");
      return {
        filesProcessed: 0,
        changedFiles: [],
        chunksCreated: 0,
        errors: [],
        duration: Date.now() - startTime,
      };
    }
    
    // Filter files that need reindexing
    const filesToIndex = files.filter((file) =>
      this.needsReindexing(file, options.forceReindex || false)
    );
    
    console.error(`\nFound ${files.length} files, ${filesToIndex.length} need indexing`);
    
    if (filesToIndex.length === 0) {
      console.error("All files are up to date");
      return {
        filesProcessed: 0,
        changedFiles: [],
        chunksCreated: 0,
        errors: [],
        duration: Date.now() - startTime,
      };
    }
    
    // Index files
    const errors: string[] = [];
    const changedFiles: string[] = [];
    let totalChunks = 0;
    let processedFiles = 0;
    
    for (let i = 0; i < filesToIndex.length; i++) {
      const file = filesToIndex[i];
      console.error(`\n[${i + 1}/${filesToIndex.length}] Processing ${file.path}`);
      
      const result = await this.indexFile(file, options.forceReindex || false, projectId);
      
      if (result.error) {
        errors.push(result.error);
      } else {
        processedFiles++;
        totalChunks += result.chunksCreated;
        changedFiles.push(file.path);
      }
    }
    
    const indexDuration = Date.now() - startTime;
    
    console.error(`\n=== Indexing complete ===`);
    console.error(`Files processed: ${processedFiles}`);
    console.error(`Chunks created: ${totalChunks}`);
    console.error(`Errors: ${errors.length}`);
    console.error(`Duration: ${(indexDuration / 1000).toFixed(2)}s`);
    
    // Run post-indexing hook to update project documentation
    let docsGeneration: GenerationResult | undefined;
    
    if (shouldAutoUpdateDocs && this.projectKnowledgeService && changedFiles.length > 0) {
      console.error(`\n=== Updating project documentation ===`);
      
      try {
        // Get all chunks for the project
        const allChunks = await this.vectorStore.getAllChunks(projectId);
        
        // Update docs incrementally based on changed files
        docsGeneration = await this.projectKnowledgeService.updateDocuments(
          projectId,
          allChunks,
          changedFiles
        );
        
        console.error(`Docs updated: ${docsGeneration.documentsUpdated.length}`);
        console.error(`Docs generated: ${docsGeneration.documentsGenerated.length}`);
        console.error(`Reasoning tokens: ${docsGeneration.totalReasoningTokens}`);
      } catch (error: any) {
        console.error(`Warning: Failed to update project docs: ${error.message}`);
        errors.push(`Project docs update failed: ${error.message}`);
      }
    }
    
    const totalDuration = Date.now() - startTime;
    
    // Update project config with sourcePath if projectKnowledgeService is available
    if (this.projectKnowledgeService && processedFiles > 0) {
      try {
        // Calculate relative path from memorybank to the indexed project folder
        const rootPathResolved = path.resolve(options.rootPath);
        const workspaceRootResolved = path.resolve(workspaceRoot);
        const relativePath = path.relative(workspaceRootResolved, rootPathResolved);
        // Use forward slashes for consistency
        const normalizedSourcePath = relativePath.split(path.sep).join('/');
        
        this.projectKnowledgeService.updateProjectConfig(projectId, {
          sourcePath: normalizedSourcePath,
          lastIndexed: Date.now(),
        });
        
        console.error(`Updated project config: sourcePath=${normalizedSourcePath}`);
      } catch (error: any) {
        console.error(`Warning: Could not update project config: ${error.message}`);
      }
    }
    
    return {
      filesProcessed: processedFiles,
      changedFiles,
      chunksCreated: totalChunks,
      errors,
      duration: totalDuration,
      docsGeneration,
    };
  }
  
  /**
   * Re-indexes a specific file by path
   */
  async reindexFile(
    filePath: string,
    rootPath: string,
    projectId?: string
  ): Promise<{ success: boolean; chunksCreated: number; error?: string }> {
    try {
      // Scan the specific file
      const file = scanSingleFile(filePath, rootPath);
      
      if (!file) {
        return {
          success: false,
          chunksCreated: 0,
          error: "File not found or not a code file",
        };
      }
      
      // Derive project ID from root path if not provided
      const resolvedProjectId = this.deriveProjectId(rootPath, projectId);
      
      // Initialize vector store
      await this.vectorStore.initialize();
      
      // Index the file
      const result = await this.indexFile(file, true, resolvedProjectId);
      
      if (result.error) {
        return {
          success: false,
          chunksCreated: 0,
          error: result.error,
        };
      }
      
      return {
        success: true,
        chunksCreated: result.chunksCreated,
      };
    } catch (error) {
      return {
        success: false,
        chunksCreated: 0,
        error: `Error reindexing file: ${error}`,
      };
    }
  }
  
  /**
   * Gets statistics about the index
   */
  async getStats(): Promise<IndexStats> {
    await this.vectorStore.initialize();
    
    const vectorStats = await this.vectorStore.getStats();
    const fileHashes = await this.vectorStore.getFileHashes();
    
    // Check for files that need reindexing
    const pendingFiles: string[] = [];
    for (const [filePath, storedHash] of fileHashes) {
      const metadataHash = this.metadata.files[filePath]?.hash;
      if (metadataHash && metadataHash !== storedHash) {
        pendingFiles.push(filePath);
      }
    }
    
    return {
      totalFiles: vectorStats.fileCount,
      totalChunks: vectorStats.totalChunks,
      lastIndexed: vectorStats.lastUpdated,
      languages: vectorStats.languageCounts,
      pendingFiles: pendingFiles.length > 0 ? pendingFiles : undefined,
    };
  }
  
  /**
   * Searches the index
   */
  async search(
    query: string,
    options: {
      projectId?: string;       // Filter by project ID
      topK?: number;
      minScore?: number;
      filterByFile?: string;
      filterByLanguage?: string;
    } = {}
  ): Promise<Array<{
    filePath: string;
    content: string;
    startLine: number;
    endLine: number;
    chunkType: string;
    name?: string;
    language: string;
    score: number;
  }>> {
    await this.vectorStore.initialize();
    
    // Generate query embedding
    const queryVector = await this.embeddingService.generateQueryEmbedding(query);
    
    // Search vector store
    const results = await this.vectorStore.search(queryVector, {
      filterByProject: options.projectId,
      topK: options.topK || 10,
      minScore: options.minScore || 0.0,
      filterByFile: options.filterByFile,
      filterByLanguage: options.filterByLanguage,
    });
    
    // Format results
    return results.map((result) => ({
      filePath: result.chunk.file_path,
      content: result.chunk.content,
      startLine: result.chunk.start_line,
      endLine: result.chunk.end_line,
      chunkType: result.chunk.chunk_type,
      name: result.chunk.name,
      language: result.chunk.language,
      score: result.score,
    }));
  }
  
  /**
   * Clears the entire index
   */
  async clearIndex(): Promise<void> {
    await this.vectorStore.initialize();
    await this.vectorStore.clear();
    
    this.metadata = {
      version: "1.0",
      lastIndexed: 0,
      files: {},
    };
    this.saveMetadata();
    
    // Clear embedding cache
    this.embeddingService.clearCache();
    
    console.error("Index cleared");
  }
  
  /**
   * Removes a file from the index
   */
  async removeFile(filePath: string): Promise<void> {
    await this.vectorStore.initialize();
    await this.vectorStore.deleteChunksByFile(filePath);
    
    delete this.metadata.files[filePath];
    this.saveMetadata();
    
    console.error(`Removed ${filePath} from index`);
  }
}

/**
 * Creates an index manager from environment variables
 */
export function createIndexManager(
  embeddingService: EmbeddingService,
  vectorStore: VectorStore
): IndexManager {
  const storagePath = process.env.MEMORYBANK_STORAGE_PATH || ".memorybank";
  return new IndexManager(embeddingService, vectorStore, storagePath);
}
