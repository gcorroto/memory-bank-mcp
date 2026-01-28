/**
 * @fileoverview Test for get_task_details functionality
 * 
 * Verifies that agents can retrieve full details of tasks including
 * description and context that was provided during delegation.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { AgentBoardSqlite } from '../common/agentBoardSqlite.js';
import { databaseManager } from '../common/database.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Task Details Retrieval', () => {
    const testProjectId = 'test-task-details';
    let board: AgentBoardSqlite;

    beforeEach(() => {
        // Clean database before each test
        const dbPath = path.join(os.homedir(), '.memorybank', 'agentboard.db');
        if (fs.existsSync(dbPath)) {
            fs.unlinkSync(dbPath);
        }
        // Initialize will happen automatically on first getConnection()
        board = new AgentBoardSqlite(testProjectId);
    });

    afterEach(() => {
        // Close database connection to release lock
        databaseManager.close();
    });

    it('should retrieve full details of an external task', () => {
        // Create an external task with description and context
        const title = 'Implement authentication service';
        const description = 'Create JWT-based authentication for the API';
        const context = `
Technical Requirements:
- Use bcrypt for password hashing
- JWT tokens with 1h expiration
- Refresh token mechanism
- Store in lib-auth project
        `;
        const fromProject = 'api-gateway';
        
        const taskId = board.createExternalTask(
            title, 
            fromProject, 
            `${description}\n\nContext:\n${context}`
        );

        // Get task details
        const details = board.getTaskDetails(taskId);

        // Verify all fields are present
        expect(details).not.toBeNull();
        expect(details?.id).toBe(taskId);
        expect(details?.projectId).toBe(testProjectId);
        expect(details?.title).toBe(title);
        expect(details?.description).toContain(description);
        expect(details?.description).toContain(context);
        expect(details?.description).toContain('bcrypt');
        expect(details?.description).toContain('JWT tokens');
        expect(details?.fromProject).toBe(fromProject);
        expect(details?.status).toBe('PENDING');
        expect(details?.createdAt).toBeDefined();
    });

    it('should retrieve full details of an internal task', () => {
        // Create an internal task
        const title = 'Refactor user service';
        const description = 'Extract common logic into shared utilities';
        const fromAgent = 'dev-agent-1';
        
        const taskId = board.createTask(title, description, fromAgent);

        // Get task details
        const details = board.getTaskDetails(taskId);

        // Verify
        expect(details).not.toBeNull();
        expect(details?.id).toBe(taskId);
        expect(details?.title).toBe(title);
        expect(details?.description).toBe(description);
        expect(details?.fromAgent).toBe(fromAgent);
        expect(details?.status).toBe('PENDING');
    });

    it('should return null for non-existent task', () => {
        const details = board.getTaskDetails('NON-EXISTENT');
        expect(details).toBeNull();
    });

    it('should return null for task from different project', () => {
        // Create task in different project
        const otherBoard = new AgentBoardSqlite('other-project');
        const taskId = otherBoard.createTask('Some task', 'Description', 'agent-1');

        // Try to get it from our board
        const details = board.getTaskDetails(taskId);
        expect(details).toBeNull();
    });

    it('should show updated status after claiming', () => {
        // Create task
        const taskId = board.createExternalTask(
            'Test task',
            'source-project',
            'Test description'
        );

        // Claim it
        const agentId = 'test-agent-1';
        board.claimTask(taskId, agentId);

        // Get details
        const details = board.getTaskDetails(taskId);

        // Verify status changed
        expect(details?.status).toBe('IN_PROGRESS');
        expect(details?.claimedBy).toBe(agentId);
        expect(details?.claimedAt).toBeDefined();
    });

    it('should show completed status with timestamp', () => {
        // Create and complete task
        const taskId = board.createTask('Task', 'Description', 'agent-1');
        board.completeTask(taskId, 'agent-1');

        // Get details
        const details = board.getTaskDetails(taskId);

        // Verify
        expect(details?.status).toBe('COMPLETED');
        expect(details?.completedAt).toBeDefined();
    });

    it('should preserve complex context with special characters', () => {
        const contextWithSpecialChars = `
Context includes:
- "Quoted strings"
- Code snippets: const x = { foo: "bar" };
- Line breaks
- Special chars: @#$%^&*()
- Unicode: 日本語 émojis 🎉
        `;
        
        const taskId = board.createExternalTask(
            'Complex task',
            'source',
            contextWithSpecialChars
        );

        const details = board.getTaskDetails(taskId);

        // All special characters should be preserved
        expect(details?.description).toContain('"Quoted strings"');
        expect(details?.description).toContain('const x =');
        expect(details?.description).toContain('@#$%^&*()');
        expect(details?.description).toContain('日本語');
        expect(details?.description).toContain('🎉');
    });

    it('should handle very long descriptions', () => {
        // Create a long description (simulating detailed technical spec)
        const longDescription = 'Section 1: ' + 'A'.repeat(1000) + '\n' +
                                'Section 2: ' + 'B'.repeat(1000) + '\n' +
                                'Section 3: ' + 'C'.repeat(1000);
        
        const taskId = board.createTask('Long task', longDescription, 'agent');
        const details = board.getTaskDetails(taskId);

        // Full description should be preserved
        expect(details?.description?.length).toBe(longDescription.length);
        expect(details?.description).toContain('Section 1:');
        expect(details?.description).toContain('Section 2:');
        expect(details?.description).toContain('Section 3:');
    });
});
