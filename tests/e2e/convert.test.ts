import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolve, join } from 'node:path';
import { readFile, rm, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { parseComposeFile } from '../../src/parser/compose.js';
import { analyzeProject } from '../../src/analyzer/index.js';
import { generateManifests } from '../../src/generator/index.js';
import { generateDefaults } from '../../src/interactive/defaults.js';
import { writeOutput } from '../../src/output/index.js';

const fixturesDir = resolve(import.meta.dirname, '../fixtures');

async function runConversion(fixture: string, outputDir: string) {
  const composeFile = resolve(fixturesDir, fixture);
  const parseResult = await parseComposeFile({ file: composeFile });
  const analysis = analyzeProject(parseResult.project);
  const config = generateDefaults(analysis, { outputDir });
  const output = generateManifests({ analysis, config, composeFile });
  await writeOutput(output, config);
  return { parseResult, analysis, config, output };
}

describe('E2E: convert pipeline', () => {
  const outputDir = resolve('/tmp/compose2k8s-test-e2e');

  beforeEach(async () => {
    if (existsSync(outputDir)) {
      await rm(outputDir, { recursive: true });
    }
  });

  afterEach(async () => {
    if (existsSync(outputDir)) {
      await rm(outputDir, { recursive: true });
    }
  });

  it('converts basic-compose.yml end-to-end', async () => {
    const { output } = await runConversion('basic-compose.yml', outputDir);

    // Check manifests were generated
    expect(output.manifests.length).toBeGreaterThan(0);

    // Check files were written
    const files = await readdir(outputDir);
    expect(files).toContain('README.md');
    expect(files.some((f) => f.endsWith('.yaml'))).toBe(true);

    // Validate each YAML file
    for (const file of files.filter((f) => f.endsWith('.yaml'))) {
      const content = await readFile(join(outputDir, file), 'utf-8');
      const parsed = parseYaml(content);
      expect(parsed).toHaveProperty('apiVersion');
      expect(parsed).toHaveProperty('kind');
      expect(parsed).toHaveProperty('metadata.name');
    }
  });

  it('produces correct workload types', async () => {
    const { output } = await runConversion('basic-compose.yml', outputDir);

    const kinds = output.manifests.map((m) => `${m.serviceName}:${m.manifest.kind}`);
    expect(kinds).toContain('web:Deployment');
    expect(kinds).toContain('api:Deployment');
    expect(kinds).toContain('db:StatefulSet');
  });

  it('generates secrets with REPLACE_ME placeholders', async () => {
    const { output } = await runConversion('basic-compose.yml', outputDir);

    const secrets = output.manifests.filter((m) => m.manifest.kind === 'Secret');
    expect(secrets.length).toBeGreaterThan(0);

    for (const secret of secrets) {
      const data = secret.manifest.stringData as Record<string, string>;
      for (const value of Object.values(data)) {
        expect(value).toBe('REPLACE_ME');
      }
    }
  });

  it('converts wordpress-compose.yml', async () => {
    const { output, analysis } = await runConversion('wordpress-compose.yml', outputDir);

    expect(analysis.services.wordpress.category).toBe('web');
    expect(analysis.services.mysql.category).toBe('database');
    expect(analysis.services.mysql.workloadType).toBe('StatefulSet');
    expect(output.manifests.length).toBeGreaterThan(0);
  });

  it('converts fullstack-compose.yml', async () => {
    const { output, analysis } = await runConversion('fullstack-compose.yml', outputDir);

    expect(analysis.services.nginx.category).toBe('proxy');
    expect(analysis.services.api.category).toBe('api');
    expect(analysis.services.postgres.category).toBe('database');
    expect(analysis.services.redis.category).toBe('cache');

    // Check init containers for API service (depends on postgres, redis)
    const apiDeployment = output.manifests.find(
      (m) => m.serviceName === 'api' && m.manifest.kind === 'Deployment',
    );
    expect(apiDeployment).toBeDefined();
    const spec = apiDeployment!.manifest.spec as Record<string, unknown>;
    const template = spec.template as Record<string, unknown>;
    const podSpec = template.spec as Record<string, unknown>;
    const initContainers = podSpec.initContainers as Record<string, unknown>[];
    expect(initContainers).toBeDefined();
    expect(initContainers.length).toBe(2); // postgres + redis
  });

  it('generates valid single-file output', async () => {
    const composeFile = resolve(fixturesDir, 'basic-compose.yml');
    const parseResult = await parseComposeFile({ file: composeFile });
    const analysis = analyzeProject(parseResult.project);
    const config = generateDefaults(analysis, {
      outputDir,
      outputFormat: 'single-file',
    });
    const output = generateManifests({ analysis, config, composeFile });
    await writeOutput(output, config);

    const files = await readdir(outputDir);
    expect(files).toContain('all-resources.yaml');

    const content = await readFile(join(outputDir, 'all-resources.yaml'), 'utf-8');
    const docs = content.split('---').filter((d) => d.trim());
    expect(docs.length).toBe(output.manifests.length);
  });

  it('produces probes for services with healthchecks', async () => {
    const { output } = await runConversion('fullstack-compose.yml', outputDir);

    const apiDeployment = output.manifests.find(
      (m) => m.serviceName === 'api' && m.manifest.kind === 'Deployment',
    );
    const spec = apiDeployment!.manifest.spec as Record<string, unknown>;
    const template = spec.template as Record<string, unknown>;
    const podSpec = template.spec as Record<string, unknown>;
    const containers = podSpec.containers as Record<string, unknown>[];

    expect(containers[0]).toHaveProperty('livenessProbe');
    expect(containers[0]).toHaveProperty('readinessProbe');
  });
});
