/**
 * @fileoverview Get stats tool for Memory Bank
 * Returns statistics about the indexed codebase
 */

import { IndexManager } from "../common/indexManager.js";
import { EmbeddingService } from "../common/embeddingService.js";

export interface GetStatsResult {
  success: boolean;
  stats?: {
    totalFiles: number;
    totalChunks: number;
    lastIndexed?: string;
    languages: Record<string, number>;
    pendingFiles?: string[];
    embeddingCache?: {
      size: number;
      models: Record<string, number>;
    };
  };
  message: string;
}

/**
 * Gets statistics about the Memory Bank
 */
export async function getStats(
  indexManager: IndexManager,
  embeddingService: EmbeddingService
): Promise<GetStatsResult> {
  try {
    console.error("\nGetting Memory Bank statistics...");
    
    // Get index stats
    const indexStats = await indexManager.getStats();
    
    // Get embedding cache stats
    const cacheStats = embeddingService.getCacheStats();
    
    const stats = {
      totalFiles: indexStats.totalFiles,
      totalChunks: indexStats.totalChunks,
      lastIndexed: indexStats.lastIndexed?.toISOString(),
      languages: indexStats.languages,
      pendingFiles: indexStats.pendingFiles,
      embeddingCache: cacheStats.size > 0 ? cacheStats : undefined,
    };
    
    // Format message
    let message = `Memory Bank contains ${stats.totalChunks} chunk(s) from ${stats.totalFiles} file(s)`;
    
    if (stats.lastIndexed) {
      const lastIndexedDate = new Date(stats.lastIndexed);
      const now = new Date();
      const diffMs = now.getTime() - lastIndexedDate.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      
      if (diffMins < 60) {
        message += `, last indexed ${diffMins} minute(s) ago`;
      } else {
        const diffHours = Math.floor(diffMins / 60);
        message += `, last indexed ${diffHours} hour(s) ago`;
      }
    }
    
    if (stats.pendingFiles && stats.pendingFiles.length > 0) {
      message += `. ${stats.pendingFiles.length} file(s) pending reindexing`;
    }
    
    console.error(message);
    console.error(`Languages: ${Object.keys(stats.languages).join(", ")}`);
    
    if (stats.embeddingCache) {
      console.error(`Embedding cache: ${stats.embeddingCache.size} cached`);
    }
    
    return {
      success: true,
      stats,
      message,
    };
  } catch (error) {
    console.error(`Error in getStats tool: ${error}`);
    return {
      success: false,
      message: `Failed to get stats: ${error}`,
    };
  }
}
