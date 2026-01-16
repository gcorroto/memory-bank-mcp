/**
 * @fileoverview Tool for generating project documentation
 * Uses the Project Knowledge Service to create structured markdown docs
 */

import { ProjectKnowledgeService, ProjectDocType, GenerationResult } from "../common/projectKnowledgeService.js";
import { VectorStore } from "../common/vectorStore.js";
import { AgentBoard } from "../common/agentBoard.js";
import { sessionLogger } from "../common/sessionLogger.js";
import * as path from "path";

import { sessionState } from "../common/sessionState.js";

export interface GenerateProjectDocsParams {
  projectId?: string;     // Optional project ID to filter chunks
  force?: boolean;        // Force regeneration of all documents
  documents?: string[];   // Specific documents to generate (default: all)
}

export interface GenerateProjectDocsResult {
  success: boolean;
  message: string;
  result: GenerationResult;
  tokenUsage: {
    reasoningTokens: number;
    outputTokens: number;
    estimatedCost: string;
  };
}

/**
 * Generates project documentation using AI reasoning
 */
export async function generateProjectDocs(
  params: GenerateProjectDocsParams,
  projectKnowledgeService: ProjectKnowledgeService,
  vectorStore: VectorStore,
  workspaceRoot: string = process.cwd() // Add workspaceRoot
): Promise<GenerateProjectDocsResult> {
  try {
    console.error("\n=== Generating Project Documentation ===");
    const projectId = params.projectId || "default";
    console.error(`Project ID: ${projectId}`);
    
    // Fetch Session History via Session State
    let sessionHistory: string | undefined;
    const activeAgentId = sessionState.getCurrentAgentId();
    if (activeAgentId) {
        try {
            const board = new AgentBoard(workspaceRoot, projectId);
            const sessionId = await board.getSessionId(activeAgentId);
            
            if (sessionId) {
                console.error(`Fetching session history for session: ${sessionId}`);
                const history = await sessionLogger.getSessionHistory(projectId, sessionId);
                if (history && history.length > 0) {
                    // Summarize last 20 events
                    const recentEvents = history.slice(-20);
                    sessionHistory = recentEvents.map(e => {
                        const dataStr = JSON.stringify(e.data).slice(0, 200); // Truncate data
                        return `- [${e.timestamp.split('T')[1].split('.')[0]}] ${e.type}: ${dataStr}`;
                    }).join('\n');
                }
            }
        } catch (e) {
            console.error(`Warning: Failed to fetch session history: ${e}`);
        }
    }

    console.error(`Force regeneration: ${params.force || false}`);
    const chunks = await vectorStore.getAllChunks(params.projectId);
    
    if (chunks.length === 0) {
      return {
        success: false,
        message: "No indexed code found. Please run memorybank_index_code first to index your project.",
        result: {
          success: false,
          documentsGenerated: [],
          documentsUpdated: [],
          documentsSkipped: [],
          totalReasoningTokens: 0,
          totalOutputTokens: 0,
          errors: ["No chunks available for documentation generation"],
        },
        tokenUsage: {
          reasoningTokens: 0,
          outputTokens: 0,
          estimatedCost: "$0.00",
        },
      };
    }
    
    console.error(`Found ${chunks.length} code chunks to analyze`);
    
    // Generate documents - projectId is required
    const result = await projectKnowledgeService.generateAllDocuments(
      projectId,
      chunks,
      params.force || false,
      sessionHistory
    );
    
    // Calculate estimated cost (approximate rates for gpt-5-mini)
    // Reasoning tokens are typically more expensive
    const reasoningCostPer1K = 0.003;  // $0.003 per 1K reasoning tokens
    const outputCostPer1K = 0.012;      // $0.012 per 1K output tokens
    
    const reasoningCost = (result.totalReasoningTokens / 1000) * reasoningCostPer1K;
    const outputCost = (result.totalOutputTokens / 1000) * outputCostPer1K;
    const totalCost = reasoningCost + outputCost;
    
    // Build response message
    let message = "";
    
    if (result.documentsGenerated.length > 0) {
      message += `Generated ${result.documentsGenerated.length} new document(s): ${result.documentsGenerated.join(", ")}. `;
    }
    
    if (result.documentsUpdated.length > 0) {
      message += `Updated ${result.documentsUpdated.length} document(s): ${result.documentsUpdated.join(", ")}. `;
    }
    
    if (result.documentsSkipped.length > 0) {
      message += `Skipped ${result.documentsSkipped.length} unchanged document(s). `;
    }
    
    if (result.errors.length > 0) {
      message += `Errors: ${result.errors.join("; ")}`;
    }
    
    if (!message) {
      message = "All documents are up to date.";
    }
    
    console.error(`\nGeneration complete:`);
    console.error(`  - Generated: ${result.documentsGenerated.length}`);
    console.error(`  - Updated: ${result.documentsUpdated.length}`);
    console.error(`  - Skipped: ${result.documentsSkipped.length}`);
    console.error(`  - Reasoning tokens: ${result.totalReasoningTokens}`);
    console.error(`  - Output tokens: ${result.totalOutputTokens}`);
    console.error(`  - Estimated cost: $${totalCost.toFixed(4)}`);
    
    return {
      success: result.success,
      message,
      result,
      tokenUsage: {
        reasoningTokens: result.totalReasoningTokens,
        outputTokens: result.totalOutputTokens,
        estimatedCost: `$${totalCost.toFixed(4)}`,
      },
    };
  } catch (error: any) {
    console.error(`Error generating project docs: ${error.message}`);
    
    return {
      success: false,
      message: `Failed to generate project documentation: ${error.message}`,
      result: {
        success: false,
        documentsGenerated: [],
        documentsUpdated: [],
        documentsSkipped: [],
        totalReasoningTokens: 0,
        totalOutputTokens: 0,
        errors: [error.message],
      },
      tokenUsage: {
        reasoningTokens: 0,
        outputTokens: 0,
        estimatedCost: "$0.00",
      },
    };
  }
}

/**
 * Tool definition for MCP
 */
export const generateProjectDocsToolDefinition = {
  name: "memorybank_generate_project_docs",
  description: `Genera documentación estructurada del proyecto usando IA con razonamiento avanzado (gpt-5-mini).
  
Crea 6 documentos markdown que proporcionan una visión global del proyecto:
- projectBrief.md: Descripción general del proyecto
- productContext.md: Perspectiva de negocio y usuarios
- systemPatterns.md: Patrones de arquitectura y diseño
- techContext.md: Stack tecnológico y dependencias
- activeContext.md: Estado actual de desarrollo
- progress.md: Seguimiento de cambios

Esta herramienta complementa la búsqueda semántica precisa con conocimiento global del proyecto.
Útil para que agentes menos avanzados comprendan mejor el contexto completo.`,
  
  inputSchema: {
    type: "object",
    properties: {
      projectId: {
        type: "string",
        description: "ID del proyecto (opcional, usa 'default' si no se especifica)",
      },
      force: {
        type: "boolean",
        description: "Forzar regeneración de todos los documentos aunque no hayan cambiado",
        default: false,
      },
    },
  },
};
