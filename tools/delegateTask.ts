import { RegistryManager } from '../common/registryManager.js';
import { AgentBoard } from '../common/agentBoard.js';
import { textSimilarity } from '../common/textSimilarity.js';

export interface DelegateTaskParams {
    projectId: string; // Source project
    targetProjectId: string;
    title: string;
    description: string;
    context: string;
}

export async function delegateTaskTool(params: DelegateTaskParams) {
    const registryManager = new RegistryManager();
    const targetProject = await registryManager.getProject(params.targetProjectId);

    if (!targetProject) {
        return {
            success: false,
            message: `Target project '${params.targetProjectId}' not found in global registry.`
        };
    }

    try {
        // Initialize board for the TARGET project path
        const targetBoard = new AgentBoard(targetProject.path, targetProject.projectId);
        
        // ========================================================================
        // DOUBLE CHECK: Verify no duplicate task exists before creating
        // (Protection against race conditions between route and delegate)
        // ========================================================================
        
        const existingTasks = targetBoard.getAllTasks();
        const TITLE_SIMILARITY_THRESHOLD = 0.85;
        
        for (const existingTask of existingTasks) {
            const similarity = textSimilarity(params.title, existingTask.title);
            
            if (similarity >= TITLE_SIMILARITY_THRESHOLD) {
                // Found a duplicate - don't create
                console.error(`  ⚠️  Duplicate task detected during delegation: ${existingTask.id} (similarity: ${(similarity * 100).toFixed(0)}%)`);
                
                return {
                    success: true, // Not an error, just already exists
                    taskId: existingTask.id,
                    isDuplicate: true,
                    existingStatus: existingTask.status,
                    message: `Task already exists in '${params.targetProjectId}' as ${existingTask.id} (status: ${existingTask.status}). No duplicate created.`
                };
            }
        }
        
        // No duplicate found - safe to create
        const taskId = await targetBoard.createExternalTask(
            params.title,
            params.projectId,
            `${params.description}\n\nContext:\n${params.context}`
        );

        return {
            success: true,
            taskId,
            isDuplicate: false,
            message: `Task successfully delegated to project '${params.targetProjectId}' (Task ID: ${taskId})`
        };
    } catch (error: any) {
        return {
            success: false,
            message: `Failed to delegate task: ${error.message}`
        };
    }
}

export const delegateTaskToolDefinition = {
    name: "memorybank_delegate_task",
    description: "Delega una tarea a otro proyecto del ecosistema. Crea una petición externa en el tablero del proyecto destino.",
    inputSchema: {
        type: "object",
        properties: {
            projectId: {
                type: "string",
                description: "ID del proyecto origen (quien pide)"
            },
            targetProjectId: {
                type: "string",
                description: "ID del proyecto destino (quien debe hacer el trabajo)"
            },
            title: {
                type: "string",
                description: "Título corto de la tarea"
            },
            description: {
                type: "string",
                description: "Descripción detallada de lo que se necesita"
            },
            context: {
                type: "string",
                description: "Contexto técnico adicional para que el agente receptor entienda la tarea"
            }
        },
        required: ["projectId", "targetProjectId", "title", "description"]
    }
};
