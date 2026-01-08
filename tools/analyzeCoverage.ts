/**
 * @fileoverview Analyze coverage tool for Memory Bank
 * Provides detailed analysis of indexation coverage across the project
 */

import * as fs from "fs";
import * as path from "path";
import { IndexManager } from "../common/indexManager.js";
import { scanFiles, FileMetadata } from "../common/fileScanner.js";
import { VectorStore } from "../common/vectorStore.js";

export interface DirectoryNode {
  name: string;
  path: string;
  type: "directory" | "file";
  status: "indexed" | "not_indexed" | "pending_reindex" | "ignored";
  fileCount?: number;
  indexedCount?: number;
  pendingCount?: number;
  size?: number;
  lastModified?: Date;
  lastIndexed?: Date;
  chunkCount?: number;
  children?: DirectoryNode[];
}

export interface CoverageStats {
  totalFiles: number;
  indexedFiles: number;
  notIndexedFiles: number;
  pendingReindexFiles: number;
  ignoredFiles: number;
  totalSize: number;
  indexedSize: number;
  coveragePercentage: number;
  totalChunks: number;
  languageBreakdown: Record<string, {
    total: number;
    indexed: number;
    chunks: number;
  }>;
  directoryBreakdown: Record<string, {
    total: number;
    indexed: number;
    pending: number;
  }>;
}

export interface AnalyzeCoverageResult {
  success: boolean;
  stats: CoverageStats;
  tree: DirectoryNode;
  recommendations: string[];
  message: string;
}

/**
 * Builds a directory tree with indexation status
 */
function buildDirectoryTree(
  files: FileMetadata[],
  indexedFiles: Map<string, { lastIndexed: number; chunks: number }>,
  pendingFiles: Set<string>,
  rootPath: string
): DirectoryNode {
  const root: DirectoryNode = {
    name: path.basename(rootPath),
    path: "",
    type: "directory",
    status: "indexed",
    fileCount: 0,
    indexedCount: 0,
    pendingCount: 0,
    children: [],
  };
  
  // Build tree structure
  const dirMap = new Map<string, DirectoryNode>();
  dirMap.set("", root);
  
  // Sort files by path for consistent tree building
  const sortedFiles = [...files].sort((a, b) => a.path.localeCompare(b.path));
  
  for (const file of sortedFiles) {
    const parts = file.path.split(path.sep);
    let currentPath = "";
    
    // Create directory nodes
    for (let i = 0; i < parts.length - 1; i++) {
      const parentPath = currentPath;
      currentPath = currentPath ? path.join(currentPath, parts[i]) : parts[i];
      
      if (!dirMap.has(currentPath)) {
        const dirNode: DirectoryNode = {
          name: parts[i],
          path: currentPath,
          type: "directory",
          status: "indexed",
          fileCount: 0,
          indexedCount: 0,
          pendingCount: 0,
          children: [],
        };
        
        dirMap.set(currentPath, dirNode);
        
        const parent = dirMap.get(parentPath);
        if (parent && parent.children) {
          parent.children.push(dirNode);
        }
      }
    }
    
    // Add file node
    const fileName = parts[parts.length - 1];
    const fileDir = parts.length > 1 ? path.dirname(file.path) : "";
    const parentDir = dirMap.get(fileDir);
    
    if (parentDir && parentDir.children) {
      const indexed = indexedFiles.has(file.path);
      const pending = pendingFiles.has(file.path);
      
      const fileNode: DirectoryNode = {
        name: fileName,
        path: file.path,
        type: "file",
        status: pending ? "pending_reindex" : indexed ? "indexed" : "not_indexed",
        size: file.size,
        lastModified: file.mtime,
        lastIndexed: indexed ? new Date(indexedFiles.get(file.path)!.lastIndexed) : undefined,
        chunkCount: indexed ? indexedFiles.get(file.path)!.chunks : 0,
      };
      
      parentDir.children.push(fileNode);
      
      // Update parent stats
      let current = parentDir;
      while (current) {
        current.fileCount = (current.fileCount || 0) + 1;
        if (indexed) current.indexedCount = (current.indexedCount || 0) + 1;
        if (pending) current.pendingCount = (current.pendingCount || 0) + 1;
        
        // Find parent
        const parentPath = path.dirname(current.path);
        current = parentPath !== current.path ? dirMap.get(parentPath === "." ? "" : parentPath)! : null as any;
      }
    }
  }
  
  // Sort children (directories first, then files)
  const sortChildren = (node: DirectoryNode) => {
    if (node.children) {
      node.children.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === "directory" ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
      
      node.children.forEach(sortChildren);
    }
  };
  
  sortChildren(root);
  
  return root;
}

/**
 * Calculates coverage statistics
 */
function calculateStats(
  files: FileMetadata[],
  indexedFiles: Map<string, { lastIndexed: number; chunks: number }>,
  pendingFiles: Set<string>,
  totalChunks: number
): CoverageStats {
  const stats: CoverageStats = {
    totalFiles: files.length,
    indexedFiles: 0,
    notIndexedFiles: 0,
    pendingReindexFiles: 0,
    ignoredFiles: 0,
    totalSize: 0,
    indexedSize: 0,
    coveragePercentage: 0,
    totalChunks,
    languageBreakdown: {},
    directoryBreakdown: {},
  };
  
  for (const file of files) {
    stats.totalSize += file.size;
    
    const indexed = indexedFiles.has(file.path);
    const pending = pendingFiles.has(file.path);
    
    if (pending) {
      stats.pendingReindexFiles++;
    } else if (indexed) {
      stats.indexedFiles++;
      stats.indexedSize += file.size;
    } else {
      stats.notIndexedFiles++;
    }
    
    // Language breakdown
    if (!stats.languageBreakdown[file.language]) {
      stats.languageBreakdown[file.language] = {
        total: 0,
        indexed: 0,
        chunks: 0,
      };
    }
    
    stats.languageBreakdown[file.language].total++;
    if (indexed) {
      stats.languageBreakdown[file.language].indexed++;
      stats.languageBreakdown[file.language].chunks += indexedFiles.get(file.path)!.chunks;
    }
    
    // Directory breakdown
    const dir = path.dirname(file.path);
    const topLevelDir = dir.split(path.sep)[0] || "(root)";
    
    if (!stats.directoryBreakdown[topLevelDir]) {
      stats.directoryBreakdown[topLevelDir] = {
        total: 0,
        indexed: 0,
        pending: 0,
      };
    }
    
    stats.directoryBreakdown[topLevelDir].total++;
    if (indexed) stats.directoryBreakdown[topLevelDir].indexed++;
    if (pending) stats.directoryBreakdown[topLevelDir].pending++;
  }
  
  stats.coveragePercentage = stats.totalFiles > 0
    ? (stats.indexedFiles / stats.totalFiles) * 100
    : 0;
  
  return stats;
}

/**
 * Generates recommendations based on coverage analysis
 */
function generateRecommendations(
  stats: CoverageStats,
  tree: DirectoryNode
): string[] {
  const recommendations: string[] = [];
  
  // Low coverage
  if (stats.coveragePercentage < 50) {
    recommendations.push(
      `⚠️ Cobertura baja (${stats.coveragePercentage.toFixed(1)}%). Considera indexar el proyecto completo con memorybank_index_code({})`
    );
  } else if (stats.coveragePercentage < 80) {
    recommendations.push(
      `📊 Cobertura media (${stats.coveragePercentage.toFixed(1)}%). Hay ${stats.notIndexedFiles} archivos sin indexar`
    );
  } else if (stats.coveragePercentage === 100) {
    recommendations.push(
      `✅ Cobertura completa (100%). Todos los archivos están indexados`
    );
  }
  
  // Pending reindex
  if (stats.pendingReindexFiles > 0) {
    recommendations.push(
      `🔄 Hay ${stats.pendingReindexFiles} archivo(s) con cambios pendientes de reindexación. Ejecuta memorybank_index_code({ forceReindex: true })`
    );
  }
  
  // Language-specific recommendations
  const unindexedLanguages = Object.entries(stats.languageBreakdown)
    .filter(([_, data]) => data.indexed === 0 && data.total > 0)
    .map(([lang]) => lang);
  
  if (unindexedLanguages.length > 0) {
    recommendations.push(
      `💡 Lenguajes sin indexar: ${unindexedLanguages.join(", ")}. Considera indexar estos archivos`
    );
  }
  
  // Directory-specific recommendations
  const unindexedDirs = Object.entries(stats.directoryBreakdown)
    .filter(([_, data]) => data.indexed === 0 && data.total > 5)
    .map(([dir]) => dir);
  
  if (unindexedDirs.length > 0) {
    recommendations.push(
      `📁 Directorios sin indexar: ${unindexedDirs.join(", ")}. Usa memorybank_index_code({ path: "directorio" })`
    );
  }
  
  // Size recommendations
  const avgChunksPerFile = stats.indexedFiles > 0 ? stats.totalChunks / stats.indexedFiles : 0;
  if (avgChunksPerFile > 20) {
    recommendations.push(
      `⚡ Promedio alto de chunks por archivo (${avgChunksPerFile.toFixed(1)}). Los archivos son muy grandes o el chunk_size es pequeño`
    );
  }
  
  return recommendations;
}

/**
 * Analyzes indexation coverage of the project
 */
export async function analyzeCoverage(
  indexManager: IndexManager,
  vectorStore: VectorStore,
  workspaceRoot: string
): Promise<AnalyzeCoverageResult> {
  try {
    console.error("\n=== Analizando cobertura de indexación ===");
    console.error(`Workspace root: ${workspaceRoot}`);
    
    // 1. Scan all code files in workspace with timeout protection
    console.error("Escaneando archivos del workspace...");
    
    // Add timeout and file limit protection
    const scanStartTime = Date.now();
    const maxScanTime = 10000; // 10 seconds max
    
    let allFiles: any[] = [];
    try {
      allFiles = scanFiles({ 
        rootPath: workspaceRoot,
        recursive: true
      });
      
      const scanDuration = Date.now() - scanStartTime;
      console.error(`Escaneo completado en ${scanDuration}ms`);
      console.error(`Encontrados ${allFiles.length} archivos de código`);
      
      // If scan took too long or found too many files, limit results
      if (scanDuration > maxScanTime || allFiles.length > 10000) {
        console.error(`⚠️ Workspace muy grande. Limitando análisis a primeros 1000 archivos`);
        allFiles = allFiles.slice(0, 1000);
      }
    } catch (error) {
      console.error(`Error escaneando archivos: ${error}`);
      throw error;
    }
    
    // 2. Get indexed files from vector store
    console.error("Obteniendo archivos indexados...");
    await vectorStore.initialize();
    const fileHashes = await vectorStore.getFileHashes();
    
    // 3. Get index metadata
    const indexStats = await indexManager.getStats();
    
    // 4. Build indexed files map with chunk counts
    const indexedFiles = new Map<string, { lastIndexed: number; chunks: number }>();
    
    // Get chunks grouped by file from vector store
    for (const [filePath, hash] of fileHashes) {
      const chunks = await vectorStore.getChunksByFile(filePath);
      if (chunks.length > 0) {
        indexedFiles.set(filePath, {
          lastIndexed: chunks[0].timestamp,
          chunks: chunks.length,
        });
      }
    }
    
    // 5. Identify pending files (files that changed)
    const pendingFiles = new Set<string>();
    for (const file of allFiles) {
      const indexed = indexedFiles.get(file.path);
      if (indexed) {
        // Check if file hash matches
        const chunks = await vectorStore.getChunksByFile(file.path);
        if (chunks.length > 0 && chunks[0].fileHash !== file.hash) {
          pendingFiles.add(file.path);
        }
      }
    }
    
    console.error(`Archivos indexados: ${indexedFiles.size}`);
    console.error(`Archivos con cambios: ${pendingFiles.size}`);
    
    // 6. Build directory tree
    console.error("Construyendo árbol de directorios...");
    const tree = buildDirectoryTree(allFiles, indexedFiles, pendingFiles, workspaceRoot);
    
    // 7. Calculate statistics
    console.error("Calculando estadísticas...");
    const stats = calculateStats(allFiles, indexedFiles, pendingFiles, indexStats.totalChunks);
    
    // 8. Generate recommendations
    const recommendations = generateRecommendations(stats, tree);
    
    // 9. Format message
    const message = `Análisis completado: ${stats.indexedFiles}/${stats.totalFiles} archivos indexados (${stats.coveragePercentage.toFixed(1)}% cobertura)`;
    
    console.error("\n=== Análisis completado ===");
    console.error(message);
    console.error(`Total chunks: ${stats.totalChunks}`);
    console.error(`Pendientes: ${stats.pendingReindexFiles}`);
    
    return {
      success: true,
      stats,
      tree,
      recommendations,
      message,
    };
  } catch (error) {
    console.error(`Error analyzing coverage: ${error}`);
    return {
      success: false,
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
      recommendations: [],
      message: `Failed to analyze coverage: ${error}`,
    };
  }
}
