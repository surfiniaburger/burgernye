/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// File for 'gemini litellm list' command
import type { CommandModule } from 'yargs';
import { loadSettings } from '../../config/settings.js';
import { debugLogger } from '@google/gemini-cli-core';

export async function listLiteLLMServers(): Promise<void> {
  const settings = loadSettings();
  const litellmServers = settings.merged.litellm?.servers || {};
  const serverNames = Object.keys(litellmServers);

  if (serverNames.length === 0) {
    debugLogger.log('No LiteLLM servers configured.');
    return;
  }

  debugLogger.log('Configured LiteLLM servers:\n');

  for (const serverName of serverNames) {
    const server = litellmServers[serverName];
    // For now, just list the server information.
    // In the future, we can add connection testing.
    let serverInfo = serverName + ': ';
    if (server.url) {
      serverInfo += `${server.url}`;
    }

    debugLogger.log(`- ${serverInfo}`);
  }
}

export const listCommand: CommandModule = {
  command: 'list',
  describe: 'List all configured LiteLLM servers',
  handler: async () => {
    await listLiteLLMServers();
  },
};
