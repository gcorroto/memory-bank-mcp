import { RegistryManager } from '../common/registryManager.js';
import { EmbeddingService } from '../common/embeddingService.js';
import { VectorStore } from '../common/vectorStore.js';
import { ProjectKnowledgeService } from '../common/projectKnowledgeService.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export async function syncProjectsTool() {
    if (!process.env.OPENAI_API_KEY) {
        return {
            success: false,
            message: "OPENAI_API_KEY environment variable is required for syncing projects."
        };
    }

    try {
        const registryManager = new RegistryManager();
        const embeddingService = new EmbeddingService(process.env.OPENAI_API_KEY);
        const vectorStore = new VectorStore();
        const projectKnowledgeService = new ProjectKnowledgeService(process.env.OPENAI_API_KEY);
        
        console.error("\n=== Starting Project Synchronization ===");
        
        // Step 1: Discover ALL projects from multiple sources
        console.error("\nStep 1: Discovering projects from all sources...");
        
        // 1a. Find projects with indexed code
        const indexedProjectIds = await vectorStore.getIndexedProjectIds();
        console.error(`  - Found ${indexedProjectIds.length} projects with indexed code`);
        
        // 1b. Find projects with documentation folders (auto-recovery!)
        const storagePath = process.env.MEMORYBANK_STORAGE_PATH || path.join(os.homedir(), '.memorybank');
        const projectsDir = path.join(storagePath, 'projects');
        let documentedProjectIds: string[] = [];
        
        if (fs.existsSync(projectsDir)) {
            const entries = fs.readdirSync(projectsDir, { withFileTypes: true });
            documentedProjectIds = entries
                .filter(e => e.isDirectory())
                .map(e => e.name);
            console.error(`  - Found ${documentedProjectIds.length} projects with documentation folders`);
        }
        
        // 1c. Combine all discovered projects (unique)
        const allProjectIds = Array.from(new Set([...indexedProjectIds, ...documentedProjectIds]));
        console.error(`  - Total unique projects discovered: ${allProjectIds.length}`);
        
        if (allProjectIds.length > 0) {
            console.error(`  - Projects: ${allProjectIds.join(', ')}`);
        }
        
        // Step 2: Sync existing registry to vector store
        console.error("\nStep 2: Syncing existing registry to vector store...");
        const registryResult = await registryManager.syncRegistry(embeddingService);
        console.error(`Registry sync: ${registryResult.processed} processed, ${registryResult.failures} failures`);
        
        // Step 3: For each discovered project, ensure it has documentation and registry entry
        let docsGenerated = 0;
        let docsSkipped = 0;
        let docsFailed = 0;
        let registryRecovered = 0;
        
        console.error("\nStep 3: Ensuring documentation and registry for all discovered projects...");
        for (const projectId of allProjectIds) {
            try {
                console.error(`\nProcessing project: ${projectId}`);
                
                // Check if project has documentation
                const hasDocumentation = projectKnowledgeService.isProjectInitialized(projectId);
                const hasIndexedCode = indexedProjectIds.includes(projectId);
                
                if (!hasDocumentation && hasIndexedCode) {
                    console.error(`  - No documentation found, generating...`);
                    
                    // Generate documentation (this will automatically update registry)
                    const chunks = await vectorStore.getAllChunks(projectId);
                    if (chunks.length > 0) {
                        const result = await projectKnowledgeService.generateAllDocuments(
                            projectId,
                            chunks,
                            false // Don't force regeneration
                        );
                        
                        if (result.success) {
                            console.error(`  - Documentation generated successfully`);
                            
                            // Generate and update registry
                            const summary = await projectKnowledgeService.generateProjectSummary(projectId);
                            if (summary) {
                                // Try to find existing workspace path from registry
                                let workspacePath = '';
                                const existingProject = await registryManager.getProject(projectId);
                                if (existingProject) {
                                    workspacePath = existingProject.path;
                                } else {
                                    // Try to infer from chunks
                                    const firstChunk = chunks[0];
                                    if (firstChunk && firstChunk.file_path) {
                                        // Extract workspace path (this is a guess, may not be perfect)
                                        workspacePath = process.cwd();
                                    }
                                }
                                
                                await registryManager.registerProject(
                                    projectId,
                                    workspacePath,
                                    summary.description,
                                    summary.keywords,
                                    embeddingService,
                                    {
                                        responsibilities: summary.responsibilities,
                                        owns: summary.owns,
                                        exports: summary.exports,
                                        projectType: summary.projectType,
                                    }
                                );
                                console.error(`  - Registry updated with project summary`);
                                docsGenerated++;
                            }
                        } else {
                            console.error(`  - Failed to generate documentation`);
                            docsFailed++;
                        }
                    } else {
                        console.error(`  - No chunks found for project, skipping`);
                        docsSkipped++;
                    }
                } else if (hasDocumentation) {
                    console.error(`  - Documentation already exists, ensuring registry is up-to-date...`);
                    
                    // Documentation exists, regenerate/update registry from it (RECOVERY!)
                    try {
                        const summary = await projectKnowledgeService.generateProjectSummary(projectId);
                        if (summary) {
                            const existingProject = await registryManager.getProject(projectId);
                            const workspacePath = existingProject?.path || process.cwd();
                            
                            await registryManager.registerProject(
                                projectId,
                                workspacePath,
                                summary.description,
                                summary.keywords,
                                embeddingService,
                                {
                                    responsibilities: summary.responsibilities,
                                    owns: summary.owns,
                                    exports: summary.exports,
                                    projectType: summary.projectType,
                                }
                            );
                            console.error(`  - Registry updated/recovered from documentation`);
                            registryRecovered++;
                        }
                    } catch (error) {
                        console.error(`  - Error recovering registry from docs: ${error}`);
                    }
                    docsSkipped++;
                } else {
                    console.error(`  - No documentation and no indexed code, skipping`);
                    docsSkipped++;
                }
            } catch (error) {
                console.error(`  - Error processing project ${projectId}: ${error}`);
                docsFailed++;
            }
        }
        
        console.error("\n=== Synchronization Complete ===");
        console.error(`Projects discovered: ${allProjectIds.length} total`);
        console.error(`  - From indexed code: ${indexedProjectIds.length}`);
        console.error(`  - From documentation folders: ${documentedProjectIds.length}`);
        console.error(`Registry synced: ${registryResult.processed} projects`);
        console.error(`Registry recovered from docs: ${registryRecovered} projects`);
        console.error(`Documentation generated: ${docsGenerated} projects`);
        console.error(`Documentation skipped (already exists): ${docsSkipped} projects`);
        console.error(`Failures: ${registryResult.failures + docsFailed}`);
        
        return {
            success: true,
            message: `Synchronization complete. Discovered ${allProjectIds.length} projects (${indexedProjectIds.length} indexed, ${documentedProjectIds.length} documented). Registry recovered: ${registryRecovered}, Docs generated: ${docsGenerated}, Failures: ${registryResult.failures + docsFailed}`,
            details: {
                discovery: {
                    total: allProjectIds.length,
                    indexed: indexedProjectIds.length,
                    documented: documentedProjectIds.length,
                    projects: allProjectIds
                },
                registrySync: registryResult,
                registryRecovery: {
                    recovered: registryRecovered
                },
                documentationGeneration: {
                    generated: docsGenerated,
                    skipped: docsSkipped,
                    failed: docsFailed
                }
            }
        };
    } catch (error) {
        return {
            success: false,
            message: `Error during synchronization: ${error}`
        };
    }
}

export const syncProjectsToolDefinition = {
    name: "memorybank_sync_projects",
    description: `Sincroniza y recupera automáticamente todos los proyectos desde múltiples fuentes.
    
Esta herramienta realiza una sincronización completa con AUTO-RECUPERACIÓN:

DESCUBRIMIENTO MULTI-FUENTE:
1. Escanea carpetas de documentación (.memorybank/projects/*)
2. Escanea código indexado en vector store
3. Lee registry JSON existente (si existe)

RECUPERACIÓN AUTOMÁTICA:
- Si el registry.json se corrompe o vacía, lo reconstruye desde las carpetas de documentación
- Genera documentación para código indexado sin docs
- Actualiza registry con responsabilidades extraídas

Útil cuando:
- El registry.json se ha corrompido o vaciado (AUTO-RECUPERA desde carpetas!)
- Has indexado código pero no has generado documentación
- El registry está desactualizado o incompleto
- Necesitas poblar las responsabilidades de proyectos para el orquestador
- Has perdido proyectos del registry pero las carpetas siguen existiendo`,
    inputSchema: {
        type: "object",
        properties: {}
    }
};
