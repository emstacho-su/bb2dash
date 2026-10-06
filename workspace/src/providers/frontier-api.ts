/**
 * The frontier-API provider: a typed stub. Nothing is connected in v1; a tier routed here is stored
 * as `provider_not_configured`.
 */

import { ProviderNotConfiguredError } from '../errors.js';
import type { Provider, TurnEvent } from './types.js';

export function createFrontierApiProvider(): Provider {
  return {
    id: 'frontier-api',
    runTurn(): AsyncIterable<TurnEvent> {
      throw new ProviderNotConfiguredError('frontier-api');
    },
  };
}
