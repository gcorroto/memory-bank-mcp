import { RegistryManager } from '../common/registryManager.js';

export interface DiscoverProjectsParams {
    query?: string;
}

export async function discoverProjectsTool(params: DiscoverProjectsParams) {
    const registryManager = new RegistryManager();
    const projects = await registryManager.discoverProjects(params.query);
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
