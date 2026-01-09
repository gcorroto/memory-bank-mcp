/**
 * @fileoverview Vector store for Memory Bank using LanceDB
 * Manages storage and retrieval of code embeddings
 * Uses snake_case for field names for LanceDB SQL compatibility
 */

import * as lancedb from "@lancedb/lancedb";
import * as fs from "fs";
import * as path from "path";

export interface ChunkRecord {
  id: string;              // Unique chunk ID
  vector: number[];        // Embedding vector (1536 dimensions)
  file_path: string;       // Relative file path
  content: string;         // Code content
  start_line: number;      // Starting line number
  end_line: number;        // Ending line number
  chunk_type: string;      // Type: function, class, method, block, file
  name?: string;           // Name of function/class
  language: string;        // Programming language
  file_hash: string;       // Hash of the source file
  timestamp: number;       // Timestamp of indexing
  context?: string;        // Additional context (imports, etc.)
  project_id: string;      // Project identifier for multi-project support
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
  filterByProject?: string; // Filter by project ID
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
      // Use snake_case field name for LanceDB SQL compatibility
      await this.table.delete(`file_path = '${filePath}'`);
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
      
      // Apply filters if specified (using snake_case field names)
      if (options.filterByFile) {
        query = query.where(`file_path LIKE '%${options.filterByFile}%'`);
      }
      
      if (options.filterByLanguage) {
        query = query.where(`language = '${options.filterByLanguage}'`);
      }
      
      if (options.filterByType) {
        query = query.where(`chunk_type = '${options.filterByType}'`);
      }
      
      if (options.filterByProject) {
        query = query.where(`project_id = '${options.filterByProject}'`);
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
            file_path: result.file_path,
            content: result.content,
            start_line: result.start_line,
            end_line: result.end_line,
            chunk_type: result.chunk_type,
            name: result.name,
            language: result.language,
            file_hash: result.file_hash,
            timestamp: result.timestamp,
            context: result.context,
            project_id: result.project_id,
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
      const results = await this.table
        .query()
        .where(`file_path = '${filePath}'`)
        .toArray();
      
      return results.map((r: any) => ({
        id: r.id,
        vector: r.vector,
        file_path: r.file_path,
        content: r.content,
        start_line: r.start_line,
        end_line: r.end_line,
        chunk_type: r.chunk_type,
        name: r.name,
        language: r.language,
        file_hash: r.file_hash,
        timestamp: r.timestamp,
        context: r.context,
        project_id: r.project_id,
      }));
    } catch (error) {
      console.error(`Error getting chunks by file: ${error}`);
      return [];
    }
  }
  
  /**
   * Gets all chunks, optionally filtered by project
   */
  async getAllChunks(projectId?: string): Promise<ChunkRecord[]> {
    await this.ensureInitialized();
    
    if (!this.table) {
      console.error("getAllChunks: No table exists");
      return [];
    }
    
    try {
      let query = this.table.query();
      
      // Apply project filter using snake_case field name
      if (projectId) {
        query = query.where(`project_id = '${projectId}'`);
        console.error(`getAllChunks: Filtering by project_id='${projectId}'`);
      }
      
      const results = await query.toArray();
      console.error(`getAllChunks: Got ${results.length} results`);
      
      // Debug: Check first result's content
      if (results.length > 0) {
        const first = results[0] as any;
        console.error(`getAllChunks: First result file_path=${first.file_path}, content length=${first.content?.length || 0}`);
      }
      
      return results.map((r: any) => ({
        id: r.id,
        vector: r.vector,
        file_path: r.file_path,
        content: r.content,
        start_line: r.start_line,
        end_line: r.end_line,
        chunk_type: r.chunk_type,
        name: r.name,
        language: r.language,
        file_hash: r.file_hash,
        timestamp: r.timestamp,
        context: r.context,
        project_id: r.project_id,
      }));
    } catch (error) {
      console.error(`Error getting all chunks: ${error}`);
      return [];
    }
  }
  
  /**
   * Gets chunks by project ID
   */
  async getChunksByProject(projectId: string): Promise<ChunkRecord[]> {
    return this.getAllChunks(projectId);
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
      const allChunks = await this.table.query().toArray();
      
      const uniqueFiles = new Set<string>();
      const languageCounts: Record<string, number> = {};
      const typeCounts: Record<string, number> = {};
      let latestTimestamp = 0;
      
      for (const chunk of allChunks as any[]) {
        uniqueFiles.add(chunk.file_path);
        
        languageCounts[chunk.language] = (languageCounts[chunk.language] || 0) + 1;
        typeCounts[chunk.chunk_type] = (typeCounts[chunk.chunk_type] || 0) + 1;
        
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
      const allChunks = await this.table.query().toArray();
      const fileHashes = new Map<string, string>();
      
      for (const chunk of allChunks as any[]) {
        if (!fileHashes.has(chunk.file_path)) {
          fileHashes.set(chunk.file_path, chunk.file_hash);
        }
      }
      
      return fileHashes;
    } catch (error) {
      console.error(`Error getting file hashes: ${error}`);
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
