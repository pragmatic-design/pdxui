// File-based routing — discover routes from filesystem conventions.
// Convention follows SvelteKit-style: [param].pdx, _layout.pdx, _error.pdx, (group)/, [...catch].pdx
// Layout chain: all _layout.pdx files from root to leaf are collected for nesting.

import { readdirSync, statSync, existsSync } from 'fs';
import { join, relative, dirname } from 'path';

export interface FileRoute {
    /** URL path pattern: '/users/:id' */
    path: string;
    /** File path relative to routes dir: 'users/[id].pdx' */
    file: string;
    /** Layout chain from root to nearest: ['_layout.pdx', 'admin/_layout.pdx'] */
    layouts: string[];
    /** Nearest _layout.pdx (backward compat — last in chain) */
    layout?: string;
    /** Nearest _error.pdx file path (relative to routes dir) */
    error?: string;
    /** Status-specific error pages: { '404': '_404.pdx', '403': 'admin/_error-403.pdx' } */
    errorPages: Record<string, string>;
    /** True if this is an index route (index.pdx) */
    isIndex: boolean;
    /** True if this is a catch-all route ([...name].pdx) */
    isCatchAll: boolean;
}

/**
 * Convert a file path to a URL route pattern.
 *
 * Examples:
 *   'index.pdx' -> '/'
 *   'about.pdx' -> '/about'
 *   'users/index.pdx' -> '/users'
 *   'users/[id].pdx' -> '/users/:id'
 *   '[...catch].pdx' -> '/*'
 *   '(admin)/dashboard.pdx' -> '/dashboard'
 */
export function filePathToRoute(filePath: string): string {
    // Remove .pdx extension
    const route = filePath.replace(/\.pdx$/, '');

    // Split into segments
    const segments = route.split(/[/\\]/);
    const routeSegments: string[] = [];

    for (const seg of segments) {
        // Skip group folders: (admin) -> no URL segment
        if (seg.startsWith('(') && seg.endsWith(')')) continue;

        // Skip index (handled as parent path)
        if (seg === 'index') continue;

        // Catch-all: [...name] -> *
        const catchAllMatch = seg.match(/^\[\.\.\.(\w+)\]$/);
        if (catchAllMatch) {
            routeSegments.push('*');
            continue;
        }

        // Dynamic param with constraint: [name=number] -> :name(number)
        const constrainedMatch = seg.match(/^\[(\w+)=(\w+)\]$/);
        if (constrainedMatch) {
            routeSegments.push(`:${constrainedMatch[1]}(${constrainedMatch[2]})`);
            continue;
        }

        // Dynamic param: [name] -> :name
        const paramMatch = seg.match(/^\[(\w+)\]$/);
        if (paramMatch) {
            routeSegments.push(`:${paramMatch[1]}`);
            continue;
        }

        // Static segment
        routeSegments.push(seg);
    }

    const path = '/' + routeSegments.join('/');
    return path === '/' ? '/' : path.replace(/\/$/, '');
}

/**
 * Discover all routes in a directory following filesystem conventions.
 *
 * Special files (not routes):
 *   _layout.pdx -- layout wrapper
 *   _error.pdx -- error page
 *
 * @param routesDir -- Absolute path to the routes directory
 */
export function discoverRoutes(routesDir: string): FileRoute[] {
    if (!existsSync(routesDir)) return [];

    const routes: FileRoute[] = [];

    /** Find nearest special file walking UP from dir to routesDir. */
    function findNearestSpecial(dir: string, fileName: string): string | undefined {
        let current = dir;
        while (current.startsWith(routesDir)) {
            const candidate = join(current, fileName);
            if (existsSync(candidate)) {
                return relative(routesDir, candidate).replace(/\\/g, '/');
            }
            const parent = dirname(current);
            if (parent === current) break;
            current = parent;
        }
        return undefined;
    }

    /**
     * Build layout chain from routesDir to dir, collecting all _layout.pdx files.
     * Returns array ordered root -> leaf: ['_layout.pdx', 'admin/_layout.pdx']
     */
    function findLayoutChain(dir: string): string[] {
        const chain: string[] = [];
        // Walk from routesDir DOWN to dir
        const relDir = relative(routesDir, dir).replace(/\\/g, '/');
        const segments = relDir ? relDir.split('/') : [];

        // Check root
        const rootLayout = join(routesDir, '_layout.pdx');
        if (existsSync(rootLayout)) {
            chain.push('_layout.pdx');
        }

        // Check each intermediate + leaf directory
        let current = routesDir;
        for (const seg of segments) {
            current = join(current, seg);
            const candidate = join(current, '_layout.pdx');
            if (existsSync(candidate)) {
                chain.push(relative(routesDir, candidate).replace(/\\/g, '/'));
            }
        }

        return chain;
    }

    /**
     * Find status-specific error pages walking UP from dir to routesDir.
     * Scans for _404.pdx, _error-{code}.pdx patterns.
     * Returns: { '404': '_404.pdx', '403': 'admin/_error-403.pdx' }
     */
    function findErrorPages(dir: string): Record<string, string> {
        const pages: Record<string, string> = {};
        let current = dir;
        while (current.startsWith(routesDir)) {
            if (existsSync(current)) {
                const entries = readdirSync(current);
                for (const entry of entries) {
                    // _404.pdx → code '404'
                    if (entry === '_404.pdx' && !pages['404']) {
                        pages['404'] = relative(routesDir, join(current, entry)).replace(/\\/g, '/');
                    }
                    // _error-{code}.pdx → code from filename
                    const codeMatch = entry.match(/^_error-(\d+)\.pdx$/);
                    if (codeMatch && !pages[codeMatch[1]]) {
                        pages[codeMatch[1]] = relative(routesDir, join(current, entry)).replace(/\\/g, '/');
                    }
                }
            }
            const parent = dirname(current);
            if (parent === current) break;
            current = parent;
        }
        return pages;
    }

    function scan(dir: string): void {
        const entries = readdirSync(dir);

        for (const entry of entries) {
            const fullPath = join(dir, entry);
            const stat = statSync(fullPath);

            if (stat.isDirectory()) {
                scan(fullPath);
                continue;
            }

            if (!entry.endsWith('.pdx')) continue;

            // Skip special files (layouts, error pages)
            if (entry === '_layout.pdx' || entry === '_error.pdx') continue;
            if (entry.startsWith('_error-') && entry.endsWith('.pdx')) continue;
            if (entry === '_404.pdx') continue;

            const relPath = relative(routesDir, fullPath).replace(/\\/g, '/');
            const routePath = filePathToRoute(relPath);

            const isCatchAll = entry.startsWith('[...') && entry.endsWith('].pdx');
            const isIndex = entry === 'index.pdx';

            const parentDir = dirname(fullPath);
            const layouts = findLayoutChain(parentDir);
            const error = findNearestSpecial(parentDir, '_error.pdx');
            const errorPages = findErrorPages(parentDir);

            routes.push({
                path: routePath,
                file: relPath,
                layouts,
                layout: layouts.length > 0 ? layouts[layouts.length - 1] : undefined,
                error,
                errorPages,
                isIndex,
                isCatchAll,
            });
        }
    }

    scan(routesDir);

    // Sort: static before dynamic, catch-all last
    routes.sort((a, b) => {
        if (a.isCatchAll !== b.isCatchAll) return a.isCatchAll ? 1 : -1;
        const aDynamic = a.path.includes(':');
        const bDynamic = b.path.includes(':');
        if (aDynamic !== bDynamic) return aDynamic ? 1 : -1;
        return a.path.localeCompare(b.path);
    });

    return routes;
}
