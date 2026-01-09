/**
 * @fileoverview Embedding service for Memory Bank using OpenAI
 * Generates vector embeddings for code chunks
 */

import OpenAI from "openai";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";

export interface EmbeddingResult {
  chunkId: string;
  vector: number[];      // 1536 dimensions for text-embedding-3-small
  model: string;
  tokens: number;
}

export interface EmbeddingOptions {
  model?: string;        // Default: text-embedding-3-small
  dimensions?: number;   // Default: 1536
  batchSize?: number;    // Default: 100 (safe batch size)
  enableCache?: boolean; // Default: true
  cachePath?: string;    // Default: .memorybank/embedding-cache.json
}

interface CacheEntry {
  chunkId: string;
  contentHash: string;
  vector: number[];
  model: string;
  timestamp: number;
}

/**
 * Embedding service with caching and batch processing
 */
export class EmbeddingService {
  private client: OpenAI;
  private options: Required<EmbeddingOptions>;
  private cache: Map<string, CacheEntry>;

  constructor(apiKey: string, options?: EmbeddingOptions) {
    if (!apiKey) {
      throw new Error("OpenAI API key is required");
    }

    this.client = new OpenAI({ apiKey });

    this.options = {
      model: options?.model || "text-embedding-3-small",
      dimensions: options?.dimensions || 1536,
      batchSize: options?.batchSize || 100,
      enableCache: options?.enableCache !== undefined ? options.enableCache : true,
      cachePath: options?.cachePath || ".memorybank/embedding-cache.json",
    };

    this.cache = new Map();

    if (this.options.enableCache) {
      this.loadCache();
    }
  }

  /**
   * Loads embedding cache from disk
   */
  private loadCache(): void {
    try {
      if (fs.existsSync(this.options.cachePath)) {
        const data = fs.readFileSync(this.options.cachePath, "utf-8");
        const entries: CacheEntry[] = JSON.parse(data);

        for (const entry of entries) {
          this.cache.set(entry.chunkId, entry);
        }

        console.error(`Loaded ${entries.length} cached embeddings`);
      }
    } catch (error) {
      console.error(`Warning: Could not load embedding cache: ${error}`);
    }
  }

  /**
   * Saves embedding cache to disk using streams to handle large files
   */
  public saveCache(): void {
    try {
      const dir = path.dirname(this.options.cachePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const entries = Array.from(this.cache.values());
      const stream = fs.createWriteStream(this.options.cachePath, { encoding: 'utf8' });

      stream.write('[\n');
      entries.forEach((entry, index) => {
        const isLast = index === entries.length - 1;
        const line = JSON.stringify(entry) + (isLast ? '' : ',\n');
        stream.write(line);
      });
      stream.write('\n]');
      stream.end();

      console.error(`Updated embedding cache (Total: ${entries.length} entries)`);
    } catch (error) {
      console.error(`Warning: Could not save embedding cache: ${error}`);
    }
  }

  /**
   * Generates hash of content for cache lookup
   */
  private hashContent(content: string): string {
    return crypto.createHash("sha256").update(content).digest("hex");
  }

  /**
   * Checks if embedding is cached
   */
  private getCachedEmbedding(chunkId: string, content: string): number[] | null {
    if (!this.options.enableCache) {
      return null;
    }

    const cached = this.cache.get(chunkId);
    if (!cached) {
      return null;
    }

    // Verify content hasn't changed
    const contentHash = this.hashContent(content);
    if (cached.contentHash !== contentHash) {
      // Content changed, invalidate cache
      this.cache.delete(chunkId);
      return null;
    }

    // Verify model matches
    if (cached.model !== this.options.model) {
      return null;
    }

    return cached.vector;
  }

  /**
   * Caches an embedding
   */
  private cacheEmbedding(chunkId: string, content: string, vector: number[]): void {
    if (!this.options.enableCache) {
      return;
    }

    const contentHash = this.hashContent(content);
    this.cache.set(chunkId, {
      chunkId,
      contentHash,
      vector,
      model: this.options.model,
      timestamp: Date.now(),
    });
  }

  /**
   * Sleeps for a specified duration (for retry backoff)
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Generates embeddings for a batch of texts with retry logic
   */
  private async generateBatchWithRetry(
    texts: string[],
    maxRetries = 3
  ): Promise<number[][]> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await this.client.embeddings.create({
          model: this.options.model,
          input: texts,
          dimensions: this.options.dimensions,
        });

        return response.data.map((item) => item.embedding);
      } catch (error: any) {
        lastError = error;

        // Check if it's a rate limit error
        if (error?.status === 429 || error?.code === "rate_limit_exceeded") {
          const backoffMs = Math.pow(2, attempt) * 1000; // Exponential backoff
          console.error(
            `Rate limit hit, retrying in ${backoffMs}ms (attempt ${attempt + 1}/${maxRetries})`
          );
          await this.sleep(backoffMs);
          continue;
        }

        // Check if it's a temporary error
        if (error?.status >= 500 && error?.status < 600) {
          const backoffMs = Math.pow(2, attempt) * 1000;
          console.error(
            `Server error ${error.status}, retrying in ${backoffMs}ms (attempt ${attempt + 1}/${maxRetries})`
          );
          await this.sleep(backoffMs);
          continue;
        }

        // For other errors, don't retry
        throw error;
      }
    }

    // All retries failed
    throw lastError || new Error("Failed to generate embeddings after retries");
  }

  /**
   * Generates embedding for a single chunk
   */
  async generateEmbedding(chunkId: string, content: string): Promise<EmbeddingResult> {
    // Check cache first
    const cached = this.getCachedEmbedding(chunkId, content);
    if (cached) {
      return {
        chunkId,
        vector: cached,
        model: this.options.model,
        tokens: 0, // Not tracked for cached
      };
    }

    // Generate new embedding
    const vectors = await this.generateBatchWithRetry([content]);
    const vector = vectors[0];

    // Cache the result
    this.cacheEmbedding(chunkId, content, vector);

    // Estimate tokens (rough approximation: ~4 chars per token)
    const tokens = Math.ceil(content.length / 4);

    return {
      chunkId,
      vector,
      model: this.options.model,
      tokens,
    };
  }

  /**
   * Generates embeddings for multiple chunks in batches
   */
  async generateBatchEmbeddings(
    chunks: Array<{ id: string; content: string }>,
    options: { autoSave?: boolean } = {}
  ): Promise<EmbeddingResult[]> {
    const results: EmbeddingResult[] = [];
    const toGenerate: Array<{ id: string; content: string; index: number }> = [];
    const shouldSave = options.autoSave !== undefined ? options.autoSave : true;

    // Check cache and collect chunks that need generation
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const cached = this.getCachedEmbedding(chunk.id, chunk.content);

      if (cached) {
        results[i] = {
          chunkId: chunk.id,
          vector: cached,
          model: this.options.model,
          tokens: 0,
        };
      } else {
        toGenerate.push({ ...chunk, index: i });
      }
    }

    if (toGenerate.length > 0) {
      console.error(
        `Generating embeddings: ${toGenerate.length} new, ${chunks.length - toGenerate.length} cached`
      );

      // Process in batches
      for (let i = 0; i < toGenerate.length; i += this.options.batchSize) {
        const batch = toGenerate.slice(i, i + this.options.batchSize);
        const batchTexts = batch.map((item) => item.content);

        console.error(
          `Processing batch ${Math.floor(i / this.options.batchSize) + 1}/${Math.ceil(toGenerate.length / this.options.batchSize)}`
        );

        try {
          const vectors = await this.generateBatchWithRetry(batchTexts);

          // Store results and cache
          for (let j = 0; j < batch.length; j++) {
            const item = batch[j];
            const vector = vectors[j];

            // Cache the result
            this.cacheEmbedding(item.id, item.content, vector);

            // Estimate tokens
            const tokens = Math.ceil(item.content.length / 4);

            results[item.index] = {
              chunkId: item.id,
              vector,
              model: this.options.model,
              tokens,
            };
          }
        } catch (error) {
          console.error(`Error generating batch embeddings: ${error}`);
          throw error;
        }

        // Small delay between batches to avoid rate limits
        if (i + this.options.batchSize < toGenerate.length) {
          await this.sleep(100);
        }
      }
    }

    // Save cache after batch processing
    if (shouldSave && this.options.enableCache && toGenerate.length > 0) {
      this.saveCache();
    }

    return results;
  }


  /**
   * Generates embedding for a query (for search)
   */
  async generateQueryEmbedding(query: string): Promise<number[]> {
    try {
      const response = await this.client.embeddings.create({
        model: this.options.model,
        input: query,
        dimensions: this.options.dimensions,
      });

      return response.data[0].embedding;
    } catch (error) {
      console.error(`Error generating query embedding: ${error} `);
      throw error;
    }
  }

  /**
   * Clears the embedding cache
   */
  clearCache(): void {
    this.cache.clear();
    if (fs.existsSync(this.options.cachePath)) {
      fs.unlinkSync(this.options.cachePath);
    }
    console.error("Embedding cache cleared");
  }

  /**
   * Gets cache statistics
   */
  getCacheStats(): { size: number; models: Record<string, number> } {
    const models: Record<string, number> = {};

    for (const entry of this.cache.values()) {
      models[entry.model] = (models[entry.model] || 0) + 1;
    }

    return {
      size: this.cache.size,
      models,
    };
  }
}

/**
 * Creates an embedding service from environment variables
 */
export function createEmbeddingService(): EmbeddingService {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY environment variable is required. Get your API key from https://platform.openai.com/api-keys"
    );
  }

  const options: EmbeddingOptions = {
    model: process.env.MEMORYBANK_EMBEDDING_MODEL || "text-embedding-3-small",
    dimensions: parseInt(process.env.MEMORYBANK_EMBEDDING_DIMENSIONS || "1536"),
    enableCache: true,
    cachePath: path.join(
      process.env.MEMORYBANK_STORAGE_PATH || ".memorybank",
      "embedding-cache.json"
    ),
  };

  return new EmbeddingService(apiKey, options);
}
