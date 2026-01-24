/**
 * @fileoverview SQLite-based Agent Board Implementation
 * Replaces Markdown-based agentBoard with proper database operations.
 * Provides project-centric task management and multi-agent coordination.
 */

import { databaseManager } from './database.js';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ============================================================================
// Types
// ============================================================================

export interface AgentRecord {
    id: string;
    projectId: string;
    sessionId: string;
    status: 'ACTIVE' | 'INACTIVE';
    focus: string;
    lastHeartbeat: string;
    createdAt: string;
}

export interface TaskRecord {
    id: string;
    projectId: string;
    title: string;
    description?: string;
    fromProject?: string;
    fromAgent?: string;
    status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
    claimedBy?: string;
    createdAt: string;
    claimedAt?: string;
    completedAt?: string;
}

export interface LockRecord {
    resource: string;
    projectId: string;
    agentId: string;
    acquiredAt: string;
}

export interface SessionEventRecord {
    id: number;
    projectId: string;
    sessionId: string;
    agentId?: string;
    eventType: string;
    eventData: any;
    timestamp: string;
}

export interface MessageRecord {
    id: number;
    projectId: string;
    agentId: string;
    message: string;
    timestamp: string;
}

// ============================================================================
// Agent Board SQLite Implementation
// ============================================================================

export class AgentBoardSqlite {
    private projectId: string;

    constructor(projectId: string) {
        this.projectId = projectId;
    }

    // ========================================================================
    // Agent Management
    // ========================================================================

    /**
     * Register a new agent for this project.
     * Automatically deactivates any previous active agent.
     * The MCP generates the hash suffix - client only provides base ID.
     * Also syncs project keywords/responsibilities from registry to SQLite.
     */
    registerAgent(baseAgentId: string, sessionId?: string): { agentId: string; sessionId: string } {
        const db = databaseManager.getConnection();
        
        // Generate unique agent ID with hash suffix
        const suffix = crypto.randomUUID().slice(0, 8);
        const fullAgentId = `${baseAgentId}-${suffix}`;
        
        // Generate session ID if not provided
        const effectiveSessionId = sessionId || crypto.randomUUID();
        
        const now = new Date().toISOString();
        
        // Get project metadata from registry (keywords, responsibilities) - sync read
        let keywords: string[] = [];
        let responsibilities: string[] = [];
        try {
            const registryPath = path.join(os.homedir(), '.memorybank', 'global_registry.json');
            if (fs.existsSync(registryPath)) {
                const registryData = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
                const project = registryData.projects?.find((p: any) => p.projectId === this.projectId);
                if (project) {
                    keywords = project.keywords || [];
                    responsibilities = project.responsibilities || [];
                }
            }
        } catch (e) {
            // Registry not available, continue without metadata
        }

        return databaseManager.transaction(() => {
            // Deactivate any currently active agents for this project
            db.prepare(`
                UPDATE agents 
                SET status = 'INACTIVE', last_heartbeat = ?
                WHERE project_id = ? AND status = 'ACTIVE'
            `).run(now, this.projectId);

            // Insert new agent as ACTIVE with project metadata
            db.prepare(`
                INSERT INTO agents (id, project_id, session_id, status, focus, last_heartbeat, keywords, responsibilities)
                VALUES (?, ?, ?, 'ACTIVE', '-', ?, ?, ?)
            `).run(
                fullAgentId, 
                this.projectId, 
                effectiveSessionId, 
                now,
                JSON.stringify(keywords),
                JSON.stringify(responsibilities)
            );

            // Log the registration
            this.logMessage(fullAgentId, `Agent registered and activated`);

            return { agentId: fullAgentId, sessionId: effectiveSessionId };
        });
    }

    /**
     * Get the currently active agent for this project
     */
    getActiveAgent(): AgentRecord | null {
        const db = databaseManager.getConnection();
        
        const row = db.prepare(`
            SELECT id, project_id, session_id, status, focus, last_heartbeat, created_at
            FROM agents
            WHERE project_id = ? AND status = 'ACTIVE'
            ORDER BY last_heartbeat DESC
            LIMIT 1
        `).get(this.projectId) as any;

        if (!row) return null;

        return {
            id: row.id,
            projectId: row.project_id,
            sessionId: row.session_id,
            status: row.status,
            focus: row.focus,
            lastHeartbeat: row.last_heartbeat,
            createdAt: row.created_at
        };
    }

    /**
     * Get session ID for a specific agent
     */
    getSessionId(agentId: string): string | null {
        const db = databaseManager.getConnection();
        
        const row = db.prepare(`
            SELECT session_id FROM agents
            WHERE id = ? AND project_id = ?
        `).get(agentId, this.projectId) as { session_id: string } | undefined;

        return row?.session_id || null;
    }

    /**
     * Resolve an agent ID - find the active agent matching a base ID prefix
     */
    resolveActiveAgentId(baseId: string): string {
        const db = databaseManager.getConnection();

        // First try exact match
        const exact = db.prepare(`
            SELECT id FROM agents
            WHERE id = ? AND project_id = ? AND status = 'ACTIVE'
        `).get(baseId, this.projectId) as { id: string } | undefined;

        if (exact) return exact.id;

        // Try prefix match - find most recent active agent starting with baseId
        const prefixMatch = db.prepare(`
            SELECT id FROM agents
            WHERE project_id = ? AND status = 'ACTIVE' AND id LIKE ?
            ORDER BY last_heartbeat DESC
            LIMIT 1
        `).get(this.projectId, `${baseId}-%`) as { id: string } | undefined;

        return prefixMatch?.id || baseId;
    }

    /**
     * Update agent status and focus
     */
    updateStatus(agentId: string, status: string, focus: string): void {
        const db = databaseManager.getConnection();
        const now = new Date().toISOString();

        // Resolve to actual agent ID if base ID provided
        const resolvedId = this.resolveActiveAgentId(agentId);

        db.prepare(`
            UPDATE agents
            SET status = ?, focus = ?, last_heartbeat = ?
            WHERE id = ? AND project_id = ?
        `).run(status, focus, now, resolvedId, this.projectId);
        
        // Flush WAL so external readers can see changes
        databaseManager.flushForExternalReaders();
    }

    /**
     * Update heartbeat for an agent
     */
    heartbeat(agentId: string): void {
        const db = databaseManager.getConnection();
        const now = new Date().toISOString();

        db.prepare(`
            UPDATE agents
            SET last_heartbeat = ?
            WHERE id = ? AND project_id = ?
        `).run(now, agentId, this.projectId);
        
        // Flush WAL so external readers can see changes
        databaseManager.flushForExternalReaders();
    }

    /**
     * Get all agents for this project (for session history view)
     */
    getAllAgents(): AgentRecord[] {
        const db = databaseManager.getConnection();
        
        const rows = db.prepare(`
            SELECT id, project_id, session_id, status, focus, last_heartbeat, created_at
            FROM agents
            WHERE project_id = ?
            ORDER BY created_at DESC
        `).all(this.projectId) as any[];

        return rows.map(row => ({
            id: row.id,
            projectId: row.project_id,
            sessionId: row.session_id,
            status: row.status,
            focus: row.focus,
            lastHeartbeat: row.last_heartbeat,
            createdAt: row.created_at
        }));
    }

    // ========================================================================
    // Task Management (Project-centric)
    // ========================================================================

    /**
     * Create a task for this project
     */
    createTask(title: string, description?: string, fromAgent?: string): string {
        const db = databaseManager.getConnection();
        
        const taskId = `TASK-${Date.now().toString().slice(-6)}`;
        const now = new Date().toISOString();

        db.prepare(`
            INSERT INTO tasks (id, project_id, title, description, from_agent, status, created_at)
            VALUES (?, ?, ?, ?, ?, 'PENDING', ?)
        `).run(taskId, this.projectId, title, description || null, fromAgent || null, now);

        this.logMessage(fromAgent || 'SYSTEM', `Created task ${taskId}: ${title}`);
        databaseManager.flushForExternalReaders();

        return taskId;
    }

    /**
     * Create an external task (cross-project delegation)
     */
    createExternalTask(title: string, fromProjectId: string, context?: string): string {
        const db = databaseManager.getConnection();
        
        const taskId = `EXT-${Date.now().toString().slice(-6)}`;
        const now = new Date().toISOString();

        db.prepare(`
            INSERT INTO tasks (id, project_id, title, description, from_project, status, created_at)
            VALUES (?, ?, ?, ?, ?, 'PENDING', ?)
        `).run(taskId, this.projectId, title, context || null, fromProjectId, now);

        this.logMessage('SYSTEM', `External task ${taskId} from ${fromProjectId}: ${title}`);
        databaseManager.flushForExternalReaders();

        return taskId;
    }

    /**
     * Get pending tasks for this project
     */
    getPendingTasks(): TaskRecord[] {
        const db = databaseManager.getConnection();
        
        const rows = db.prepare(`
            SELECT * FROM tasks
            WHERE project_id = ? AND status IN ('PENDING', 'IN_PROGRESS')
            ORDER BY created_at ASC
        `).all(this.projectId) as any[];

        return rows.map(this.mapTaskRow);
    }

    /**
     * Claim a task (agent takes ownership)
     */
    claimTask(taskId: string, agentId: string): boolean {
        const db = databaseManager.getConnection();
        const now = new Date().toISOString();

        const result = db.prepare(`
            UPDATE tasks
            SET status = 'IN_PROGRESS', claimed_by = ?, claimed_at = ?
            WHERE id = ? AND project_id = ? AND status = 'PENDING'
        `).run(agentId, now, taskId, this.projectId);

        if (result.changes > 0) {
            this.logMessage(agentId, `Claimed task ${taskId}`);
            databaseManager.flushForExternalReaders();
            return true;
        }
        return false;
    }

    /**
     * Complete a task
     */
    completeTask(taskId: string, agentId: string): boolean {
        const db = databaseManager.getConnection();
        const now = new Date().toISOString();

        const result = db.prepare(`
            UPDATE tasks
            SET status = 'COMPLETED', completed_at = ?
            WHERE id = ? AND project_id = ?
        `).run(now, taskId, this.projectId);

        if (result.changes > 0) {
            this.logMessage(agentId, `Completed task ${taskId}`);
            databaseManager.flushForExternalReaders();
            return true;
        }
        return false;
    }

    private mapTaskRow(row: any): TaskRecord {
        return {
            id: row.id,
            projectId: row.project_id,
            title: row.title,
            description: row.description,
            fromProject: row.from_project,
            fromAgent: row.from_agent,
            status: row.status,
            claimedBy: row.claimed_by,
            createdAt: row.created_at,
            claimedAt: row.claimed_at,
            completedAt: row.completed_at
        };
    }

    // ========================================================================
    // Resource Locks
    // ========================================================================

    /**
     * Claim a resource lock
     */
    claimResource(agentId: string, resource: string): boolean {
        const db = databaseManager.getConnection();
        const now = new Date().toISOString();

        try {
            return databaseManager.transaction(() => {
                // Check if already locked by someone else
                const existing = db.prepare(`
                    SELECT agent_id FROM locks
                    WHERE resource = ? AND project_id = ?
                `).get(resource, this.projectId) as { agent_id: string } | undefined;

                if (existing && existing.agent_id !== agentId) {
                    return false; // Already locked by another agent
                }

                // Insert or update lock
                db.prepare(`
                    INSERT OR REPLACE INTO locks (resource, project_id, agent_id, acquired_at)
                    VALUES (?, ?, ?, ?)
                `).run(resource, this.projectId, agentId, now);

                this.logMessage(agentId, `Claimed lock on ${resource}`);
                return true;
            });
        } catch {
            return false;
        }
    }

    /**
     * Release a resource lock
     */
    releaseResource(agentId: string, resource: string): void {
        const db = databaseManager.getConnection();

        db.prepare(`
            DELETE FROM locks
            WHERE resource = ? AND project_id = ? AND agent_id = ?
        `).run(resource, this.projectId, agentId);

        this.logMessage(agentId, `Released lock on ${resource}`);
        // Note: logMessage already flushes
    }

    /**
     * Get all locks for this project
     */
    getLocks(): LockRecord[] {
        const db = databaseManager.getConnection();
        
        const rows = db.prepare(`
            SELECT resource, project_id, agent_id, acquired_at
            FROM locks
            WHERE project_id = ?
        `).all(this.projectId) as any[];

        return rows.map(row => ({
            resource: row.resource,
            projectId: row.project_id,
            agentId: row.agent_id,
            acquiredAt: row.acquired_at
        }));
    }

    /**
     * Release all locks held by an agent (cleanup)
     */
    releaseAllLocks(agentId: string): number {
        const db = databaseManager.getConnection();

        const result = db.prepare(`
            DELETE FROM locks
            WHERE agent_id = ? AND project_id = ?
        `).run(agentId, this.projectId);
        
        // Flush WAL so external readers can see changes
        databaseManager.flushForExternalReaders();

        return result.changes;
    }

    /**
     * Cleanup orphaned locks (locks from inactive agents)
     */
    cleanupOrphanedLocks(): number {
        const db = databaseManager.getConnection();

        const result = db.prepare(`
            DELETE FROM locks
            WHERE project_id = ? AND agent_id NOT IN (
                SELECT id FROM agents WHERE project_id = ? AND status = 'ACTIVE'
            )
        `).run(this.projectId, this.projectId);
        
        // Flush WAL so external readers can see changes
        databaseManager.flushForExternalReaders();

        return result.changes;
    }

    // ========================================================================
    // Session Events
    // ========================================================================

    /**
     * Log a session event
     * Auto-flushes WAL for external readers since this tracks all agent actions
     */
    logSessionEvent(sessionId: string, eventType: string, eventData: any, agentId?: string): void {
        const db = databaseManager.getConnection();
        const now = new Date().toISOString();

        db.prepare(`
            INSERT INTO session_events (project_id, session_id, agent_id, event_type, event_data, timestamp)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(
            this.projectId,
            sessionId,
            agentId || null,
            eventType,
            JSON.stringify(eventData),
            now
        );
        
        // Flush WAL so external readers (sql.js) can see changes
        databaseManager.flushForExternalReaders();
    }

    /**
     * Get session history for a specific session
     */
    getSessionHistory(sessionId: string): SessionEventRecord[] {
        const db = databaseManager.getConnection();
        
        const rows = db.prepare(`
            SELECT id, project_id, session_id, agent_id, event_type, event_data, timestamp
            FROM session_events
            WHERE session_id = ?
            ORDER BY timestamp ASC
        `).all(sessionId) as any[];

        return rows.map(row => ({
            id: row.id,
            projectId: row.project_id,
            sessionId: row.session_id,
            agentId: row.agent_id,
            eventType: row.event_type,
            eventData: JSON.parse(row.event_data),
            timestamp: row.timestamp
        }));
    }

    /**
     * Get all sessions for this project (for UI display)
     */
    getProjectSessions(): { sessionId: string; agentId: string; eventCount: number; firstEvent: string; lastEvent: string }[] {
        const db = databaseManager.getConnection();
        
        const rows = db.prepare(`
            SELECT 
                session_id,
                MAX(agent_id) as agent_id,
                COUNT(*) as event_count,
                MIN(timestamp) as first_event,
                MAX(timestamp) as last_event
            FROM session_events
            WHERE project_id = ?
            GROUP BY session_id
            ORDER BY last_event DESC
        `).all(this.projectId) as any[];

        return rows.map(row => ({
            sessionId: row.session_id,
            agentId: row.agent_id,
            eventCount: row.event_count,
            firstEvent: row.first_event,
            lastEvent: row.last_event
        }));
    }

    // ========================================================================
    // Messages (Agent Log)
    // ========================================================================

    /**
     * Log a message
     * Auto-flushes WAL for external readers since this is called at end of most operations
     */
    logMessage(agentId: string, message: string): void {
        const db = databaseManager.getConnection();
        const now = new Date().toISOString();

        db.prepare(`
            INSERT INTO messages (project_id, agent_id, message, timestamp)
            VALUES (?, ?, ?, ?)
        `).run(this.projectId, agentId, message, now);
        
        // Flush WAL so external readers (sql.js) can see changes
        databaseManager.flushForExternalReaders();
    }

    /**
     * Get recent messages
     */
    getMessages(limit: number = 20): MessageRecord[] {
        const db = databaseManager.getConnection();
        
        const rows = db.prepare(`
            SELECT id, project_id, agent_id, message, timestamp
            FROM messages
            WHERE project_id = ?
            ORDER BY timestamp DESC
            LIMIT ?
        `).all(this.projectId, limit) as any[];

        return rows.map(row => ({
            id: row.id,
            projectId: row.project_id,
            agentId: row.agent_id,
            message: row.message,
            timestamp: row.timestamp
        }));
    }

    // ========================================================================
    // Export to Markdown (for compatibility/display)
    // ========================================================================

    /**
     * Generate Markdown representation of the board (for get_board action)
     */
    exportToMarkdown(): string {
        const agents = this.getAllAgents();
        const tasks = this.getPendingTasks();
        const locks = this.getLocks();
        const messages = this.getMessages(20);

        const lines: string[] = [
            '# Multi-Agent Board',
            '',
            '## Active Agents',
            '| Agent ID | Status | Current Focus | Session ID | Last Heartbeat |',
            '|---|---|---|---|---|',
            ...agents.map(a => `| ${a.id} | ${a.status} | ${a.focus} | ${a.sessionId} | ${a.lastHeartbeat} |`),
            '',
            '## Pending Tasks',
            '| ID | Title | From | Status | Created At |',
            '|---|---|---|---|---|',
            ...tasks.map(t => `| ${t.id} | ${t.title} | ${t.fromProject || t.fromAgent || '-'} | ${t.status} | ${t.createdAt} |`),
            '',
            '## File Locks',
            '| File Pattern | Claimed By | Since |',
            '|---|---|---|',
            ...locks.map(l => `| ${l.resource} | ${l.agentId} | ${l.acquiredAt} |`),
            '',
            '## Agent Messages',
            ...messages.reverse().map(m => `- [${m.timestamp.split('T')[1]?.split('.')[0] || m.timestamp}] **${m.agentId}**: ${m.message}`),
            ''
        ];

        return lines.join('\n');
    }
}

// ============================================================================
// Orchestrator Log Types and Functions
// ============================================================================

export interface OrchestratorLogRecord {
    id: number;
    projectId: string;
    taskDescription: string;
    action: 'proceed' | 'delegate' | 'mixed';
    myResponsibilities: string[];
    delegations: Array<{
        targetProject: string;
        taskTitle: string;
        taskDescription: string;
        reasoning: string;
    }>;
    suggestedImports: string[];
    architectureNotes: string;
    searchesPerformed: string[];
    warning?: string;
    success: boolean;
    modelUsed: string;
    timestamp: string;
}

export interface OrchestratorLogInput {
    projectId: string;
    taskDescription: string;
    action: 'proceed' | 'delegate' | 'mixed';
    myResponsibilities: string[];
    delegations: Array<{
        targetProject: string;
        taskTitle: string;
        taskDescription: string;
        reasoning: string;
    }>;
    suggestedImports: string[];
    architectureNotes: string;
    searchesPerformed?: string[];
    warning?: string;
    success: boolean;
    modelUsed: string;
}

/**
 * Save an orchestrator routing decision to the database
 */
export function saveOrchestratorLog(log: OrchestratorLogInput): number {
    const db = databaseManager.getConnection();
    
    const result = db.prepare(`
        INSERT INTO orchestrator_logs (
            project_id, task_description, action, my_responsibilities,
            delegations, suggested_imports, architecture_notes,
            searches_performed, warning, success, model_used
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        log.projectId,
        log.taskDescription,
        log.action,
        JSON.stringify(log.myResponsibilities),
        JSON.stringify(log.delegations),
        JSON.stringify(log.suggestedImports),
        log.architectureNotes,
        JSON.stringify(log.searchesPerformed || []),
        log.warning || null,
        log.success ? 1 : 0,
        log.modelUsed
    );
    
    // Flush for external readers (VSCode extension)
    databaseManager.flushForExternalReaders();
    
    console.error(`[Orchestrator] Saved routing log (ID: ${result.lastInsertRowid})`);
    
    return result.lastInsertRowid as number;
}

/**
 * Get orchestrator logs for a project
 */
export function getOrchestratorLogs(projectId?: string, limit: number = 50): OrchestratorLogRecord[] {
    const db = databaseManager.getConnection();
    
    let query = `
        SELECT * FROM orchestrator_logs
        ${projectId ? 'WHERE project_id = ?' : ''}
        ORDER BY timestamp DESC
        LIMIT ?
    `;
    
    const params = projectId ? [projectId, limit] : [limit];
    const rows = db.prepare(query).all(...params) as any[];
    
    return rows.map(row => ({
        id: row.id,
        projectId: row.project_id,
        taskDescription: row.task_description,
        action: row.action,
        myResponsibilities: JSON.parse(row.my_responsibilities || '[]'),
        delegations: JSON.parse(row.delegations || '[]'),
        suggestedImports: JSON.parse(row.suggested_imports || '[]'),
        architectureNotes: row.architecture_notes,
        searchesPerformed: JSON.parse(row.searches_performed || '[]'),
        warning: row.warning,
        success: row.success === 1,
        modelUsed: row.model_used,
        timestamp: row.timestamp,
    }));
}

/**
 * Get a single orchestrator log by ID
 */
export function getOrchestratorLogById(id: number): OrchestratorLogRecord | null {
    const db = databaseManager.getConnection();
    
    const row = db.prepare(`SELECT * FROM orchestrator_logs WHERE id = ?`).get(id) as any;
    
    if (!row) return null;
    
    return {
        id: row.id,
        projectId: row.project_id,
        taskDescription: row.task_description,
        action: row.action,
        myResponsibilities: JSON.parse(row.my_responsibilities || '[]'),
        delegations: JSON.parse(row.delegations || '[]'),
        suggestedImports: JSON.parse(row.suggested_imports || '[]'),
        architectureNotes: row.architecture_notes,
        searchesPerformed: JSON.parse(row.searches_performed || '[]'),
        warning: row.warning,
        success: row.success === 1,
        modelUsed: row.model_used,
        timestamp: row.timestamp,
    };
}

// ============================================================================
// Cleanup utilities
// ============================================================================

/**
 * Cleanup stale agents (no heartbeat for specified minutes)
 */
export function cleanupStaleAgents(staleMinutes: number = 30): number {
    const db = databaseManager.getConnection();
    
    const result = db.prepare(`
        UPDATE agents
        SET status = 'INACTIVE'
        WHERE status = 'ACTIVE' 
        AND datetime(last_heartbeat) < datetime('now', '-' || ? || ' minutes')
    `).run(staleMinutes);
    
    // Flush WAL so external readers can see changes
    databaseManager.flushForExternalReaders();

    return result.changes;
}

/**
 * Cleanup all orphaned locks across all projects
 */
export function cleanupAllOrphanedLocks(): number {
    const db = databaseManager.getConnection();
    
    const result = db.prepare(`
        DELETE FROM locks
        WHERE agent_id NOT IN (
            SELECT id FROM agents WHERE status = 'ACTIVE'
        )
    `).run();
    
    // Flush WAL so external readers can see changes
    databaseManager.flushForExternalReaders();

    return result.changes;
}
