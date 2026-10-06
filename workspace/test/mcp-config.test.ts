import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { PATHS } from '../src/config.js';
import { MCP_CONFIG_MODE, buildMcpConfig, mcpConfigText, writeMcpConfig } from '../src/mcp-config.js';

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
    expect(PATHS.mcpConfig).toBe('/run/workspace/mcp.json');
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

describe('the MCP config', () => {
  const config = buildMcpConfig();

  it('holds exactly bb2dash and rag', () => {
    expect(Object.keys(config)).toEqual(['mcpServers']);
    expect(Object.keys(config.mcpServers).sort()).toEqual(['bb2dash', 'rag']);
  });

  it('starts the materials server by path, its key named by file', () => {
    expect(config.mcpServers.bb2dash).toEqual({
      command: 'node',
      args: ['/app/mcp-materials/dist/index.js'],
      env: {
        SUPABASE_URL: 'https://goultdzqcavefcgnifdy.supabase.co',
        SUPABASE_SERVICE_ROLE_FILE: '/run/secrets/bb2dash_mcp_service_key',
      },
    });
  });

  it('starts the notes server through its launcher, with no env at all', () => {
    expect(config.mcpServers.rag).toEqual({ command: 'bash', args: ['/app/mcp-rag/mcp-rag.sh'] });
    expect('env' in config.mcpServers.rag).toBe(false);
  });

  it('holds paths only: no DSN, no key and no token shape', () => {
    const text = mcpConfigText();
    expect(text).not.toMatch(/postgres(ql)?:\/\//);
    expect(text).not.toMatch(/sb_secret_/);
    expect(text).not.toMatch(/eyJ/);
    expect(text).not.toMatch(/sk-ant-/);
    expect(text).not.toMatch(/DATABASE_URL/);
    expect(JSON.parse(text)).toEqual(config);
  });

  it('is the same on every call and cannot be changed by a caller', () => {
    expect(buildMcpConfig()).toEqual(config);
    expect(Object.isFrozen(config.mcpServers.bb2dash)).toBe(true);
    expect(Object.isFrozen(config.mcpServers.bb2dash.env)).toBe(true);
  });
});

describe('writeMcpConfig', () => {
  it('writes the config as JSON to the path it is given', () => {
    const file = path.join(tempDir(), 'mcp.json');
    writeMcpConfig(file);
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual(buildMcpConfig());
    expect(fs.readFileSync(file, 'utf8')).toBe(mcpConfigText());
  });

  it('asks for mode 0600', () => {
    expect(MCP_CONFIG_MODE).toBe(0o600);
    const calls: Array<{ what: string; file: string; mode: unknown }> = [];
    writeMcpConfig('/run/workspace/mcp.json', {
      writeFileSync: (file, _text, options) => calls.push({ what: 'write', file, mode: options.mode }),
      chmodSync: (file, mode) => calls.push({ what: 'chmod', file, mode }),
    });
    expect(calls).toEqual([
      { what: 'write', file: '/run/workspace/mcp.json', mode: 0o600 },
      { what: 'chmod', file: '/run/workspace/mcp.json', mode: 0o600 },
    ]);
  });

  it('writes to the in-image path by default', () => {
    const files: string[] = [];
    writeMcpConfig(undefined, { writeFileSync: (file) => files.push(file), chmodSync: () => undefined });
    expect(files).toEqual([PATHS.mcpConfig]);
  });

  it('replaces a file that is already there', () => {
    const file = path.join(tempDir(), 'mcp.json');
    fs.writeFileSync(file, 'stale');
    writeMcpConfig(file);
    expect(fs.readFileSync(file, 'utf8')).toBe(mcpConfigText());
  });
});
