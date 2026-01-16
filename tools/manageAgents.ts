import { AgentBoard } from '../common/agentBoard.js';
import { RegistryManager } from '../common/registryManager.js';
import { sessionState } from '../common/sessionState.js';
import { sessionLogger } from '../common/sessionLogger.js';
import os from 'os';

export interface ManageAgentsParams {
  projectId: string;
  action: 'register' | 'update_status' | 'claim_resource' | 'release_resource' | 'get_board';
  agentId?: string;
  sessionId?: string;
  status?: string;
  focus?: string;
  resource?: string;
  workspacePath?: string; // The actual project path (should be passed by the agent)
}

export async function manageAgentsTool(params: ManageAgentsParams): Promise<any> {
    const { projectId, action, agentId, sessionId, status, focus, resource, workspacePath } = params;

    // For register action, workspacePath is REQUIRED to correctly register the project
    if (action === 'register' && !workspacePath) {
        throw new Error('workspacePath is REQUIRED for register action. Please provide the absolute path to the project workspace.');
    }

    // Use provided workspacePath, or fall back to home directory for non-register actions
    const workspaceRoot = workspacePath || os.homedir();

    const board = new AgentBoard(workspaceRoot, projectId);

    try {
        switch (action) {
            case 'register':
                if (!agentId) throw new Error('agentId is required for register');
                
                // Use the new SQLite-based registration which handles hash generation
                const result = board.registerAgentWithHash(agentId, sessionId);
                
                // Set Global Session State with the HASHED ID
                sessionState.setCurrentAgent(result.agentId, projectId);

                // Log the registration event
                await sessionLogger.logSessionEvent(projectId, result.sessionId, {
                    timestamp: new Date().toISOString(),
                    type: 'tool_call',
                    data: {
                        tool: 'manage_agents',
                        action: 'register',
                        baseAgentId: agentId,
                        finalAgentId: result.agentId
                    }
                }, result.agentId);

                // Ensure project is registered in Global Registry
                try {
                    const registry = new RegistryManager();
                    await registry.registerProject(
                        projectId, 
                        workspaceRoot, 
                        `Auto-registered via Agent ${result.agentId}`,
                        ['auto-discovered']
                    );
                } catch (err) {
                    console.error(`Failed to auto-register project in global registry: ${err}`);
                }

                return { 
                    success: true, 
                    message: `Agent ${result.agentId} registered`,
                    agentId: result.agentId,
                    sessionId: result.sessionId 
                };

            case 'update_status':
                if (!agentId) throw new Error('agentId is required for update_status');
                const activeIdStatus = await board.resolveActiveAgentId(agentId);
                await board.updateStatus(activeIdStatus, status || 'ACTIVE', focus || '-');
                return { success: true, message: `Agent ${activeIdStatus} status updated` };

            case 'claim_resource':
                if (!agentId || !resource) throw new Error('agentId and resource are required for claim_resource');
                const activeIdClaim = await board.resolveActiveAgentId(agentId);
                const claimed = await board.claimResource(activeIdClaim, resource);
                if (claimed) {
                     return { success: true, message: `Resource ${resource} claimed by ${activeIdClaim}` };
                } else {
                     return { success: false, message: `Resource ${resource} is already locked` };
                }

            case 'release_resource':
                 if (!agentId || !resource) throw new Error('agentId and resource are required for release_resource');
                 const activeIdRelease = await board.resolveActiveAgentId(agentId);
                 await board.releaseResource(activeIdRelease, resource);
                 return { success: true, message: `Resource ${resource} released` };

            case 'get_board':
                const content = await board.getBoardContent();
                return { success: true, content };

            default:
                throw new Error(`Unknown action: ${action}`);
        }
    } catch (error: any) {
        return {
            success: false,
            error: error.message
        };
    }
}

export const manageAgentsToolDefinition = {
  name: "memorybank_manage_agents",
  description: "Coordina múltiples agentes usando una pizarra central (Agent Board). Permite registrar agentes, pedir recursos (locks) y ver estado global para evitar conflictos.",
  inputSchema: {
    type: "object",
    properties: {
      projectId: {
        type: "string",
        description: "Identificador único del proyecto (OBLIGATORIO)",
      },
      action: {
        type: "string",
        description: "Acción a realizar",
        enum: ["register", "update_status", "claim_resource", "release_resource", "get_board"],
      },
      agentId: {
        type: "string",
        description: "Identificador del agente (ej: 'dev-agent-1'). Requerido para escrituras.",
      },
      sessionId: {
        type: "string",
        description: "UUID de sesión del agente para tracking de contexto.",
      },
      status: {
        type: "string",
        description: "Estado del agente (para update_status).",
      },
      focus: {
        type: "string",
        description: "Tarea o fichero en el que se enfoca (para update_status).",
      },
      resource: {
        type: "string",
        description: "Identificador del recurso a bloquear (ej: 'src/auth/').",
      },
      workspacePath: {
        type: "string",
        description: "RUTA ABSOLUTA al directorio raíz del workspace. IMPORTANTE: Debe coincidir con la ruta real del proyecto, no usar rutas relativas.",
      },
    },
    required: ["projectId", "action"],
  },
};

