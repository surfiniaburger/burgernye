/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { LiteLLMContentGenerator } from './liteLLMContentGenerator.js';
import nock from 'nock';
import { describe, it, expect } from 'vitest';

describe('LiteLLMContentGenerator', () => {
  it('should send a message to the MCP server', async () => {
    const scope = nock('http://127.0.0.1:8000')
      .post('/mcp', {
        method: 'tools/call',
        arguments: {
          prompt: [{ role: 'user', content: 'hello' }],
          model: 'test-model',
        },
      })
      .reply(200, {
        content: 'hello from the mock server',
      });

    const generator = new LiteLLMContentGenerator('http://127.0.0.1:8000/mcp');
    const response = await generator.generateContent(
      {
        contents: [
          {
            role: 'user',
            parts: [{ text: 'hello' }],
          },
        ],
        model: 'test-model',
      },
      'test-session-id',
    );

    expect(response.response.candidates[0].content.parts[0].text).toBe(
      'hello from the mock server',
    );
    scope.done();
  });

  it('should stream a message from the MCP server', async () => {
    const scope = nock('http://127.0.0.1:8000')
      .post('/mcp', {
        method: 'tools/call',
        arguments: {
          prompt: [{ role: 'user', content: 'hello' }],
          model: 'test-model',
          stream: true,
        },
      })
      .reply(200, '{"content": "hello "}\n{"content": "from the "}\n{"content": "mock server"}');

    const generator = new LiteLLMContentGenerator('http://127.0.0.1:8000/mcp');
    const response = generator.generateContentStream(
      {
        contents: [
          {
            role: 'user',
            parts: [{ text: 'hello' }],
          },
        ],
        model: 'test-model',
      },
      'test-session-id',
    );

    const chunks = [];
    for await (const chunk of response) {
      chunks.push(chunk);
    }

    expect(chunks).toHaveLength(3);
    expect(chunks[0].response.candidates[0].content.parts[0].text).toBe('hello ');
    expect(chunks[1].response.candidates[0].content.parts[0].text).toBe('from the ');
    expect(chunks[2].response.candidates[0].content.parts[0].text).toBe('mock server');
    scope.done();
  });

  it('should count tokens using the MCP server', async () => {
    const scope = nock('http://127.0.0.1:8000')
      .post('/mcp', {
        method: 'tools/call',
        arguments: {
          prompt: [{ role: 'user', content: 'hello' }],
          model: 'test-model',
          extra_headers: {
            'X-Function-Name': 'count_tokens',
          },
        },
      })
      .reply(200, {
        totalTokens: 1,
      });

    const generator = new LiteLLMContentGenerator('http://127.0.0.1:8000/mcp');
    const response = await generator.countTokens(
      {
        contents: [
          {
            role: 'user',
            parts: [{ text: 'hello' }],
          },
        ],
        model: 'test-model',
      },
    );

    expect(response.totalTokens).toBe(1);
    scope.done();
  });

  it('should embed content using the MCP server', async () => {
    const scope = nock('http://127.0.0.1:8000')
      .post('/mcp', {
        method: 'tools/call',
        arguments: {
          prompt: { role: 'user', content: 'hello' },
          model: 'test-model',
          extra_headers: {
            'X-Function-Name': 'embed_content',
          },
        },
      })
      .reply(200, {
        embedding: [1, 2, 3],
      });

    const generator = new LiteLLMContentGenerator('http://127.0.0.1:8000/mcp');
    const response = await generator.embedContent(
      {
        content: {
          role: 'user',
          parts: [{ text: 'hello' }],
        },
        model: 'test-model',
      },
    );

    expect(response.embedding.values).toEqual([1, 2, 3]);
    scope.done();
  });
});
