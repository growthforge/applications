#!/usr/bin/env node
// @ts-check
/**
 * stdio entry point, for the MCP Inspector and local agents that launch the server as a
 * subprocess. No token: per the MCP authorization guidance, stdio servers take credentials
 * from their environment, and this one reads only bundled data. Nothing is written to stdout
 * except protocol messages.
 */
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { loadToolkit } from './load.js';
import { createServerFactory } from './mcp.js';

const toolkit = loadToolkit();
serveStdio(createServerFactory(toolkit));
