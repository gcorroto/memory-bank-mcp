#!/usr/bin/env node

/**
 * @fileoverview Memory Bank MCP Server
 * Semantic code indexing and retrieval using vector embeddings
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as path from "path";

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
  "Indexa semánticamente código de un directorio o archivo específico para permitir búsquedas semánticas. El projectId es OBLIGATORIO y debe coincidir con el definido en AGENTS.md",
  {
    projectId: z
      .string()
      .describe("Identificador único del proyecto (OBLIGATORIO). Debe coincidir con el definido en AGENTS.md del proyecto"),
    path: z
      .string()
      .optional()
      .describe("Ruta relativa o absoluta del directorio/archivo a indexar (por defecto: raíz del workspace)"),
    recursive: z
      .boolean()
      .optional()
      .default(true)
      .describe("Indexar recursivamente subdirectorios"),
    forceReindex: z
      .boolean()
      .optional()
      .default(false)
      .describe("Forzar reindexación completa aunque no haya cambios"),
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
  "Lee el contenido de un archivo específico del workspace. Usa esta herramienta para obtener contexto adicional cuando los fragmentos de búsqueda no son suficientes",
  {
    path: z
      .string()
      .describe("Ruta relativa o absoluta del archivo a leer"),
    startLine: z
      .number()
      .optional()
      .describe("Línea inicial para leer un rango específico (opcional)"),
    endLine: z
      .number()
      .optional()
      .describe("Línea final para leer un rango específico (opcional)"),
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
  "Escribe o modifica un archivo y automáticamente lo reindexa en el Memory Bank para mantener la consistencia. El projectId es OBLIGATORIO para la reindexación correcta",
  {
    projectId: z
      .string()
      .describe("Identificador del proyecto (OBLIGATORIO). Necesario para la auto-reindexación correcta"),
    path: z
      .string()
      .describe("Ruta relativa o absoluta del archivo a escribir"),
    content: z
      .string()
      .describe("Contenido completo del archivo a escribir"),
    autoReindex: z
      .boolean()
      .optional()
      .default(true)
      .describe("Reindexar automáticamente el archivo después de escribirlo"),
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
  "Analiza la cobertura de indexación del proyecto. Muestra qué carpetas/archivos están indexados, cuáles no, y cuáles tienen cambios pendientes. El projectId es OBLIGATORIO. NOTA: Puede tardar en workspaces grandes",
  {
    projectId: z
      .string()
      .describe("Identificador del proyecto a analizar (OBLIGATORIO)"),
    path: z
      .string()
      .optional()
      .describe("Ruta específica a analizar (por defecto: raíz del workspace)"),
  },
  async (args) => {
    try {
      const targetPath = args.path || workspaceRoot;
      const result = await analyzeCoverage(indexManager, vectorStore, targetPath, args.projectId);
      
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
  
  // Get workspace root
  workspaceRoot = process.env.MEMORYBANK_WORKSPACE_ROOT || process.cwd();
  console.error(`✓ Workspace root: ${workspaceRoot}`);
  
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
    console.error("  Core Memory Bank:");
    console.error("    - memorybank_index_code: Indexar código semánticamente");
    console.error("    - memorybank_search: Buscar código por similitud semántica");
    console.error("    - memorybank_read_file: Leer archivos del workspace");
    console.error("    - memorybank_write_file: Escribir archivos y reindexar");
    console.error("    - memorybank_get_stats: Obtener estadísticas del índice");
    console.error("    - memorybank_analyze_coverage: Analizar cobertura de indexación");
    console.error("  Project Knowledge Layer:");
    console.error("    - memorybank_generate_project_docs: Generar documentación con IA");
    console.error("    - memorybank_get_project_docs: Leer documentación del proyecto");
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
