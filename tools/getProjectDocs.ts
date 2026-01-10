/**
 * @fileoverview Tool for reading project documentation
 * Retrieves generated markdown documents for project context
 */

import { ProjectKnowledgeService, ProjectDocType, ProjectDoc } from "../common/projectKnowledgeService.js";

export interface GetProjectDocsParams {
  projectId: string;      // Project identifier (REQUIRED)
  document?: string;      // Specific document to retrieve (or "all" / "summary")
  format?: "full" | "summary";  // Output format
}

export interface GetProjectDocsResult {
  success: boolean;
  message: string;
  documents?: ProjectDoc[];
  summary?: string;
  stats?: {
    documentCount: number;
    totalReasoningTokens: number;
    totalOutputTokens: number;
    lastGenerated?: string;
  };
}

const VALID_DOC_TYPES: ProjectDocType[] = [
  "projectBrief",
  "productContext", 
  "systemPatterns",
  "techContext",
  "activeContext",
  "progress",
];

/**
 * Retrieves project documentation
 */
export async function getProjectDocs(
  params: GetProjectDocsParams,
  projectKnowledgeService: ProjectKnowledgeService
): Promise<GetProjectDocsResult> {
  try {
    const projectId = params.projectId;
    const format = params.format || "full";
    const requestedDoc = params.document?.toLowerCase();
    
    // Check if any documents exist for this project
    if (!projectKnowledgeService.hasDocuments(projectId)) {
      return {
        success: false,
        message: `No project documentation has been generated for project "${projectId}" yet. Run memorybank_generate_project_docs first.`,
        stats: {
          documentCount: 0,
          totalReasoningTokens: 0,
          totalOutputTokens: 0,
        },
      };
    }
    
    // Get stats for this project
    const stats = projectKnowledgeService.getStats(projectId);
    const statsResult = {
      documentCount: stats.documentCount,
      totalReasoningTokens: stats.totalReasoningTokens,
      totalOutputTokens: stats.totalOutputTokens,
      lastGenerated: stats.lastGenerated?.toISOString(),
    };
    
    // Handle summary request
    if (requestedDoc === "summary" || format === "summary") {
      const summary = projectKnowledgeService.getDocumentsSummary(projectId);
      
      return {
        success: true,
        message: `Retrieved summary of ${stats.documentCount} project documents for "${projectId}".`,
        summary,
        stats: statsResult,
      };
    }
    
    // Handle "all" or no specific document
    if (!requestedDoc || requestedDoc === "all") {
      const documents = projectKnowledgeService.getAllDocuments(projectId);
      
      return {
        success: true,
        message: `Retrieved ${documents.length} project documents for "${projectId}".`,
        documents,
        stats: statsResult,
      };
    }
    
    // Handle specific document request
    // Normalize document name (allow both "projectBrief" and "projectbrief")
    const normalizedDoc = VALID_DOC_TYPES.find(
      t => t.toLowerCase() === requestedDoc.replace(".md", "").replace("_", "")
    );
    
    if (!normalizedDoc) {
      return {
        success: false,
        message: `Invalid document type: "${params.document}". Valid types are: ${VALID_DOC_TYPES.join(", ")}`,
        stats: statsResult,
      };
    }
    
    const document = projectKnowledgeService.getDocument(projectId, normalizedDoc);
    
    if (!document) {
      return {
        success: false,
        message: `Document "${normalizedDoc}" has not been generated yet for project "${projectId}".`,
        stats: statsResult,
      };
    }
    
    return {
      success: true,
      message: `Retrieved document: ${normalizedDoc} for project "${projectId}"`,
      documents: [document],
      stats: statsResult,
    };
  } catch (error: any) {
    console.error(`Error getting project docs: ${error.message}`);
    
    return {
      success: false,
      message: `Failed to retrieve project documentation: ${error.message}`,
    };
  }
}

/**
 * Tool definition for MCP
 */
export const getProjectDocsToolDefinition = {
  name: "memorybank_get_project_docs",
  description: `Lee la documentación del proyecto generada por IA.

Recupera documentos markdown estructurados que proporcionan contexto global del proyecto:
- projectBrief: Descripción general del proyecto
- productContext: Perspectiva de negocio y usuarios
- systemPatterns: Patrones de arquitectura y diseño
- techContext: Stack tecnológico y dependencias
- activeContext: Estado actual de desarrollo
- progress: Seguimiento de cambios

Usa esta herramienta al inicio de cada sesión para cargar contexto global.
Complementa la búsqueda semántica precisa (memorybank_search) con visión de alto nivel.`,
  
  inputSchema: {
    type: "object",
    properties: {
      document: {
        type: "string",
        description: "Documento específico a recuperar. Opciones: projectBrief, productContext, systemPatterns, techContext, activeContext, progress, all, summary",
        default: "summary",
      },
      format: {
        type: "string",
        enum: ["full", "summary"],
        description: "Formato de salida: 'full' devuelve contenido completo, 'summary' devuelve resumen de todos los docs",
        default: "full",
      },
    },
  },
};
