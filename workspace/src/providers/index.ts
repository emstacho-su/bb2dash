/** The provider registry: one provider per id, the claude CLI connected and two stubs. */

import { createClaudeCliProvider, type CliTurn } from './claude-cli.js';
import { createFrontierApiProvider } from './frontier-api.js';
import { createOllamaProvider } from './ollama.js';
import type { Provider, ProviderId } from './types.js';

export const PROVIDER_IDS = ['claude-cli', 'ollama', 'frontier-api'] as const satisfies readonly ProviderId[];

export interface ProviderDeps {
  /** How one turn of the claude CLI runs: the real process in the container, a replay in tests. */
  readonly claudeCli: CliTurn;
}

export type Providers = Readonly<Record<ProviderId, Provider>>;

export function createProviders(deps: ProviderDeps): Providers {
  return Object.freeze({
    'claude-cli': createClaudeCliProvider(deps.claudeCli),
    ollama: createOllamaProvider(),
    'frontier-api': createFrontierApiProvider(),
  });
}
