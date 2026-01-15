import { AgentBoard } from '../common/agentBoard.js';
import * as path from 'path';

const WORKSPACE_ROOT = process.cwd(); // Will be overridden by actual workspace logic if passed

export interface ManageAgentsParams {
  projectId: string;
  action: 'register' | 'update_status' | 'claim_resource' | 'release_resource' | 'get_board';
  agentId?: string;
  status?: string;
  focus?: string;
  resource?: string;
}

export async function manageAgentsTool(params: ManageAgentsParams, workspaceRoot: string = WORKSPACE_ROOT): Promise<any> {
    const { projectId, action, agentId, status, focus, resource } = params;

    const board = new AgentBoard(workspaceRoot, projectId);

    try {
        switch (action) {
            case 'register':
                if (!agentId) throw new Error('agentId is required for register');
                await board.registerAgent(agentId);
                return { success: true, message: `Agent ${agentId} registered` };

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

