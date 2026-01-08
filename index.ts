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

// Import tools
import { indexCode } from "./tools/indexCode.js";
import { searchMemory } from "./tools/searchMemory.js";
import { readFile } from "./tools/readFile.js";
import { writeFile } from "./tools/writeFile.js";
import { getStats } from "./tools/getStats.js";
import { analyzeCoverage } from "./tools/analyzeCoverage.js";

import { VERSION } from "./common/version.js";

// Global services
let embeddingService: EmbeddingService;
let vectorStore: VectorStore;
let indexManager: IndexManager;
let workspaceRoot: string;

// Create the MCP Server
const server = new McpServer({
  name: "memory-bank-mcp-server",
  version: VERSION,
});

// Tool: Index Code
server.tool(
  "memorybank_index_code",
  "Indexa semánticamente código de un directorio o archivo específico para permitir búsquedas semánticas",
  {
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
  "Busca código relevante mediante búsqueda semántica vectorial. Usa esta herramienta SIEMPRE que necesites información sobre el código",
  {
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
      .default(0.7)
      .describe("Puntuación mínima de similitud (0-1). Valores más altos = resultados más relevantes"),
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
  "Escribe o modifica un archivo y automáticamente lo reindexa en el Memory Bank para mantener la consistencia",
  {
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
  "Analiza la cobertura de indexación del proyecto. Muestra qué carpetas/archivos están indexados, cuáles no, y cuáles tienen cambios pendientes. Perfecto para visualizar el estado del conocimiento del agente sobre el proyecto. NOTA: Puede tardar en workspaces grandes",
  {},
  async () => {
    try {
      const result = await analyzeCoverage(indexManager, vectorStore, workspaceRoot);
      
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
    console.error("  - memorybank_index_code: Indexar código semánticamente");
    console.error("  - memorybank_search: Buscar código por similitud semántica");
    console.error("  - memorybank_read_file: Leer archivos del workspace");
    console.error("  - memorybank_write_file: Escribir archivos y reindexar");
    console.error("  - memorybank_get_stats: Obtener estadísticas del índice");
    console.error("  - memorybank_analyze_coverage: Analizar cobertura de indexación");
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
