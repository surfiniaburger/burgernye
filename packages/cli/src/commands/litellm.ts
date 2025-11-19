/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// File for 'gemini litellm' command
import type { CommandModule, Argv } from 'yargs';
import { listCommand } from './litellm/list.js';

export const litellmCommand: CommandModule = {
  command: 'litellm',
  describe: 'Manage LiteLLM servers',
  builder: (yargs: Argv) =>
    yargs
      .command(listCommand)
      .demandCommand(1, 'You need at least one command before continuing.')
      .version(false),
  handler: () => {
    // yargs will automatically show help if no subcommand is provided
    // thanks to demandCommand(1) in the builder.
  },
};
