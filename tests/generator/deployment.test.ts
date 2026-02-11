import { describe, it, expect } from 'vitest';
import { generateDeployment } from '../../src/generator/deployment.js';
import type { AnalyzedService } from '../../src/types/analysis.js';
import type { WizardConfig } from '../../src/types/config.js';

function makeConfig(overrides: Partial<WizardConfig> = {}): WizardConfig {
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
      resourceDefaults: {
        cpuRequest: '100m',
        cpuLimit: '500m',
        memoryRequest: '128Mi',
        memoryLimit: '512Mi',
      },
    },
    ...overrides,
  };
}

function makeAnalyzed(overrides: Partial<AnalyzedService> = {}): AnalyzedService {
  return {
    name: 'api',
    service: {
      image: 'node:20-alpine',
      command: ['node', 'server.js'],
      environment: { NODE_ENV: 'production' },
      ports: [{ target: 3000, published: 3000, protocol: 'tcp' }],
      volumes: [],
      depends_on: {},
      labels: {},
    },
    category: 'api',
    workloadType: 'Deployment',
    volumes: [],
    ports: [{ containerPort: 3000, protocol: 'tcp', publishedPort: 3000 }],
    envVars: [{ name: 'NODE_ENV', value: 'production', sensitive: false }],
    dependsOn: [],
    ...overrides,
  };
}

describe('generateDeployment', () => {
  it('generates a basic deployment', () => {
    const config = makeConfig();
    const analyzed = makeAnalyzed();

    const result = generateDeployment('api', analyzed, config);

    expect(result.manifest.apiVersion).toBe('apps/v1');
    expect(result.manifest.kind).toBe('Deployment');
    expect(result.manifest.metadata.name).toBe('api');
    expect(result.filename).toBe('api-deployment.yaml');
  });

  it('sets correct labels and selector', () => {
    const result = generateDeployment('api', makeAnalyzed(), makeConfig());
    const spec = result.manifest.spec as Record<string, unknown>;
    const selector = spec.selector as { matchLabels: Record<string, string> };

    expect(result.manifest.metadata.labels).toHaveProperty('app.kubernetes.io/name', 'api');
    expect(selector.matchLabels).toHaveProperty('app.kubernetes.io/name', 'api');
  });

  it('sets container image and ports', () => {
    const result = generateDeployment('api', makeAnalyzed(), makeConfig());
    const spec = result.manifest.spec as Record<string, unknown>;
    const template = spec.template as Record<string, unknown>;
    const podSpec = template.spec as Record<string, unknown>;
    const containers = podSpec.containers as Record<string, unknown>[];

    expect(containers[0].image).toBe('node:20-alpine');
    expect(containers[0].ports).toEqual([
      { containerPort: 3000 },
    ]);
  });

  it('maps command to args', () => {
    const result = generateDeployment('api', makeAnalyzed(), makeConfig());
    const spec = result.manifest.spec as Record<string, unknown>;
    const template = spec.template as Record<string, unknown>;
    const podSpec = template.spec as Record<string, unknown>;
    const containers = podSpec.containers as Record<string, unknown>[];

    expect(containers[0].args).toEqual(['node', 'server.js']);
  });

  it('uses default resource limits', () => {
    const result = generateDeployment('api', makeAnalyzed(), makeConfig());
    const spec = result.manifest.spec as Record<string, unknown>;
    const template = spec.template as Record<string, unknown>;
    const podSpec = template.spec as Record<string, unknown>;
    const containers = podSpec.containers as Record<string, unknown>[];
    const resources = containers[0].resources as Record<string, unknown>;

    expect(resources.requests).toEqual({ cpu: '100m', memory: '128Mi' });
    expect(resources.limits).toEqual({ cpu: '500m', memory: '512Mi' });
  });

  it('respects namespace', () => {
    const config = makeConfig();
    config.deploy.namespace = 'myapp';
    const result = generateDeployment('api', makeAnalyzed(), config);

    expect(result.manifest.metadata.namespace).toBe('myapp');
  });

  it('uses deploy replicas', () => {
    const analyzed = makeAnalyzed();
    analyzed.service.deploy = { replicas: 3 };
    const result = generateDeployment('api', analyzed, makeConfig());
    const spec = result.manifest.spec as Record<string, unknown>;

    expect(spec.replicas).toBe(3);
  });

  it('omits replicas when not explicitly set', () => {
    const result = generateDeployment('api', makeAnalyzed(), makeConfig());
    const spec = result.manifest.spec as Record<string, unknown>;

    expect(spec.replicas).toBeUndefined();
  });

  it('omits replicas when explicitly set to 1', () => {
    const analyzed = makeAnalyzed();
    analyzed.service.deploy = { replicas: 1 };
    const result = generateDeployment('api', analyzed, makeConfig());
    const spec = result.manifest.spec as Record<string, unknown>;

    expect(spec.replicas).toBeUndefined();
  });
});
