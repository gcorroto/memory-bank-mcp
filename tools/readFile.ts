/**
 * @fileoverview Read file tool for Memory Bank
 * Reads files from the workspace
 */

import * as fs from "fs";
import * as path from "path";
import { AgentBoard } from "../common/agentBoard.js";
import { sessionLogger } from "../common/sessionLogger.js";
import { sessionState } from "../common/sessionState.js";

export interface ReadFileParams {
  path: string;            // File path to read
  startLine?: number;      // Start line (optional)
  endLine?: number;        // End line (optional)
  projectId?: string;      // Project identifier (Optional, required for logging)
}

export interface ReadFileResult {
  success: boolean;
  content?: string;
  filePath: string;
  totalLines?: number;
  linesRead?: {
    start: number;
    end: number;
  };
  size?: number;
  lastModified?: Date;
  message: string;
}

/**
 * Reads a file from the workspace
 */
export async function readFile(
  params: ReadFileParams,
  workspaceRoot: string
): Promise<ReadFileResult> {
  try {
    // Resolve file path
    const filePath = path.isAbsolute(params.path)
      ? params.path
      : path.join(workspaceRoot, params.path);
    
    // Session Logging via Session State
    const activeAgentId = sessionState.getCurrentAgentId();
    if (activeAgentId && params.projectId) {
      try {
        const board = new AgentBoard(workspaceRoot, params.projectId);
        const sessionId = await board.getSessionId(activeAgentId);
        
        if (sessionId) {
          await sessionLogger.logSessionEvent(params.projectId, sessionId, {
            timestamp: new Date().toISOString(),
            type: 'read_file',
            data: {
              path: params.path,
              lines: params.startLine && params.endLine ? `${params.startLine}-${params.endLine}` : 'all'
            }
          }, activeAgentId);
        }
      } catch (logError) {
        console.error(`Failed to log session event: ${logError}`);
      }
    }

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return {
        success: false,
        filePath: params.path,
        message: `File not found: ${params.path}`,
      };
    }
    
    // Check if it's a file
    const stats = fs.statSync(filePath);
    if (!stats.isFile()) {
      return {
        success: false,
        filePath: params.path,
        message: `Path is not a file: ${params.path}`,
      };
    }
    
    // Read file
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    const totalLines = lines.length;
    
    // Apply line range if specified
    let finalContent = content;
    let linesRead: { start: number; end: number } | undefined;
    
    if (params.startLine !== undefined || params.endLine !== undefined) {
      const start = Math.max(0, (params.startLine || 1) - 1);
      const end = Math.min(totalLines, params.endLine || totalLines);
      
      finalContent = lines.slice(start, end).join("\n");
      linesRead = { start: start + 1, end };
    }
    
    const message = linesRead
      ? `Read lines ${linesRead.start}-${linesRead.end} from ${params.path} (${totalLines} total lines)`
      : `Read ${params.path} (${totalLines} lines, ${stats.size} bytes)`;
    
    console.error(message);
    
    return {
      success: true,
      content: finalContent,
      filePath: params.path,
      totalLines,
      linesRead,
      size: stats.size,
      lastModified: stats.mtime,
      message,
    };
  } catch (error) {
    console.error(`Error in readFile tool: ${error}`);
    return {
      success: false,
      filePath: params.path,
      message: `Failed to read file: ${error}`,
    };
  }
}
