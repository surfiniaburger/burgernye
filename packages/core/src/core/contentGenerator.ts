/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CountTokensResponse,
  GenerateContentResponse,
  GenerateContentParameters,
  CountTokensParameters,
  EmbedContentResponse,
  EmbedContentParameters,
} from './liteLLMContentGenerator';
import type { Config } from '../config/config.js';

import type { UserTierId } from '../code_assist/types.js';
import { FakeContentGenerator } from './fakeContentGenerator.js';
import { RecordingContentGenerator } from './recordingContentGenerator.js';
import { LiteLLMContentGenerator } from './liteLLMContentGenerator.js';

/**
 * Interface abstracting the core functionalities for generating content and counting tokens.
 */
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
}

export type ContentGeneratorConfig = {
  apiKey?: string;
  vertexai?: boolean;
  authType?: AuthType;
  proxy?: string;
  mcpServerUrl?: string;
};

export async function createContentGeneratorConfig(
  config: Config,
  authType: AuthType | undefined,
): Promise<ContentGeneratorConfig> {
  const contentGeneratorConfig: ContentGeneratorConfig = {
    authType,
    proxy: config?.getProxy(),
    mcpServerUrl:
      authType === AuthType.LITELLM
        ? config?.getLiteLLMMcpServerUrl()
        : config?.getMcpServerUrl(),
  };

  return contentGeneratorConfig;
}

export async function createContentGenerator(
  config: ContentGeneratorConfig,
  gcConfig: Config,
  sessionId?: string,
): Promise<ContentGenerator> {
  const generator = await (async () => {
    if (gcConfig.fakeResponses) {
      return FakeContentGenerator.fromFile(gcConfig.fakeResponses);
    }

    if (config.authType === AuthType.LITELLM) {
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
