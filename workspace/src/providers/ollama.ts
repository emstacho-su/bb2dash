/**
 * The local-model provider: a typed stub. Nothing is connected in v1; a tier routed here is stored
 * as `provider_not_configured`.
 */

import { ProviderNotConfiguredError } from '../errors.js';
import type { Provider, TurnEvent } from './types.js';

export function createOllamaProvider(): Provider {
  return {
    id: 'ollama',
    runTurn(): AsyncIterable<TurnEvent> {
      throw new ProviderNotConfiguredError('ollama');
    },
  };
}
