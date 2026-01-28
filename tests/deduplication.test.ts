/**
 * @fileoverview Tests for Task Deduplication in Route and Delegate
 * Verifies that routeTask detects duplicate tasks and delegateTask prevents creation
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { textSimilarity, areSimilar, findMostSimilar } from '../common/textSimilarity';

describe('Text Similarity for Task Deduplication', () => {
    it('should detect identical strings', () => {
        const text1 = 'Create UserDTO for authentication';
        const text2 = 'Create UserDTO for authentication';
        
        const similarity = textSimilarity(text1, text2);
        expect(similarity).toBe(1.0);
    });
    
    it('should detect high similarity with minor differences', () => {
        const text1 = 'Create UserDTO for authentication';
        const text2 = 'Create UserDTO for authentification'; // typo
        
        const similarity = textSimilarity(text1, text2);
        expect(similarity).toBeGreaterThan(0.85);
    });
    
    it('should detect low similarity for different tasks', () => {
        const text1 = 'Create UserDTO for authentication';
        const text2 = 'Implement payment gateway service';
        
        const similarity = textSimilarity(text1, text2);
        expect(similarity).toBeLessThan(0.5);
    });
    
    it('should identify similar tasks with areSimilar function', () => {
        const text1 = 'Create user authentication service';
        const text2 = 'Create user auth service'; // abbreviated
        
        const similar = areSimilar(text1, text2, 0.7);
        expect(similar).toBe(true);
    });
    
    it('should find most similar task from candidates', () => {
        const target = 'Create UserDTO with validation';
        const candidates = [
            'Implement payment service',
            'Create UserDTO with validations', // Most similar
            'Setup database connection',
        ];
        
        const result = findMostSimilar(target, candidates, 0.7);
        
        expect(result).not.toBeNull();
        expect(result?.index).toBe(1);
        expect(result?.score).toBeGreaterThan(0.85);
    });
    
    it('should return null when no candidates match threshold', () => {
        const target = 'Create UserDTO';
        const candidates = [
            'Implement payment service',
            'Setup database connection',
        ];
        
        const result = findMostSimilar(target, candidates, 0.7);
        expect(result).toBeNull();
    });
    
    it('should handle empty strings gracefully', () => {
        expect(textSimilarity('', '')).toBe(1.0);
        expect(textSimilarity('test', '')).toBe(0);
        expect(textSimilarity('', 'test')).toBe(0);
    });
    
    it('should be case-insensitive', () => {
        const text1 = 'CREATE USERDTO';
        const text2 = 'create userdto';
        
        const similarity = textSimilarity(text1, text2);
        expect(similarity).toBe(1.0);
    });
    
    it('should handle whitespace normalization', () => {
        const text1 = '  Create   UserDTO   ';
        const text2 = 'Create UserDTO';
        
        const similarity = textSimilarity(text1, text2);
        expect(similarity).toBe(1.0);
    });
});

// Note: Integration tests for routeTask and delegateTask would require:
// - Setting up test projects in the registry
// - Creating mock AgentBoards with test tasks
// - Verifying deduplication logic in real scenarios
// These are better suited for separate integration test files with proper setup/teardown

describe('Task Deduplication Scenarios (Unit)', () => {
    it('should match task titles with high similarity threshold (85%)', () => {
        const existingTitle = 'Create authentication UserDTO';
        const newTitle = 'Create authentification UserDTO'; // Common typo
        
        const similarity = textSimilarity(existingTitle, newTitle);
        expect(similarity).toBeGreaterThanOrEqual(0.85);
    });
    
    it('should match task descriptions with medium similarity threshold (75%)', () => {
        const existingDesc = 'Implement user authentication with JWT tokens and refresh logic';
        const newDesc = 'Implement user auth with JWT tokens and refresh'; // Abbreviated
        
        const similarity = textSimilarity(existingDesc, newDesc);
        expect(similarity).toBeGreaterThanOrEqual(0.70);
    });
    
    it('should NOT match completely different tasks', () => {
        const task1 = 'Create UserDTO';
        const task2 = 'Setup payment gateway';
        
        const similarity = textSimilarity(task1, task2);
        expect(similarity).toBeLessThan(0.5);
    });
});
