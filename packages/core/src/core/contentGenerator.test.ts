/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import type { ContentGenerator } from './contentGenerator.js';
import {
  createContentGenerator,
  AuthType,
} from './contentGenerator.js';
import type { Config } from '../config/config.js';
import { FakeContentGenerator } from './fakeContentGenerator.js';
import { RecordingContentGenerator } from './recordingContentGenerator.js';
import { LiteLLMContentGenerator } from './liteLLMContentGenerator.js';

vi.mock('./fakeContentGenerator.js');

const mockConfig = {
  getProxy: vi.fn(),
  getMcpServerUrl: vi.fn(),
  getUsageStatisticsEnabled: vi.fn(),
} as unknown as Config;

describe('createContentGenerator', () => {
  it('should create a FakeContentGenerator', async () => {
    const mockGenerator = {} as unknown as ContentGenerator;
    vi.mocked(FakeContentGenerator.fromFile).mockResolvedValue(
      mockGenerator as never,
    );
    const fakeResponsesFile = 'fake/responses.yaml';
    const mockConfigWithFake = {
      fakeResponses: fakeResponsesFile,
    } as unknown as Config;
    const generator = await createContentGenerator(
      {
        authType: AuthType.LITELLM,
      },
      mockConfigWithFake,
    );
    expect(FakeContentGenerator.fromFile).toHaveBeenCalledWith(
      fakeResponsesFile,
    );
    expect(generator).toEqual(mockGenerator);
  });

  it('should create a RecordingContentGenerator', async () => {
    const fakeResponsesFile = 'fake/responses.yaml';
    const recordResponsesFile = 'record/responses.yaml';
    const mockConfigWithRecordResponses = {
      fakeResponses: fakeResponsesFile,
      recordResponses: recordResponsesFile,
    } as unknown as Config;
    const generator = await createContentGenerator(
      {
        authType: AuthType.LITELLM,
      },
      mockConfigWithRecordResponses,
    );
    expect(generator).toBeInstanceOf(RecordingContentGenerator);
  });

  it('should create a LiteLLMContentGenerator when AuthType is LITELLM', async () => {
    const generator = await createContentGenerator(
      {
        authType: AuthType.LITELLM,
      },
      mockConfig,
    );
    expect(generator).toBeInstanceOf(LiteLLMContentGenerator);
  });
});
