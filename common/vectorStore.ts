/**
 * @fileoverview Vector store for Memory Bank using LanceDB
 * Manages storage and retrieval of code embeddings
 */

import * as lancedb from "@lancedb/lancedb";
import * as fs from "fs";
import * as path from "path";

export interface ChunkRecord {
  id: string;              // Unique chunk ID
  vector: number[];        // Embedding vector (1536 dimensions)
  filePath: string;        // Relative file path
  content: string;         // Code content
  startLine: number;       // Starting line number
  endLine: number;         // Ending line number
  chunkType: string;       // Type: function, class, method, block, file
  name?: string;           // Name of function/class
  language: string;        // Programming language
  fileHash: string;        // Hash of the source file
  timestamp: number;       // Timestamp of indexing
  context?: string;        // Additional context (imports, etc.)
}

export interface SearchResult {
  chunk: ChunkRecord;
  score: number;           // Similarity score (0-1)
  distance: number;        // Vector distance
}

export interface SearchOptions {
  topK?: number;           // Number of results (default: 10)
  minScore?: number;       // Minimum similarity score (default: 0.0)
  filterByFile?: string;   // Filter by file path pattern
  filterByLanguage?: string; // Filter by language
  filterByType?: string;   // Filter by chunk type
}

/**
 * Vector store using LanceDB
 */
export class VectorStore {
  private db: lancedb.Connection | null = null;
  private table: lancedb.Table | null = null;
  private dbPath: string;
  private tableName: string;

  constructor(dbPath: string = ".memorybank", tableName: string = "code_chunks") {
    this.dbPath = dbPath;
    this.tableName = tableName;
  }

  /**
   * Initializes the vector database
   */
  async initialize(): Promise<void> {
    try {
      // Create database directory if it doesn't exist
      if (!fs.existsSync(this.dbPath)) {
        fs.mkdirSync(this.dbPath, { recursive: true });
        console.error(`Created database directory: ${this.dbPath}`);
      }

      // Connect to LanceDB
      this.db = await lancedb.connect(this.dbPath);
      console.error(`Connected to LanceDB at ${this.dbPath}`);

      // Check if table exists
      const tableNames = await this.db.tableNames();

      if (tableNames.includes(this.tableName)) {
        // Open existing table
        this.table = await this.db.openTable(this.tableName);
        console.error(`Opened existing table: ${this.tableName}`);
      } else {
        // Create new table with empty data (will add records later)
        console.error(`Creating new table: ${this.tableName}`);
        // LanceDB requires at least one record to create table with schema
        // We'll create it when first inserting data
      }
    } catch (error) {
      console.error(`Error initializing vector store: ${error}`);
      throw error;
    }
  }

  /**
   * Ensures database and table are initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.db) {
      await this.initialize();
    }
  }

  /**
   * Inserts chunks into the vector store
   */
  async insertChunks(chunks: ChunkRecord[]): Promise<void> {
    await this.ensureInitialized();

    if (chunks.length === 0) {
      return;
    }

    try {
      if (!this.table) {
        // Create table with first batch of data
        this.table = await this.db!.createTable(this.tableName, chunks as any);
        console.error(`Created table ${this.tableName} with ${chunks.length} chunks`);
      } else {
        // Add to existing table
        await this.table.add(chunks as any);
        console.error(`Added ${chunks.length} chunks to ${this.tableName}`);
      }
    } catch (error) {
      console.error(`Error inserting chunks: ${error}`);
      throw error;
    }
  }

  /**
   * Updates chunks in the vector store
   */
  async updateChunks(chunks: ChunkRecord[]): Promise<void> {
    await this.ensureInitialized();

    if (chunks.length === 0) {
      return;
    }

    try {
      // Delete old versions by ID
      const ids = chunks.map((c) => c.id);
      await this.deleteChunksByIds(ids);

      // Insert updated versions
      await this.insertChunks(chunks);

      console.error(`Updated ${chunks.length} chunks`);
    } catch (error) {
      console.error(`Error updating chunks: ${error}`);
      throw error;
    }
  }

  /**
   * Deletes chunks by their IDs
   */
  async deleteChunksByIds(ids: string[]): Promise<void> {
    await this.ensureInitialized();

    if (!this.table || ids.length === 0) {
      return;
    }

    try {
      // LanceDB uses SQL-like syntax for deletion
      const idList = ids.map((id) => `'${id}'`).join(",");
      await this.table.delete(`id IN (${idList})`);
      console.error(`Deleted ${ids.length} chunks`);
    } catch (error) {
      console.error(`Error deleting chunks: ${error}`);
      throw error;
    }
  }

  /**
   * Deletes all chunks from a specific file
   */
  async deleteChunksByFile(filePath: string): Promise<void> {
    await this.ensureInitialized();

    if (!this.table) {
      return;
    }

    try {
      await this.table.delete(`"filePath" = '${filePath}'`);
      console.error(`Deleted all chunks from file: ${filePath}`);
    } catch (error) {
      console.error(`Error deleting chunks by file: ${error}`);
      throw error;
    }
  }

  /**
   * Searches for similar chunks using vector similarity
   */
  async search(
    queryVector: number[],
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    await this.ensureInitialized();

    if (!this.table) {
      console.error("No table exists yet, returning empty results");
      return [];
    }

    const topK = options.topK || 10;
    const minScore = options.minScore || 0.0;

    try {
      // Start with vector search
      let query = this.table.search(queryVector).limit(topK);

      // Apply filters if specified
      if (options.filterByFile) {
        query = query.where(`filePath LIKE '%${options.filterByFile}%'`);
      }

      if (options.filterByLanguage) {
        query = query.where(`language = '${options.filterByLanguage}'`);
      }

      if (options.filterByType) {
        query = query.where(`chunkType = '${options.filterByType}'`);
      }

      // Execute search
      const results = await query.toArray();

      // Convert to SearchResult format
      const searchResults: SearchResult[] = results.map((result: any) => {
        // LanceDB returns distance, convert to similarity score (0-1)
        // Using cosine similarity: score = 1 - (distance / 2)
        const distance = result._distance || 0;
        const score = Math.max(0, 1 - distance / 2);

        return {
          chunk: {
            id: result.id,
            vector: result.vector,
            filePath: result.filePath,
            content: result.content,
            startLine: result.startLine,
            endLine: result.endLine,
            chunkType: result.chunkType,
            name: result.name,
            language: result.language,
            fileHash: result.fileHash,
            timestamp: result.timestamp,
            context: result.context,
          },
          score,
          distance,
        };
      });

      // Filter by minimum score
      return searchResults.filter((r) => r.score >= minScore);
    } catch (error) {
      console.error(`Error searching vector store: ${error}`);
      throw error;
    }
  }

  /**
   * Gets all chunks from a specific file
   */
  async getChunksByFile(filePath: string): Promise<ChunkRecord[]> {
    await this.ensureInitialized();

    if (!this.table) {
      return [];
    }

    try {
      const results = await (this.table as any)
        .where(`filePath = '${filePath}'`)
        .toArray();

      return results.map((r: any) => ({
        id: r.id,
        vector: r.vector,
        filePath: r.filePath,
        content: r.content,
        startLine: r.startLine,
        endLine: r.endLine,
        chunkType: r.chunkType,
        name: r.name,
        language: r.language,
        fileHash: r.fileHash,
        timestamp: r.timestamp,
        context: r.context,
      }));
    } catch (error) {
      console.error(`Error getting chunks by file: ${error}`);
      return [];
    }
  }

  /**
   * Gets statistics about the vector store
   */
  async getStats(): Promise<{
    totalChunks: number;
    fileCount: number;
    languageCounts: Record<string, number>;
    typeCounts: Record<string, number>;
    lastUpdated?: Date;
  }> {
    await this.ensureInitialized();

    if (!this.table) {
      return {
        totalChunks: 0,
        fileCount: 0,
        languageCounts: {},
        typeCounts: {},
      };
    }

    try {
      // Use query().toArray() instead of direct toArray()
      const allChunks = await this.table.query().toArray();

      const uniqueFiles = new Set<string>();
      const languageCounts: Record<string, number> = {};
      const typeCounts: Record<string, number> = {};
      let latestTimestamp = 0;

      for (const chunk of allChunks) {
        uniqueFiles.add(chunk.filePath);

        languageCounts[chunk.language] = (languageCounts[chunk.language] || 0) + 1;
        typeCounts[chunk.chunkType] = (typeCounts[chunk.chunkType] || 0) + 1;

        if (chunk.timestamp > latestTimestamp) {
          latestTimestamp = chunk.timestamp;
        }
      }

      return {
        totalChunks: allChunks.length,
        fileCount: uniqueFiles.size,
        languageCounts,
        typeCounts,
        lastUpdated: latestTimestamp > 0 ? new Date(latestTimestamp) : undefined,
      };
    } catch (error) {
      console.error(`Error getting stats: ${error}`);
      throw error;
    }
  }

  /**
   * Clears all data from the vector store
   */
  async clear(): Promise<void> {
    await this.ensureInitialized();

    if (!this.table) {
      return;
    }

    try {
      // Drop the table
      await this.db!.dropTable(this.tableName);
      this.table = null;
      console.error(`Cleared vector store table: ${this.tableName}`);
    } catch (error) {
      console.error(`Error clearing vector store: ${error}`);
      throw error;
    }
  }

  /**
   * Closes the database connection
   */
  async close(): Promise<void> {
    // LanceDB connections are lightweight and don't need explicit closing
    // But we'll clear references
    this.table = null;
    this.db = null;
  }

  /**
   * Gets file hashes for all indexed files
   */
  async getFileHashes(): Promise<Map<string, string>> {
    await this.ensureInitialized();

    if (!this.table) {
      return new Map();
    }

    try {
      // Use query().toArray() instead of direct toArray()
      const allChunks = await this.table.query().toArray();
      const fileHashes = new Map<string, string>();

      for (const chunk of allChunks) {
        if (!fileHashes.has(chunk.filePath)) {
          fileHashes.set(chunk.filePath, chunk.fileHash);
        }
      }

      return fileHashes;
    } catch (error) {
      console.error(`Error getting file hashes: ${error}`);
      return new Map();
    }
  }
  /**
   * Gets aggregated statistics for all indexed files in a single query
   * Returns a map of filePath -> { lastIndexed, chunkCount, fileHash }
   */
  async getIndexedFileStats(): Promise<Map<string, { lastIndexed: number; chunkCount: number; fileHash: string }>> {
    await this.ensureInitialized();

    if (!this.table) {
      return new Map();
    }

    try {
      // Fetch all chunks in one go - much faster than N queries
      // querying only necessary columns to reduce memory usage
      const allChunks = await this.table.query()
        .select(['filePath', 'timestamp', 'fileHash'])
        .toArray();

      const stats = new Map<string, { lastIndexed: number; chunkCount: number; fileHash: string }>();

      for (const chunk of allChunks) {
        const current = stats.get(chunk.filePath);

        if (!current) {
          stats.set(chunk.filePath, {
            lastIndexed: chunk.timestamp,
            chunkCount: 1,
            fileHash: chunk.fileHash
          });
        } else {
          // Update stats
          current.chunkCount++;
          // Keep the latest timestamp
          if (chunk.timestamp > current.lastIndexed) {
            current.lastIndexed = chunk.timestamp;
          }
        }
      }

      return stats;
    } catch (error) {
      console.error(`Error getting indexed file stats: ${error}`);
      return new Map();
    }
  }
}

/**
 * Creates a vector store from environment variables
 */
export function createVectorStore(): VectorStore {
  const storagePath = process.env.MEMORYBANK_STORAGE_PATH || ".memorybank";
  return new VectorStore(storagePath);
}
