import { RegistryManager } from '../common/registryManager.js';
import { EmbeddingService } from '../common/embeddingService.js';

export interface DiscoverProjectsParams {
    query?: string;
}

export async function discoverProjectsTool(params: DiscoverProjectsParams) {
    const registryManager = new RegistryManager();
    let embeddingService: EmbeddingService | undefined;
    
    if (process.env.OPENAI_API_KEY) {
        try {
            embeddingService = new EmbeddingService(process.env.OPENAI_API_KEY);
        } catch (e) {
           console.error("Failed to init embedding service for discovery:", e);
        }
    }

    const projects = await registryManager.discoverProjects(params.query, embeddingService);
    return {
        success: true,
        projectCount: projects.length,
        projects: projects
    };
}

export const discoverProjectsToolDefinition = {
    name: "memorybank_discover_projects",
    description: "Descubre otros proyectos indexados en el ecosistema Memory Bank local. Útil para coordinar tareas entre proyectos.",
    inputSchema: {
        type: "object",
        properties: {
            query: {
                type: "string",
                description: "Término de búsqueda (por ID, descripción o keywords)"
            }
        }
    }
};
