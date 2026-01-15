#!/usr/bin/env node

/**
 * @fileoverview Memory Bank MCP Server
 * Semantic code indexing and retrieval using vector embeddings
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as path from "path";
import * as fs from "fs";

/**
 * Detects the workspace root by searching for common project markers
 * Searches upward from startPath looking for .git, package.json, etc.
 * This mimics how Git finds the repository root
 */
function detectWorkspaceRoot(startPath: string): string {
  let currentDir = path.resolve(startPath);
  const root = path.parse(currentDir).root;
  
  // Markers that indicate a project/workspace root (in priority order)
  const rootMarkers = [
    ".git",           // Git repository root
    "package.json",   // Node.js project
    "pom.xml",        // Maven project
    "build.gradle",   // Gradle project
    "Cargo.toml",     // Rust project
    "go.mod",         // Go module
    "pyproject.toml", // Python project
    "setup.py",       // Python project (legacy)
    ".project",       // Eclipse project
    "*.sln",          // .NET solution (special handling below)
  ];
  
  while (currentDir !== root) {
    // Check each marker
    for (const marker of rootMarkers) {
      if (marker === "*.sln") {
        // Special case: check for any .sln file
        try {
          const files = fs.readdirSync(currentDir);
          if (files.some(f => f.endsWith(".sln"))) {
            console.error(`Detected workspace root via .sln file: ${currentDir}`);
            return currentDir;
          }
        } catch { /* ignore */ }
      } else {
        const markerPath = path.join(currentDir, marker);
        if (fs.existsSync(markerPath)) {
          console.error(`Detected workspace root via ${marker}: ${currentDir}`);
          return currentDir;
        }
      }
    }
    
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }
  
  // Fallback: return the original startPath
  console.error(`No project markers found, using startPath as workspace root: ${startPath}`);
  return startPath;
}

// Import Memory Bank services
import { createEmbeddingService, EmbeddingService } from "./common/embeddingService.js";
import { createVectorStore, VectorStore } from "./common/vectorStore.js";
import { createIndexManager, IndexManager } from "./common/indexManager.js";
import { createProjectKnowledgeService, ProjectKnowledgeService } from "./common/projectKnowledgeService.js";

// Import tools
import { indexCode } from "./tools/indexCode.js";
import { searchMemory } from "./tools/searchMemory.js";
import { readFile } from "./tools/readFile.js";
import { writeFile } from "./tools/writeFile.js";
import { getStats } from "./tools/getStats.js";
import { analyzeCoverage } from "./tools/analyzeCoverage.js";
import { generateProjectDocs, generateProjectDocsToolDefinition } from "./tools/generateProjectDocs.js";
import { getProjectDocs, getProjectDocsToolDefinition } from "./tools/getProjectDocs.js";

// Import new context management tools
import { initializeMemoryBank, initializeMemoryBankToolDefinition } from "./tools/initializeMemoryBank.js";
import { updateContext, updateContextToolDefinition } from "./tools/updateContext.js";
import { recordDecision, recordDecisionToolDefinition } from "./tools/recordDecision.js";
import { trackProgress, trackProgressToolDefinition } from "./tools/trackProgress.js";
import { manageAgentsTool, manageAgentsToolDefinition } from "./tools/manageAgents.js";


import { VERSION } from "./common/version.js";

// Global services
let embeddingService: EmbeddingService;
let vectorStore: VectorStore;
let indexManager: IndexManager;
let projectKnowledgeService: ProjectKnowledgeService;
let workspaceRoot: string;

// Create the MCP Server
const server = new McpServer({
  name: "memory-bank-mcp-server",
  version: VERSION,
});

// Tool: Index Code
server.tool(
  "memorybank_index_code",
  `Indexa semánticamente código de un DIRECTORIO para búsquedas semánticas.

⚠️ IMPORTANTE:
- El path debe ser una RUTA ABSOLUTA a un DIRECTORIO (no archivo)
- Ejemplo correcto: "C:/workspaces/mi-proyecto/src/components"
- Ejemplo incorrecto: "src/components" (ruta relativa)
- Ejemplo incorrecto: "C:/workspaces/mi-proyecto/src/file.ts" (archivo, no directorio)

Si quieres indexar un archivo específico, usa el directorio que lo contiene.`,
  {
    projectId: z
      .string()
      .describe("Identificador único del proyecto (OBLIGATORIO). Debe coincidir con el definido en AGENTS.md"),
    path: z
      .string()
      .describe("RUTA ABSOLUTA al DIRECTORIO a indexar. Ejemplo: 'C:/workspaces/proyecto/src'. NO usar rutas relativas. NO usar rutas a archivos."),
    recursive: z
      .boolean()
      .optional()
      .default(true)
      .describe("Indexar recursivamente subdirectorios (default: true)"),
    forceReindex: z
      .boolean()
      .optional()
      .default(false)
      .describe("RARAMENTE NECESARIO. El sistema detecta cambios por hash automáticamente. Solo usa true si necesitas regenerar embeddings sin cambios en archivos."),
  },
  async (args) => {
    const result = await indexCode(
      {
        projectId: args.projectId,
        path: args.path,
        recursive: args.recursive,
        forceReindex: args.forceReindex,
      },
      indexManager,
      workspaceRoot
    );
    
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// Tool: Search Memory Bank
server.tool(
  "memorybank_search",
  "Busca código relevante mediante búsqueda semántica vectorial. Usa esta herramienta SIEMPRE que necesites información sobre el código. El projectId es OBLIGATORIO",
  {
    projectId: z
      .string()
      .describe("Identificador del proyecto donde buscar (OBLIGATORIO). Debe coincidir con el usado al indexar"),
    query: z
      .string()
      .describe("Consulta semántica: describe qué estás buscando en lenguaje natural (ej: 'función de autenticación', '¿cómo se validan los emails?')"),
    topK: z
      .number()
      .optional()
      .default(10)
      .describe("Número máximo de resultados a retornar"),
    minScore: z
      .number()
      .optional()
      .default(0.4)
      .describe("Puntuación mínima de similitud (0-1). por defecto usa 0.4 y basado en el resultado ajusta el valor"),
    filterByFile: z
      .string()
      .optional()
      .describe("Filtrar resultados por patrón de ruta de archivo (ej: 'auth/', 'utils.ts')"),
    filterByLanguage: z
      .string()
      .optional()
      .describe("Filtrar resultados por lenguaje de programación (ej: 'typescript', 'python')"),
  },
  async (args) => {
    const result = await searchMemory(
      {
        projectId: args.projectId,
        query: args.query,
        topK: args.topK,
        minScore: args.minScore,
        filterByFile: args.filterByFile,
        filterByLanguage: args.filterByLanguage,
      },
      indexManager
    );
    
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// Tool: Read File
server.tool(
  "memorybank_read_file",
  `Lee el contenido de un archivo específico. Usa para obtener contexto adicional.

⚠️ Preferir RUTA ABSOLUTA para evitar errores.
Ejemplo: "C:/workspaces/proyecto/src/index.ts"`,
  {
    path: z
      .string()
      .describe("Ruta al archivo. Preferir ABSOLUTA: 'C:/workspaces/proyecto/src/file.ts'"),
    startLine: z
      .number()
      .optional()
      .describe("Línea inicial (opcional)"),
    endLine: z
      .number()
      .optional()
      .describe("Línea final (opcional)"),
  },
  async (args) => {
    const result = await readFile(
      {
        path: args.path,
        startLine: args.startLine,
        endLine: args.endLine,
      },
      workspaceRoot
    );
    
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// Tool: Write File
server.tool(
  "memorybank_write_file",
  `Escribe un archivo y automáticamente lo reindexa en el Memory Bank.

⚠️ Preferir RUTA ABSOLUTA para evitar errores.
Ejemplo path: "C:/workspaces/proyecto/src/nuevo.ts"`,
  {
    projectId: z
      .string()
      .describe("Identificador del proyecto (OBLIGATORIO)"),
    path: z
      .string()
      .describe("Ruta al archivo. Preferir ABSOLUTA: 'C:/workspaces/proyecto/src/file.ts'"),
    content: z
      .string()
      .describe("Contenido COMPLETO del archivo"),
    autoReindex: z
      .boolean()
      .optional()
      .default(true)
      .describe("Auto-reindexar después de escribir (default: true)"),
  },
  async (args) => {
    const result = await writeFile(
      {
        projectId: args.projectId,
        path: args.path,
        content: args.content,
        autoReindex: args.autoReindex,
      },
      indexManager,
      workspaceRoot
    );
    
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// Tool: Get Statistics
server.tool(
  "memorybank_get_stats",
  "Obtiene estadísticas del Memory Bank: archivos indexados, chunks totales, última indexación, etc. Usa esta herramienta al inicio de cada sesión",
  {},
  async () => {
    const result = await getStats(indexManager, embeddingService);
    
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// Tool: Analyze Coverage
server.tool(
  "memorybank_analyze_coverage",
  `Analiza la cobertura de indexación del proyecto. RÁPIDO (~2s).

⚠️ IMPORTANTE:
- path debe ser RUTA ABSOLUTA al DIRECTORIO raíz del workspace
- Ejemplo: "C:/workspaces/mi-proyecto" (NO rutas relativas)
- Por defecto NO incluye árbol de directorios (lento en proyectos grandes)`,
  {
    projectId: z
      .string()
      .describe("Identificador del proyecto (OBLIGATORIO)"),
    path: z
      .string()
      .describe("RUTA ABSOLUTA al directorio raíz del workspace. Ejemplo: 'C:/workspaces/mi-proyecto'"),
    includeTree: z
      .boolean()
      .optional()
      .default(false)
      .describe("Incluir árbol de directorios detallado (LENTO en proyectos grandes, omitir normalmente)"),
  },
  async (args) => {
    try {
      const targetPath = args.path;
      const result = await analyzeCoverage(indexManager, vectorStore, targetPath, args.projectId, args.includeTree);
      
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      console.error(`Error in analyze_coverage: ${error}`);
      return {
        content: [{ 
          type: "text", 
          text: JSON.stringify({
            success: false,
            message: `Error al analizar cobertura: ${error}`,
            stats: {
              totalFiles: 0,
              indexedFiles: 0,
              notIndexedFiles: 0,
              pendingReindexFiles: 0,
              ignoredFiles: 0,
              totalSize: 0,
              indexedSize: 0,
              coveragePercentage: 0,
              totalChunks: 0,
              languageBreakdown: {},
              directoryBreakdown: {},
            },
            tree: {
              name: "root",
              path: "",
              type: "directory",
              status: "not_indexed",
              children: [],
            },
            recommendations: ["Error al escanear workspace. Verifica la ruta y permisos."],
          }, null, 2)
        }],
      };
    }
  }
);

// Tool: Generate Project Docs
server.tool(
  generateProjectDocsToolDefinition.name,
  generateProjectDocsToolDefinition.description + ". El projectId es OBLIGATORIO",
  {
    projectId: z
      .string()
      .describe("Identificador del proyecto (OBLIGATORIO). Debe coincidir con el usado al indexar"),
    force: z
      .boolean()
      .optional()
      .default(false)
      .describe("Forzar regeneración de todos los documentos aunque no hayan cambiado"),
  },
  async (args) => {
    const result = await generateProjectDocs(
      {
        projectId: args.projectId,
        force: args.force,
      },
      projectKnowledgeService,
      vectorStore
    );
    
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// Tool: Get Project Docs
server.tool(
  getProjectDocsToolDefinition.name,
  getProjectDocsToolDefinition.description + ". El projectId es OBLIGATORIO",
  {
    projectId: z
      .string()
      .describe("Identificador del proyecto (OBLIGATORIO). Debe coincidir con el usado al generar los docs"),
    document: z
      .string()
      .optional()
      .default("summary")
      .describe("Documento específico a recuperar: projectBrief, productContext, systemPatterns, techContext, activeContext, progress, all, summary"),
    format: z
      .enum(["full", "summary"])
      .optional()
      .default("full")
      .describe("Formato de salida: 'full' devuelve contenido completo, 'summary' devuelve resumen de todos los docs"),
  },
  async (args) => {
    const result = await getProjectDocs(
      {
        projectId: args.projectId,
        document: args.document,
        format: args.format,
      },
      projectKnowledgeService
    );
    
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// ==========================================
// Context Management Tools (Cline-style)
// ==========================================

// Tool: Initialize Memory Bank
server.tool(
  initializeMemoryBankToolDefinition.name,
  initializeMemoryBankToolDefinition.description + `

⚠️ projectPath debe ser RUTA ABSOLUTA. Ejemplo: "C:/workspaces/mi-proyecto"`,
  {
    projectId: z
      .string()
      .describe("Identificador único del proyecto (OBLIGATORIO)"),
    projectPath: z
      .string()
      .describe("RUTA ABSOLUTA al proyecto. Ejemplo: 'C:/workspaces/mi-proyecto'"),
    projectName: z
      .string()
      .optional()
      .describe("Nombre legible del proyecto (opcional)"),
    description: z
      .string()
      .optional()
      .describe("Descripción inicial del proyecto (opcional)"),
  },
  async (args) => {
    const storagePath = process.env.MEMORYBANK_STORAGE_PATH || ".memorybank";
    const result = await initializeMemoryBank(
      {
        projectId: args.projectId,
        projectPath: args.projectPath,
        projectName: args.projectName,
        description: args.description,
      },
      storagePath
    );
    
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// Tool: Update Context
server.tool(
  updateContextToolDefinition.name,
  updateContextToolDefinition.description,
  {
    projectId: z
      .string()
      .describe("Identificador único del proyecto (OBLIGATORIO)"),
    currentSession: z
      .object({
        date: z.string().optional().describe("Fecha de la sesión (YYYY-MM-DD)"),
        mode: z.string().optional().describe("Modo de trabajo: development, debugging, refactoring, etc."),
        task: z.string().optional().describe("Descripción de la tarea actual"),
      })
      .optional()
      .describe("Información de la sesión actual"),
    recentChanges: z
      .array(z.string())
      .optional()
      .describe("Lista de cambios recientes realizados"),
    openQuestions: z
      .array(z.string())
      .optional()
      .describe("Preguntas pendientes de resolver"),
    nextSteps: z
      .array(z.string())
      .optional()
      .describe("Próximos pasos planificados"),
    notes: z
      .string()
      .optional()
      .describe("Notas adicionales o consideraciones"),
  },
  async (args) => {
    const storagePath = process.env.MEMORYBANK_STORAGE_PATH || ".memorybank";
    const result = await updateContext(
      {
        projectId: args.projectId,
        currentSession: args.currentSession,
        recentChanges: args.recentChanges,
        openQuestions: args.openQuestions,
        nextSteps: args.nextSteps,
        notes: args.notes,
      },
      storagePath
    );
    
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// Tool: Record Decision
server.tool(
  recordDecisionToolDefinition.name,
  recordDecisionToolDefinition.description,
  {
    projectId: z
      .string()
      .describe("Identificador único del proyecto (OBLIGATORIO)"),
    decision: z
      .object({
        title: z.string().describe("Título corto y descriptivo de la decisión"),
        description: z.string().describe("Descripción detallada de lo que se decidió"),
        rationale: z.string().describe("Por qué se tomó esta decisión"),
        alternatives: z.array(z.string()).optional().describe("Alternativas consideradas"),
        impact: z.string().optional().describe("Impacto esperado de la decisión"),
        category: z.string().optional().describe("Categoría: architecture, technology, dependencies, etc."),
        date: z.string().optional().describe("Fecha de la decisión (YYYY-MM-DD)"),
      })
      .describe("Información de la decisión a registrar"),
  },
  async (args) => {
    const storagePath = process.env.MEMORYBANK_STORAGE_PATH || ".memorybank";
    const result = await recordDecision(
      {
        projectId: args.projectId,
        decision: args.decision,
      },
      storagePath
    );
    
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// Tool: Track Progress
server.tool(
  trackProgressToolDefinition.name,
  trackProgressToolDefinition.description,
  {
    projectId: z
      .string()
      .describe("Identificador único del proyecto (OBLIGATORIO)"),
    progress: z
      .object({
        completed: z.array(z.string()).optional().describe("Tareas completadas"),
        inProgress: z.array(z.string()).optional().describe("Tareas en progreso"),
        blocked: z.array(z.string()).optional().describe("Tareas bloqueadas"),
        upcoming: z.array(z.string()).optional().describe("Próximas tareas"),
      })
      .optional()
      .describe("Tareas a actualizar"),
    milestone: z
      .object({
        name: z.string().describe("Nombre del milestone"),
        status: z.enum(["pending", "in_progress", "completed"]).describe("Estado del milestone"),
        targetDate: z.string().optional().describe("Fecha objetivo"),
        notes: z.string().optional().describe("Notas adicionales"),
      })
      .optional()
      .describe("Milestone a añadir o actualizar"),
    blockers: z
      .array(
        z.object({
          description: z.string().describe("Descripción del blocker"),
          severity: z.enum(["low", "medium", "high"]).describe("Severidad"),
        })
      )
      .optional()
      .describe("Blockers a registrar"),
    phase: z
      .string()
      .optional()
      .describe("Fase actual del proyecto"),
    phaseStatus: z
      .string()
      .optional()
      .describe("Estado de la fase"),
  },
  async (args) => {
    const storagePath = process.env.MEMORYBANK_STORAGE_PATH || ".memorybank";
    const result = await trackProgress(
      {
        projectId: args.projectId,
        progress: args.progress,
        milestone: args.milestone,
        blockers: args.blockers,
        phase: args.phase,
        phaseStatus: args.phaseStatus,
      },
      storagePath
    );
    
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// Tool: Manage Agents
server.tool(
  manageAgentsToolDefinition.name,
  manageAgentsToolDefinition.description,
  {
    projectId: z.string().describe("Identificador único del proyecto (OBLIGATORIO)"),
    action: z.enum(["register", "update_status", "claim_resource", "release_resource", "get_board"]).describe("Acción a realizar"),
    agentId: z.string().optional().describe("Identificador del agente (ej: 'dev-agent-1'). Requerido para escrituras."),
    status: z.string().optional().describe("Estado del agente (para update_status)."),
    focus: z.string().optional().describe("Tarea o fichero en el que se enfoca (para update_status)."),
    resource: z.string().optional().describe("Identificador del recurso a bloquear (ej: 'src/auth/')."),
  },
  async (args) => {
    const workspaceRoot = process.cwd();
    
    if ((args.action === 'register' || args.action === 'update_status') && !args.agentId) {
       throw new Error(`agentId is required for action ${args.action}`);
    }

    const result = await manageAgentsTool({
        projectId: args.projectId,
        action: args.action as any,
        agentId: args.agentId,
        status: args.status,
        focus: args.focus,
        resource: args.resource
    }, workspaceRoot);
    
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);


// ==========================================
// MCP Resources (Direct document access)
// ==========================================

// Resource: Project Active Context
server.resource(
  "memory://*/active",
  "Contexto activo del proyecto: sesión actual, cambios recientes, próximos pasos",
  async (uri) => {
    const projectId = uri.pathname.split("/")[0] || uri.host;
    
    if (!projectKnowledgeService) {
      return {
        contents: [{
          uri: uri.href,
          mimeType: "text/plain",
          text: "Error: Project Knowledge Service not initialized",
        }],
      };
    }
    
    const content = projectKnowledgeService.getProjectDocument(projectId, "activeContext");
    
    if (!content) {
      return {
        contents: [{
          uri: uri.href,
          mimeType: "text/plain",
          text: `No active context found for project "${projectId}". Run memorybank_initialize first.`,
        }],
      };
    }
    
    return {
      contents: [{
        uri: uri.href,
        mimeType: "text/markdown",
        text: content,
      }],
    };
  }
);

// Resource: Project Progress
server.resource(
  "memory://*/progress",
  "Seguimiento de progreso: tareas completadas, en progreso, bloqueadas y milestones",
  async (uri) => {
    const projectId = uri.pathname.split("/")[0] || uri.host;
    
    if (!projectKnowledgeService) {
      return {
        contents: [{
          uri: uri.href,
          mimeType: "text/plain",
          text: "Error: Project Knowledge Service not initialized",
        }],
      };
    }
    
    const content = projectKnowledgeService.getProjectDocument(projectId, "progress");
    
    if (!content) {
      return {
        contents: [{
          uri: uri.href,
          mimeType: "text/plain",
          text: `No progress tracking found for project "${projectId}". Run memorybank_initialize first.`,
        }],
      };
    }
    
    return {
      contents: [{
        uri: uri.href,
        mimeType: "text/markdown",
        text: content,
      }],
    };
  }
);

// Resource: Project Decisions
server.resource(
  "memory://*/decisions",
  "Log de decisiones técnicas: historial de decisiones arquitectónicas y técnicas",
  async (uri) => {
    const projectId = uri.pathname.split("/")[0] || uri.host;
    
    if (!projectKnowledgeService) {
      return {
        contents: [{
          uri: uri.href,
          mimeType: "text/plain",
          text: "Error: Project Knowledge Service not initialized",
        }],
      };
    }
    
    const content = projectKnowledgeService.getProjectDocument(projectId, "decisionLog");
    
    if (!content) {
      return {
        contents: [{
          uri: uri.href,
          mimeType: "text/plain",
          text: `No decision log found for project "${projectId}". Run memorybank_initialize first.`,
        }],
      };
    }
    
    return {
      contents: [{
        uri: uri.href,
        mimeType: "text/markdown",
        text: content,
      }],
    };
  }
);

// Resource: Project Context (Brief + Tech)
server.resource(
  "memory://*/context",
  "Contexto completo del proyecto: descripción general y stack tecnológico",
  async (uri) => {
    const projectId = uri.pathname.split("/")[0] || uri.host;
    
    if (!projectKnowledgeService) {
      return {
        contents: [{
          uri: uri.href,
          mimeType: "text/plain",
          text: "Error: Project Knowledge Service not initialized",
        }],
      };
    }
    
    const content = projectKnowledgeService.getProjectContext(projectId);
    
    if (!content) {
      return {
        contents: [{
          uri: uri.href,
          mimeType: "text/plain",
          text: `No project context found for project "${projectId}". Run memorybank_initialize first.`,
        }],
      };
    }
    
    return {
      contents: [{
        uri: uri.href,
        mimeType: "text/markdown",
        text: content,
      }],
    };
  }
);

// Resource: System Patterns
server.resource(
  "memory://*/patterns",
  "Patrones de sistema: arquitectura, patrones de diseño y organización del código",
  async (uri) => {
    const projectId = uri.pathname.split("/")[0] || uri.host;
    
    if (!projectKnowledgeService) {
      return {
        contents: [{
          uri: uri.href,
          mimeType: "text/plain",
          text: "Error: Project Knowledge Service not initialized",
        }],
      };
    }
    
    const content = projectKnowledgeService.getProjectDocument(projectId, "systemPatterns");
    
    if (!content) {
      return {
        contents: [{
          uri: uri.href,
          mimeType: "text/plain",
          text: `No system patterns found for project "${projectId}". Run memorybank_initialize or memorybank_generate_project_docs first.`,
        }],
      };
    }
    
    return {
      contents: [{
        uri: uri.href,
        mimeType: "text/markdown",
        text: content,
      }],
    };
  }
);

// Resource: Project Brief
server.resource(
  "memory://*/brief",
  "Descripción del proyecto: propósito, objetivos y audiencia",
  async (uri) => {
    const projectId = uri.pathname.split("/")[0] || uri.host;
    
    if (!projectKnowledgeService) {
      return {
        contents: [{
          uri: uri.href,
          mimeType: "text/plain",
          text: "Error: Project Knowledge Service not initialized",
        }],
      };
    }
    
    const content = projectKnowledgeService.getProjectDocument(projectId, "projectBrief");
    
    if (!content) {
      return {
        contents: [{
          uri: uri.href,
          mimeType: "text/plain",
          text: `No project brief found for project "${projectId}". Run memorybank_initialize or memorybank_generate_project_docs first.`,
        }],
      };
    }
    
    return {
      contents: [{
        uri: uri.href,
        mimeType: "text/markdown",
        text: content,
      }],
    };
  }
);

/**
 * Validates and initializes environment
 */
async function validateEnvironment() {
  console.error("=== Memory Bank MCP Server ===");
  console.error("Version:", VERSION);
  console.error("");
  
  // Validate OpenAI API Key
  if (!process.env.OPENAI_API_KEY) {
    console.error("ERROR: OPENAI_API_KEY environment variable is required");
    console.error("Get your API key from: https://platform.openai.com/api-keys");
    throw new Error("Missing OPENAI_API_KEY environment variable");
  }
  console.error("✓ OpenAI API key configured");
  
  // Get workspace root with smart detection
  if (process.env.MEMORYBANK_WORKSPACE_ROOT) {
    // Explicit configuration takes priority
    workspaceRoot = process.env.MEMORYBANK_WORKSPACE_ROOT;
    console.error(`✓ Workspace root (from env): ${workspaceRoot}`);
  } else {
    // Auto-detect by searching for project markers (.git, package.json, etc.)
    workspaceRoot = detectWorkspaceRoot(process.cwd());
    console.error(`✓ Workspace root (auto-detected): ${workspaceRoot}`);
  }
  
  // Storage path
  const storagePath = process.env.MEMORYBANK_STORAGE_PATH || ".memorybank";
  console.error(`✓ Storage path: ${storagePath}`);
  
  // Embedding model configuration
  const embeddingModel = process.env.MEMORYBANK_EMBEDDING_MODEL || "text-embedding-3-small";
  const embeddingDimensions = process.env.MEMORYBANK_EMBEDDING_DIMENSIONS || "1536";
  console.error(`✓ Embedding model: ${embeddingModel} (${embeddingDimensions} dimensions)`);
  
  // Project Knowledge Layer configuration
  const reasoningModel = process.env.MEMORYBANK_REASONING_MODEL || "gpt-5-mini";
  const reasoningEffort = process.env.MEMORYBANK_REASONING_EFFORT || "medium";
  const autoUpdateDocs = process.env.MEMORYBANK_AUTO_UPDATE_DOCS === "true";
  console.error(`✓ Reasoning model: ${reasoningModel} (effort: ${reasoningEffort})`);
  console.error(`✓ Auto-update docs: ${autoUpdateDocs}`);
  
  // Initialize services
  console.error("\nInitializing services...");
  
  try {
    embeddingService = createEmbeddingService();
    console.error("✓ Embedding service initialized");
    
    vectorStore = createVectorStore();
    await vectorStore.initialize();
    console.error("✓ Vector store initialized");
    
    indexManager = createIndexManager(embeddingService, vectorStore);
    console.error("✓ Index manager initialized");
    
    // Initialize Project Knowledge Service
    try {
      projectKnowledgeService = createProjectKnowledgeService();
      console.error("✓ Project Knowledge service initialized");
      
      // Connect to Index Manager for auto-update hooks
      indexManager.setProjectKnowledgeService(projectKnowledgeService);
      indexManager.setAutoUpdateDocs(autoUpdateDocs);
      console.error("✓ Project Knowledge service connected to Index Manager");
    } catch (error) {
      console.error(`⚠ Warning: Project Knowledge service not available: ${error}`);
      console.error("  Project documentation features will be disabled.");
    }
  } catch (error) {
    console.error(`ERROR: Failed to initialize services: ${error}`);
    throw error;
  }
  
  console.error("\n✓ All services ready");
  console.error("");
}

/**
 * Starts the stdio server
 */
async function startStdioServer() {
  try {
    console.error("Starting Memory Bank MCP Server in stdio mode...\n");
    
    // Validate environment and initialize services
    await validateEnvironment();
    
    // Create transport
    const transport = new StdioServerTransport();
    
    console.error("Connecting server to transport...");
    
    // Connect server to transport
    await server.connect(transport);
    
    console.error("\n=== MCP Server Ready ===");
    console.error("Available tools:");
    console.error("  Core Memory Bank (Cursor-style):");
    console.error("    - memorybank_index_code: Indexar código semánticamente");
    console.error("    - memorybank_search: Buscar código por similitud semántica");
    console.error("    - memorybank_read_file: Leer archivos del workspace");
    console.error("    - memorybank_write_file: Escribir archivos y reindexar");
    console.error("    - memorybank_get_stats: Obtener estadísticas del índice");
    console.error("    - memorybank_analyze_coverage: Analizar cobertura de indexación");
    console.error("  Project Knowledge Layer (AI Docs):");
    console.error("    - memorybank_generate_project_docs: Generar documentación con IA");
    console.error("    - memorybank_get_project_docs: Leer documentación del proyecto");
    console.error("  Context Management (Cline-style):");
    console.error("    - memorybank_initialize: Inicializar Memory Bank para un proyecto");
    console.error("    - memorybank_update_context: Actualizar contexto de sesión");
    console.error("    - memorybank_record_decision: Registrar decisiones técnicas");
    console.error("    - memorybank_track_progress: Actualizar progreso del proyecto");
    console.error("  Multi-Agent Coordination:");
    console.error("    - memorybank_manage_agents: Coordinación y bloqueos de recursos");
    console.error("");
    console.error("Available resources:");
    console.error("    - memory://{projectId}/active: Contexto activo");
    console.error("    - memory://{projectId}/progress: Seguimiento de progreso");
    console.error("    - memory://{projectId}/decisions: Log de decisiones");
    console.error("    - memory://{projectId}/context: Contexto del proyecto");
    console.error("    - memory://{projectId}/patterns: Patrones de sistema");
    console.error("    - memory://{projectId}/brief: Descripción del proyecto");
    console.error("");
    console.error("Ready to accept requests...\n");
    
  } catch (error) {
    console.error("Error starting stdio server:", error);
    console.error("Stack trace:", (error as Error).stack);
    process.exit(1);
  }
}

/**
 * Main entry point
 */
async function main() {
  try {
    // For now, only stdio mode is supported
    await startStdioServer();
  } catch (error) {
    console.error("Fatal error:", error);
    console.error("Stack trace:", (error as Error).stack);
    process.exit(1);
  }
}

// Start the server
main();
