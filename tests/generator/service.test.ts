import { describe, it, expect } from 'vitest';
import { generateService } from '../../src/generator/service.js';
import type { AnalyzedService } from '../../src/types/analysis.js';
import type { WizardConfig } from '../../src/types/config.js';

function makeConfig(): WizardConfig {
  return {
    selectedServices: ['api'],
    workloadOverrides: {},
    serviceExposures: {},
    ingress: { enabled: false, mode: 'ingress', tls: false, certManager: false, controller: 'none', routes: [] },
    envClassification: {},
    storageConfig: [],
    initContainers: 'none',
    deploy: {
      namespace: 'default',
      imagePullPolicy: 'IfNotPresent',
      imagePullSecrets: [],
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
      environment: {},
      ports: [{ target: 3000, published: 3000, protocol: 'tcp' }],
      volumes: [],
      depends_on: {},
      labels: {},
    },
    category: 'api',
    workloadType: 'Deployment',
    volumes: [],
    ports: [{ containerPort: 3000, protocol: 'tcp', publishedPort: 3000 }],
    envVars: [],
    dependsOn: [],
    ...overrides,
  };
}

describe('generateService', () => {
  it('generates ClusterIP service with correct ports', () => {
    const result = generateService('api', makeAnalyzed(), makeConfig());

    expect(result).not.toBeNull();
    expect(result!.manifest.kind).toBe('Service');
    expect(result!.manifest.metadata.name).toBe('api');

    const spec = result!.manifest.spec as Record<string, unknown>;
    expect(spec.type).toBeUndefined();

    const ports = spec.ports as Array<Record<string, unknown>>;
    expect(ports[0].port).toBe(3000);
    expect(ports[0].targetPort).toBeUndefined();
    expect(ports[0].protocol).toBeUndefined();
  });

  it('returns null when service has no ports', () => {
    const analyzed = makeAnalyzed({ ports: [] });
    const result = generateService('worker', analyzed, makeConfig());

    expect(result).toBeNull();
  });

  it('sets selector labels', () => {
    const result = generateService('api', makeAnalyzed(), makeConfig());
    const spec = result!.manifest.spec as Record<string, unknown>;
    const selector = spec.selector as Record<string, string>;

    expect(selector['app.kubernetes.io/name']).toBe('api');
  });

  it('generates NodePort service when exposure is NodePort', () => {
    const config = makeConfig();
    config.serviceExposures = { api: { type: 'NodePort' } };
    const result = generateService('api', makeAnalyzed(), config);

    const spec = result!.manifest.spec as Record<string, unknown>;
    expect(spec.type).toBe('NodePort');
  });

  it('generates LoadBalancer service when exposure is LoadBalancer', () => {
    const config = makeConfig();
    config.serviceExposures = { api: { type: 'LoadBalancer' } };
    const result = generateService('api', makeAnalyzed(), config);

    const spec = result!.manifest.spec as Record<string, unknown>;
    expect(spec.type).toBe('LoadBalancer');
  });

  it('keeps ClusterIP for Ingress exposure', () => {
    const config = makeConfig();
    config.serviceExposures = { api: { type: 'Ingress', ingressPath: '/' } };
    const result = generateService('api', makeAnalyzed(), config);

    const spec = result!.manifest.spec as Record<string, unknown>;
    expect(spec.type).toBeUndefined();
  });

  it('sets nodePort on port when specified', () => {
    const config = makeConfig();
    config.serviceExposures = { api: { type: 'NodePort', nodePort: 30080 } };
    const result = generateService('api', makeAnalyzed(), config);

    const spec = result!.manifest.spec as Record<string, unknown>;
    expect(spec.type).toBe('NodePort');

    const ports = spec.ports as Array<Record<string, unknown>>;
    expect(ports[0].nodePort).toBe(30080);
  });
});
