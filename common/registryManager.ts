import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

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

    constructor() {
        this.globalPath = path.join(os.homedir(), '.memorybank', 'global_registry.json');
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

    async registerProject(projectId: string, workspacePath: string, description?: string, keywords: string[] = []): Promise<void> {
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
    }

    async discoverProjects(query?: string): Promise<ProjectCard[]> {
        const registry = await this.ensureRegistry();
        if (!query || query.trim() === '') return registry.projects;

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
