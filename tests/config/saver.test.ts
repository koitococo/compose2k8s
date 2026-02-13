import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolve, join } from 'node:path';
import { mkdir, rm } from 'node:fs/promises';
import { parseComposeFile } from '../../src/parser/compose.js';
import { analyzeProject } from '../../src/analyzer/index.js';
import { generateDefaults } from '../../src/interactive/defaults.js';
import { saveConfigFile } from '../../src/config/saver.js';
import { loadConfigFile } from '../../src/config/loader.js';
import type { AnalysisResult } from '../../src/types/analysis.js';

const tmpDir = resolve('/tmp/compose2k8s-saver-test');
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

describe('saveConfigFile', () => {
  it('round-trips: save then load produces equivalent config', async () => {
    const original = generateDefaults(analysis);
    const configPath = join(tmpDir, 'config.yml');

    await saveConfigFile(original, configPath);
    const { config: loaded } = await loadConfigFile(configPath, analysis);

    expect(loaded.selectedServices).toEqual(original.selectedServices);
    expect(loaded.deploy.namespace).toBe(original.deploy.namespace);
    expect(loaded.deploy.imagePullPolicy).toBe(original.deploy.imagePullPolicy);
    expect(loaded.deploy.outputFormat).toBe(original.deploy.outputFormat);
    expect(loaded.deploy.resourceDefaults).toEqual(original.deploy.resourceDefaults);
    expect(loaded.initContainers).toBe(original.initContainers);
    expect(loaded.podSecurityStandard).toBe(original.podSecurityStandard);
    expect(loaded.serviceExposures).toEqual(original.serviceExposures);
    expect(loaded.workloadOverrides).toEqual(original.workloadOverrides);
    expect(loaded.envClassification).toEqual(original.envClassification);
  });

  it('round-trips with custom settings', async () => {
    const original = generateDefaults(analysis);
    original.deploy.namespace = 'custom-ns';
    original.podSecurityStandard = 'baseline';
    original.initContainers = 'none';
    original.serviceExposures.web = { type: 'NodePort', nodePort: 30080 };
    const configPath = join(tmpDir, 'custom.yml');

    await saveConfigFile(original, configPath);
    const { config: loaded } = await loadConfigFile(configPath, analysis);

    expect(loaded.deploy.namespace).toBe('custom-ns');
    expect(loaded.podSecurityStandard).toBe('baseline');
    expect(loaded.initContainers).toBe('none');
    expect(loaded.serviceExposures.web).toEqual({ type: 'NodePort', nodePort: 30080 });
  });

  it('round-trips podSecurityStandard none', async () => {
    const original = generateDefaults(analysis);
    original.podSecurityStandard = 'none';
    const configPath = join(tmpDir, 'pss-none.yml');

    await saveConfigFile(original, configPath);
    const { config: loaded } = await loadConfigFile(configPath, analysis);

    expect(loaded.podSecurityStandard).toBe('none');
  });
});
