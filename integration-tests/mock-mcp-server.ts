/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as http from 'http';

export function createMockMCPServer(port: number) {
  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/mcp') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        mcp_version: '0.1.0',
        capabilities: {
          tools: {
            list: true,
            call: true,
          },
        },
      }));
    } else if (req.method === 'POST' && req.url === '/mcp') {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      req.on('end', () => {
        const request = JSON.parse(body);
        if (request.method === 'tools/list') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            tools: [
              {
                name: 'ask_opensource_model',
                description: 'Ask a question to an open-source large language model.',
                inputSchema: {
                  type: 'object',
                  properties: {
                    prompt: {
                      type: 'string',
                      description: 'The question to ask the model.',
                    },
                  },
                  required: ['prompt'],
                },
              },
            ],
          }));
        } else if (request.method === 'tools/call') {
          if (request.name === 'ask_opensource_model') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              content: 'Paris',
            }));
          } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Tool not found' }));
          }
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Method not found' }));
        }
      });
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  });

  server.listen(port);

  return server;
}
