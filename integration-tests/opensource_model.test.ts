/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TestRig } from './test-helper.js';
import { createMockMCPServer } from './mock-mcp-server.js';
import * as http from 'http';

describe('ask_opensource_model', () => {
  let server: http.Server;
  const port = 8080;

  beforeAll(() => {
    server = createMockMCPServer(port);
  });

  afterAll(() => {
    server.close();
  });

  it('should be able to call the ask_opensource_model tool', async () => {
    const rig = new TestRig();
    await rig.setup('should be able to call the ask_opensource_model tool', {
      'settings.json': JSON.stringify({
        mcpServers: {
          mock_server: {
            httpUrl: `http://localhost:${port}/mcp`,
          },
        },
      }),
    });

    const prompt = `use the ask_opensource_model tool to tell me the capital of france`;

    const result = await rig.run(prompt);

    const foundToolCall = await rig.waitForToolCall('ask_opensource_model');

    expect(foundToolCall).toBe(true);
    expect(result).toContain('Paris');
  });
});
