import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { parseComposeFile } from '../../src/parser/compose.js';

const fixturesDir = resolve(import.meta.dirname, '../fixtures');

describe('parseComposeFile', () => {
  it('parses basic compose file', async () => {
    const result = await parseComposeFile({
      file: resolve(fixturesDir, 'basic-compose.yml'),
    });

    expect(result.project.services).toHaveProperty('web');
    expect(result.project.services).toHaveProperty('api');
    expect(result.project.services).toHaveProperty('db');
    expect(Object.keys(result.project.services)).toHaveLength(3);
  });

  it('normalizes ports correctly', async () => {
    const result = await parseComposeFile({
      file: resolve(fixturesDir, 'basic-compose.yml'),
    });

    const webPorts = result.project.services.web.ports;
    expect(webPorts).toEqual([{ target: 80, published: 80, protocol: 'tcp' }]);

    const apiPorts = result.project.services.api.ports;
    expect(apiPorts).toEqual([{ target: 3000, published: 3000, protocol: 'tcp' }]);
  });

  it('normalizes environment from both formats', async () => {
    const result = await parseComposeFile({
      file: resolve(fixturesDir, 'basic-compose.yml'),
    });

    // Array format
    const apiEnv = result.project.services.api.environment;
    expect(apiEnv.NODE_ENV).toBe('production');
    expect(apiEnv.DATABASE_URL).toBe('postgres://user:pass@db:5432/myapp');

    // Record format
    const dbEnv = result.project.services.db.environment;
    expect(dbEnv.POSTGRES_USER).toBe('user');
    expect(dbEnv.POSTGRES_PASSWORD).toBe('pass');
  });

  it('normalizes volumes with named volume disambiguation', async () => {
    const result = await parseComposeFile({
      file: resolve(fixturesDir, 'basic-compose.yml'),
    });

    // Named volume
    const dbVolumes = result.project.services.db.volumes;
    expect(dbVolumes[0].type).toBe('volume');
    expect(dbVolumes[0].source).toBe('pgdata');

    // Bind mount
    const webVolumes = result.project.services.web.volumes;
    expect(webVolumes[0].type).toBe('bind');
    expect(webVolumes[0].readOnly).toBe(true);
  });

  it('normalizes depends_on', async () => {
    const result = await parseComposeFile({
      file: resolve(fixturesDir, 'basic-compose.yml'),
    });

    expect(result.project.services.web.depends_on).toEqual({
      api: { condition: 'service_started' },
    });
  });

  it('preserves top-level volumes', async () => {
    const result = await parseComposeFile({
      file: resolve(fixturesDir, 'basic-compose.yml'),
    });

    expect(result.project.volumes).toHaveProperty('pgdata');
  });

  it('parses complex compose file', async () => {
    const result = await parseComposeFile({
      file: resolve(fixturesDir, 'complex-compose.yml'),
    });

    expect(Object.keys(result.project.services)).toHaveLength(5);
    expect(result.project.services.proxy.deploy?.replicas).toBe(2);
    expect(result.project.services.app.healthcheck?.test).toEqual([
      'CMD', 'curl', '-f', 'http://localhost:3000/health',
    ]);
  });

  it('handles variable interpolation with defaults', async () => {
    const result = await parseComposeFile({
      file: resolve(fixturesDir, 'complex-compose.yml'),
    });

    // ${DB_PASSWORD:-secret} should resolve to "secret" since no env is set
    expect(result.project.services.db.environment.POSTGRES_PASSWORD).toBe('secret');
  });
});
