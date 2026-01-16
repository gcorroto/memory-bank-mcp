/**
 * @fileoverview Agent Board - Unified interface for agent coordination
 * 
 * This module provides backward-compatible API while using SQLite internally.
 * The AgentBoard class maintains the same method signatures but delegates to
 * AgentBoardSqlite for actual operations.
 * 
 * Migration: MD-based storage is deprecated. All operations now use SQLite.
 */

import { AgentBoardSqlite } from './agentBoardSqlite.js';
import { databaseManager } from './database.js';
import * as crypto from 'crypto';

/**
 * AgentBoard - Facade for agent coordination
 * 
 * Maintains backward-compatible API while using SQLite storage.
 * The basePath parameter is kept for compatibility but ignored (DB is global).
 */
export class AgentBoard {
    private sqlite: AgentBoardSqlite;
    private projectId: string;

    constructor(basePath: string, projectId: string) {
        // basePath is ignored - SQLite DB is at ~/.memorybank/agentboard.db
        this.projectId = projectId;
        this.sqlite = new AgentBoardSqlite(projectId);
    }

    // ========================================================================
    // Board Content (Markdown export for compatibility)
    // ========================================================================

    /**
     * Get board content as Markdown (for display/debugging)
     */
    async getBoardContent(): Promise<string> {
        return this.sqlite.exportToMarkdown();
    }

    // ========================================================================
    // Agent Management
    // ========================================================================

    /**
     * Register an agent with optional session ID
     * Note: For new flow, use registerAgentWithHash() which returns the generated ID
     */
    async registerAgent(agentId: string, sessionId?: string): Promise<void> {
        // Legacy method - agent ID already includes hash
        // Just update/insert into SQLite
        const db = databaseManager.getConnection();
        const now = new Date().toISOString();
        const effectiveSessionId = sessionId || crypto.randomUUID();

        // Deactivate other agents for this project
        db.prepare(`
            UPDATE agents 
            SET status = 'INACTIVE', last_heartbeat = ?
            WHERE project_id = ? AND status = 'ACTIVE' AND id != ?
        `).run(now, this.projectId, agentId);

        // Upsert this agent
        db.prepare(`
            INSERT INTO agents (id, project_id, session_id, status, focus, last_heartbeat)
            VALUES (?, ?, ?, 'ACTIVE', '-', ?)
            ON CONFLICT(id, project_id) DO UPDATE SET
                session_id = excluded.session_id,
                status = 'ACTIVE',
                last_heartbeat = excluded.last_heartbeat
        `).run(agentId, this.projectId, effectiveSessionId, now);

        this.sqlite.logMessage(agentId, 'Agent registered');
    }

    /**
     * Register agent and generate hash suffix (new flow)
     * Client provides base ID (e.g., "Dev-VSCode-Gemini"), MCP generates full ID with hash
     */
    registerAgentWithHash(baseAgentId: string, sessionId?: string): { agentId: string; sessionId: string } {
        return this.sqlite.registerAgent(baseAgentId, sessionId);
    }

    /**
     * Update agent status and current focus
     */
    async updateStatus(agentId: string, status: string, focus: string): Promise<void> {
        this.sqlite.updateStatus(agentId, status, focus);
    }

    /**
     * Resolve a base agent ID to the actual active agent ID
     */
    async resolveActiveAgentId(baseId: string): Promise<string> {
        return this.sqlite.resolveActiveAgentId(baseId);
    }

    /**
     * Get session ID for an agent
     */
    async getSessionId(agentId: string): Promise<string | undefined> {
        return this.sqlite.getSessionId(agentId) || undefined;
    }

    /**
     * Get the currently active agent for this project
     */
    getActiveAgent() {
        return this.sqlite.getActiveAgent();
    }

    /**
     * Get all agents (for session history)
     */
    getAllAgents() {
        return this.sqlite.getAllAgents();
    }

    // ========================================================================
    // Task Management
    // ========================================================================

    /**
     * Create a task (project-centric)
     * Note: assignedTo parameter is deprecated - tasks go to the project, not agent
     */
    async createTask(title: string, fromAgentId: string, assignedTo: string, description: string): Promise<string> {
        // assignedTo is ignored in new model - tasks are project-centric
        return this.sqlite.createTask(title, description, fromAgentId);
    }

    /**
     * Create an external task from another project
     */
    async createExternalTask(title: string, fromProject: string, context: string): Promise<string> {
        return this.sqlite.createExternalTask(title, fromProject, context);
    }

    /**
     * Complete a task
     */
    async completeTask(taskId: string, agentId: string): Promise<void> {
        this.sqlite.completeTask(taskId, agentId);
    }

    /**
     * Get pending tasks for this project
     */
    getPendingTasks() {
        return this.sqlite.getPendingTasks();
    }

    /**
     * Claim a task
     */
    claimTask(taskId: string, agentId: string): boolean {
        return this.sqlite.claimTask(taskId, agentId);
    }

    // ========================================================================
    // Resource Locks
    // ========================================================================

    /**
     * Claim a resource lock
     */
    async claimResource(agentId: string, resource: string): Promise<boolean> {
        return this.sqlite.claimResource(agentId, resource);
    }

    /**
     * Release a resource lock
     */
    async releaseResource(agentId: string, resource: string): Promise<void> {
        this.sqlite.releaseResource(agentId, resource);
    }

    /**
     * Get all locks for this project
     */
    getLocks() {
        return this.sqlite.getLocks();
    }

    /**
     * Cleanup orphaned locks
     */
    cleanupOrphanedLocks(): number {
        return this.sqlite.cleanupOrphanedLocks();
    }

    // ========================================================================
    // Messages
    // ========================================================================

    /**
     * Log a message to the agent board
     */
    async logMessage(agentId: string, message: string): Promise<void> {
        this.sqlite.logMessage(agentId, message);
    }

    /**
     * Get recent messages
     */
    getMessages(limit: number = 20) {
        return this.sqlite.getMessages(limit);
    }

    // ========================================================================
    // Session Events
    // ========================================================================

    /**
     * Log a session event
     */
    logSessionEvent(sessionId: string, eventType: string, eventData: any, agentId?: string): void {
        this.sqlite.logSessionEvent(sessionId, eventType, eventData, agentId);
    }

    /**
     * Get session history
     */
    getSessionHistory(sessionId: string) {
        return this.sqlite.getSessionHistory(sessionId);
    }

    /**
     * Get all sessions for this project
     */
    getProjectSessions() {
        return this.sqlite.getProjectSessions();
    }
}

// Re-export SQLite implementation for direct access if needed
export { AgentBoardSqlite } from './agentBoardSqlite.js';
export { cleanupStaleAgents, cleanupAllOrphanedLocks } from './agentBoardSqlite.js';
