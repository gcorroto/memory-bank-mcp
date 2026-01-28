import * as fs from 'fs/promises';
import * as fssync from 'fs';
import * as path from 'path';
import * as os from 'os';
import { EmbeddingService } from './embeddingService.js';
import { ProjectVectorStore } from './projectVectorStore.js';

export interface ProjectCard {
    projectId: string;
    path: string; // Absolute path to workspace
    description?: string;
    keywords: string[];
    lastActive: string;
    status: 'ACTIVE' | 'IDLE';
    // Enhanced fields for orchestrator
    responsibilities?: string[];   // What this project is responsible for
    owns?: string[];              // File patterns this project owns (e.g., "*DTO.ts", "services/")
    exports?: string;             // Package name if it's a library (e.g., "@company/lib-dtos")
    projectType?: string;         // Type: api, library, frontend, backend, cli, etc.
}

export interface GlobalRegistry {
    projects: ProjectCard[];
}

export class RegistryManager {
    private globalPath: string;
    private projectVectorStore: ProjectVectorStore;
    private storagePath: string;

    constructor() {
        this.globalPath = path.join(os.homedir(), '.memorybank', 'global_registry.json');
        this.storagePath = process.env.MEMORYBANK_STORAGE_PATH || path.join(os.homedir(), '.memorybank');
        this.projectVectorStore = new ProjectVectorStore();
    }

    /**
     * Discovers projects by scanning the projects directory
     * Used for auto-recovery when registry.json is corrupted/empty
     */
    private async discoverProjectsFromDisk(): Promise<string[]> {
        const projectsDir = path.join(this.storagePath, 'projects');
        
        if (!fssync.existsSync(projectsDir)) {
            return [];
        }
        
        try {
            const entries = await fs.readdir(projectsDir, { withFileTypes: true });
            const projectIds = entries
                .filter(e => e.isDirectory())
                .map(e => e.name);
            
            console.error(`Discovered ${projectIds.length} projects from disk: ${projectIds.join(', ')}`);
            return projectIds;
        } catch (error) {
            console.error(`Error discovering projects from disk: ${error}`);
            return [];
        }
    }

    /**
     * Ensures the registry exists and returns it
     * If corrupted/empty, auto-recovers by scanning project folders
     */
    private async ensureRegistry(): Promise<GlobalRegistry> {
        try {
            await fs.mkdir(path.dirname(this.globalPath), { recursive: true });
            const content = await fs.readFile(this.globalPath, 'utf-8');
            
            // Validate JSON
            if (!content || content.trim() === '') {
                console.error('⚠️  Registry file is empty, attempting auto-recovery...');
                return await this.autoRecoverRegistry();
            }
            
            const parsed = JSON.parse(content);
            
            // Validate structure
            if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.projects)) {
                console.error('⚠️  Registry file has invalid structure, attempting auto-recovery...');
                await this.backupCorruptedRegistry(content);
                return await this.autoRecoverRegistry();
            }
            
            // Check if registry is suspiciously empty (has folders but no projects)
            if (parsed.projects.length === 0) {
                const diskProjects = await this.discoverProjectsFromDisk();
                if (diskProjects.length > 0) {
                    console.error(`⚠️  Registry is empty but ${diskProjects.length} projects exist on disk, attempting auto-recovery...`);
                    await this.backupCorruptedRegistry(content);
                    return await this.autoRecoverRegistry();
                }
            }
            
            return parsed;
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                // File doesn't exist, try auto-recovery
                console.error('Registry file does not exist, attempting auto-recovery...');
                return await this.autoRecoverRegistry();
            }
            
            // JSON parse error - backup and auto-recover
            console.error(`Error reading registry: ${error.message}, attempting auto-recovery...`);
            try {
                const content = await fs.readFile(this.globalPath, 'utf-8');
                await this.backupCorruptedRegistry(content);
            } catch {
                // Can't read for backup
            }
            return await this.autoRecoverRegistry();
        }
    }

    /**
     * Auto-recovers registry by discovering projects from disk
     * Returns a minimal registry with project IDs - full data will be populated by sync
     */
    private async autoRecoverRegistry(): Promise<GlobalRegistry> {
        const projectIds = await this.discoverProjectsFromDisk();
        
        if (projectIds.length === 0) {
            console.error('No projects found on disk, starting with empty registry');
            return { projects: [] };
        }
        
        console.error(`✓ Auto-recovered ${projectIds.length} projects from disk`);
        console.error(`  Run 'memorybank_sync_projects' to populate full metadata`);
        
        // Return minimal registry - sync will populate the rest
        const projects: ProjectCard[] = projectIds.map(projectId => ({
            projectId,
            path: '', // Will be populated by sync
            description: '',
            keywords: [],
            lastActive: new Date().toISOString(),
            status: 'ACTIVE' as const
        }));
        
        return { projects };
    }

    /**
     * Backs up a corrupted registry file before overwriting
     */
    private async backupCorruptedRegistry(content: string): Promise<void> {
        try {
            const backupPath = `${this.globalPath}.backup-${Date.now()}`;
            await fs.writeFile(backupPath, content, 'utf-8');
            console.error(`Backed up corrupted registry to: ${backupPath}`);
        } catch (error) {
            console.error(`Failed to backup corrupted registry: ${error}`);
        }
    }

    private async saveRegistry(registry: GlobalRegistry): Promise<void> {
        await fs.writeFile(this.globalPath, JSON.stringify(registry, null, 2), 'utf-8');
    }

    async registerProject(
        projectId: string, 
        workspacePath: string, 
        description?: string, 
        keywords: string[] = [], 
        embeddingService?: EmbeddingService,
        enhancedInfo?: {
            responsibilities?: string[];
            owns?: string[];
            exports?: string;
            projectType?: string;
        }
    ): Promise<void> {
        const registry = await this.ensureRegistry();
        const idx = registry.projects.findIndex(p => p.projectId === projectId);
        
        // Preserve existing data if not provided
        const existing = idx >= 0 ? registry.projects[idx] : null;

        const card: ProjectCard = {
            projectId,
            // Preserve existing workspace path if new one is empty/invalid
            path: (workspacePath && workspacePath.trim() !== '') ? workspacePath : (existing?.path || workspacePath),
            // Preserve existing description if new one is undefined or empty
            description: (description !== undefined && description.trim() !== '') ? description : (existing?.description || ''),
            // Preserve existing keywords if new array is empty
            keywords: keywords.length > 0 ? keywords : (existing?.keywords || []),
            lastActive: new Date().toISOString(),
            status: 'ACTIVE',
            // Enhanced fields - preserve existing if not provided
            responsibilities: enhancedInfo?.responsibilities !== undefined 
                ? (enhancedInfo.responsibilities.length > 0 ? enhancedInfo.responsibilities : existing?.responsibilities)
                : existing?.responsibilities,
            owns: enhancedInfo?.owns !== undefined 
                ? (enhancedInfo.owns.length > 0 ? enhancedInfo.owns : existing?.owns)
                : existing?.owns,
            exports: enhancedInfo?.exports !== undefined 
                ? (enhancedInfo.exports.trim() !== '' ? enhancedInfo.exports : existing?.exports)
                : existing?.exports,
            projectType: enhancedInfo?.projectType !== undefined 
                ? (enhancedInfo.projectType.trim() !== '' ? enhancedInfo.projectType : existing?.projectType)
                : existing?.projectType,
        };

        if (idx >= 0) {
            registry.projects[idx] = card;
        } else {
            registry.projects.push(card);
        }

        await this.saveRegistry(registry);

        // Update vector store if embedding service provides
        if (embeddingService) {
            try {
               await this.updateProjectEmbedding(card, embeddingService);
            } catch (error) {
                console.error(`Failed to update project embedding: ${error}`);
            }
        }
    }

    private async updateProjectEmbedding(card: ProjectCard, embeddingService: EmbeddingService): Promise<void> {
        // Build rich text for embedding including responsibilities
        const textParts = [
            `Project: ${card.projectId}`,
            `Description: ${card.description || ''}`,
            `Keywords: ${card.keywords.join(', ')}`,
        ];
        
        if (card.responsibilities && card.responsibilities.length > 0) {
            textParts.push(`Responsibilities: ${card.responsibilities.join('. ')}`);
        }
        if (card.owns && card.owns.length > 0) {
            textParts.push(`Owns: ${card.owns.join(', ')}`);
        }
        if (card.projectType) {
            textParts.push(`Type: ${card.projectType}`);
        }
        if (card.exports) {
            textParts.push(`Exports: ${card.exports}`);
        }
        
        const text = textParts.join('\n');
        const result = await embeddingService.generateEmbedding(card.projectId, text);
        
        await this.projectVectorStore.upsertProject({
            id: card.projectId,
            vector: result.vector,
            name: card.projectId,
            description: card.description || '',
            tags: card.keywords,
            path: card.path,
            lastActive: new Date(card.lastActive).getTime()
        });
    }

    async discoverProjects(query?: string, embeddingService?: EmbeddingService): Promise<ProjectCard[]> {
        const registry = await this.ensureRegistry();
        if (!query || query.trim() === '') return registry.projects;

        // Try semantic search if service available
        if (embeddingService) {
            try {
                const queryEmbedding = await embeddingService.generateEmbedding('search-query', query);
                const results = await this.projectVectorStore.search(queryEmbedding.vector);
                
                // Map back to ProjectCards
                const projectIds = new Set(results.map(r => r.project.id));
                // Return found projects, maintain order from vector search
                const foundProjects: ProjectCard[] = [];
                for (const res of results) {
                    const card = registry.projects.find(p => p.projectId === res.project.id);
                    if (card) foundProjects.push(card);
                }
                
                // If we found something, return it. If very few, maybe fallback or mix?
                // For now, if we have semantic results, use them.
                if (foundProjects.length > 0) return foundProjects;
                
            } catch (error) {
                console.error(`Semantic search failed, falling back to text: ${error}`);
            }
        }

        const q = query.toLowerCase();
        return registry.projects.filter(p => 
            p.projectId.toLowerCase().includes(q) || 
            (p.description && p.description.toLowerCase().includes(q)) ||
            p.keywords.some(k => k.toLowerCase().includes(q))
        );
    }
    
    async getProject(projectId: string): Promise<ProjectCard | undefined> {
        const registry = await this.ensureRegistry();
        return registry.projects.find(p => p.projectId === projectId);
    }

    /**
     * Gets all projects from the registry.
     * Useful for the orchestrator to analyze responsibilities across all projects.
     */
    async getAllProjects(): Promise<ProjectCard[]> {
        const registry = await this.ensureRegistry();
        return registry.projects;
    }

    /**
     * Syncs all projects from the JSON registry to the vector store.
     * Useful for migrating existing projects to the new semantic discovery system.
     */
    async syncRegistry(embeddingService: EmbeddingService): Promise<{ processed: number, failures: number }> {
        const registry = await this.ensureRegistry();
        let processed = 0;
        let failures = 0;

        console.error(`Syncing ${registry.projects.length} projects to vector store...`);

        for (const project of registry.projects) {
            try {
                await this.updateProjectEmbedding(project, embeddingService);
                processed++;
                if (processed % 10 === 0) {
                    console.error(`Synced ${processed}/${registry.projects.length} projects`);
                }
            } catch (error) {
                console.error(`Failed to sync project ${project.projectId}: ${error}`);
                failures++;
            }
        }

        return { processed, failures };
    }
}
