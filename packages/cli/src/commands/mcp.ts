// pdx mcp — the CLI as an MCP server over stdio, rooted at the current project.
//
// stdout IS the protocol: nothing else may be written there, so this command logs nothing, and the
// tools it serves return their output rather than printing it.

import { defineCommand } from 'citty';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createPdxMcpServer } from '../mcp/server';
import { findCliPackage } from '../mcp/docs';

export default defineCommand({
    meta: { name: 'mcp', description: 'Serve the CLI to an agent as an MCP server over stdio (check, explain, component, components, project, docs)' },
    async run() {
        const server = createPdxMcpServer(process.cwd(), { version: findCliPackage()?.version });
        await server.connect(new StdioServerTransport());
    },
});
