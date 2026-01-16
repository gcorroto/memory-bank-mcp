/**
 * @fileoverview Session Logger - SQLite-based session event tracking
 * 
 * Replaces JSONL file-based logging with SQLite for better querying
 * and integration with the centralized agent board database.
 */

import { databaseManager } from './database.js';

export interface SessionEvent {
    timestamp: string;
    type: 'search' | 'read_doc' | 'read_file' | 'index' | 'decision' | 'write_file' | 'tool_call';
    data: any;
}

export interface SessionEventRecord extends SessionEvent {
    id: number;
    projectId: string;
    sessionId: string;
    agentId?: string;
}

/**
 * SessionLogger - Logs all events during agent sessions
 * Uses SQLite session_events table for persistence
 */
export class SessionLogger {
    // projectPath kept for backward compatibility but ignored
    private projectPath: string;

    constructor(projectPath: string = process.cwd()) {
        this.projectPath = projectPath;
    }

    /**
     * Log a session event to SQLite
     */
    async logSessionEvent(
        projectId: string, 
        sessionId: string, 
        event: SessionEvent,
        agentId?: string
    ): Promise<void> {
        if (!sessionId) return; // No logging if no session ID provided

        try {
            const db = databaseManager.getConnection();
            
            db.prepare(`
                INSERT INTO session_events (project_id, session_id, agent_id, event_type, event_data, timestamp)
                VALUES (?, ?, ?, ?, ?, ?)
            `).run(
                projectId,
                sessionId,
                agentId || null,
                event.type,
                JSON.stringify(event.data),
                event.timestamp
            );
        } catch (error) {
            console.error(`[SessionLogger] Error logging event for session ${sessionId}:`, error);
        }
    }

    /**
     * Get session history from SQLite
     */
    async getSessionHistory(projectId: string, sessionId: string): Promise<SessionEvent[]> {
        try {
            const db = databaseManager.getConnection();
            
            const rows = db.prepare(`
                SELECT event_type, event_data, timestamp
                FROM session_events
                WHERE project_id = ? AND session_id = ?
                ORDER BY timestamp ASC
            `).all(projectId, sessionId) as any[];

            return rows.map(row => ({
                timestamp: row.timestamp,
                type: row.event_type,
                data: JSON.parse(row.event_data)
            }));
        } catch (error: any) {
            console.error(`[SessionLogger] Error getting session history:`, error);
            return [];
        }
    }

    /**
     * Get full session event records including IDs
     */
    async getSessionEventRecords(projectId: string, sessionId: string): Promise<SessionEventRecord[]> {
        try {
            const db = databaseManager.getConnection();
            
            const rows = db.prepare(`
                SELECT id, project_id, session_id, agent_id, event_type, event_data, timestamp
                FROM session_events
                WHERE project_id = ? AND session_id = ?
                ORDER BY timestamp ASC
            `).all(projectId, sessionId) as any[];

            return rows.map(row => ({
                id: row.id,
                projectId: row.project_id,
                sessionId: row.session_id,
                agentId: row.agent_id,
                timestamp: row.timestamp,
                type: row.event_type,
                data: JSON.parse(row.event_data)
            }));
        } catch (error: any) {
            console.error(`[SessionLogger] Error getting session records:`, error);
            return [];
        }
    }

    /**
     * Get all sessions for a project
     */
    async getProjectSessions(projectId: string): Promise<{
        sessionId: string;
        agentId: string | null;
        eventCount: number;
        firstEvent: string;
        lastEvent: string;
    }[]> {
        try {
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
            `).all(projectId) as any[];

            return rows.map(row => ({
                sessionId: row.session_id,
                agentId: row.agent_id,
                eventCount: row.event_count,
                firstEvent: row.first_event,
                lastEvent: row.last_event
            }));
        } catch (error: any) {
            console.error(`[SessionLogger] Error getting project sessions:`, error);
            return [];
        }
    }

    /**
     * Get events by type for a project
     */
    async getEventsByType(
        projectId: string, 
        eventType: string, 
        limit: number = 100
    ): Promise<SessionEventRecord[]> {
        try {
            const db = databaseManager.getConnection();
            
            const rows = db.prepare(`
                SELECT id, project_id, session_id, agent_id, event_type, event_data, timestamp
                FROM session_events
                WHERE project_id = ? AND event_type = ?
                ORDER BY timestamp DESC
                LIMIT ?
            `).all(projectId, eventType, limit) as any[];

            return rows.map(row => ({
                id: row.id,
                projectId: row.project_id,
                sessionId: row.session_id,
                agentId: row.agent_id,
                timestamp: row.timestamp,
                type: row.event_type,
                data: JSON.parse(row.event_data)
            }));
        } catch (error: any) {
            console.error(`[SessionLogger] Error getting events by type:`, error);
            return [];
        }
    }

    /**
     * Get recent events across all sessions for a project
     */
    async getRecentEvents(projectId: string, limit: number = 50): Promise<SessionEventRecord[]> {
        try {
            const db = databaseManager.getConnection();
            
            const rows = db.prepare(`
                SELECT id, project_id, session_id, agent_id, event_type, event_data, timestamp
                FROM session_events
                WHERE project_id = ?
                ORDER BY timestamp DESC
                LIMIT ?
            `).all(projectId, limit) as any[];

            return rows.map(row => ({
                id: row.id,
                projectId: row.project_id,
                sessionId: row.session_id,
                agentId: row.agent_id,
                timestamp: row.timestamp,
                type: row.event_type,
                data: JSON.parse(row.event_data)
            }));
        } catch (error: any) {
            console.error(`[SessionLogger] Error getting recent events:`, error);
            return [];
        }
    }

    /**
     * Cleanup old session events (older than specified days)
     */
    async cleanupOldEvents(daysToKeep: number = 30): Promise<number> {
        try {
            const db = databaseManager.getConnection();
            
            const result = db.prepare(`
                DELETE FROM session_events
                WHERE datetime(timestamp) < datetime('now', '-' || ? || ' days')
            `).run(daysToKeep);

            return result.changes;
        } catch (error: any) {
            console.error(`[SessionLogger] Error cleaning up old events:`, error);
            return 0;
        }
    }
}

// Export singleton instance
export const sessionLogger = new SessionLogger(process.cwd());
