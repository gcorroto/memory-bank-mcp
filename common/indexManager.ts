/**
 * @fileoverview Index manager for Memory Bank
 * Coordinates scanning, chunking, embedding, and storage
 */

import * as fs from "fs";
import * as path from "path";
import { scanFiles, scanSingleFile, FileMetadata } from "./fileScanner.js";
import { chunkCode, CodeChunk } from "./chunker.js";
import { EmbeddingService } from "./embeddingService.js";
import { VectorStore, ChunkRecord } from "./vectorStore.js";
import { logger } from "./logger.js";
import * as crypto from "crypto";

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
  rootPath: string;
  projectRoot?: string;
  forceReindex?: boolean;
  recursive?: boolean;
}

/**
 * Index manager coordinating the entire indexing pipeline
 */
export class IndexManager {
  private embeddingService: EmbeddingService;
  private vectorStore: VectorStore;
  private metadataPath: string;
  private metadata: IndexMetadata;
  private projectRoot: string;
  private projectId: string;

  constructor(
    embeddingService: EmbeddingService,
    vectorStore: VectorStore,
    storagePath: string = ".memorybank",
    projectRoot?: string
  ) {
    this.embeddingService = embeddingService;
    this.vectorStore = vectorStore;
    this.metadataPath = path.join(storagePath, "index-metadata.json");
    this.projectRoot = projectRoot || process.cwd();
    this.projectId = this.generateProjectId(this.projectRoot);
    this.metadata = this.loadMetadata();
  }

  /**
   * Generates a unique project ID from the project root path
   */
  private generateProjectId(projectRoot: string): string {
    return crypto.createHash("sha256").update(projectRoot).digest("hex").substring(0, 16);
  }

  /**
   * Loads index metadata from disk
   */
  private loadMetadata(): IndexMetadata {
    try {
      if (fs.existsSync(this.metadataPath)) {
        const data = fs.readFileSync(this.metadataPath, "utf-8");
        return JSON.parse(data);
      }
    } catch (error) {
      logger.warn(`Could not load index metadata: ${error}`);
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

      fs.writeFileSync(this.metadataPath, JSON.stringify(this.metadata, null, 2));
    } catch (error) {
      logger.warn(`Could not save index metadata: ${error}`);
    }
  }

  /**
   * Checks if a file needs reindexing
   */
  private needsReindexing(file: FileMetadata, forceReindex: boolean): boolean {
    if (forceReindex) {
      return true;
    }

    const fileInfo = this.metadata.files[file.path];
    if (!fileInfo) {
      return true; // New file
    }

    if (fileInfo.hash !== file.hash) {
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
    saveMetadata: boolean = true
  ): Promise<{ chunksCreated: number; error?: string }> {
    try {
      // Check if file needs reindexing
      if (!this.needsReindexing(file, forceReindex)) {
        logger.debug(`Skipping ${file.path} (no changes)`);
        return { chunksCreated: 0 };
      }

      logger.info(`Indexing: ${file.path}`);

      // Read file content
      const content = fs.readFileSync(file.absolutePath, "utf-8");

      // Get chunk size from environment or use defaults
      const maxChunkSize = parseInt(process.env.MEMORYBANK_CHUNK_SIZE || "1000");
      const chunkOverlap = parseInt(process.env.MEMORYBANK_CHUNK_OVERLAP || "200");

      // Chunk the code
      const chunks = chunkCode({
        filePath: file.path,
        content,
        language: file.language,
        maxChunkSize,
        chunkOverlap,
      });

      if (chunks.length === 0) {
        logger.warn(`No chunks created for ${file.path}`);
        return { chunksCreated: 0 };
      }

      logger.debug(`  Created ${chunks.length} chunks`);

      // Filter out invalid chunks (fail-safe)
      const validChunks = chunks.filter(c => c.content && c.content.trim().length > 0 && c.content.trim() !== "}");

      if (validChunks.length === 0) {
        logger.warn(`No valid chunks after filtering for ${file.path}`);
        return { chunksCreated: 0 };
      }

      // Generate embeddings
      const embeddingInputs = validChunks.map((chunk) => ({
        id: chunk.id,
        content: chunk.content,
      }));

      const embeddings = await this.embeddingService.generateBatchEmbeddings(
        embeddingInputs
      );

      logger.debug(`  Generated ${embeddings.length} embeddings`);

      // Prepare chunk records for storage
      const timestamp = Date.now();
      const chunkRecords: ChunkRecord[] = validChunks.map((chunk, i) => ({
        id: chunk.id,
        vector: embeddings[i].vector,
        filePath: chunk.filePath,
        content: chunk.content,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        chunkType: chunk.chunkType,
        name: chunk.name || "",
        language: chunk.language,
        fileHash: file.hash,
        timestamp,
        context: chunk.context,
        projectId: this.projectId,
      }));

      // Delete old chunks for this file
      await this.vectorStore.deleteChunksByFile(file.path, this.projectId);

      // Insert new chunks
      await this.vectorStore.insertChunks(chunkRecords);

      logger.debug(`  Stored ${chunkRecords.length} chunks in vector store`);

      // Update metadata
      this.metadata.files[file.path] = {
        hash: file.hash,
        lastIndexed: timestamp,
        chunkCount: chunks.length,
      };
      this.metadata.lastIndexed = timestamp;

      if (saveMetadata) {
        this.saveMetadata();
      }

      return { chunksCreated: chunks.length };
    } catch (error) {
      const errorMsg = `Error indexing ${file.path}: ${error}`;
      logger.error(errorMsg);
      return { chunksCreated: 0, error: errorMsg };
    }
  }

  /**
   * Indexes multiple files or a directory
   */
  async indexFiles(options: IndexOptions): Promise<{
    filesProcessed: number;
    chunksCreated: number;
    errors: string[];
    duration: number;
  }> {
    const startTime = Date.now();

    logger.info(`=== Starting indexing process ===`);
    logger.info(`Root path: ${options.rootPath}`);
    logger.info(`Force reindex: ${options.forceReindex || false}`);

    // Initialize vector store
    await this.vectorStore.initialize();

    // Scan files
    logger.info(`Scanning files...`);
    const files = await scanFiles({
      rootPath: options.rootPath,
      projectRoot: options.projectRoot,
      recursive: options.recursive !== undefined ? options.recursive : true,
    });

    if (files.length === 0) {
      logger.warn("No files found to index");
      return {
        filesProcessed: 0,
        chunksCreated: 0,
        errors: [],
        duration: Date.now() - startTime,
      };
    }

    // Filter files that need reindexing
    const filesToIndex = files.filter((file) =>
      this.needsReindexing(file, options.forceReindex || false)
    );

    logger.info(`Found ${files.length} files, ${filesToIndex.length} need indexing`);

    if (filesToIndex.length === 0) {
      logger.info("All files are up to date");
      return {
        filesProcessed: 0,
        chunksCreated: 0,
        errors: [],
        duration: Date.now() - startTime,
      };
    }

    // Index files in batches
    const errors: string[] = [];
    let totalChunks = 0;
    let processedFiles = 0;
    const batchSize = 5; // Concurrency limit

    for (let i = 0; i < filesToIndex.length; i += batchSize) {
      const batch = filesToIndex.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(filesToIndex.length / batchSize);

      logger.info(`Processing batch ${batchNum}/${totalBatches} (${batch.length} files)`);

      const batchPromises = batch.map(async (file, index) => {
        logger.debug(`[${i + index + 1}/${filesToIndex.length}] Processing ${file.path}`);
        return this.indexFile(file, options.forceReindex || false, false); // Don't save metadata per file
      });

      const results = await Promise.all(batchPromises);

      // Process results
      for (const result of results) {
        if (result.error) {
          errors.push(result.error);
        } else {
          processedFiles++;
          totalChunks += result.chunksCreated;
        }
      }

      // Save metadata and embedding cache after each batch
      this.saveMetadata();
      this.embeddingService.saveCache();

      // Small delay between batches
      if (i + batchSize < filesToIndex.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    const duration = Date.now() - startTime;

    logger.info(`=== Indexing complete ===`);
    logger.info(`Files processed: ${processedFiles}`);
    logger.info(`Chunks created: ${totalChunks}`);
    logger.info(`Errors: ${errors.length}`);
    logger.info(`Duration: ${(duration / 1000).toFixed(2)}s`);

    return {
      filesProcessed: processedFiles,
      chunksCreated: totalChunks,
      errors,
      duration,
    };
  }

  /**
   * Re-indexes a specific file by path
   */
  async reindexFile(
    filePath: string,
    rootPath: string,
    projectRoot?: string
  ): Promise<{ success: boolean; chunksCreated: number; error?: string }> {
    try {
      // Scan the specific file
      const file = await scanSingleFile(filePath, rootPath, projectRoot);

      if (!file) {
        return {
          success: false,
          chunksCreated: 0,
          error: "File not found or not a code file",
        };
      }

      // Initialize vector store
      await this.vectorStore.initialize();

      // Index the file
      const result = await this.indexFile(file, true);

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
      topK: options.topK || 10,
      minScore: options.minScore || 0.0,
      filterByFile: options.filterByFile,
      filterByLanguage: options.filterByLanguage,
    });

    // Format results
    return results.map((result) => ({
      filePath: result.chunk.filePath,
      content: result.chunk.content,
      startLine: result.chunk.startLine,
      endLine: result.chunk.endLine,
      chunkType: result.chunk.chunkType,
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

    logger.info("Index cleared");
  }

  /**
   * Removes a file from the index
   */
  async removeFile(filePath: string): Promise<void> {
    await this.vectorStore.initialize();
    await this.vectorStore.deleteChunksByFile(filePath, this.projectId);

    delete this.metadata.files[filePath];
    this.saveMetadata();

    logger.info(`Removed ${filePath} from index`);
  }
}

/**
 * Creates an index manager from environment variables
 */
export function createIndexManager(
  embeddingService: EmbeddingService,
  vectorStore: VectorStore,
  workspaceRoot?: string
): IndexManager {
  const storagePath = process.env.MEMORYBANK_STORAGE_PATH || ".memorybank";
  return new IndexManager(embeddingService, vectorStore, storagePath, workspaceRoot);
}
