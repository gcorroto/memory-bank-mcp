import * as fs from 'fs/promises';
import * as path from 'path';
import { LockManager } from './lockManager.js';
import { Logger } from './logger.js';

interface AgentEntry {
    id: string;
    status: string;
    focus: string;
    lastHeartbeat: string;
}

interface LockEntry {
    resource: string;
    agentId: string;
    since: string;
}

export class AgentBoard {
    private basePath: string;
    private projectId: string;
    private lockManager: LockManager;

    constructor(basePath: string, projectId: string) {
        this.basePath = basePath;
        this.projectId = projectId;
        this.lockManager = new LockManager(basePath);
    }

    private getBoardPath(): string {
        return path.join(this.basePath, '.memorybank', 'projects', this.projectId, 'docs', 'agentBoard.md');
    }

    private async ensureBoardExists(): Promise<void> {
        const boardPath = this.getBoardPath();
        try {
            await fs.access(boardPath);
        } catch {
            const initialContent = `# Multi-Agent Board

## Active Agents
| Agent ID | Status | Current Focus | Session ID | Last Heartbeat |
|---|---|---|---|---|

## File Locks
| File Pattern | Claimed By | Since |
|---|---|---|

## Agent Messages
- [System]: Board initialized
`;
            await fs.mkdir(path.dirname(boardPath), { recursive: true });
            await fs.writeFile(boardPath, initialContent, 'utf-8');
        }
    }

    async registerAgent(agentId: string, sessionId?: string): Promise<void> {
        await this.updateBoard((content) => {
            const agents = this.parseTable(content, 'Active Agents');
            const existing = agents.findIndex(a => a[0]?.trim() === agentId);
            
            const now = new Date().toISOString();
            const session = sessionId || (existing >= 0 ? (agents[existing][3] || '') : ''); // Use col 3 as SessionID based on previous read

            if (existing >= 0) {
                 // Check if it's already 5 cols or 4
                 if (agents[existing].length < 5) {
                    agents[existing] = [agentId, 'ACTIVE', '-', session, now];
                 } else {
                     // preserve existing fields if needed, but update timestamp
                    agents[existing] = [agentId, 'ACTIVE', '-', session, now];
                 }
            } else {
                agents.push([agentId, 'ACTIVE', '-', session, now]);
            }
            
            return this.updateTable(content, 'Active Agents', ['Agent ID', 'Status', 'Current Focus', 'Session ID', 'Last Heartbeat'], agents);
        });
    }


    async updateStatus(agentId: string, status: string, focus: string): Promise<void> {
        await this.updateBoard((content) => {
            let agents = this.parseTable(content, 'Active Agents');
            
            // Migration: Ensure 5 columns
            agents = agents.map(row => {
                if (row.length === 4) {
                    return [row[0], row[1], row[2], '', row[3]];
                }
                return row;
            });

            const idx = agents.findIndex(a => a[0]?.trim() === agentId);
            const now = new Date().toISOString();
            
            if (idx >= 0) {
                // Keep existing session ID
                const currentSession = agents[idx][3] || '';
                agents[idx] = [agentId, status, focus, currentSession, now];
            } else {
                agents.push([agentId, status, focus, '', now]);
            }
            
            return this.updateTable(content, 'Active Agents', ['Agent ID', 'Status', 'Current Focus', 'Session ID', 'Last Heartbeat'], agents);
        });
    }

    async getSessionId(agentId: string): Promise<string | undefined> {
        const content = await this.getBoardContent();
        const agents = this.parseTable(content, 'Active Agents');
        const agent = agents.find(a => a[0]?.trim() === agentId);
        
        if (agent) {
             // Handle 5 cols
             if (agent.length >= 5) return agent[3].trim();
             // Handle 4 cols (legacy) - no session ID
             return undefined;
        }
        return undefined;
    }

    async claimResource(agentId: string, resource: string): Promise<boolean> {
        let success = false;
        await this.updateBoard((content) => {
            const locks = this.parseTable(content, 'File Locks');
            
            // Check if already locked by someone else
            const existing = locks.find(l => l[0]?.trim() === resource);
            if (existing && existing[1]?.trim() !== agentId) {
                success = false;
                return content; // No change
            }

            // Add or update lock
            const now = new Date().toISOString();
            if (existing) {
                existing[2] = now; // Renew timestamp
            } else {
                locks.push([resource, agentId, now]);
            }
            
            success = true;
            return this.updateTable(content, 'File Locks', ['File Pattern', 'Claimed By', 'Since'], locks);
        });
        return success;
    }

    async releaseResource(agentId: string, resource: string): Promise<void> {
        await this.updateBoard((content) => {
            let locks = this.parseTable(content, 'File Locks');
            // Filter out locks for this resource by this agent
            locks = locks.filter(l => !(l[0]?.trim() === resource && l[1]?.trim() === agentId));
            return this.updateTable(content, 'File Locks', ['File Pattern', 'Claimed By', 'Since'], locks);
        });
    }

    async getBoardContent(): Promise<string> {
        await this.ensureBoardExists();
        return await fs.readFile(this.getBoardPath(), 'utf-8');
    }

    // --- Helpers ---

    private async updateBoard(mutator: (content: string) => string): Promise<void> {
        await this.ensureBoardExists();
        const locked = await this.lockManager.acquire('agentBoard');
        if (!locked) {
            throw new Error('Could not acquire lock for Agent Board');
        }

        try {
            const current = await fs.readFile(this.getBoardPath(), 'utf-8');
            const newContent = mutator(current);
            await fs.writeFile(this.getBoardPath(), newContent, 'utf-8');
        } finally {
            await this.lockManager.release('agentBoard');
        }
    }

    private parseTable(content: string, headerName: string): string[][] {
        const lines = content.split('\n');
        const result: string[][] = [];
        let inTable = false;
        let colCount = 0;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.startsWith(`## ${headerName}`)) {
                inTable = true;
                continue;
            }
            if (inTable) {
                if (line.startsWith('## ')) break; // New section
                if (!line.includes('|')) continue;
                if (line.includes('---')) continue; // Separator
                
                // Parse row
                const cols = line.split('|').map(c => c.trim()).filter(c => c !== '');
                if (cols.length > 0) {
                     // Check if it's the header row
                    if (result.length === 0 && (line.toLowerCase().includes('agent id') || line.toLowerCase().includes('file pattern'))) {
                        // skip header detection logic for simplicity, we pass headers in update
                    } else {
                         result.push(cols);
                    }
                }
            }
        }
        return result;
    }

    private updateTable(content: string, headerName: string, headers: string[], rows: string[][]): string {
        const lines = content.split('\n');
        let startIdx = -1;
        let endIdx = -1;

        // Validar rows (limpiar arrays vacíos o mal formados)
        const cleanRows = rows.filter(r => r.length > 0);

        for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim().startsWith(`## ${headerName}`)) {
                startIdx = i;
                // Find end of section (next ## or end of file)
                for (let j = i + 1; j < lines.length; j++) {
                    if (lines[j].trim().startsWith('## ')) {
                        endIdx = j;
                        break;
                    }
                }
                if (endIdx === -1) endIdx = lines.length;
                break;
            }
        }

        const newTable = [
            `## ${headerName}`,
            `| ${headers.join(' | ')} |`,
            `| ${headers.map(() => '---').join(' | ')} |`,
            ...cleanRows.map(row => `| ${row.join(' | ')} |`)
        ].join('\n');

        if (startIdx === -1) {
            // Append if not found
            return content + '\n\n' + newTable;
        } else {
            // Replace section
            const before = lines.slice(0, startIdx);
            const after = lines.slice(endIdx);
            return [...before, newTable, '', ...after].join('\n');
        }
    }
}
