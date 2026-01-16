/**
 * @fileoverview Index code tool for Memory Bank
 * Indexes code files semantically
 */

import * as path from "path";
import { IndexManager } from "../common/indexManager.js";
import { AgentBoard } from "../common/agentBoard.js";
import { sessionLogger } from "../common/sessionLogger.js";
import { sessionState } from "../common/sessionState.js";

export interface IndexCodeParams {
  projectId: string;       // Project identifier (REQUIRED)
  path?: string;           // Path to index (default: workspace root)
  recursive?: boolean;     // Index recursively (default: true)
  forceReindex?: boolean;  // Force reindexing (default: false)
}

export interface IndexCodeResult {
  success: boolean;
  filesProcessed: number;
  chunksCreated: number;
  duration: number;
  errors?: string[];
  message: string;
}

/**
 * Indexes code from a directory or file
 */
export async function indexCode(
  params: IndexCodeParams,
  indexManager: IndexManager,
  workspaceRoot: string
): Promise<IndexCodeResult> {
  try {
    // Determine path to index
    const targetPath = params.path
      ? path.isAbsolute(params.path)
        ? params.path
        : path.join(workspaceRoot, params.path)
      : workspaceRoot;
    
    console.error(`\nIndexing code at: ${targetPath}`);
    console.error(`Project ID: ${params.projectId}`);
    
    // Session Logging via Session State
    const activeAgentId = sessionState.getCurrentAgentId();
    if (activeAgentId) {
      try {
        const board = new AgentBoard(workspaceRoot, params.projectId);
        const sessionId = await board.getSessionId(activeAgentId);
        
        if (sessionId) {
          await sessionLogger.logSessionEvent(params.projectId, sessionId, {
            timestamp: new Date().toISOString(),
            type: 'index',
            data: {
              path: targetPath,
              recursive: params.recursive !== false,
              force: params.forceReindex || false
            }
          });
        }
      } catch (logError) {
        console.error(`Failed to log session event: ${logError}`);
      }
    }

    console.error(`Workspace root: ${workspaceRoot}`);
    console.error(`Recursive: ${params.recursive !== false}`);
    console.error(`Force reindex: ${params.forceReindex || false}`);
    
    // Run indexing - pass workspaceRoot for consistent path normalization
    const result = await indexManager.indexFiles({
      projectId: params.projectId,
      rootPath: targetPath,
      workspaceRoot: workspaceRoot,  // Always normalize paths relative to workspace
      recursive: params.recursive !== false,
      forceReindex: params.forceReindex || false,
    });
    
    // Format result
    const message = result.filesProcessed > 0
      ? `Successfully indexed ${result.filesProcessed} file(s), created ${result.chunksCreated} chunk(s) in ${(result.duration / 1000).toFixed(2)}s`
      : result.errors.length > 0
      ? `Indexing completed with errors`
      : `No files needed indexing (all up to date)`;
    
    return {
      success: result.errors.length === 0,
      filesProcessed: result.filesProcessed,
      chunksCreated: result.chunksCreated,
      duration: result.duration,
      errors: result.errors.length > 0 ? result.errors : undefined,
      message,
    };
  } catch (error) {
    console.error(`Error in indexCode tool: ${error}`);
    return {
      success: false,
      filesProcessed: 0,
      chunksCreated: 0,
      duration: 0,
      errors: [String(error)],
      message: `Failed to index code: ${error}`,
    };
  }
}
