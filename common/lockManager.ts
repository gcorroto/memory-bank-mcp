import * as fs from 'fs/promises';
import * as path from 'path';
import { logger } from './logger.js';

export class LockManager {
    private lockDir: string;
    private maxRetries: number = 20;
    private retryDelay: number = 200; // ms
    private staleLockAge: number = 10000; // 10 seconds

    constructor(baseDir: string) {
        this.lockDir = path.join(baseDir, '.memorybank', 'locks');
    }

    private getLockPath(resourceId: string): string {
        return path.join(this.lockDir, `${resourceId}.lock`);
    }

    /**
     * Tries to acquire a lock for a resource.
     * Retries automatically if locked.
     */
    async acquire(resourceId: string): Promise<boolean> {
        const lockPath = this.getLockPath(resourceId);

        // Ensure lock directory exists
        try {
            await fs.mkdir(this.lockDir, { recursive: true });
        } catch (error) {
            // Ignore error if it exists
        }

        for (let i = 0; i < this.maxRetries; i++) {
            try {
                // exclusive, fails if exists
                await fs.mkdir(lockPath);
                return true;
            } catch (error: any) {
                if (error.code === 'EEXIST') {
                    // Check for stale lock
                    const isStale = await this.checkStale(lockPath);
                    if (isStale) {
                         // Broken lock found, try loop again immediately
                        continue;
                    }
                    // Wait and retry
                    await new Promise(resolve => setTimeout(resolve, this.retryDelay));
                } else {
                    throw error;
                }
            }
        }
        
        logger.info(`Failed to acquire lock for ${resourceId} after ${this.maxRetries} attempts`);
        return false;
    }

    async release(resourceId: string): Promise<void> {
        const lockPath = this.getLockPath(resourceId);
        try {
            await fs.rmdir(lockPath);
        } catch (error: any) {
            // Ignore if already gone
            if (error.code !== 'ENOENT') {
                logger.error(`Error releasing lock ${resourceId}: ${error.message}`);
            }
        }
    }

    private async checkStale(lockPath: string): Promise<boolean> {
        try {
            const stats = await fs.stat(lockPath);
            const age = Date.now() - stats.mtimeMs;
            if (age > this.staleLockAge) {
                logger.info(`Cleaning up stale lock: ${lockPath} (${age}ms old)`);
                try {
                    await fs.rmdir(lockPath);
                    return true;
                } catch (e) {
                    // Someone else might have cleaned it or acquired it
                    return false;
                }
            }
        } catch (e) {
            // Lock might have been released while checkins
        }
        return false;
    }
}
