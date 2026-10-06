// The PDX MCP server: the CLI's own work, offered to an agent as tools.
//
// Each tool is a thin wrapper over what a command already does — `runCheck`, `explainCode`,
// `buildProjectManifest`, the component packages the compiler resolves from, the docs the site
// publishes — so the answers are the CLI's answers, and nothing here is a second implementation.
//
// The low-level `Server` with plain JSON Schemas, not `McpServer`: the latter wants zod schemas,
// which would be a dependency of its own for six small input objects.
//
// Every answer is one JSON text block. A tool that cannot answer — an unknown code, an unknown tag,
// a project whose config does not load — says why with `isError`, rather than throwing: the agent
// reads the reason and the server stays up.

import { readFileSync } from 'fs';
import { Server } from '@modelcontextprotocol/sdk/server';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { loadConfig, resolveConfig } from '../config/loader';
import { runCheck, checkJson } from '../commands/check-run';
import { explainCode } from '../commands/explain';
import { buildProjectManifest } from '../commands/analyze';
import { packageComponents, listComponents, type PackageComponent } from './components';
import { findDocsFile, readSections, searchDocs, type DocsSection } from './docs';

export interface PdxMcpOptions {
    /** The `llms-full.txt` the `docs` tool searches; found beside the CLI when absent. */
    docsPath?: string;
    /** The version the server reports to its client. */
    version?: string;
}

const TOOLS = [
    {
        name: 'check',
        description: 'Validate the project\'s .pdx files, as `pdx check --json`: every finding with its code, position, hint, '
            + 'and — when it has one — a fix as text edits. `fix: true` applies the fixes and reports the files after.',
        inputSchema: {
            type: 'object',
            properties: {
                files: { type: 'array', items: { type: 'string' }, description: 'Only these files (relative to the project); all when absent' },
                design: { type: 'boolean', description: 'Add the design review (heuristics and cross-file rules)' },
                types: { type: 'boolean', description: 'Add the TypeScript check of scripts and templates (PDX_TS)' },
                fix: { type: 'boolean', description: 'Apply the fixes the findings carry — this WRITES the files' },
            },
        },
    },
    {
        name: 'explain',
        description: 'What a PDX_* diagnostic code means and what to write instead, from the compiler\'s catalog.',
        inputSchema: {
            type: 'object',
            properties: { code: { type: 'string', description: 'The code, e.g. PDX_RAW_INTERPOLATION' } },
            required: ['code'],
        },
    },
    {
        name: 'component',
        description: 'One component\'s API: props (attributes), events, slots, methods, description, and the import the '
            + 'compiler writes for it. Library components from their manifest, project components from their .pdx.',
        inputSchema: {
            type: 'object',
            properties: { tag: { type: 'string', description: 'The tag, e.g. pdx-button' } },
            required: ['tag'],
        },
    },
    {
        name: 'components',
        description: 'Every component available to the project — the libraries\' and its own — as tag and one-line description.',
        inputSchema: {
            type: 'object',
            properties: { query: { type: 'string', description: 'Only components whose tag or description contains every word' } },
        },
    },
    {
        name: 'project',
        description: 'The project manifest, as `pdx analyze --json`: its components with props, events, slots, signals, '
            + 'stores, fetches and forms, and the route table.',
        inputSchema: { type: 'object', properties: {} },
    },
    {
        name: 'docs',
        description: 'The sections of the PDX documentation and component API that best match a query, with their URLs.',
        inputSchema: {
            type: 'object',
            properties: { query: { type: 'string', description: 'What to look for, in words' } },
            required: ['query'],
        },
    },
] as const;

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean };
const answer = (data: unknown): ToolResult => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] });
const refuse = (data: unknown): ToolResult => ({ ...answer(data), isError: true });

/** An MCP server rooted at the project in `cwd`. Connect it to a transport to serve. */
export function createPdxMcpServer(cwd: string, options: PdxMcpOptions = {}): Server {
    const server = new Server(
        { name: 'pdx', version: options.version ?? '0.0.0' },
        { capabilities: { tools: {} } },
    );

    // Read once, when first asked: the library manifests and the docs do not change under a session.
    let packages: Map<string, PackageComponent> | null = null;
    let sections: DocsSection[] | null = null;
    const libraryComponents = () => (packages ??= packageComponents(cwd));
    const docsSections = (): DocsSection[] | null => {
        if (sections) return sections;
        const path = options.docsPath ?? findDocsFile();
        if (!path) return null;
        sections = readSections(readFileSync(path, 'utf-8'));
        return sections;
    };
    // The project is read on every call: the agent is editing it.
    const project = async () => resolveConfig(await loadConfig(cwd), cwd);

    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS.map(t => ({ ...t })) }));

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const args = (request.params.arguments ?? {}) as Record<string, unknown>;
        try {
            switch (request.params.name) {
                case 'check': {
                    const resolved = await project();
                    const files = Array.isArray(args.files) ? args.files.map(String) : undefined;
                    const result = await runCheck(cwd, resolved, { files, design: !!args.design, types: !!args.types, fix: !!args.fix });
                    return answer(checkJson(result));
                }
                case 'explain': {
                    const result = explainCode(String(args.code ?? ''));
                    return result.found
                        ? answer(result.entry)
                        : refuse({ error: `Unknown diagnostic code: ${result.code}`, closest: result.closest });
                }
                case 'component': {
                    const tag = String(args.tag ?? '').trim().toLowerCase();
                    const fromLibrary = libraryComponents().get(tag);
                    if (fromLibrary) return answer(fromLibrary);
                    const { manifest } = await buildProjectManifest(cwd, await project());
                    const own = manifest.components.find(c => c.tag === tag);
                    return own ? answer(own) : refuse({ error: `No component <${tag}> in the project or in its component packages.` });
                }
                case 'components': {
                    const { manifest } = await buildProjectManifest(cwd, await project());
                    return answer(listComponents(libraryComponents(), manifest.components, args.query ? String(args.query) : undefined));
                }
                case 'project': {
                    const { manifest, failed } = await buildProjectManifest(cwd, await project());
                    return answer(failed.length > 0 ? { ...manifest, failed } : manifest);
                }
                case 'docs': {
                    const all = docsSections();
                    if (!all) return refuse({ error: 'The documentation is not bundled with this CLI (llms-full.txt not found).' });
                    return answer(searchDocs(all, String(args.query ?? '')));
                }
                default:
                    return refuse({ error: `Unknown tool: ${request.params.name}` });
            }
        } catch (err) {
            // A config that does not load, a file that cannot be read: the reason goes back to the
            // agent, and the server keeps serving.
            return refuse({ error: (err as Error).message });
        }
    });

    return server;
}
