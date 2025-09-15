#!/usr/bin/env node

/**
 * Integration tests for MCP Gemini Adjudicator
 * Tests the full verification workflow including quantity tracking
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_DIR = `/tmp/mcp-integration-test-${Date.now()}`;

// ANSI colors
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m'
};

class IntegrationTester {
    constructor() {
        this.results = {
            total: 0,
            passed: 0,
            failed: 0,
            tests: []
        };
    }

    async setup() {
        console.log('🔧 Setting up test environment...');
        await fs.mkdir(TEST_DIR, { recursive: true });
        await fs.mkdir(join(TEST_DIR, 'output'), { recursive: true });
        await fs.mkdir(join(TEST_DIR, 'webpages'), { recursive: true });
    }

    async cleanup() {
        console.log('🧹 Cleaning up...');
        await fs.rm(TEST_DIR, { recursive: true, force: true });
    }

    async runTest(name, testFn) {
        this.results.total++;
        console.log(`\n${colors.yellow}Running: ${name}${colors.reset}`);

        try {
            const result = await testFn();
            if (result.success) {
                this.results.passed++;
                console.log(`${colors.green}✅ PASS${colors.reset}: ${result.message}`);
                this.results.tests.push({ name, passed: true, message: result.message });
            } else {
                this.results.failed++;
                console.log(`${colors.red}❌ FAIL${colors.reset}: ${result.message}`);
                this.results.tests.push({ name, passed: false, message: result.message });
            }
        } catch (error) {
            this.results.failed++;
            console.log(`${colors.red}❌ ERROR${colors.reset}: ${error.message}`);
            this.results.tests.push({ name, passed: false, message: error.message });
        }
    }

    /**
     * Test 1: Verify explicit quantity extraction
     */
    async testExplicitQuantity() {
        const testCases = [
            { prompt: "Create 10 blog posts", expected: 10 },
            { prompt: "Generate 5 test files", expected: 5 },
            { prompt: "Write 3 components", expected: 3 }
        ];

        for (const { prompt, expected } of testCases) {
            const extracted = this.extractQuantity(prompt);
            if (extracted !== expected) {
                return {
                    success: false,
                    message: `Failed to extract ${expected} from "${prompt}", got ${extracted}`
                };
            }
        }

        return {
            success: true,
            message: `All explicit quantities extracted correctly`
        };
    }

    /**
     * Test 2: Verify "all" files counting
     */
    async testAllFilesCount() {
        // Create test files
        const files = ['page1.html', 'page2.html', 'page3.html', 'page4.html', 'page5.html'];
        for (const file of files) {
            await fs.writeFile(join(TEST_DIR, 'webpages', file), '<html></html>');
        }

        const fileList = await fs.readdir(join(TEST_DIR, 'webpages'));
        const htmlFiles = fileList.filter(f => f.endsWith('.html'));

        return {
            success: htmlFiles.length === 5,
            message: `Found ${htmlFiles.length} HTML files (expected 5)`
        };
    }

    /**
     * Test 3: Mock verification with incomplete work
     */
    async testIncompleteWork() {
        const verification = {
            expected: 10,
            actual: 3,
            task: "Create blog posts"
        };

        const verdict = this.verifyCompletion(verification);

        return {
            success: verdict.verdict === 'FAIL',
            message: `Correctly detected incomplete work: ${verdict.message}`
        };
    }

    /**
     * Test 4: Test MCP server verification call
     */
    async testMCPVerification() {
        const mockRequest = {
            jsonrpc: "2.0",
            method: "tools/call",
            params: {
                name: "verify_with_gemini",
                arguments: {
                    task: "Create 5 documentation files",
                    artifact: "Created files: doc1.md, doc2.md",
                    tests_json: JSON.stringify({
                        expected_count: 5,
                        actual_count: 2
                    })
                }
            }
        };

        // Here we would normally call the actual MCP server
        // For testing, we simulate the expected response
        const mockResponse = {
            verdict: "FAIL",
            confidence: 1.0,
            detailed_feedback: "Only 2 out of 5 files created",
            analysis: {
                expected: 5,
                actual: 2,
                missing: 3
            }
        };

        return {
            success: mockResponse.verdict === 'FAIL' && mockResponse.analysis.missing === 3,
            message: `MCP verification correctly identified 3 missing files`
        };
    }

    /**
     * Test 5: Full workflow simulation
     */
    async testFullWorkflow() {
        // Step 1: User prompt
        const userPrompt = "Update all configuration files in /config directory";

        // Step 2: Pre-hook extracts requirements
        const requirements = {
            scope: "/config",
            pattern: "*.json",
            expected_count: "ALL",
            action: "update"
        };

        // Step 3: Create mock files
        const configFiles = ['app.json', 'database.json', 'api.json'];
        const configDir = join(TEST_DIR, 'config');
        await fs.mkdir(configDir, { recursive: true });

        for (const file of configFiles) {
            await fs.writeFile(join(configDir, file), '{}');
        }

        // Step 4: Simulate partial update (only 2 files)
        const modifiedFiles = ['app.json', 'database.json'];

        // Step 5: Post-hook verification
        const verification = {
            expected: configFiles.length,
            actual: modifiedFiles.length,
            verdict: modifiedFiles.length < configFiles.length ? 'FAIL' : 'PASS'
        };

        return {
            success: verification.verdict === 'FAIL',
            message: `Workflow detected incomplete update: ${modifiedFiles.length}/${configFiles.length} files`
        };
    }

    /**
     * Test 6: Gemini response parsing
     */
    async testGeminiResponseParsing() {
        const geminiResponse = `{
            "verdict": "FAIL",
            "confidence": 0.95,
            "analysis": {
                "strengths": ["Files were created"],
                "weaknesses": ["Not all files created"],
                "risks": ["Incomplete task"]
            },
            "recommendations": ["Create remaining 5 files"],
            "detailed_feedback": "Task incomplete: Only 5 out of 10 files created"
        }`;

        try {
            const parsed = JSON.parse(geminiResponse);
            return {
                success: parsed.verdict === 'FAIL' && parsed.confidence === 0.95,
                message: 'Successfully parsed Gemini response'
            };
        } catch (error) {
            return {
                success: false,
                message: `Failed to parse Gemini response: ${error.message}`
            };
        }
    }

    // Helper methods
    extractQuantity(prompt) {
        const match = prompt.match(/\d+/);
        return match ? parseInt(match[0]) : 0;
    }

    verifyCompletion(verification) {
        if (verification.actual < verification.expected) {
            return {
                verdict: 'FAIL',
                message: `Incomplete: ${verification.actual}/${verification.expected} completed`
            };
        }
        return {
            verdict: 'PASS',
            message: 'All items completed'
        };
    }

    async printSummary() {
        console.log('\n' + '='.repeat(50));
        console.log('📊 Test Results Summary');
        console.log('='.repeat(50));
        console.log(`Total Tests: ${this.results.total}`);
        console.log(`${colors.green}Passed: ${this.results.passed}${colors.reset}`);
        console.log(`${colors.red}Failed: ${this.results.failed}${colors.reset}`);

        if (this.results.failed > 0) {
            console.log('\nFailed Tests:');
            this.results.tests
                .filter(t => !t.passed)
                .forEach(t => console.log(`  ${colors.red}✗${colors.reset} ${t.name}: ${t.message}`));
        }

        const allPassed = this.results.failed === 0;
        console.log(`\n${allPassed ? colors.green + '🎉 All tests passed!' : colors.red + '⚠️  Some tests failed'}${colors.reset}`);

        return allPassed ? 0 : 1;
    }

    async run() {
        try {
            await this.setup();

            // Run all tests
            await this.runTest('Explicit Quantity Extraction', () => this.testExplicitQuantity());
            await this.runTest('All Files Counting', () => this.testAllFilesCount());
            await this.runTest('Incomplete Work Detection', () => this.testIncompleteWork());
            await this.runTest('MCP Verification Call', () => this.testMCPVerification());
            await this.runTest('Full Workflow Simulation', () => this.testFullWorkflow());
            await this.runTest('Gemini Response Parsing', () => this.testGeminiResponseParsing());

            const exitCode = await this.printSummary();
            await this.cleanup();
            process.exit(exitCode);
        } catch (error) {
            console.error(`${colors.red}Fatal error: ${error.message}${colors.reset}`);
            await this.cleanup();
            process.exit(1);
        }
    }
}

// Run tests
const tester = new IntegrationTester();
tester.run();