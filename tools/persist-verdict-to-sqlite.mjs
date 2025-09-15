#!/usr/bin/env node

/**
 * Persist verdict per-unit results and metrics to SQLite database
 * Usage: persist-verdict-to-sqlite.mjs <task_dir>
 */

import fs from 'fs';
import Database from 'better-sqlite3';
import { saveUnits, saveMetrics } from '../src/storage-sqlite.mjs';
import { join } from 'path';

// Get task directory from command line
const taskDir = process.argv[2];

if (!taskDir) {
    console.error('usage: persist-verdict-to-sqlite <task_dir>');
    process.exit(2);
}

// Read verdict and claim files
let verdict, claim;

try {
    verdict = JSON.parse(fs.readFileSync(join(taskDir, 'verdict.json'), 'utf8'));
} catch (error) {
    console.error(`Error reading verdict.json: ${error.message}`);
    process.exit(1);
}

try {
    claim = JSON.parse(fs.readFileSync(join(taskDir, 'claim.json'), 'utf8'));
} catch (error) {
    console.warn(`Warning: Could not read claim.json: ${error.message}`);
    claim = null;
}

// Extract task ID
const taskId = verdict.task_id || process.env.TASK_ID || taskDir.split('/').pop();

// Open database
const dbPath = process.env.VERIFY_DB_PATH || 'verify.sqlite';
const db = new Database(dbPath);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');

// Ensure tables exist (run inline creation instead of loading migration file)
db.exec(`
    CREATE TABLE IF NOT EXISTS units (
        task_id   TEXT NOT NULL,
        unit_id   TEXT NOT NULL,
        unit_type TEXT NOT NULL,
        claimed   INTEGER NOT NULL,
        verified  INTEGER NOT NULL,
        reason    TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (task_id, unit_id)
    );

    CREATE INDEX IF NOT EXISTS idx_units_task ON units(task_id);

    CREATE TABLE IF NOT EXISTS task_metrics (
        task_id   TEXT NOT NULL,
        k         TEXT NOT NULL,
        v         REAL,
        created_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (task_id, k, created_at)
    );
`);

// Save units data
const perUnit = verdict.per_unit || [];

// If verdict doesn't have per_unit but has evidence, try to extract
if (perUnit.length === 0 && verdict.evidence) {
    // Try to extract from various evidence formats
    if (verdict.evidence.units) {
        perUnit.push(...verdict.evidence.units);
    }

    if (verdict.evidence.files_checked) {
        verdict.evidence.files_checked.forEach(file => {
            perUnit.push({
                id: file,
                unit_type: 'file',
                ok: true,
                reason: 'File processed'
            });
        });
    }

    if (verdict.evidence.urls_checked) {
        verdict.evidence.urls_checked.forEach(url => {
            perUnit.push({
                id: url,
                unit_type: 'url',
                ok: verdict.evidence.failed_urls?.includes(url) ? false : true,
                reason: verdict.evidence.failed_urls?.includes(url) ? 'URL check failed' : 'URL verified'
            });
        });
    }
}

// If still no units but we have claim units_list, create entries from claim
if (perUnit.length === 0 && claim?.claim?.units_list) {
    claim.claim.units_list.forEach(unit => {
        perUnit.push({
            id: unit,
            unit_type: 'unit',
            ok: verdict.status === 'pass' ? true : false,
            reason: verdict.status === 'pass' ? 'Verified' : 'Not verified'
        });
    });
}

console.log(`Persisting ${perUnit.length} units for task ${taskId}`);
saveUnits(db, taskId, perUnit, claim);

// Save metrics
const metrics = verdict.metrics || {};

// Extract additional metrics from verdict
if (verdict.evidence) {
    if (verdict.evidence.total_files !== undefined) {
        metrics.total_files = verdict.evidence.total_files;
    }
    if (verdict.evidence.files_processed !== undefined) {
        metrics.files_processed = verdict.evidence.files_processed;
    }
    if (verdict.evidence.coverage_percent !== undefined) {
        metrics.coverage = verdict.evidence.coverage_percent;
    }
    if (verdict.evidence.lint_errors !== undefined) {
        metrics.lint_errors = verdict.evidence.lint_errors;
    }
    if (verdict.evidence.tests_passed !== undefined) {
        metrics.tests_passed = verdict.evidence.tests_passed;
    }
    if (verdict.evidence.tests_failed !== undefined) {
        metrics.tests_failed = verdict.evidence.tests_failed;
    }
}

// Add verdict status as metric
metrics.verdict_pass = verdict.status === 'pass' ? 1 : 0;

console.log(`Persisting ${Object.keys(metrics).length} metrics for task ${taskId}`);
saveMetrics(db, taskId, metrics);

// Close database
db.close();

console.log(`✅ Persisted units and metrics for ${taskId} to ${dbPath}`);