import { describe, it, expect } from 'vitest';
import { generateConfigMapsForService } from '../../src/generator/configmap.js';
import type { AnalyzedService } from '../../src/types/analysis.js';
import type { WizardConfig } from '../../src/types/config.js';

function makeConfig(): WizardConfig {
  return {
    selectedServices: ['api'],
    ingress: { enabled: false, tls: false, certManager: false, controller: 'none', routes: [] },
    envClassification: {},
    storageConfig: [],
    initContainers: 'none',
    deploy: {
      namespace: 'default',
      imagePullPolicy: 'IfNotPresent',
      outputFormat: 'plain',
      outputDir: './k8s',
      migrationScripts: true,
      resourceDefaults: {
        cpuRequest: '100m', cpuLimit: '500m',
        memoryRequest: '128Mi', memoryLimit: '512Mi',
      },
    },
  };
}

function makeAnalyzed(overrides: Partial<AnalyzedService> = {}): AnalyzedService {
  return {
    name: 'api',
    service: {
      image: 'node:20',
      environment: { NODE_ENV: 'production', DB_HOST: 'db' },
      ports: [],
      volumes: [],
      depends_on: {},
      labels: {},
    },
    category: 'api',
    workloadType: 'Deployment',
    volumes: [],
    ports: [],
    envVars: [
      { name: 'NODE_ENV', value: 'production', sensitive: false },
      { name: 'DB_HOST', value: 'db', sensitive: false },
    ],
    dependsOn: [],
    ...overrides,
  };
}

describe('generateConfigMapsForService', () => {
  it('generates env-based configmap for non-sensitive vars', () => {
    const { manifests } = generateConfigMapsForService(
      'api',
      makeAnalyzed(),
      makeConfig(),
      '/tmp',
    );

    const envCM = manifests.find((m) => m.filename.includes('configmap-env'));
    expect(envCM).toBeDefined();
    expect(envCM!.manifest.data).toEqual({
      NODE_ENV: 'production',
      DB_HOST: 'db',
    });
  });

  it('generates file-based configmap from volume mounts', () => {
    const analyzed = makeAnalyzed({
      volumes: [
        {
          mount: {
            source: './missing.conf',
            target: '/etc/app/app.conf',
            readOnly: true,
            type: 'bind',
          },
          classification: 'configmap',
          suggestedName: 'api-app-conf',
        },
      ],
    });

    const { manifests, warnings } = generateConfigMapsForService(
      'api',
      analyzed,
      makeConfig(),
      '/tmp',
    );

    const fileCM = manifests.find((m) => m.filename.includes('configmap-api-app-conf'));
    expect(fileCM).toBeDefined();
    expect(fileCM!.manifest.data).toHaveProperty('app.conf');
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('skips configmap when all vars are sensitive', () => {
    const analyzed = makeAnalyzed({
      envVars: [
        { name: 'API_SECRET', value: 'xxx', sensitive: true },
      ],
    });

    const { manifests } = generateConfigMapsForService(
      'api',
      analyzed,
      makeConfig(),
      '/tmp',
    );

    const envCM = manifests.find((m) => m.filename.includes('configmap-env'));
    expect(envCM).toBeUndefined();
  });
});
