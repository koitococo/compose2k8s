import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolve, join } from 'node:path';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { stringify as toYaml } from 'yaml';
import { loadConfigFile } from '../../src/config/loader.js';
import { parseComposeFile } from '../../src/parser/compose.js';
import { analyzeProject } from '../../src/analyzer/index.js';
import type { AnalysisResult } from '../../src/types/analysis.js';

const tmpDir = resolve('/tmp/compose2k8s-config-test');
const fixturesDir = resolve(import.meta.dirname, '../fixtures');

let analysis: AnalysisResult;

beforeEach(async () => {
  await mkdir(tmpDir, { recursive: true });
  const parseResult = await parseComposeFile({
    file: resolve(fixturesDir, 'basic-compose.yml'),
  });
  analysis = analyzeProject(parseResult.project);
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

async function writeConfig(data: Record<string, unknown>): Promise<string> {
  const configPath = join(tmpDir, 'config.yml');
  await writeFile(configPath, toYaml(data), 'utf-8');
  return configPath;
}

describe('loadConfigFile', () => {
  it('loads minimal config and uses analysis defaults', async () => {
    const configPath = await writeConfig({ services: ['api', 'db'] });
    const { config, warnings } = await loadConfigFile(configPath, analysis);

    expect(config.selectedServices).toEqual(['api', 'db']);
    expect(config.deploy.namespace).toBe('default');
    expect(config.deploy.imagePullPolicy).toBe('IfNotPresent');
    expect(config.initContainers).toBe('wait-for-port');
    expect(warnings).toEqual([]);
  });

  it('loads full config with ingress, secrets, storage, deploy', async () => {
    const configPath = await writeConfig({
      services: ['api'],
      ingress: {
        domain: 'app.example.com',
        tls: true,
        certManager: true,
        controller: 'nginx',
        routes: [{ service: 'api', path: '/', port: 3000 }],
      },
      secrets: {
        api: { NODE_ENV: 'secret' },
      },
      storage: [
        { volume: 'pgdata', size: '20Gi' },
      ],
      initContainers: 'none',
      deploy: {
        namespace: 'myapp',
        migrationScripts: false,
      },
    });

    const { config, warnings } = await loadConfigFile(configPath, analysis);

    expect(config.selectedServices).toEqual(['api']);
    expect(config.ingress.enabled).toBe(true);
    expect(config.ingress.domain).toBe('app.example.com');
    expect(config.ingress.tls).toBe(true);
    expect(config.ingress.routes[0].serviceName).toBe('api');
    expect(config.envClassification.api.NODE_ENV).toBe('secret');
    expect(config.storageConfig.find((s) => s.volumeName === 'pgdata')?.size).toBe('20Gi');
    expect(config.initContainers).toBe('none');
    expect(config.deploy.namespace).toBe('myapp');
    expect(config.deploy.migrationScripts).toBe(false);
    expect(warnings).toEqual([]);
  });

  it('warns on unknown service name', async () => {
    const configPath = await writeConfig({ services: ['api', 'nonexistent'] });
    const { config, warnings } = await loadConfigFile(configPath, analysis);

    expect(config.selectedServices).toEqual(['api']);
    expect(warnings).toContain('Unknown service "nonexistent" in config — skipping.');
  });

  it('warns on unknown env var in secrets', async () => {
    const configPath = await writeConfig({
      secrets: { api: { UNKNOWN_VAR: 'secret' } },
    });
    const { warnings } = await loadConfigFile(configPath, analysis);

    expect(warnings.some((w) => w.includes('UNKNOWN_VAR'))).toBe(true);
  });

  it('throws on missing config file', async () => {
    await expect(
      loadConfigFile('/tmp/nonexistent-config.yml', analysis),
    ).rejects.toThrow();
  });

  it('handles empty config file', async () => {
    const configPath = join(tmpDir, 'empty.yml');
    await writeFile(configPath, '', 'utf-8');

    const { config } = await loadConfigFile(configPath, analysis);
    expect(config.selectedServices).toEqual(Object.keys(analysis.services));
    expect(config.deploy.namespace).toBe('default');
  });
});
