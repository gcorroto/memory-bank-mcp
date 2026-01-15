import * as fs from 'fs/promises';
import * as path from 'path';

export interface SessionEvent {
    timestamp: string;
    type: 'search' | 'read_doc' | 'read_file' | 'index' | 'decision';
    data: any;
}

export class SessionLogger {
    private projectPath: string;

    constructor(projectPath: string) {
        this.projectPath = projectPath;
    }

    private getSessionDir(projectId: string): string {
        return path.join(this.projectPath, '.memorybank', 'projects', projectId, 'sessions');
    }

    private getSessionFilePath(projectId: string, sessionId: string): string {
        return path.join(this.getSessionDir(projectId), `${sessionId}.jsonl`);
    }

    async logSessionEvent(projectId: string, sessionId: string, event: SessionEvent): Promise<void> {
        if (!sessionId) return; // No logging if no session ID provided

        const sessionDir = this.getSessionDir(projectId);
        try {
            await fs.mkdir(sessionDir, { recursive: true });
            
            const filePath = this.getSessionFilePath(projectId, sessionId);
            // Append line to JSONL file
            const line = JSON.stringify(event) + '\n';
            
            await fs.appendFile(filePath, line, 'utf-8');
        } catch (error) {
            console.error(`[SessionLogger] Error logging event for session ${sessionId}:`, error);
        }
    }

    async getSessionHistory(projectId: string, sessionId: string): Promise<SessionEvent[]> {
        const filePath = this.getSessionFilePath(projectId, sessionId);
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            return content.split('\n')
                .filter(line => line.trim().length > 0)
                .map(line => JSON.parse(line));
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                return [];
            }
            throw error;
        }
    }
}

export const sessionLogger = new SessionLogger(process.cwd());
