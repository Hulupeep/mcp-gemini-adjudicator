/**
 * Content Adapter - Handles content verification tasks
 * Verifies word counts, file creation, quoted insertions
 */

import { promises as fs } from 'fs';
import { join, basename } from 'path';

export class ContentAdapter {
    constructor(profile = {}) {
        this.profile = {
            word_min: 400,
            word_tolerance: 0,
            strict: true,
            ...profile
        };
    }

    /**
     * Verify content against commitments and claims
     */
    async verify(commitment, claim, artifacts) {
        const results = {
            units_expected: commitment.commitments?.expected_total || 0,
            units_verified: 0,
            per_unit: [],
            metrics: {},
            reasons: []
        };

        // Handle v1.1 format - extract claim data from nested structure
        const claimData = claim.claim || claim.claimed || claim;

        // Get files from artifacts
        const files = artifacts?.content?.files || [];

        // Verify each file
        for (const file of files) {
            const unitResult = await this.verifyUnit(file, commitment);
            results.per_unit.push(unitResult);

            if (unitResult.ok) {
                results.units_verified++;
            } else {
                results.reasons.push(unitResult.reason);
            }
        }

        // Check total count
        if (results.units_verified < results.units_expected) {
            const missing = results.units_expected - results.units_verified;
            results.reasons.push(`Missing ${missing} units`);
        }

        // Validate v1.1 format consistency if present
        if (claim.schema === "verify.claim/v1.1" && claimData.units_total !== claimData.units_list?.length) {
            results.reasons.push(`units_total (${claimData.units_total}) does not match units_list.length (${claimData.units_list?.length})`);
        }

        // Calculate metrics
        results.metrics = {
            completion_rate: results.units_expected > 0
                ? results.units_verified / results.units_expected
                : 0,
            average_word_count: this.calculateAverageWords(files),
            word_min_compliance: this.calculateWordCompliance(files, this.profile.word_min)
        };

        return results;
    }

    /**
     * Verify a single content unit
     */
    async verifyUnit(file, commitment) {
        const result = {
            id: file.path || file.name,
            ok: true,
            reason: null
        };

        // Check word count
        const wordCount = file.word_count || 0;
        const minWords = commitment.commitments?.quality?.word_min || this.profile.word_min;

        if (wordCount < minWords - this.profile.word_tolerance) {
            result.ok = false;
            result.reason = `word_count ${wordCount} < ${minWords}`;
        }

        // Check file exists
        if (file.path) {
            try {
                await fs.access(file.path);
            } catch (error) {
                result.ok = false;
                result.reason = `File not found: ${file.path}`;
            }
        }

        // Check for required insertions (if specified)
        if (commitment.commitments?.quality?.required_text) {
            const content = await this.readFile(file.path);
            if (!content.includes(commitment.commitments.quality.required_text)) {
                result.ok = false;
                result.reason = `Missing required text: "${commitment.commitments.quality.required_text}"`;
            }
        }

        return result;
    }

    /**
     * Read file content
     */
    async readFile(path) {
        try {
            return await fs.readFile(path, 'utf8');
        } catch (error) {
            return '';
        }
    }

    /**
     * Calculate average word count
     */
    calculateAverageWords(files) {
        if (!files.length) return 0;
        const total = files.reduce((sum, f) => sum + (f.word_count || 0), 0);
        return Math.round(total / files.length);
    }

    /**
     * Calculate word compliance rate
     */
    calculateWordCompliance(files, minWords) {
        if (!files.length) return 0;
        const compliant = files.filter(f => (f.word_count || 0) >= minWords).length;
        return compliant / files.length;
    }

    /**
     * Collect artifacts from filesystem
     */
    async collectArtifacts(directory, pattern = '*.md') {
        const artifacts = {
            content: {
                files: []
            }
        };

        try {
            const files = await fs.readdir(directory);

            for (const file of files) {
                if (file.endsWith('.md') || file.endsWith('.txt')) {
                    const path = join(directory, file);
                    const content = await fs.readFile(path, 'utf8');
                    const wordCount = content.split(/\s+/).filter(w => w.length > 0).length;

                    artifacts.content.files.push({
                        path: path,
                        name: file,
                        word_count: wordCount
                    });
                }
            }
        } catch (error) {
            console.error('Error collecting artifacts:', error);
        }

        return artifacts;
    }
}

// Export singleton for convenience
export const contentAdapter = new ContentAdapter();