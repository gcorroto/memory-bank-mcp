import { AgentBoard } from '../common/agentBoard.js';
import { RegistryManager } from '../common/registryManager.js';
import { sessionState } from '../common/sessionState.js';
import * as path from 'path';
import * as crypto from 'crypto';

const WORKSPACE_ROOT = process.cwd(); // Will be overridden by actual workspace logic if passed

export interface ManageAgentsParams {
  projectId: string;
  action: 'register' | 'update_status' | 'claim_resource' | 'release_resource' | 'get_board';
  agentId?: string;
  sessionId?: string;
  status?: string;
  focus?: string;
  resource?: string;
}

export async function manageAgentsTool(params: ManageAgentsParams, workspaceRoot: string = WORKSPACE_ROOT): Promise<any> {
    const { projectId, action, agentId, sessionId, status, focus, resource } = params;

    const board = new AgentBoard(workspaceRoot, projectId);

    try {
        switch (action) {
            case 'register':
                if (!agentId) throw new Error('agentId is required for register');
                
                // Set Global Session State
                sessionState.setCurrentAgent(agentId, projectId);

                // Auto-generate session ID if not provided.
                const effectiveSessionId = sessionId || crypto.randomUUID();
                
                // 1. Register agent on local board
                await board.registerAgent(agentId, effectiveSessionId);

                // 2. Ensure project is registered in Global Registry
                try {
                    const registry = new RegistryManager();
                    // We try to infer keywords or description, but for now we keep it simple.
                    // If the project is already registered, this updates the "lastActive" timestamp.
                    await registry.registerProject(
                        projectId, 
                        workspaceRoot, 
                        `Auto-registered via Agent ${agentId}`,
                        ['auto-discovered']
                    );
                } catch (err) {
                    console.error(`Failed to auto-register project in global registry: ${err}`);
                    // We don't fail the agent registration if global registry fails (e.g. permission issues)
                }

                return { 
                    success: true, 
                    message: `Agent ${agentId} registered`,
                    sessionId: effectiveSessionId 
                };

            case 'update_status':
                if (!agentId) throw new Error('agentId is required for update_status');
                await board.updateStatus(agentId, status || 'ACTIVE', focus || '-');
                return { success: true, message: `Agent ${agentId} status updated` };

            case 'claim_resource':
                if (!agentId || !resource) throw new Error('agentId and resource are required for claim_resource');
                const claimed = await board.claimResource(agentId, resource);
                if (claimed) {
                     return { success: true, message: `Resource ${resource} claimed by ${agentId}` };
                } else {
                     return { success: false, message: `Resource ${resource} is already locked` };
                }

            case 'release_resource':
                 if (!agentId || !resource) throw new Error('agentId and resource are required for release_resource');
                 await board.releaseResource(agentId, resource);
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
        description: "Acción a realizar: register, update_status, claim_resource, release_resource, get_board",
        enum: ["register", "update_status", "claim_resource", "release_resource", "get_board"],
      },
      agentId: {
        type: "string",
        description: "Identificador del agente (ej: 'dev-agent-1'). Requerido para escrituras.",
      },
      sessionId: {
        type: "string",
        description: "Identificador de sesión (opcional, para registro)",
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
    },
    required: ["projectId", "action"],
  },
};

