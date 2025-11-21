/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Import EVERYTHING from the SDK
import type {
  GenerateContentResponse,
  CountTokensResponse,
  EmbedContentResponse,
  GenerateContentParameters,
  CountTokensParameters,
  EmbedContentParameters,
} from '@google/genai';

import type { Config } from '../config/config.js';
import type { UserTierId } from '../code_assist/types.js';
import { FakeContentGenerator } from './fakeContentGenerator.js';
import { RecordingContentGenerator } from './recordingContentGenerator.js';
import { LiteLLMContentGenerator } from './liteLLMContentGenerator.js';

export type {
  GenerateContentParameters,
  CountTokensParameters,
  EmbedContentParameters,
};

export interface ContentGenerator {
  generateContent(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<GenerateContentResponse>;

  generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>>;

  countTokens(request: CountTokensParameters): Promise<CountTokensResponse>;

  embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse>;

  userTier?: UserTierId;
}

export enum AuthType {
  LITELLM = 'litellm',
  LOGIN_WITH_GOOGLE = 'login_with_google',
  USE_GEMINI = 'use_gemini',
  USE_VERTEX_AI = 'use_vertex_ai',
  COMPUTE_ADC = 'compute_adc',
  LEGACY_CLOUD_SHELL = 'legacy_cloud_shell',
}

export type ContentGeneratorConfig = {
  authType?: AuthType;
  mcpServerUrl?: string;
  apiKey?: string;
  vertexai?: boolean;
  proxy?: string;
};

export async function createContentGeneratorConfig(
  config: Config,
  authType: AuthType | undefined,
): Promise<ContentGeneratorConfig> {
  return {
    authType: authType || AuthType.LITELLM,
    mcpServerUrl:
      config?.getLiteLLMMcpServerUrl?.() || 'http://127.0.0.1:8000/mcp',
    proxy: config?.getProxy(),
  };
}

export async function createContentGenerator(
  config: ContentGeneratorConfig,
  gcConfig: Config,
  _sessionId?: string,
): Promise<ContentGenerator> {
  const generator = await (async () => {
    if (gcConfig.fakeResponses) {
      return FakeContentGenerator.fromFile(gcConfig.fakeResponses);
    }

    // --- FIX: Hijack the default logic ---
    if (
      config.authType === AuthType.LITELLM ||
      config.authType === AuthType.USE_GEMINI ||
      !config.authType
    ) {
      console.log(
        '\x1b[33m%s\x1b[0m',
        '[DEBUG] 🔧 Factory: Hijacking request to use LiteLLMContentGenerator',
      );
      return new LiteLLMContentGenerator(
        config.mcpServerUrl || 'http://127.0.0.1:8000/mcp',
      );
    }

    throw new Error(
      `Error creating contentGenerator: Unsupported authType: ${config.authType}`,
    );
  })();

  if (gcConfig.recordResponses) {
    return new RecordingContentGenerator(generator, gcConfig.recordResponses);
  }

  return generator;
}
