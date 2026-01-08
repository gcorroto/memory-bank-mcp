/**
 * @fileoverview Search memory tool for Memory Bank
 * Searches code semantically using vector similarity
 */

import { IndexManager } from "../common/indexManager.js";

export interface SearchMemoryParams {
  query: string;              // Search query
  topK?: number;              // Number of results (default: 10)
  minScore?: number;          // Minimum similarity score (default: 0.7)
  filterByFile?: string;      // Filter by file path pattern
  filterByLanguage?: string;  // Filter by language
}

export interface SearchResult {
  filePath: string;
  content: string;
  startLine: number;
  endLine: number;
  chunkType: string;
  name?: string;
  language: string;
  score: number;
}

export interface SearchMemoryResult {
  success: boolean;
  results: SearchResult[];
  count: number;
  query: string;
  message: string;
}

/**
 * Searches the Memory Bank for relevant code
 */
export async function searchMemory(
  params: SearchMemoryParams,
  indexManager: IndexManager
): Promise<SearchMemoryResult> {
  try {
    if (!params.query || params.query.trim() === "") {
      return {
        success: false,
        results: [],
        count: 0,
        query: params.query || "",
        message: "Query cannot be empty",
      };
    }
    
    console.error(`\nSearching Memory Bank for: "${params.query}"`);
    console.error(`Top K: ${params.topK || 10}`);
    console.error(`Min score: ${params.minScore || 0.7}`);
    
    if (params.filterByFile) {
      console.error(`Filter by file: ${params.filterByFile}`);
    }
    if (params.filterByLanguage) {
      console.error(`Filter by language: ${params.filterByLanguage}`);
    }
    
    // Search
    const results = await indexManager.search(params.query, {
      topK: params.topK || 10,
      minScore: params.minScore !== undefined ? params.minScore : 0.7,
      filterByFile: params.filterByFile,
      filterByLanguage: params.filterByLanguage,
    });
    
    console.error(`Found ${results.length} result(s)`);
    
    // Format message
    let message = `Found ${results.length} result(s)`;
    if (results.length > 0) {
      const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
      message += ` (avg score: ${avgScore.toFixed(3)})`;
    }
    
    return {
      success: true,
      results,
      count: results.length,
      query: params.query,
      message,
    };
  } catch (error) {
    console.error(`Error in searchMemory tool: ${error}`);
    return {
      success: false,
      results: [],
      count: 0,
      query: params.query || "",
      message: `Search failed: ${error}`,
    };
  }
}
