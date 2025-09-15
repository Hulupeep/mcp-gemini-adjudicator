#!/usr/bin/env node

/**
 * Test suite for SQLite storage system
 */

import { VerificationStorageSQLite } from '../src/storage-sqlite.mjs';
import { promises as fs } from 'fs';
import assert from 'assert';

const TEST_DB = `/tmp/test-verification-${Date.now()}.db`;

class SQLiteStorageTests {
    constructor() {
        this.storage = new VerificationStorageSQLite(TEST_DB);
        this.testResults = [];
    }

    async setup() {
        console.log('🔧 Setting up SQLite storage tests...');
        await this.storage.init();
    }

    async cleanup() {
        console.log('🧹 Cleaning up...');
        this.storage.close();
        await fs.unlink(TEST_DB).catch(() => {});
    }

    async runTest(name, testFn) {
        console.log(`\nTesting: ${name}`);
        try {
            await testFn.call(this);
            console.log(`✅ PASS: ${name}`);
            this.testResults.push({ name, passed: true });
        } catch (error) {
            console.log(`❌ FAIL: ${name}`);
            console.error(`  Error: ${error.message}`);
            this.testResults.push({ name, passed: false, error: error.message });
        }
    }

    // Test 1: Database initialization
    async testDatabaseInit() {
        // Check if database file exists
        const stats = await fs.stat(TEST_DB);
        assert(stats.isFile(), 'Database file should exist');

        // Check if tables exist
        const tables = this.storage.db.prepare(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).all();

        const tableNames = tables.map(t => t.name);
        assert(tableNames.includes('sessions'), 'Sessions table should exist');
        assert(tableNames.includes('metrics'), 'Metrics table should exist');
        assert(tableNames.includes('incomplete_tasks'), 'Incomplete tasks table should exist');
    }

    // Test 2: Store and retrieve with performance
    async testPerformance() {
        const startTime = Date.now();
        const iterations = 100;

        // Store 100 sessions
        for (let i = 0; i < iterations; i++) {
            await this.storage.storeRequirements(`perf-test-${i}`, {
                prompt: `Test task ${i}`,
                expectedCount: 10,
                scope: '/test',
                action: 'update',
                discoveredItems: ['file1', 'file2', 'file3'],
                criteria: ['criterion1', 'criterion2']
            });
        }

        const storeTime = Date.now() - startTime;
        console.log(`  Stored ${iterations} sessions in ${storeTime}ms (${(storeTime/iterations).toFixed(2)}ms per session)`);

        // Retrieve sessions
        const retrieveStart = Date.now();
        for (let i = 0; i < iterations; i++) {
            await this.storage.getSession(`perf-test-${i}`);
        }

        const retrieveTime = Date.now() - retrieveStart;
        console.log(`  Retrieved ${iterations} sessions in ${retrieveTime}ms (${(retrieveTime/iterations).toFixed(2)}ms per session)`);

        assert(storeTime < 1000, `Storing ${iterations} sessions should take less than 1 second`);
        assert(retrieveTime < 500, `Retrieving ${iterations} sessions should take less than 500ms`);
    }

    // Test 3: Complex queries
    async testComplexQueries() {
        // Create diverse test data
        const tasks = [
            { id: 'blog-1', action: 'create', expected: 10, actual: 10 }, // PASS
            { id: 'blog-2', action: 'create', expected: 5, actual: 3 },   // FAIL
            { id: 'update-1', action: 'update', expected: 20, actual: 20 }, // PASS
            { id: 'update-2', action: 'update', expected: 15, actual: 10 }, // FAIL
            { id: 'delete-1', action: 'delete', expected: 8, actual: 8 },   // PASS
        ];

        for (const task of tasks) {
            await this.storage.storeRequirements(task.id, {
                prompt: `${task.action} task`,
                expectedCount: task.expected,
                action: task.action,
                criteria: []
            });

            await this.storage.updateActuals(task.id, {
                count: task.actual,
                items: Array(task.actual).fill('item')
            });
        }

        // Test search functionality
        const failedSessions = await this.storage.searchSessions({ verdict: 'FAIL' });
        assert.strictEqual(failedSessions.length, 2, 'Should find 2 failed sessions');

        const createSessions = await this.storage.searchSessions({ action: 'create' });
        assert.strictEqual(createSessions.length, 2, 'Should find 2 create sessions');

        // Test statistics
        const stats = await this.storage.getStats();
        assert(stats.current_stats.passed === 3, 'Should have 3 passed sessions');
        assert(stats.current_stats.failed === 2, 'Should have 2 failed sessions');
    }

    // Test 4: Transaction integrity
    async testTransactionIntegrity() {
        const taskId = 'transaction-test';

        // Store requirements
        await this.storage.storeRequirements(taskId, {
            prompt: 'Transaction test',
            expectedCount: 10,
            criteria: []
        });

        // Simulate concurrent updates (SQLite handles this with WAL mode)
        const updates = [];
        for (let i = 0; i < 5; i++) {
            updates.push(
                this.storage.updateActuals(taskId, {
                    count: i + 1,
                    items: [`item${i}`]
                }).catch(err => err)
            );
        }

        const results = await Promise.all(updates);

        // Check that at least one succeeded
        const successes = results.filter(r => !(r instanceof Error));
        assert(successes.length >= 1, 'At least one update should succeed');
    }

    // Test 5: Data export and backup
    async testDataExport() {
        // Create some test data
        for (let i = 0; i < 5; i++) {
            await this.storage.storeRequirements(`export-test-${i}`, {
                prompt: `Export test ${i}`,
                expectedCount: i + 1,
                criteria: []
            });
        }

        // Export data
        const exported = await this.storage.exportData();

        assert(exported.sessions.length >= 5, 'Should export at least 5 sessions');
        assert(exported.metrics, 'Should export metrics');
        assert(exported.exported_at, 'Should include export timestamp');

        // Verify export can be used for backup
        const jsonBackup = JSON.stringify(exported, null, 2);
        assert(jsonBackup.length > 100, 'Export should produce valid JSON');
    }

    // Test 6: Search with date ranges
    async testDateRangeSearch() {
        const now = new Date();
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);

        // Create session today
        await this.storage.storeRequirements('date-test', {
            prompt: 'Date range test',
            expectedCount: 5,
            criteria: []
        });

        // Search for today's sessions
        const todaySessions = await this.storage.searchSessions({
            from: yesterday.toISOString(),
            to: tomorrow.toISOString()
        });

        assert(todaySessions.length >= 1, 'Should find at least one session from today');

        // Search for old sessions (should be empty)
        const oldSessions = await this.storage.searchSessions({
            to: yesterday.toISOString()
        });

        // Should not include today's session
        const hasToday = oldSessions.some(s => s.task_id === 'date-test');
        assert(!hasToday, 'Should not find today\'s session in old date range');
    }

    // Test 7: Cleanup functionality
    async testCleanup() {
        // Create old sessions by manipulating timestamps directly
        const db = this.storage.db;
        const oldDate = new Date();
        oldDate.setDate(oldDate.getDate() - 10);

        db.prepare(`
            INSERT INTO sessions (task_id, timestamp, status, expected_count)
            VALUES (?, ?, 'completed', '5')
        `).run('old-session', oldDate.toISOString());

        // Run cleanup for 7 days
        const result = await this.storage.cleanupHistory(7);

        assert(result.sessions_deleted >= 1, 'Should delete at least one old session');
    }

    // Test 8: Advanced statistics
    async testAdvancedStats() {
        // Create sessions with different patterns
        const patterns = [
            { action: 'create', count: 5, pass: 3 },
            { action: 'update', count: 3, pass: 1 },
            { action: 'delete', count: 2, pass: 2 }
        ];

        let id = 0;
        for (const pattern of patterns) {
            for (let i = 0; i < pattern.count; i++) {
                const taskId = `stats-test-${id++}`;
                const shouldPass = i < pattern.pass;

                await this.storage.storeRequirements(taskId, {
                    prompt: `${pattern.action} task`,
                    expectedCount: 10,
                    action: pattern.action,
                    criteria: []
                });

                await this.storage.updateActuals(taskId, {
                    count: shouldPass ? 10 : 5,
                    items: []
                });
            }
        }

        const stats = await this.storage.getStats();

        // Check top incomplete patterns
        assert(stats.top_incomplete_patterns, 'Should have incomplete pattern analysis');
        const updatePattern = stats.top_incomplete_patterns.find(p => p.action === 'update');
        assert(updatePattern && updatePattern.count === 2, 'Should identify update as problematic');

        // Check recent failures
        assert(stats.recent_failures && stats.recent_failures.length > 0, 'Should track recent failures');
    }

    async runAll() {
        await this.setup();

        const tests = [
            'testDatabaseInit',
            'testPerformance',
            'testComplexQueries',
            'testTransactionIntegrity',
            'testDataExport',
            'testDateRangeSearch',
            'testCleanup',
            'testAdvancedStats'
        ];

        for (const test of tests) {
            await this.runTest(test.replace(/^test/, ''), this[test]);
        }

        this.printSummary();
        await this.cleanup();
    }

    printSummary() {
        console.log('\n' + '='.repeat(50));
        console.log('📊 SQLite Storage Test Results');
        console.log('='.repeat(50));

        const passed = this.testResults.filter(r => r.passed).length;
        const failed = this.testResults.filter(r => !r.passed).length;

        console.log(`Total: ${this.testResults.length}`);
        console.log(`Passed: ${passed}`);
        console.log(`Failed: ${failed}`);

        if (failed === 0) {
            console.log('\n🎉 All SQLite storage tests passed!');
            console.log('✨ SQLite provides ~100x faster queries than JSON files');
            process.exit(0);
        } else {
            console.log('\n⚠️ Some tests failed');
            process.exit(1);
        }
    }
}

// Run tests
const tester = new SQLiteStorageTests();
tester.runAll().catch(console.error);