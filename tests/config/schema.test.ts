import { describe, it, expect } from 'vitest';
import { configFileSchema } from '../../src/config/schema.js';

describe('configFileSchema', () => {
  it('parses empty object with defaults', () => {
    const result = configFileSchema.parse({});
    expect(result.initContainers).toBe('wait-for-port');
    expect(result.deploy.namespace).toBe('default');
    expect(result.deploy.imagePullPolicy).toBe('IfNotPresent');
    expect(result.deploy.format).toBe('plain');
    expect(result.deploy.migrationScripts).toBe(true);
    expect(result.deploy.resources.cpuRequest).toBe('100m');
    expect(result.services).toBeUndefined();
    expect(result.ingress).toBeUndefined();
    expect(result.secrets).toBeUndefined();
    expect(result.storage).toBeUndefined();
  });

  it('parses full config correctly', () => {
    const result = configFileSchema.parse({
      services: ['api', 'db'],
      ingress: {
        domain: 'app.example.com',
        tls: true,
        certManager: true,
        controller: 'nginx',
        routes: [{ service: 'api', path: '/', port: 3000 }],
      },
      secrets: {
        api: { DATABASE_URL: 'secret', NODE_ENV: 'configmap' },
      },
      storage: [
        { volume: 'pgdata', size: '20Gi', accessMode: 'ReadWriteOnce', storageClass: 'ssd' },
      ],
      initContainers: 'none',
      deploy: {
        namespace: 'myapp',
        imagePullPolicy: 'Always',
        format: 'single-file',
        outputDir: './output',
        migrationScripts: false,
        resources: {
          cpuRequest: '200m',
          cpuLimit: '1',
          memoryRequest: '256Mi',
          memoryLimit: '1Gi',
        },
      },
    });

    expect(result.services).toEqual(['api', 'db']);
    expect(result.ingress!.domain).toBe('app.example.com');
    expect(result.ingress!.tls).toBe(true);
    expect(result.secrets!.api.DATABASE_URL).toBe('secret');
    expect(result.storage![0].volume).toBe('pgdata');
    expect(result.storage![0].storageClass).toBe('ssd');
    expect(result.initContainers).toBe('none');
    expect(result.deploy.namespace).toBe('myapp');
    expect(result.deploy.migrationScripts).toBe(false);
  });

  it('rejects invalid initContainers value', () => {
    expect(() => configFileSchema.parse({ initContainers: 'invalid' })).toThrow();
  });

  it('rejects invalid imagePullPolicy', () => {
    expect(() =>
      configFileSchema.parse({ deploy: { imagePullPolicy: 'Sometimes' } }),
    ).toThrow();
  });

  it('rejects invalid secret classification', () => {
    expect(() =>
      configFileSchema.parse({ secrets: { api: { FOO: 'plaintext' } } }),
    ).toThrow();
  });
});
