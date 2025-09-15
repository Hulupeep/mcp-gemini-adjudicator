#!/usr/bin/env node
/**
 * Link Discovery Module
 * Discovers links from URLs, pages, or sitemaps
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { URL } from 'url';

export async function discoverLinks(options) {
    const { taskDir, commitment, claim, profile, url } = options;

    const results = {
        source_url: url || claim?.claimed?.source_url || '',
        discovered_count: 0,
        urls: [],
        discovery_method: 'none',
        timestamp: new Date().toISOString()
    };

    try {
        // Create links subdirectory
        const linksDir = join(taskDir, 'links');
        await fs.mkdir(linksDir, { recursive: true });

        // Determine source for discovery
        let sourceUrl = url;

        if (!sourceUrl && claim?.claimed?.source_url) {
            sourceUrl = claim.claimed.source_url;
        }

        if (!sourceUrl && commitment?.commitments?.scope?.target_url) {
            sourceUrl = commitment.commitments.scope.target_url;
        }

        if (!sourceUrl) {
            // Try to extract from files if checking local HTML
            const localFiles = await discoverLocalFiles(claim);
            if (localFiles.length > 0) {
                results.discovery_method = 'local_files';
                results.urls = await extractLinksFromFiles(localFiles);
            }
        } else {
            // Fetch and parse the URL
            results.source_url = sourceUrl;

            if (sourceUrl.endsWith('sitemap.xml')) {
                results.discovery_method = 'sitemap';
                results.urls = await parseSitemap(sourceUrl);
            } else {
                results.discovery_method = 'page_crawl';
                results.urls = await crawlPage(sourceUrl);
            }
        }

        // Deduplicate and validate URLs
        const uniqueUrls = [...new Set(results.urls)];
        results.urls = uniqueUrls.filter(url => isValidUrl(url));
        results.discovered_count = results.urls.length;

        // Write urlset
        await fs.writeFile(
            join(linksDir, 'urlset.json'),
            JSON.stringify(results.urls, null, 2)
        );

        // Write discovery metadata
        await fs.writeFile(
            join(linksDir, 'discovery.json'),
            JSON.stringify(results, null, 2)
        );

        return results;

    } catch (error) {
        console.error('Error in link discovery:', error);
        results.error = error.message;

        const linksDir = join(taskDir, 'links');
        await fs.mkdir(linksDir, { recursive: true });

        await fs.writeFile(
            join(linksDir, 'discovery.json'),
            JSON.stringify(results, null, 2)
        );

        return results;
    }
}

async function discoverLocalFiles(claim) {
    const files = [];

    if (claim?.claimed?.files_modified) {
        for (const file of claim.claimed.files_modified) {
            if (file.endsWith('.html') || file.endsWith('.htm')) {
                files.push(file);
            }
        }
    }

    return files;
}

async function extractLinksFromFiles(files) {
    const links = [];

    for (const file of files) {
        try {
            const content = await fs.readFile(file, 'utf8');
            const extracted = extractLinksFromHtml(content);
            links.push(...extracted);
        } catch (error) {
            console.error(`Error reading ${file}:`, error.message);
        }
    }

    return links;
}

function extractLinksFromHtml(html) {
    const links = [];

    // Extract href attributes
    const hrefPattern = /href=["']([^"']+)["']/gi;
    const hrefMatches = [...html.matchAll(hrefPattern)];

    for (const match of hrefMatches) {
        const url = match[1];
        if (isValidUrl(url)) {
            links.push(url);
        }
    }

    // Extract src attributes (for resources)
    const srcPattern = /src=["']([^"']+)["']/gi;
    const srcMatches = [...html.matchAll(srcPattern)];

    for (const match of srcMatches) {
        const url = match[1];
        if (isValidUrl(url)) {
            links.push(url);
        }
    }

    // Extract URLs from text content
    const urlPattern = /https?:\/\/[^\s<>"']+/gi;
    const urlMatches = [...html.matchAll(urlPattern)];

    for (const match of urlMatches) {
        const url = match[0];
        if (isValidUrl(url)) {
            links.push(url);
        }
    }

    return links;
}

async function parseSitemap(sitemapUrl) {
    const links = [];

    try {
        // Fetch sitemap
        const response = await fetch(sitemapUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch sitemap: ${response.status}`);
        }

        const xml = await response.text();

        // Extract URLs from sitemap
        const locPattern = /<loc>([^<]+)<\/loc>/gi;
        const matches = [...xml.matchAll(locPattern)];

        for (const match of matches) {
            const url = match[1].trim();
            if (isValidUrl(url)) {
                links.push(url);
            }
        }

        // Check for sitemap index
        const sitemapPattern = /<sitemap>[\s\S]*?<loc>([^<]+)<\/loc>/gi;
        const sitemapMatches = [...xml.matchAll(sitemapPattern)];

        if (sitemapMatches.length > 0) {
            // This is a sitemap index, recursively fetch child sitemaps
            for (const match of sitemapMatches) {
                const childSitemapUrl = match[1].trim();
                const childLinks = await parseSitemap(childSitemapUrl);
                links.push(...childLinks);
            }
        }

    } catch (error) {
        console.error(`Error parsing sitemap ${sitemapUrl}:`, error.message);
    }

    return links;
}

async function crawlPage(pageUrl) {
    const links = [];

    try {
        // Fetch page
        const response = await fetch(pageUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch page: ${response.status}`);
        }

        const html = await response.text();
        const baseUrl = new URL(pageUrl);

        // Extract all links
        const extracted = extractLinksFromHtml(html);

        // Resolve relative URLs
        for (const link of extracted) {
            try {
                const resolved = new URL(link, baseUrl).href;
                links.push(resolved);
            } catch {
                // If not a valid URL when resolved, use as-is if absolute
                if (isValidUrl(link)) {
                    links.push(link);
                }
            }
        }

    } catch (error) {
        console.error(`Error crawling page ${pageUrl}:`, error.message);
    }

    return links;
}

function isValidUrl(url) {
    if (!url || typeof url !== 'string') return false;

    // Skip data URLs, javascript:, mailto:, etc.
    if (url.startsWith('data:') ||
        url.startsWith('javascript:') ||
        url.startsWith('mailto:') ||
        url.startsWith('#')) {
        return false;
    }

    try {
        new URL(url);
        return true;
    } catch {
        // Try with https:// prefix
        try {
            new URL('https://' + url);
            return true;
        } catch {
            return false;
        }
    }
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
    const args = process.argv.slice(2);
    const options = {
        taskDir: '.artifacts/current',
        commitment: {},
        claim: {},
        profile: {},
        url: null
    };

    // Parse arguments
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--task-dir' && args[i + 1]) {
            options.taskDir = args[i + 1];
            i++;
        } else if (args[i] === '--commitment' && args[i + 1]) {
            options.commitment = JSON.parse(await fs.readFile(args[i + 1], 'utf8'));
            i++;
        } else if (args[i] === '--claim' && args[i + 1]) {
            options.claim = JSON.parse(await fs.readFile(args[i + 1], 'utf8'));
            i++;
        } else if (args[i] === '--profile' && args[i + 1]) {
            options.profile = JSON.parse(await fs.readFile(args[i + 1], 'utf8'));
            i++;
        } else if (args[i] === '--url' && args[i + 1]) {
            options.url = args[i + 1];
            i++;
        }
    }

    await discoverLinks(options);
}