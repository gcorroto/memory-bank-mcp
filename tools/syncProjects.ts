import { RegistryManager } from '../common/registryManager.js';
import { EmbeddingService } from '../common/embeddingService.js';

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
        
        const result = await registryManager.syncRegistry(embeddingService);
        
        return {
            success: true,
            message: `Synchronization complete. Processed: ${result.processed}, Failures: ${result.failures}`,
            details: result
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
    description: "Sincroniza todos los proyectos del registro JSON al store vectorial para habilitar la búsqueda semántica. Útil para migrar datos existentes.",
    inputSchema: {
        type: "object",
        properties: {}
    }
};
