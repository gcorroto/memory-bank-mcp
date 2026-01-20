import * as fs from 'fs/promises';
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
}

export interface GlobalRegistry {
    projects: ProjectCard[];
}

export class RegistryManager {
    private globalPath: string;
    private projectVectorStore: ProjectVectorStore;

    constructor() {
        this.globalPath = path.join(os.homedir(), '.memorybank', 'global_registry.json');
        this.projectVectorStore = new ProjectVectorStore();
    }

    private async ensureRegistry(): Promise<GlobalRegistry> {
        try {
            await fs.mkdir(path.dirname(this.globalPath), { recursive: true });
            const content = await fs.readFile(this.globalPath, 'utf-8');
            return JSON.parse(content);
        } catch {
            return { projects: [] };
        }
    }

    private async saveRegistry(registry: GlobalRegistry): Promise<void> {
        await fs.writeFile(this.globalPath, JSON.stringify(registry, null, 2), 'utf-8');
    }

    async registerProject(projectId: string, workspacePath: string, description?: string, keywords: string[] = [], embeddingService?: EmbeddingService): Promise<void> {
        const registry = await this.ensureRegistry();
        const idx = registry.projects.findIndex(p => p.projectId === projectId);
        
        // Preserve existing description/keywords if not provided
        const existing = idx >= 0 ? registry.projects[idx] : null;

        const card: ProjectCard = {
            projectId,
            path: workspacePath,
            description: description || existing?.description || '',
            keywords: keywords.length > 0 ? keywords : (existing?.keywords || []),
            lastActive: new Date().toISOString(),
            status: 'ACTIVE'
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
        const text = `Project: ${card.projectId}\nDescription: ${card.description || ''}\nKeywords: ${card.keywords.join(', ')}`;
        const result = await embeddingService.generateEmbedding(card.projectId, text);
        
        await this.projectVectorStore.upsertProject({
            id: card.projectId,
            vector: result.vector,
            name: card.projectId, // Using ID as name for now if name not available
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
}
