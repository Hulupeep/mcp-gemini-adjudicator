#!/usr/bin/env node

/**
 * Migration script from JSON file storage to SQLite
 * Preserves all existing verification data
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { VerificationStorageSQLite } from './storage-sqlite.mjs';

class StorageMigrator {
    constructor() {
        this.jsonDir = join(process.cwd(), '.claude', 'verification');
        this.sqliteStorage = new VerificationStorageSQLite();
    }

    async migrate() {
        console.log('🚀 Starting migration from JSON to SQLite...\n');

        try {
            // Initialize SQLite database
            await this.sqliteStorage.init();

            // Check if JSON storage exists
            const exists = await this.checkJsonStorage();
            if (!exists) {
                console.log('No existing JSON storage found. SQLite database is ready for use.');
                return;
            }

            // Migrate current session
            await this.migrateCurrentSession();

            // Migrate metrics
            await this.migrateMetrics();

            // Migrate history
            await this.migrateHistory();

            console.log('\n✅ Migration completed successfully!');
            console.log('📊 Run verification stats:');
            const stats = await this.sqliteStorage.getStats();
            console.log(`  - Total verifications: ${stats.metrics.total_verifications}`);
            console.log(`  - Success rate: ${stats.success_rate}`);
            console.log(`  - Database location: ${this.sqliteStorage.dbPath}`);

            // Offer to backup old JSON files
            await this.offerBackup();

        } catch (error) {
            console.error('❌ Migration failed:', error.message);
            process.exit(1);
        } finally {
            this.sqliteStorage.close();
        }
    }

    async checkJsonStorage() {
        try {
            await fs.access(this.jsonDir);
            return true;
        } catch {
            return false;
        }
    }

    async migrateCurrentSession() {
        console.log('📄 Migrating current session...');
        const sessionFile = join(this.jsonDir, 'current_session.json');

        try {
            const data = await fs.readFile(sessionFile, 'utf8');
            const session = JSON.parse(data);

            // Store requirements
            await this.sqliteStorage.storeRequirements(session.task_id, {
                prompt: session.requirements.original_prompt,
                expectedCount: session.requirements.expected_count,
                scope: session.requirements.scope,
                pattern: session.requirements.pattern,
                action: session.requirements.action,
                discoveredItems: session.requirements.discovered_items || [],
                criteria: session.requirements.verification_criteria || []
            });

            // Update actuals if completed
            if (session.status === 'completed' && session.actual.count > 0) {
                await this.sqliteStorage.updateActuals(session.task_id, {
                    count: session.actual.count,
                    items: session.actual.items || [],
                    modifications: session.actual.modifications || []
                });
            }

            console.log(`  ✓ Migrated session: ${session.task_id}`);
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log('  - No current session to migrate');
            } else {
                console.error('  ⚠️ Error migrating session:', error.message);
            }
        }
    }

    async migrateMetrics() {
        console.log('📊 Migrating metrics...');
        const metricsFile = join(this.jsonDir, 'metrics.json');

        try {
            const data = await fs.readFile(metricsFile, 'utf8');
            const metrics = JSON.parse(data);

            // Update metrics in SQLite
            const db = this.sqliteStorage.db;
            db.prepare(`
                UPDATE metrics SET
                    total_verifications = ?,
                    passed = ?,
                    failed = ?
                WHERE id = 1
            `).run(
                metrics.total_verifications || 0,
                metrics.passed || 0,
                metrics.failed || 0
            );

            console.log(`  ✓ Migrated metrics: ${metrics.total_verifications} total verifications`);
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log('  - No metrics to migrate');
            } else {
                console.error('  ⚠️ Error migrating metrics:', error.message);
            }
        }
    }

    async migrateHistory() {
        console.log('📚 Migrating history...');
        const historyDir = join(this.jsonDir, 'history');

        try {
            const files = await fs.readdir(historyDir);
            console.log(`  Found ${files.length} historical sessions`);

            let migrated = 0;
            for (const file of files) {
                try {
                    const data = await fs.readFile(join(historyDir, file), 'utf8');
                    const session = JSON.parse(data);

                    // Insert directly into database to preserve timestamps
                    const db = this.sqliteStorage.db;
                    db.prepare(`
                        INSERT OR IGNORE INTO sessions (
                            task_id, timestamp, status, original_prompt,
                            expected_count, scope, pattern, action,
                            discovered_items, verification_criteria,
                            actual_count, actual_items, modifications,
                            completed_at, verdict, verdict_reason, missing_count
                        ) VALUES (
                            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
                        )
                    `).run(
                        session.task_id,
                        session.timestamp,
                        session.status || 'completed',
                        session.requirements?.original_prompt,
                        String(session.requirements?.expected_count || '0'),
                        session.requirements?.scope,
                        session.requirements?.pattern,
                        session.requirements?.action,
                        JSON.stringify(session.requirements?.discovered_items || []),
                        JSON.stringify(session.requirements?.verification_criteria || []),
                        session.actual?.count || 0,
                        JSON.stringify(session.actual?.items || []),
                        JSON.stringify(session.actual?.modifications || []),
                        session.actual?.completed_at,
                        session.verdict?.verdict,
                        session.verdict?.reason,
                        session.verdict?.missing || 0
                    );

                    migrated++;
                    process.stdout.write(`\r  ✓ Migrated ${migrated}/${files.length} sessions`);
                } catch (error) {
                    console.error(`\n  ⚠️ Error migrating ${file}:`, error.message);
                }
            }
            console.log(''); // New line after progress
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log('  - No history to migrate');
            } else {
                console.error('  ⚠️ Error migrating history:', error.message);
            }
        }
    }

    async offerBackup() {
        console.log('\n📦 Backup Options:');
        console.log('1. Old JSON files are still in:', this.jsonDir);
        console.log('2. You can safely delete them after verifying the migration');
        console.log('3. To create a backup: tar -czf verification-backup.tar.gz .claude/verification/');
    }
}

// Run migration if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const migrator = new StorageMigrator();
    migrator.migrate().catch(console.error);
}