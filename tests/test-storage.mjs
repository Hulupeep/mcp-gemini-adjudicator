#!/usr/bin/env node

/**
 * Test suite for verification storage system
 */

import { VerificationStorage } from '../src/storage.mjs';
import { promises as fs } from 'fs';
import { join } from 'path';
import assert from 'assert';

const TEST_DIR = `/tmp/storage-test-${Date.now()}`;

class StorageTests {
    constructor() {
        this.storage = new VerificationStorage(TEST_DIR);
        this.testResults = [];
    }

    async setup() {
        console.log('🔧 Setting up storage tests...');
        await this.storage.init();
    }

    async cleanup() {
        console.log('🧹 Cleaning up...');
        await fs.rm(TEST_DIR, { recursive: true, force: true });
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

    // Test 1: Store and retrieve requirements
    async testStoreRequirements() {
        const taskId = 'test-task-001';
        const requirements = {
            prompt: 'Create 10 blog posts',
            expectedCount: 10,
            scope: '/blog',
            pattern: '*.md',
            action: 'create',
            discoveredItems: [],
            criteria: ['Each post must be 400+ words']
        };

        const session = await this.storage.storeRequirements(taskId, requirements);

        assert.strictEqual(session.task_id, taskId);
        assert.strictEqual(session.requirements.expected_count, 10);
        assert.strictEqual(session.status, 'pending');
        assert.strictEqual(session.actual.count, 0);
    }

    // Test 2: Update with actuals
    async testUpdateActuals() {
        const taskId = 'test-task-002';

        // First store requirements
        await this.storage.storeRequirements(taskId, {
            prompt: 'Update all pages',
            expectedCount: 5,
            scope: '/pages',
            action: 'update',
            criteria: []
        });

        // Then update with actuals
        const actuals = {
            count: 3,
            items: ['page1.html', 'page2.html', 'page3.html'],
            modifications: ['added footer', 'updated header']
        };

        const updated = await this.storage.updateActuals(taskId, actuals);

        assert.strictEqual(updated.actual.count, 3);
        assert.strictEqual(updated.verdict.verdict, 'FAIL');
        assert.strictEqual(updated.verdict.missing, 2);
    }

    // Test 3: Calculate verdict for complete work
    async testCompleteWorkVerdict() {
        const taskId = 'test-task-003';

        await this.storage.storeRequirements(taskId, {
            prompt: 'Create 5 components',
            expectedCount: 5,
            scope: '/components',
            action: 'create',
            criteria: []
        });

        const actuals = {
            count: 5,
            items: ['Button.jsx', 'Card.jsx', 'Modal.jsx', 'Form.jsx', 'Table.jsx']
        };

        const result = await this.storage.updateActuals(taskId, actuals);

        assert.strictEqual(result.verdict.verdict, 'PASS');
        assert.strictEqual(result.verdict.missing, 0);
    }

    // Test 4: Handle "ALL" keyword
    async testAllKeyword() {
        const taskId = 'test-task-004';

        await this.storage.storeRequirements(taskId, {
            prompt: 'Update all config files',
            expectedCount: 'ALL',
            scope: '/config',
            action: 'update',
            discoveredItems: ['app.json', 'db.json', 'api.json', 'auth.json'],
            criteria: []
        });

        // Only update 2 out of 4 discovered
        const actuals = {
            count: 2,
            items: ['app.json', 'db.json']
        };

        const result = await this.storage.updateActuals(taskId, actuals);

        assert.strictEqual(result.verdict.verdict, 'FAIL');
        assert.strictEqual(result.verdict.missing, 2);
        assert(result.verdict.reason.includes('2/4'));
    }

    // Test 5: Metrics tracking
    async testMetricsTracking() {
        // Run several verifications
        for (let i = 1; i <= 3; i++) {
            const taskId = `metric-test-${i}`;
            await this.storage.storeRequirements(taskId, {
                prompt: `Test task ${i}`,
                expectedCount: 5,
                criteria: []
            });

            const actuals = {
                count: i === 2 ? 5 : 3,  // Only task 2 passes
                items: []
            };

            await this.storage.updateActuals(taskId, actuals);
        }

        const metrics = await this.storage.loadMetrics();

        assert(metrics.total_verifications >= 3);
        assert(metrics.passed >= 1);
        assert(metrics.failed >= 2);
    }

    // Test 6: History retrieval
    async testHistoryRetrieval() {
        // Create some history
        for (let i = 1; i <= 3; i++) {
            const taskId = `history-test-${i}`;
            await this.storage.storeRequirements(taskId, {
                prompt: `Historical task ${i}`,
                expectedCount: i,
                criteria: []
            });

            await this.storage.updateActuals(taskId, {
                count: i,
                items: []
            });
        }

        const history = await this.storage.getHistory(2);

        assert(history.length <= 2);
        assert(history[0].task_id.startsWith('history-test-'));
    }

    // Test 7: Session persistence
    async testSessionPersistence() {
        const taskId = 'persist-test';

        await this.storage.storeRequirements(taskId, {
            prompt: 'Test persistence',
            expectedCount: 10,
            criteria: []
        });

        const loaded = await this.storage.loadSession();

        assert.strictEqual(loaded.task_id, taskId);
        assert.strictEqual(loaded.requirements.expected_count, 10);
    }

    // Test 8: Stats generation
    async testStatsGeneration() {
        const stats = await this.storage.getStats();

        assert(stats.metrics);
        assert(typeof stats.history_count === 'number');
        assert(typeof stats.has_active_session === 'boolean');
        assert(stats.success_rate);
    }

    async runAll() {
        await this.setup();

        const tests = [
            'testStoreRequirements',
            'testUpdateActuals',
            'testCompleteWorkVerdict',
            'testAllKeyword',
            'testMetricsTracking',
            'testHistoryRetrieval',
            'testSessionPersistence',
            'testStatsGeneration'
        ];

        for (const test of tests) {
            await this.runTest(test.replace(/^test/, ''), this[test]);
        }

        this.printSummary();
        await this.cleanup();
    }

    printSummary() {
        console.log('\n' + '='.repeat(50));
        console.log('📊 Storage Test Results');
        console.log('='.repeat(50));

        const passed = this.testResults.filter(r => r.passed).length;
        const failed = this.testResults.filter(r => !r.passed).length;

        console.log(`Total: ${this.testResults.length}`);
        console.log(`Passed: ${passed}`);
        console.log(`Failed: ${failed}`);

        if (failed === 0) {
            console.log('\n🎉 All storage tests passed!');
            process.exit(0);
        } else {
            console.log('\n⚠️ Some tests failed');
            process.exit(1);
        }
    }
}

// Run tests
const tester = new StorageTests();
tester.runAll().catch(console.error);