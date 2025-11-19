/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ContentGenerator } from './contentGenerator.js';

// Based on the types from @google/genai
export interface Part {
  text: string;
}

export interface Content {
  role: 'user' | 'model';
  parts: Part[];
}

export interface GenerateContentParameters {
  contents: Content[];
  model?: string;
}

export interface Candidate {
  content: Content;
}

export interface GenerateContentResponse {
  response: {
    candidates: Candidate[];
  };
}

export interface CountTokensParameters {
  contents: Content[];
  model?: string;
}

export interface CountTokensResponse {
  totalTokens: number;
}

export interface EmbedContentParameters {
  content: Content;
  model?: string;
}

export interface EmbedContentResponse {
  embedding: {
    values: number[];
  };
}


export class LiteLLMContentGenerator implements ContentGenerator {
  constructor(private readonly mcpServerUrl: string) {}

  async generateContent(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<GenerateContentResponse> {
    const { contents, model } = request;
    const prompt = contents.map((content) => {
      return {
        role: content.role,
        content: content.parts.map((part) => part.text).join('\n'),
      };
    });

    const response = await fetch(this.mcpServerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        method: 'tools/call',
        arguments: {
          prompt,
          model,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    return {
      response: {
        candidates: [
          {
            content: {
              parts: [{ text: data.content }],
              role: 'model',
            },
          },
        ],
      },
    } as GenerateContentResponse;
  }

  async *generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
  ): AsyncGenerator<GenerateContentResponse> {
    const { contents, model } = request;
    const prompt = contents.map((content) => {
      return {
        role: content.role,
        content: content.parts.map((part) => part.text).join('\n'),
      };
    });

    const response = await fetch(this.mcpServerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        method: 'tools/call',
        arguments: {
          prompt,
          model,
          stream: true,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        if (buffer) {
          const data = JSON.parse(buffer);
          yield {
            response: {
              candidates: [
                {
                  content: {
                    parts: [{ text: data.content }],
                    role: 'model',
                  },
                },
              ],
            },
          } as GenerateContentResponse;
        }
        break;
      }
      buffer += decoder.decode(value);
      const lines = buffer.split('\n');
      buffer = lines.pop()!;
      for (const line of lines) {
        if (line) {
          const data = JSON.parse(line);
          yield {
            response: {
              candidates: [
                {
                  content: {
                    parts: [{ text: data.content }],
                    role: 'model',
                  },
                },
              ],
            },
          } as GenerateContentResponse;
        }
      }
    }
  }

  async countTokens(
    request: CountTokensParameters,
  ): Promise<CountTokensResponse> {
    const { contents, model } = request;
    const prompt = contents.map((content) => {
      return {
        role: content.role,
        content: content.parts.map((part) => part.text).join('\n'),
      };
    });

    const response = await fetch(this.mcpServerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        method: 'tools/call',
        arguments: {
          prompt,
          model,
          extra_headers: {
            'X-Function-Name': 'count_tokens',
          },
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    return {
      totalTokens: data.totalTokens,
    };
  }

  async embedContent(
    request: EmbedContentParameters,
  ): Promise<EmbedContentResponse> {
    const { content, model } = request;
    const prompt = {
      role: content.role,
      content: content.parts.map((part) => part.text).join('\n'),
    };

    const response = await fetch(this.mcpServerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        method: 'tools/call',
        arguments: {
          prompt,
          model,
          extra_headers: {
            'X-Function-Name': 'embed_content',
          },
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    return {
      embedding: {
        values: data.embedding,
      },
    };
  }
}
