/**
 * Storage module for verification tracking
 * Persists expected counts and requirements between pre-hook and post-hook
 */

import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export class VerificationStorage {
    constructor(storageDir = null) {
        // Default storage locations
        this.storageDir = storageDir || join(process.cwd(), '.claude', 'verification');
        this.sessionFile = join(this.storageDir, 'current_session.json');
        this.historyDir = join(this.storageDir, 'history');
        this.metricsFile = join(this.storageDir, 'metrics.json');
    }

    async init() {
        // Create storage directories
        await fs.mkdir(this.storageDir, { recursive: true });
        await fs.mkdir(this.historyDir, { recursive: true });

        // Initialize metrics if not exists
        if (!await this.fileExists(this.metricsFile)) {
            await this.saveMetrics({
                total_verifications: 0,
                passed: 0,
                failed: 0,
                incomplete_tasks: []
            });
        }
    }

    /**
     * Store verification requirements from pre-hook
     */
    async storeRequirements(taskId, requirements) {
        const session = {
            task_id: taskId,
            timestamp: new Date().toISOString(),
            status: 'pending',
            requirements: {
                original_prompt: requirements.prompt,
                expected_count: requirements.expectedCount,
                scope: requirements.scope,
                pattern: requirements.pattern,
                action: requirements.action,
                discovered_items: requirements.discoveredItems || [],
                verification_criteria: requirements.criteria
            },
            actual: {
                count: 0,
                items: [],
                completed_at: null
            }
        };

        await this.saveSession(session);
        return session;
    }

    /**
     * Update with actual results from post-hook
     */
    async updateActuals(taskId, actuals) {
        const session = await this.loadSession();

        if (!session || session.task_id !== taskId) {
            throw new Error(`No matching session found for task ${taskId}`);
        }

        session.actual = {
            count: actuals.count,
            items: actuals.items,
            modifications: actuals.modifications,
            completed_at: new Date().toISOString()
        };

        session.status = 'completed';

        // Calculate verdict
        session.verdict = this.calculateVerdict(session.requirements, session.actual);

        await this.saveSession(session);

        // Archive to history
        await this.archiveSession(session);

        // Update metrics
        await this.updateMetrics(session);

        return session;
    }

    /**
     * Calculate verification verdict
     */
    calculateVerdict(requirements, actual) {
        const expected = requirements.expected_count;
        const actualCount = actual.count;

        if (expected === 'ALL') {
            // For "ALL", check if discovered items match actual
            const discovered = requirements.discovered_items.length;
            if (actualCount < discovered) {
                return {
                    verdict: 'FAIL',
                    reason: `Incomplete: only ${actualCount}/${discovered} items processed`,
                    missing: discovered - actualCount
                };
            }
        } else if (typeof expected === 'number') {
            if (actualCount < expected) {
                return {
                    verdict: 'FAIL',
                    reason: `Incomplete: only ${actualCount}/${expected} items completed`,
                    missing: expected - actualCount
                };
            }
        }

        return {
            verdict: 'PASS',
            reason: 'All expected items completed',
            missing: 0
        };
    }

    /**
     * Store current session
     */
    async saveSession(session) {
        await fs.writeFile(
            this.sessionFile,
            JSON.stringify(session, null, 2)
        );
    }

    /**
     * Load current session
     */
    async loadSession() {
        try {
            const data = await fs.readFile(this.sessionFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            return null;
        }
    }

    /**
     * Archive completed session to history
     */
    async archiveSession(session) {
        const filename = `${session.task_id}_${Date.now()}.json`;
        const archivePath = join(this.historyDir, filename);
        await fs.writeFile(archivePath, JSON.stringify(session, null, 2));
    }

    /**
     * Update global metrics
     */
    async updateMetrics(session) {
        const metrics = await this.loadMetrics();

        metrics.total_verifications++;

        if (session.verdict.verdict === 'PASS') {
            metrics.passed++;
        } else {
            metrics.failed++;
            metrics.incomplete_tasks.push({
                task_id: session.task_id,
                timestamp: session.timestamp,
                missing: session.verdict.missing,
                reason: session.verdict.reason
            });
        }

        // Keep only last 100 incomplete tasks
        if (metrics.incomplete_tasks.length > 100) {
            metrics.incomplete_tasks = metrics.incomplete_tasks.slice(-100);
        }

        await this.saveMetrics(metrics);
    }

    /**
     * Load metrics
     */
    async loadMetrics() {
        try {
            const data = await fs.readFile(this.metricsFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            return {
                total_verifications: 0,
                passed: 0,
                failed: 0,
                incomplete_tasks: []
            };
        }
    }

    /**
     * Save metrics
     */
    async saveMetrics(metrics) {
        await fs.writeFile(
            this.metricsFile,
            JSON.stringify(metrics, null, 2)
        );
    }

    /**
     * Get verification history
     */
    async getHistory(limit = 10) {
        const files = await fs.readdir(this.historyDir);
        const sorted = files.sort().reverse().slice(0, limit);

        const history = [];
        for (const file of sorted) {
            const data = await fs.readFile(join(this.historyDir, file), 'utf8');
            history.push(JSON.parse(data));
        }

        return history;
    }

    /**
     * Clear old history files (keep last N days)
     */
    async cleanupHistory(daysToKeep = 7) {
        const cutoff = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
        const files = await fs.readdir(this.historyDir);

        for (const file of files) {
            const filePath = join(this.historyDir, file);
            const stats = await fs.stat(filePath);

            if (stats.mtimeMs < cutoff) {
                await fs.unlink(filePath);
            }
        }
    }

    /**
     * Utility: Check if file exists
     */
    async fileExists(path) {
        try {
            await fs.access(path);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Get storage statistics
     */
    async getStats() {
        const metrics = await this.loadMetrics();
        const historyFiles = await fs.readdir(this.historyDir);
        const currentSession = await this.loadSession();

        return {
            metrics,
            history_count: historyFiles.length,
            has_active_session: !!currentSession,
            active_session: currentSession,
            success_rate: metrics.total_verifications > 0
                ? (metrics.passed / metrics.total_verifications * 100).toFixed(2) + '%'
                : 'N/A'
        };
    }
}

// Export singleton instance
export const verificationStorage = new VerificationStorage();