/**
 * SQLite Storage module for verification tracking
 * High-performance database storage with same API as file-based storage
 */

import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { promises as fs } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

export class VerificationStorageSQLite {
    constructor(dbPath = null) {
        this.dbPath = dbPath || join(process.cwd(), '.claude', 'verification', 'verification.db');
        this.db = null;
    }

    async init() {
        // Ensure directory exists
        const dir = dirname(this.dbPath);
        await fs.mkdir(dir, { recursive: true });

        // Open database connection
        this.db = new Database(this.dbPath);

        // Enable WAL mode for better concurrency
        this.db.pragma('journal_mode = WAL');

        // Create tables
        this.createTables();

        // Prepare statements for better performance
        this.prepareStatements();

        console.log(`✅ SQLite database initialized at: ${this.dbPath}`);
    }

    createTables() {
        // Sessions table - stores current and historical verification sessions
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS sessions (
                task_id TEXT PRIMARY KEY,
                timestamp TEXT NOT NULL,
                status TEXT NOT NULL CHECK(status IN ('pending', 'completed', 'failed')),
                original_prompt TEXT,
                expected_count TEXT,
                scope TEXT,
                pattern TEXT,
                action TEXT,
                discovered_items TEXT,
                verification_criteria TEXT,
                actual_count INTEGER DEFAULT 0,
                actual_items TEXT,
                modifications TEXT,
                completed_at TEXT,
                verdict TEXT,
                verdict_reason TEXT,
                missing_count INTEGER DEFAULT 0,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Metrics table - global statistics
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS metrics (
                id INTEGER PRIMARY KEY CHECK(id = 1),
                total_verifications INTEGER DEFAULT 0,
                passed INTEGER DEFAULT 0,
                failed INTEGER DEFAULT 0,
                last_updated TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Initialize metrics if not exists
        this.db.exec(`
            INSERT OR IGNORE INTO metrics (id, total_verifications, passed, failed)
            VALUES (1, 0, 0, 0)
        `);

        // Incomplete tasks table - tracks failed verifications
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS incomplete_tasks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                task_id TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                missing_count INTEGER NOT NULL,
                reason TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (task_id) REFERENCES sessions(task_id)
            )
        `);

        // Create indexes for better query performance
        this.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
            CREATE INDEX IF NOT EXISTS idx_sessions_timestamp ON sessions(timestamp);
            CREATE INDEX IF NOT EXISTS idx_sessions_verdict ON sessions(verdict);
            CREATE INDEX IF NOT EXISTS idx_incomplete_task_id ON incomplete_tasks(task_id);
        `);

        // Add trigger to update updated_at
        this.db.exec(`
            CREATE TRIGGER IF NOT EXISTS update_sessions_timestamp
            AFTER UPDATE ON sessions
            BEGIN
                UPDATE sessions SET updated_at = CURRENT_TIMESTAMP
                WHERE task_id = NEW.task_id;
            END;
        `);
    }

    prepareStatements() {
        // Prepare frequently used statements
        this.statements = {
            insertSession: this.db.prepare(`
                INSERT INTO sessions (
                    task_id, timestamp, status, original_prompt,
                    expected_count, scope, pattern, action,
                    discovered_items, verification_criteria
                ) VALUES (
                    @task_id, @timestamp, @status, @original_prompt,
                    @expected_count, @scope, @pattern, @action,
                    @discovered_items, @verification_criteria
                )
            `),

            updateActuals: this.db.prepare(`
                UPDATE sessions SET
                    actual_count = @actual_count,
                    actual_items = @actual_items,
                    modifications = @modifications,
                    completed_at = @completed_at,
                    status = @status,
                    verdict = @verdict,
                    verdict_reason = @verdict_reason,
                    missing_count = @missing_count
                WHERE task_id = @task_id
            `),

            getSession: this.db.prepare(`
                SELECT * FROM sessions WHERE task_id = ?
            `),

            getCurrentSession: this.db.prepare(`
                SELECT * FROM sessions
                WHERE status = 'pending'
                ORDER BY timestamp DESC
                LIMIT 1
            `),

            updateMetrics: this.db.prepare(`
                UPDATE metrics SET
                    total_verifications = total_verifications + 1,
                    passed = passed + @passed,
                    failed = failed + @failed,
                    last_updated = CURRENT_TIMESTAMP
                WHERE id = 1
            `),

            getMetrics: this.db.prepare(`
                SELECT * FROM metrics WHERE id = 1
            `),

            addIncompleteTask: this.db.prepare(`
                INSERT INTO incomplete_tasks (task_id, timestamp, missing_count, reason)
                VALUES (@task_id, @timestamp, @missing_count, @reason)
            `),

            getRecentSessions: this.db.prepare(`
                SELECT * FROM sessions
                ORDER BY timestamp DESC
                LIMIT ?
            `),

            getSessionStats: this.db.prepare(`
                SELECT
                    COUNT(*) as total,
                    SUM(CASE WHEN verdict = 'PASS' THEN 1 ELSE 0 END) as passed,
                    SUM(CASE WHEN verdict = 'FAIL' THEN 1 ELSE 0 END) as failed,
                    AVG(CASE WHEN expected_count != 'ALL' THEN CAST(actual_count AS FLOAT) / CAST(expected_count AS FLOAT) ELSE NULL END) as avg_completion_rate
                FROM sessions
                WHERE status = 'completed'
            `)
        };
    }

    /**
     * Store verification requirements from pre-hook
     */
    async storeRequirements(taskId, requirements) {
        const session = {
            task_id: taskId,
            timestamp: new Date().toISOString(),
            status: 'pending',
            original_prompt: requirements.prompt,
            expected_count: String(requirements.expectedCount),
            scope: requirements.scope || null,
            pattern: requirements.pattern || null,
            action: requirements.action || null,
            discovered_items: JSON.stringify(requirements.discoveredItems || []),
            verification_criteria: JSON.stringify(requirements.criteria || [])
        };

        this.statements.insertSession.run(session);

        return this.parseSession(this.statements.getSession.get(taskId));
    }

    /**
     * Update with actual results from post-hook
     */
    async updateActuals(taskId, actuals) {
        const session = this.statements.getSession.get(taskId);

        if (!session) {
            throw new Error(`No session found for task ${taskId}`);
        }

        const parsed = this.parseSession(session);
        const verdict = this.calculateVerdict(parsed.requirements, actuals);

        const updates = {
            task_id: taskId,
            actual_count: actuals.count,
            actual_items: JSON.stringify(actuals.items || []),
            modifications: JSON.stringify(actuals.modifications || []),
            completed_at: new Date().toISOString(),
            status: 'completed',
            verdict: verdict.verdict,
            verdict_reason: verdict.reason,
            missing_count: verdict.missing || 0
        };

        this.statements.updateActuals.run(updates);

        // Update metrics
        this.statements.updateMetrics.run({
            passed: verdict.verdict === 'PASS' ? 1 : 0,
            failed: verdict.verdict === 'FAIL' ? 1 : 0
        });

        // Track incomplete task if failed
        if (verdict.verdict === 'FAIL') {
            this.statements.addIncompleteTask.run({
                task_id: taskId,
                timestamp: new Date().toISOString(),
                missing_count: verdict.missing || 0,
                reason: verdict.reason
            });
        }

        return this.parseSession(this.statements.getSession.get(taskId));
    }

    /**
     * Calculate verification verdict
     */
    calculateVerdict(requirements, actual) {
        let expected = requirements.expected_count;
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
        } else {
            expected = parseInt(expected);
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
     * Parse session from database row
     */
    parseSession(row) {
        if (!row) return null;

        return {
            task_id: row.task_id,
            timestamp: row.timestamp,
            status: row.status,
            requirements: {
                original_prompt: row.original_prompt,
                expected_count: isNaN(row.expected_count) ? row.expected_count : parseInt(row.expected_count),
                scope: row.scope,
                pattern: row.pattern,
                action: row.action,
                discovered_items: JSON.parse(row.discovered_items || '[]'),
                verification_criteria: JSON.parse(row.verification_criteria || '[]')
            },
            actual: {
                count: row.actual_count || 0,
                items: JSON.parse(row.actual_items || '[]'),
                modifications: JSON.parse(row.modifications || '[]'),
                completed_at: row.completed_at
            },
            verdict: row.verdict ? {
                verdict: row.verdict,
                reason: row.verdict_reason,
                missing: row.missing_count
            } : null
        };
    }

    /**
     * Load current session
     */
    async loadSession() {
        const row = this.statements.getCurrentSession.get();
        return this.parseSession(row);
    }

    /**
     * Get session by ID
     */
    async getSession(taskId) {
        const row = this.statements.getSession.get(taskId);
        return this.parseSession(row);
    }

    /**
     * Load metrics
     */
    async loadMetrics() {
        const metrics = this.statements.getMetrics.get();

        // Get incomplete tasks
        const incompleteTasks = this.db.prepare(`
            SELECT * FROM incomplete_tasks
            ORDER BY created_at DESC
            LIMIT 100
        `).all();

        return {
            total_verifications: metrics.total_verifications,
            passed: metrics.passed,
            failed: metrics.failed,
            incomplete_tasks: incompleteTasks,
            last_updated: metrics.last_updated
        };
    }

    /**
     * Get verification history
     */
    async getHistory(limit = 10) {
        const rows = this.statements.getRecentSessions.all(limit);
        return rows.map(row => this.parseSession(row));
    }

    /**
     * Get advanced statistics
     */
    async getStats() {
        const stats = this.statements.getSessionStats.get();
        const metrics = await this.loadMetrics();
        const currentSession = await this.loadSession();

        // Additional queries for detailed stats
        const recentFailures = this.db.prepare(`
            SELECT task_id, timestamp, verdict_reason, missing_count
            FROM sessions
            WHERE verdict = 'FAIL'
            ORDER BY timestamp DESC
            LIMIT 5
        `).all();

        const topIncompletePatterns = this.db.prepare(`
            SELECT action, COUNT(*) as count
            FROM sessions
            WHERE verdict = 'FAIL'
            GROUP BY action
            ORDER BY count DESC
            LIMIT 5
        `).all();

        return {
            metrics,
            current_stats: stats,
            has_active_session: !!currentSession,
            active_session: currentSession,
            success_rate: stats.total > 0
                ? ((stats.passed / stats.total) * 100).toFixed(2) + '%'
                : 'N/A',
            avg_completion_rate: stats.avg_completion_rate
                ? (stats.avg_completion_rate * 100).toFixed(2) + '%'
                : 'N/A',
            recent_failures: recentFailures,
            top_incomplete_patterns: topIncompletePatterns
        };
    }

    /**
     * Clear old history (keep last N days)
     */
    async cleanupHistory(daysToKeep = 7) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - daysToKeep);

        const result = this.db.prepare(`
            DELETE FROM sessions
            WHERE timestamp < ?
            AND status = 'completed'
        `).run(cutoff.toISOString());

        // Also cleanup old incomplete tasks
        this.db.prepare(`
            DELETE FROM incomplete_tasks
            WHERE created_at < ?
        `).run(cutoff.toISOString());

        return {
            sessions_deleted: result.changes,
            message: `Deleted ${result.changes} sessions older than ${daysToKeep} days`
        };
    }

    /**
     * Search sessions by criteria
     */
    async searchSessions(criteria) {
        let query = 'SELECT * FROM sessions WHERE 1=1';
        const params = [];

        if (criteria.verdict) {
            query += ' AND verdict = ?';
            params.push(criteria.verdict);
        }

        if (criteria.action) {
            query += ' AND action = ?';
            params.push(criteria.action);
        }

        if (criteria.prompt) {
            query += ' AND original_prompt LIKE ?';
            params.push(`%${criteria.prompt}%`);
        }

        if (criteria.from) {
            query += ' AND timestamp >= ?';
            params.push(criteria.from);
        }

        if (criteria.to) {
            query += ' AND timestamp <= ?';
            params.push(criteria.to);
        }

        query += ' ORDER BY timestamp DESC LIMIT 100';

        const rows = this.db.prepare(query).all(...params);
        return rows.map(row => this.parseSession(row));
    }

    /**
     * Export data for backup
     */
    async exportData() {
        const sessions = this.db.prepare('SELECT * FROM sessions').all();
        const metrics = this.statements.getMetrics.get();
        const incompleteTasks = this.db.prepare('SELECT * FROM incomplete_tasks').all();

        return {
            exported_at: new Date().toISOString(),
            sessions,
            metrics,
            incomplete_tasks
        };
    }

    /**
     * Close database connection
     */
    close() {
        if (this.db) {
            this.db.close();
        }
    }
}

// Export singleton instance
export const verificationStorage = new VerificationStorageSQLite();