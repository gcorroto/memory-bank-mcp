/**
 * @fileoverview SQLite Database Manager for Memory Bank
 * Centralized database for agent coordination, sessions, tasks, and locks.
 * Located at ~/.memorybank/agentboard.db (same directory as global_registry.json)
 */

import Database, { Database as DatabaseType } from 'better-sqlite3';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

const SCHEMA_VERSION = 1;

/**
 * SQL Schema for Agent Board
 */
const SCHEMA_SQL = `
-- Agents: All agent sessions across all projects
-- Only one agent can be ACTIVE per project at a time
CREATE TABLE IF NOT EXISTS agents (
    id TEXT NOT NULL,                       -- Full agent ID with hash suffix (e.g., 'Dev-VSCode-Gemini-abc12345')
    project_id TEXT NOT NULL,               -- Project this agent is working on
    session_id TEXT NOT NULL,               -- UUID for this session
    status TEXT NOT NULL DEFAULT 'ACTIVE',  -- ACTIVE, INACTIVE
    focus TEXT DEFAULT '-',                 -- Current task/file being worked on
    last_heartbeat TEXT NOT NULL,           -- ISO timestamp of last activity
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_agents_project ON agents(project_id);
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(project_id, status);
CREATE INDEX IF NOT EXISTS idx_agents_session ON agents(session_id);

-- Tasks: Project-centric tasks (not assigned to specific agents)
-- The active agent of a project processes its pending tasks
CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,                    -- e.g., 'TASK-123456'
    project_id TEXT NOT NULL,               -- Target project to handle this task
    title TEXT NOT NULL,
    description TEXT,                       -- Extended task description
    from_project TEXT,                      -- Source project (for cross-project delegation)
    from_agent TEXT,                        -- Agent that created the task
    status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, IN_PROGRESS, COMPLETED, CANCELLED
    claimed_by TEXT,                        -- Agent ID that claimed the task
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    claimed_at TEXT,
    completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(project_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_from ON tasks(from_project);

-- Locks: Resource/file locks held by agents
CREATE TABLE IF NOT EXISTS locks (
    resource TEXT NOT NULL,                 -- Resource pattern (e.g., 'src/auth/')
    project_id TEXT NOT NULL,               -- Project scope
    agent_id TEXT NOT NULL,                 -- Agent holding the lock
    acquired_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (resource, project_id)
);

CREATE INDEX IF NOT EXISTS idx_locks_agent ON locks(agent_id);
CREATE INDEX IF NOT EXISTS idx_locks_project ON locks(project_id);

-- Session Events: All actions performed during agent sessions
-- Replaces JSONL files for better querying
CREATE TABLE IF NOT EXISTS session_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    agent_id TEXT,                          -- Agent that performed the action
    event_type TEXT NOT NULL,               -- search, read_doc, read_file, index, decision, write_file, etc.
    event_data TEXT NOT NULL,               -- JSON blob with event details
    timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_events_session ON session_events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_project ON session_events(project_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON session_events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_time ON session_events(timestamp);

-- Messages: Agent communication log
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    message TEXT NOT NULL,
    timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_messages_project ON messages(project_id);
CREATE INDEX IF NOT EXISTS idx_messages_time ON messages(timestamp);

-- Schema versioning for future migrations
CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

/**
 * Database Manager Singleton
 * Manages a single SQLite connection for the entire MCP server
 */
class DatabaseManager {
    private static instance: DatabaseManager;
    private db: DatabaseType | null = null;
    private dbPath: string;

    private constructor() {
        // Same directory as global_registry.json
        this.dbPath = path.join(os.homedir(), '.memorybank', 'agentboard.db');
    }

    static getInstance(): DatabaseManager {
        if (!DatabaseManager.instance) {
            DatabaseManager.instance = new DatabaseManager();
        }
        return DatabaseManager.instance;
    }

    /**
     * Get or create the database connection
     */
    getConnection(): DatabaseType {
        if (this.db) {
            return this.db;
        }

        // Ensure directory exists
        const dir = path.dirname(this.dbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        // Open database with WAL mode for better concurrency
        this.db = new Database(this.dbPath, {
            timeout: 5000, // Wait up to 5s for locks
        });

        // Use DELETE journal mode instead of WAL for compatibility with sql.js readers
        // sql.js cannot read databases with WAL mode enabled (even with empty WAL files)
        this.db.pragma('journal_mode = DELETE');
        
        // Foreign keys enforcement
        this.db.pragma('foreign_keys = ON');

        // Initialize schema
        this.initializeSchema();

        console.error(`[Database] Connected to ${this.dbPath}`);

        return this.db;
    }

    /**
     * Initialize database schema
     */
    private initializeSchema(): void {
        if (!this.db) return;

        // Check current schema version
        let currentVersion = 0;
        try {
            const row = this.db.prepare('SELECT MAX(version) as version FROM schema_version').get() as { version: number } | undefined;
            currentVersion = row?.version || 0;
        } catch {
            // Table doesn't exist yet, version is 0
        }

        if (currentVersion < SCHEMA_VERSION) {
            console.error(`[Database] Migrating schema from v${currentVersion} to v${SCHEMA_VERSION}`);
            
            // Run schema creation (IF NOT EXISTS makes it safe)
            this.db.exec(SCHEMA_SQL);

            // Record schema version
            if (currentVersion === 0) {
                this.db.prepare('INSERT OR REPLACE INTO schema_version (version) VALUES (?)').run(SCHEMA_VERSION);
            }

            console.error(`[Database] Schema initialized at v${SCHEMA_VERSION}`);
        }
    }

    /**
     * Close database connection
     */
    close(): void {
        if (this.db) {
            this.db.close();
            this.db = null;
            console.error('[Database] Connection closed');
        }
    }

    /**
     * Get the database file path
     */
    getDbPath(): string {
        return this.dbPath;
    }

    /**
     * Check if database file exists
     */
    exists(): boolean {
        return fs.existsSync(this.dbPath);
    }

    /**
     * Run a transaction with automatic rollback on error.
     * Automatically flushes WAL after successful transaction for external readers.
     */
    transaction<T>(fn: () => T): T {
        const db = this.getConnection();
        const result = db.transaction(fn)();
        // Auto-flush after any transaction so sql.js can read the changes
        this.flushForExternalReaders();
        return result;
    }

    /**
     * Execute a write operation (INSERT, UPDATE, DELETE) and auto-flush WAL.
     * Use this for single statements that modify data.
     * For multiple related writes, use transaction() instead.
     * 
     * @param sql - SQL statement to execute
     * @param params - Parameters to bind to the statement
     * @returns RunResult with changes count and lastInsertRowid
     */
    runWrite(sql: string, ...params: any[]): { changes: number; lastInsertRowid: number | bigint } {
        const db = this.getConnection();
        const result = db.prepare(sql).run(...params);
        // Auto-flush so sql.js can read the changes immediately
        this.flushForExternalReaders();
        return result;
    }

    /**
     * Force WAL checkpoint to flush pending writes to the main database file.
     * This is necessary for external readers (like sql.js in VS Code extension)
     * that cannot read WAL files directly.
     * 
     * @param mode - Checkpoint mode:
     *   - 'PASSIVE': Checkpoint as much as possible without blocking (default)
     *   - 'FULL': Wait for all readers, then checkpoint everything
     *   - 'RESTART': Like FULL, but also restart the WAL file
     *   - 'TRUNCATE': Like RESTART, but also truncate WAL file to zero bytes
     * @returns Object with busy (pages that couldn't be checkpointed) and log (total WAL pages)
     */
    checkpoint(mode: 'PASSIVE' | 'FULL' | 'RESTART' | 'TRUNCATE' = 'PASSIVE'): { busy: number; log: number } {
        if (!this.db) {
            return { busy: 0, log: 0 };
        }

        try {
            const result = this.db.pragma(`wal_checkpoint(${mode})`) as Array<{ busy: number; log: number }>;
            const checkpointResult = result[0] || { busy: 0, log: 0 };
            
            // Only log if there were actual pages to flush (reduce noise)
            if (checkpointResult.log > 0) {
                console.error(`[Database] WAL checkpoint: ${checkpointResult.log - checkpointResult.busy}/${checkpointResult.log} pages flushed`);
            }
            
            return checkpointResult;
        } catch (error) {
            console.error(`[Database] Checkpoint error: ${error}`);
            return { busy: 0, log: 0 };
        }
    }

    /**
     * Perform a full checkpoint and ensure all data is written to main DB file.
     * Called automatically after write operations.
     * Can also be called manually if needed.
     */
    flushForExternalReaders(): void {
        this.checkpoint('TRUNCATE');
    }
}

// Export singleton instance
export const databaseManager = DatabaseManager.getInstance();

// Export types for use in other modules
export type { DatabaseType };
