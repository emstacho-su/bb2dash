import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { PATHS } from '../src/config.js';
import {
  MCP_CONFIG_MODE,
  buildMcpConfig,
  buildNoServerConfig,
  configText,
  removeRequestConfig,
  requestConfigPath,
  turnLimits,
  writeNoServerConfig,
  writeRequestConfig,
} from '../src/mcp-config.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SETTINGS = path.resolve(HERE, '..', 'claude', 'settings.json');

const temps: string[] = [];

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'w64-mcp-'));
  temps.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of temps.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('the in-image layout (the seam with the image)', () => {
  it('names the runner package paths', () => {
    expect(PATHS.runDir).toBe('/run/workspace');
    expect(PATHS.mcpNone).toBe('/run/workspace/mcp-none.json');
    expect(PATHS.batchEntry).toBe('/app/mcp-materials/dist/batch.js');
    expect(PATHS.promptsDir).toBe('/app/workspace/prompts');
    expect('mcpConfig' in PATHS).toBe(false);
    expect(PATHS.aliveFile).toBe('/run/workspace/alive');
    expect(PATHS.settings).toBe('/app/workspace/claude/settings.json');
    expect(PATHS.systemPrompt).toBe('/app/workspace/prompts/system.md');
    expect(PATHS.turnCwd).toBe('/app/turn');
    expect(PATHS.runnerDbUrlSecret).toBe('/run/secrets/workspace_runner_db_url');
    expect(PATHS.oauthTokenSecret).toBe('/run/secrets/claude_oauth_token');
  });

  it('wires the hook command the image builds', () => {
    const settings = JSON.parse(fs.readFileSync(SETTINGS, 'utf8')) as {
      hooks: { PreToolUse: Array<{ hooks: Array<{ command: string }> }> };
    };
    expect(settings.hooks.PreToolUse[0]?.hooks[0]?.command).toBe('node /app/workspace/dist/hooks/tool-gate.js');
  });

  it('builds the three entry files the image runs', () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(HERE, '..', 'package.json'), 'utf8')) as { scripts: Record<string, string>; type: string };
    const tsconfig = JSON.parse(fs.readFileSync(path.resolve(HERE, '..', 'tsconfig.json'), 'utf8')) as {
      compilerOptions: { rootDir: string; outDir: string };
      include: string[];
    };
    expect(pkg.type).toBe('module');
    expect(pkg.scripts.build).toBe('tsc -p tsconfig.json');
    expect(tsconfig.compilerOptions.rootDir).toBe('src');
    expect(tsconfig.compilerOptions.outDir).toBe('dist');
    expect(tsconfig.include).toEqual(['src/**/*.ts']);
    for (const source of ['runner.ts', 'healthcheck.ts', path.join('hooks', 'tool-gate.ts')]) {
      expect(fs.existsSync(path.resolve(HERE, '..', 'src', source)), source).toBe(true);
    }
  });
});

describe('the answering turn MCP config', () => {
  const limits = turnLimits(true, ['BIO.110', 'BIO.110.lab']);
  const config = buildMcpConfig(limits);

  it('holds exactly one server, bb2dash: the notes server is gone', () => {
    expect(Object.keys(config)).toEqual(['mcpServers']);
    expect(Object.keys(config.mcpServers)).toEqual(['bb2dash']);
    expect(JSON.stringify(config)).not.toContain('rag');
  });

  it('starts the materials server by path, its key named by file, with the turn limits in its env', () => {
    expect(config.mcpServers.bb2dash).toEqual({
      command: 'node',
      args: ['/app/mcp-materials/dist/index.js'],
      env: {
        SUPABASE_URL: 'https://goultdzqcavefcgnifdy.supabase.co',
        SUPABASE_SERVICE_ROLE_FILE: '/run/secrets/bb2dash_mcp_service_key',
        BB2DASH_MAX_SEARCHES: '3',
        BB2DASH_MAX_READS: '10',
        BB2DASH_COURSES: 'BIO.110,BIO.110.lab',
      },
    });
  });

  it('allows 3 searches after a planning turn and 4 without one, and 10 reads either way', () => {
    expect(turnLimits(true, null)).toEqual({ maxSearches: 3, maxReads: 10, courses: null });
    expect(turnLimits(false, null)).toEqual({ maxSearches: 4, maxReads: 10, courses: null });
  });

  it('names no course when the request has no scope', () => {
    for (const courses of [null, []]) {
      const env = buildMcpConfig(turnLimits(true, courses)).mcpServers.bb2dash?.env ?? {};
      expect('BB2DASH_COURSES' in env).toBe(false);
    }
  });

  it('holds paths and numbers only: no DSN, no key and no token shape', () => {
    const text = configText(config);
    expect(text).not.toMatch(/postgres(ql)?:\/\//);
    expect(text).not.toMatch(/sb_secret_/);
    expect(text).not.toMatch(/eyJ/);
    expect(text).not.toMatch(/sk-ant-/);
    expect(text).not.toMatch(/DATABASE_URL/);
    expect(JSON.parse(text)).toEqual(config);
  });
});

describe('the config with no server', () => {
  it('names no server at all', () => {
    expect(buildNoServerConfig()).toEqual({ mcpServers: {} });
    expect(configText(buildNoServerConfig())).toBe('{\n  "mcpServers": {}\n}\n');
  });

  it('is written at start to /run/workspace/mcp-none.json, mode 0600', () => {
    const calls: Array<{ what: string; file: string; mode: unknown }> = [];
    writeNoServerConfig(undefined, {
      writeFileSync: (file, _text, options) => calls.push({ what: 'write', file, mode: options.mode }),
      chmodSync: (file, mode) => calls.push({ what: 'chmod', file, mode }),
    });
    expect(MCP_CONFIG_MODE).toBe(0o600);
    expect(calls).toEqual([
      { what: 'write', file: '/run/workspace/mcp-none.json', mode: 0o600 },
      { what: 'chmod', file: '/run/workspace/mcp-none.json', mode: 0o600 },
    ]);
  });
});

describe('a request config file', () => {
  it('is /run/workspace/mcp-<request id>.json', () => {
    expect(requestConfigPath('4812')).toBe('/run/workspace/mcp-4812.json');
  });

  it.each([['../etc/passwd'], ['41/../x'], ['0'], ['07'], [''], ['4 1'], ['41.json']])('never turns %j into a path', (id) => {
    expect(() => requestConfigPath(id)).toThrow(/request id/);
  });

  it('is written with mode 0600, holds the config, and is removed after the turn', () => {
    const dir = tempDir();
    const file = writeRequestConfig('77', turnLimits(false, ['MAT.221']), dir);
    expect(file).toBe(`${dir}/mcp-77.json`);
    const written = JSON.parse(fs.readFileSync(file, 'utf8')) as ReturnType<typeof buildMcpConfig>;
    expect(written).toEqual(buildMcpConfig(turnLimits(false, ['MAT.221'])));
    if (process.platform !== 'win32') expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    removeRequestConfig(file);
    expect(fs.existsSync(file)).toBe(false);
    expect(() => removeRequestConfig(file)).not.toThrow();
  });

  it('asks for the mode on the write and again on the chmod', () => {
    const calls: Array<{ what: string; file: string; mode: unknown }> = [];
    writeRequestConfig('9', turnLimits(true, null), '/run/workspace', {
      writeFileSync: (file, _text, options) => calls.push({ what: 'write', file, mode: options.mode }),
      chmodSync: (file, mode) => calls.push({ what: 'chmod', file, mode }),
    });
    expect(calls).toEqual([
      { what: 'write', file: '/run/workspace/mcp-9.json', mode: 0o600 },
      { what: 'chmod', file: '/run/workspace/mcp-9.json', mode: 0o600 },
    ]);
  });
});
