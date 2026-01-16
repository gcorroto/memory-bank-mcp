export class SessionState {
    private static instance: SessionState;
    private currentAgentId: string | null = null;
    private currentProjectId: string | null = null;

    private constructor() {}

    static getInstance(): SessionState {
        if (!SessionState.instance) {
            SessionState.instance = new SessionState();
        }
        return SessionState.instance;
    }

    setCurrentAgent(agentId: string, projectId: string) {
        this.currentAgentId = agentId;
        this.currentProjectId = projectId;
        console.error(`[SessionState] Set Active Agent: ${agentId} for Project: ${projectId}`);
    }

    getCurrentAgentId(): string | null {
        return this.currentAgentId;
    }

    getCurrentProjectId(): string | null {
        return this.currentProjectId;
    }
}

export const sessionState = SessionState.getInstance();
