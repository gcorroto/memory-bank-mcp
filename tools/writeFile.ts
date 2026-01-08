/**
 * @fileoverview Write file tool for Memory Bank
 * Writes files and automatically reindexes them
 */

import * as fs from "fs";
import * as path from "path";
import { IndexManager } from "../common/indexManager.js";

export interface WriteFileParams {
  path: string;            // File path to write
  content: string;         // Content to write
  autoReindex?: boolean;   // Auto-reindex after write (default: true)
}

export interface WriteFileResult {
  success: boolean;
  filePath: string;
  bytesWritten?: number;
  reindexed?: boolean;
  chunksCreated?: number;
  message: string;
}

/**
 * Writes a file and optionally reindexes it
 */
export async function writeFile(
  params: WriteFileParams,
  indexManager: IndexManager,
  workspaceRoot: string
): Promise<WriteFileResult> {
  try {
    // Resolve file path
    const filePath = path.isAbsolute(params.path)
      ? params.path
      : path.join(workspaceRoot, params.path);
    
    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Write file
    fs.writeFileSync(filePath, params.content, "utf-8");
    const bytesWritten = Buffer.byteLength(params.content, "utf-8");
    
    console.error(`Wrote ${bytesWritten} bytes to ${params.path}`);
    
    // Auto-reindex if enabled
    const autoReindex = params.autoReindex !== false;
    let reindexed = false;
    let chunksCreated = 0;
    
    if (autoReindex) {
      try {
        console.error(`Auto-reindexing ${params.path}...`);
        const reindexResult = await indexManager.reindexFile(filePath, workspaceRoot);
        
        if (reindexResult.success) {
          reindexed = true;
          chunksCreated = reindexResult.chunksCreated;
          console.error(`Reindexed ${params.path}: ${chunksCreated} chunk(s) created`);
        } else {
          console.error(`Warning: Reindexing failed: ${reindexResult.error}`);
        }
      } catch (error) {
        console.error(`Warning: Could not reindex file: ${error}`);
      }
    }
    
    const message = reindexed
      ? `Wrote ${bytesWritten} bytes to ${params.path} and reindexed (${chunksCreated} chunk(s))`
      : `Wrote ${bytesWritten} bytes to ${params.path}`;
    
    return {
      success: true,
      filePath: params.path,
      bytesWritten,
      reindexed,
      chunksCreated: reindexed ? chunksCreated : undefined,
      message,
    };
  } catch (error) {
    console.error(`Error in writeFile tool: ${error}`);
    return {
      success: false,
      filePath: params.path,
      message: `Failed to write file: ${error}`,
    };
  }
}
