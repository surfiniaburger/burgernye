/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ContentGenerator } from './contentGenerator.js';
import type {
  GenerateContentResponse,
  CountTokensResponse,
  EmbedContentResponse,
  GenerateContentParameters,
  CountTokensParameters,
  EmbedContentParameters,
  Content,
  Part,
  Tool,
  FunctionCall,
} from '@google/genai';

interface GeminiCliRequest extends GenerateContentParameters {
  tools?: Tool[];
  config?: { tools?: Tool[]; [key: string]: unknown };
}

interface ToolPart extends Part {
  functionCall?: FunctionCall;
  functionResponse?: { name: string; response: Record<string, unknown> };
}

export class LiteLLMContentGenerator implements ContentGenerator {
  constructor(
    private readonly mcpServerUrl: string = 'http://127.0.0.1:8000/mcp',
  ) {}

  private isContent(item: unknown): item is Content {
    return !!(item && typeof item === 'object' && 'parts' in item);
  }

  private resolveModel(inputModel?: string): string {
    if (!inputModel || inputModel === 'default-model') {
      return 'ollama/gpt-oss:120b-cloud';
    }
    return inputModel;
  }

  private formatPrompt(
    contents: GenerateContentParameters['contents'],
  ): string {
    if (typeof contents === 'string') return contents;
    if (Array.isArray(contents)) {
      return contents
        .map((item) => {
          if (typeof item === 'string') return item;
          if (this.isContent(item)) {
            const role = item.role || 'user';
            const parts = item.parts || [];
            const stringifiedParts = parts
              .map((p) => {
                const part = p as ToolPart;
                if (part.text) return part.text;
                if (part.functionCall)
                  return `\n[Action: Call Tool ${part.functionCall.name} with args ${JSON.stringify(part.functionCall.args)}]`;
                if (part.functionResponse)
                  return `\n[Action Result: ${JSON.stringify(part.functionResponse.response)}]`;
                return '';
              })
              .join(' ');
            return stringifiedParts ? `${role}: ${stringifiedParts}` : '';
          }
          if (item && typeof item === 'object' && 'text' in item)
            return (item as Part).text || '';
          return '';
        })
        .join('\n')
        .trim();
    }
    return JSON.stringify(contents);
  }

  private mapTools(geminiTools?: Tool[]): unknown[] | undefined {
    if (!geminiTools || geminiTools.length === 0) return undefined;
    const openaiTools: unknown[] = [];
    for (const t of geminiTools) {
      if (t.functionDeclarations) {
        for (const fn of t.functionDeclarations) {
          openaiTools.push({
            type: 'function',
            function: {
              name: fn.name,
              description: fn.description,
              parameters: fn.parameters,
            },
          });
        }
      }
    }
    return openaiTools.length > 0 ? openaiTools : undefined;
  }

  async generateContent(
    request: GenerateContentParameters,
    _userPromptId: string,
  ): Promise<GenerateContentResponse> {
    const cliRequest = request as unknown as GeminiCliRequest;
    const { contents, model } = request;

    let tools = cliRequest.tools;
    if (!tools && cliRequest.config?.tools) tools = cliRequest.config.tools;

    const prompt = this.formatPrompt(contents);
    const targetModel = this.resolveModel(model);
    const openAITools = this.mapTools(tools);

    try {
      const response = await fetch(this.mcpServerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: 'tools/call',
          arguments: { prompt, model: targetModel, tools: openAITools },
        }),
      });

      if (!response.ok)
        throw new Error(`LiteLLM Server Error: ${response.status}`);
      const data = await response.json();
      if (data.error) throw new Error(`LiteLLM Backend Error: ${data.error}`);

      const parts: Part[] = [];

      // --- CRITICAL CHANGE: Prioritize Tools Over Text ---
      const hasToolCalls =
        data.tool_calls &&
        Array.isArray(data.tool_calls) &&
        data.tool_calls.length > 0;

      if (hasToolCalls) {
        // If we have a tool call, IGNORE content. Send ONLY the function call.
        console.log(
          `[DEBUG] 🛠️ Processing ${data.tool_calls.length} tool calls (Stripping text)`,
        );
        for (const tc of data.tool_calls) {
          parts.push({
            functionCall: {
              name: tc.name,
              args: tc.arguments,
            },
          });
        }
      } else {
        // Only send text if there are NO tool calls
        if (data.content) {
          parts.push({ text: data.content });
        }
      }
      // --------------------------------------------------

      // Safety: If absolutely nothing, return ellipses to prevent UI hang
      if (parts.length === 0) parts.push({ text: '...' });

      // --- FINAL DEBUG LOG ---
      console.log(
        '[DEBUG] FINAL PARTS SENT TO CLI:',
        JSON.stringify(parts, null, 2),
      );
      // ----------------------

      const finalResponse = {
        candidates: [
          {
            content: { parts, role: 'model' },
            finishReason: 'STOP',
            index: 0,
          },
        ],
      } as GenerateContentResponse;

      return finalResponse;
    } catch (error) {
      console.error(error);
      throw error;
    }
  }

  async generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    const result = await this.generateContent(request, userPromptId);
    async function* gen() {
      yield result;
    }
    return gen();
  }

  async countTokens(
    _request: CountTokensParameters,
  ): Promise<CountTokensResponse> {
    return { totalTokens: 0 };
  }

  async embedContent(
    _request: EmbedContentParameters,
  ): Promise<EmbedContentResponse> {
    return { embeddings: [] } as unknown as EmbedContentResponse;
  }
}
