import { describe, expect, it } from 'vitest';

import { ERROR_CODES, ProviderNotConfiguredError, errorCodeFor } from '../src/errors.js';
import { createFrontierApiProvider } from '../src/providers/frontier-api.js';
import { PROVIDER_IDS, createProviders } from '../src/providers/index.js';
import { createOllamaProvider } from '../src/providers/ollama.js';
import type { Provider, ProviderId, TurnEvent, TurnInput } from '../src/providers/types.js';
import { TIER_ROUTES, TIERS } from '../src/tiers.js';

const INPUT: TurnInput = {
  requestId: '41',
  conversationId: '0b0e7c1e-58a3-4d0b-9d5e-1d2c3b4a5f60',
  model: 'haiku',
  prompt: 'What does the IST.323 syllabus say about late work?',
  history: [],
  claudeSessionId: null,
  budgetUsd: 1,
};

const FAKE_EVENTS: TurnEvent[] = [
  { type: 'delta', text: 'Late work ' },
  { type: 'tool', id: 'toolu_1', call: { tool: 'search_materials', query: 'late work', scope: 'IST.323', ok: true } },
  { type: 'delta', text: 'loses 10% a day.' },
  {
    type: 'result',
    ok: true,
    errorCode: null,
    costUsd: 0.0123,
    claudeSessionId: '5e0c1a52-7d7e-4b8f-9a44-0f6f1f6f0a11',
    model: 'claude-haiku-4-5-20251001',
  },
];

async function* fakeCliTurn(): AsyncIterable<TurnEvent> {
  for (const event of FAKE_EVENTS) yield event;
}

async function collect(events: AsyncIterable<TurnEvent>): Promise<TurnEvent[]> {
  const out: TurnEvent[] = [];
  for await (const event of events) out.push(event);
  return out;
}

describe('the provider seam', () => {
  const providers = createProviders({ claudeCli: fakeCliTurn });

  it('names three providers', () => {
    expect([...PROVIDER_IDS]).toEqual(['claude-cli', 'ollama', 'frontier-api']);
    expect(Object.keys(providers).sort()).toEqual([...PROVIDER_IDS].sort());
  });

  it('gives each provider its own id', () => {
    for (const id of PROVIDER_IDS) expect(providers[id].id).toBe(id);
  });

  it('has a provider for every tier route', () => {
    for (const tier of TIERS) expect(providers[TIER_ROUTES[tier].provider]).toBeDefined();
  });

  it('runs a claude-cli turn through the CLI turn it was given', async () => {
    const provider: Provider = providers['claude-cli'];
    expect(await collect(provider.runTurn(INPUT, new AbortController().signal))).toEqual(FAKE_EVENTS);
  });

  it('hands the CLI turn the input and the abort signal unchanged', async () => {
    const seen: Array<{ input: TurnInput; signal: AbortSignal }> = [];
    const local = createProviders({
      claudeCli: (input, signal) => {
        seen.push({ input, signal });
        return fakeCliTurn();
      },
    });
    const controller = new AbortController();
    await collect(local['claude-cli'].runTurn(INPUT, controller.signal));
    expect(seen).toHaveLength(1);
    expect(seen[0]?.input).toBe(INPUT);
    expect(seen[0]?.signal).toBe(controller.signal);
  });
});

describe('the two stubs', () => {
  const stubs: Array<[ProviderId, Provider]> = [
    ['ollama', createOllamaProvider()],
    ['frontier-api', createFrontierApiProvider()],
  ];

  it.each(stubs)('%s type-checks as a Provider and says it is not connected', (id, provider) => {
    expect(provider.id).toBe(id);
    const run = (): AsyncIterable<TurnEvent> => provider.runTurn(INPUT, new AbortController().signal);
    expect(run).toThrow(ProviderNotConfiguredError);
    try {
      run();
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderNotConfiguredError);
      expect((error as ProviderNotConfiguredError).providerId).toBe(id);
      expect((error as Error).message).toContain(id);
    }
  });

  it.each(stubs)('%s comes out of the registry as the same stub', (id) => {
    const providers = createProviders({ claudeCli: fakeCliTurn });
    expect(() => providers[id].runTurn(INPUT, new AbortController().signal)).toThrow(ProviderNotConfiguredError);
  });

  it('maps the stub error to provider_not_configured', () => {
    expect(errorCodeFor(new ProviderNotConfiguredError('ollama'))).toBe('provider_not_configured');
    expect(errorCodeFor(new Error('anything else'))).toBe('cli_error');
  });
});

describe('the error codes', () => {
  it('are the eight the database checks', () => {
    expect([...ERROR_CODES]).toEqual([
      'budget_exceeded',
      'timeout',
      'stale_claim',
      'provider_not_configured',
      'cli_error',
      'cancelled',
      'usage_limit',
      'sign_in_expired',
    ]);
  });
});
