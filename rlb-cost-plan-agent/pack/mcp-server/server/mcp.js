// @ts-check
/**
 * Wires the toolkit into an MCP server on the TypeScript SDK v2. The factory returns a fresh
 * McpServer per HTTP request (stateless, MCP 2026-07-28) or per stdio connection; both
 * protocol eras (2026-07-28 and the legacy 2025-11-25 initialize flow) use this one factory.
 */
import { McpServer, fromJsonSchema } from '@modelcontextprotocol/server';

/** Largest number of array elements plus object members accepted in one tools/call. */
export const MAX_TOOL_INPUT_ELEMENTS = 4000;

/**
 * @param {ReturnType<typeof import('../core/toolkit.js').createToolkit>} toolkit
 */
export function createServerFactory(toolkit) {
  // Convert the plain JSON Schemas once; tools/list then emits them unchanged.
  const prepared = toolkit.tools.map((t) => ({
    tool: t,
    input: fromJsonSchema(/** @type {any} */ (t.inputSchema)),
    output: fromJsonSchema(/** @type {any} */ (t.outputSchema)),
  }));
  const resourceText = toolkit.readResource().text;

  return function factory() {
    const server = new McpServer(
      { name: toolkit.name, version: toolkit.version },
      { instructions: toolkit.instructions, maxToolInputElements: MAX_TOOL_INPUT_ELEMENTS },
    );
    for (const { tool, input, output } of prepared) {
      server.registerTool(
        tool.name,
        { title: tool.title, description: tool.description, inputSchema: input, outputSchema: output, annotations: tool.annotations },
        async (/** @type {any} */ args) => {
          const r = toolkit.call(tool.name, args);
          if (r.isError) return { isError: true, content: [{ type: 'text', text: r.text }] };
          return {
            // Words first (figure, basis, status), then the same result as JSON text, as the MCP
            // specification recommends when structured content is returned.
            content: [{ type: 'text', text: r.text }, { type: 'text', text: JSON.stringify(r.structured) }],
            structuredContent: r.structured,
          };
        },
      );
    }
    server.registerResource(
      toolkit.resource.name,
      toolkit.resource.uri,
      { title: toolkit.resource.title, description: toolkit.resource.description, mimeType: toolkit.resource.mimeType },
      async (/** @type {URL} */ uri) => ({ contents: [{ uri: uri.href, mimeType: toolkit.resource.mimeType, text: resourceText }] }),
    );
    return server;
  };
}
