#!/usr/bin/env node
/**
 * Resolves adapter binary path for a capability
 * Usage: node resolve-adapter.js <capability>
 * Output: prints adapter binary path or exits 1
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Build capability index from manifest files
const caps = {};
const adaptersDir = path.join(__dirname, '..', 'adapters');

try {
  for (const dir of fs.readdirSync(adaptersDir)) {
    const manifestPath = path.join(adaptersDir, dir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) continue;

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (!manifest.capabilities || !manifest.entry) continue;

    // Map each capability to the adapter's entry point
    for (const capability of manifest.capabilities) {
      caps[capability] = path.join(adaptersDir, dir, manifest.entry);
    }
  }
} catch (error) {
  console.error(`ERROR_SCANNING_ADAPTERS: ${error.message}`);
  process.exit(1);
}

// Get requested capability from command line
const capability = process.argv[2];

if (!capability) {
  console.error('USAGE: node resolve-adapter.js <capability>');
  process.exit(1);
}

if (!caps[capability]) {
  console.error(`NO_ADAPTER_FOR:${capability}`);
  process.exit(1);
}

// Output the adapter binary path
console.log(caps[capability]);