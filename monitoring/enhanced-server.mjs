#!/usr/bin/env node

/**
 * Enhanced Monitoring Server with Units and Metrics Support
 */

import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3033;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

// Database connection
const dbPath = process.env.VERIFY_DB_PATH || 'verify.sqlite';
let db;

try {
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    console.log(`✅ Connected to database: ${dbPath}`);
} catch (error) {
    console.error(`❌ Failed to connect to database: ${error.message}`);
}

// API Routes

// Get all tasks with summary
app.get('/api/tasks', (req, res) => {
    try {
        const tasks = db.prepare(`
            SELECT
                task_id,
                timestamp,
                status,
                original_prompt,
                expected_count,
                actual_count,
                verdict,
                verdict_reason,
                missing_count
            FROM sessions
            ORDER BY timestamp DESC
            LIMIT 100
        `).all();

        res.json(tasks);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get task details with units
app.get('/api/tasks/:taskId', (req, res) => {
    try {
        const { taskId } = req.params;

        // Get session details
        const session = db.prepare(`
            SELECT * FROM sessions WHERE task_id = ?
        `).get(taskId);

        if (!session) {
            return res.status(404).json({ error: 'Task not found' });
        }

        // Get units for this task
        const units = db.prepare(`
            SELECT
                unit_id,
                unit_type,
                claimed,
                verified,
                reason,
                created_at
            FROM units
            WHERE task_id = ?
            ORDER BY unit_id
        `).all(taskId);

        // Get metrics for this task
        const metricsRows = db.prepare(`
            SELECT k, v, created_at
            FROM task_metrics
            WHERE task_id = ?
            ORDER BY created_at DESC
        `).all(taskId);

        // Convert metrics to object (latest value for each key)
        const metrics = {};
        const seen = new Set();
        for (const row of metricsRows) {
            if (!seen.has(row.k)) {
                metrics[row.k] = row.v;
                seen.add(row.k);
            }
        }

        res.json({
            session,
            units,
            metrics,
            summary: {
                total_units: units.length,
                claimed: units.filter(u => u.claimed === 1).length,
                verified: units.filter(u => u.verified === 1).length,
                failed: units.filter(u => u.verified === 0).length
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get units for a specific task
app.get('/api/tasks/:taskId/units', (req, res) => {
    try {
        const { taskId } = req.params;
        const { type, status } = req.query;

        let query = `
            SELECT
                unit_id,
                unit_type,
                claimed,
                verified,
                reason,
                created_at
            FROM units
            WHERE task_id = ?
        `;

        const params = [taskId];

        // Filter by type if provided
        if (type) {
            query += ' AND unit_type = ?';
            params.push(type);
        }

        // Filter by status if provided
        if (status === 'verified') {
            query += ' AND verified = 1';
        } else if (status === 'failed') {
            query += ' AND verified = 0';
        } else if (status === 'claimed') {
            query += ' AND claimed = 1';
        }

        query += ' ORDER BY unit_id';

        const units = db.prepare(query).all(...params);

        res.json({
            task_id: taskId,
            units,
            total: units.length,
            filters: { type, status }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get task metrics
app.get('/api/tasks/:taskId/metrics', (req, res) => {
    try {
        const { taskId } = req.params;

        const metricsRows = db.prepare(`
            SELECT k, v, created_at
            FROM task_metrics
            WHERE task_id = ?
            ORDER BY created_at DESC
        `).all(taskId);

        // Convert to object with latest values
        const metrics = {};
        const timeline = [];
        const seen = new Set();

        for (const row of metricsRows) {
            timeline.push(row);
            if (!seen.has(row.k)) {
                metrics[row.k] = row.v;
                seen.add(row.k);
            }
        }

        res.json({
            task_id: taskId,
            metrics,
            timeline
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get global statistics
app.get('/api/stats', (req, res) => {
    try {
        // Global metrics
        const globalMetrics = db.prepare(`
            SELECT * FROM metrics WHERE id = 1
        `).get();

        // Task statistics
        const taskStats = db.prepare(`
            SELECT
                COUNT(*) as total_tasks,
                SUM(CASE WHEN verdict = 'PASS' THEN 1 ELSE 0 END) as passed,
                SUM(CASE WHEN verdict = 'FAIL' THEN 1 ELSE 0 END) as failed,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending
            FROM sessions
        `).get();

        // Unit statistics
        const unitStats = db.prepare(`
            SELECT
                COUNT(*) as total_units,
                SUM(claimed) as total_claimed,
                SUM(verified) as total_verified,
                COUNT(DISTINCT task_id) as tasks_with_units
            FROM units
        `).get();

        // Type distribution
        const typeDistribution = db.prepare(`
            SELECT
                unit_type,
                COUNT(*) as count,
                SUM(verified) as verified,
                SUM(claimed) as claimed
            FROM units
            GROUP BY unit_type
            ORDER BY count DESC
        `).all();

        // Recent failures
        const recentFailures = db.prepare(`
            SELECT
                task_id,
                unit_id,
                unit_type,
                reason,
                created_at
            FROM units
            WHERE verified = 0 AND reason IS NOT NULL
            ORDER BY created_at DESC
            LIMIT 10
        `).all();

        res.json({
            global: globalMetrics,
            tasks: taskStats,
            units: unitStats,
            type_distribution: typeDistribution,
            recent_failures: recentFailures,
            success_rate: unitStats.total_units > 0
                ? ((unitStats.total_verified / unitStats.total_units) * 100).toFixed(2) + '%'
                : 'N/A'
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get unit type distribution
app.get('/api/stats/units/types', (req, res) => {
    try {
        const distribution = db.prepare(`
            SELECT
                unit_type,
                COUNT(*) as total,
                SUM(claimed) as claimed,
                SUM(verified) as verified,
                SUM(CASE WHEN verified = 0 THEN 1 ELSE 0 END) as failed
            FROM units
            GROUP BY unit_type
            ORDER BY total DESC
        `).all();

        res.json(distribution);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    try {
        const result = db.prepare('SELECT 1').get();
        res.json({
            status: 'healthy',
            database: dbPath,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            status: 'unhealthy',
            error: error.message
        });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Enhanced monitoring server running at http://localhost:${PORT}`);
    console.log(`📊 Dashboard available at http://localhost:${PORT}/enhanced-dashboard.html`);
    console.log(`📡 API endpoints:`);
    console.log(`   - GET /api/tasks`);
    console.log(`   - GET /api/tasks/:taskId`);
    console.log(`   - GET /api/tasks/:taskId/units`);
    console.log(`   - GET /api/tasks/:taskId/metrics`);
    console.log(`   - GET /api/stats`);
    console.log(`   - GET /api/stats/units/types`);
    console.log(`   - GET /api/health`);
});