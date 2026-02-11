import { describe, it, expect } from 'vitest';
import { inferServiceCategory, inferWorkloadType } from '../../src/analyzer/service.js';
import type { ComposeService } from '../../src/types/compose.js';

function makeService(overrides: Partial<ComposeService> = {}): ComposeService {
  return {
    environment: {},
    ports: [],
    volumes: [],
    depends_on: {},
    labels: {},
    ...overrides,
  };
}

describe('inferServiceCategory', () => {
  it('detects database from image', () => {
    expect(inferServiceCategory('db', makeService({ image: 'postgres:16' }))).toBe('database');
    expect(inferServiceCategory('db', makeService({ image: 'mysql:8' }))).toBe('database');
    expect(inferServiceCategory('db', makeService({ image: 'mongo:7' }))).toBe('database');
  });

  it('detects cache from image', () => {
    expect(inferServiceCategory('store', makeService({ image: 'redis:7-alpine' }))).toBe('cache');
    expect(inferServiceCategory('mc', makeService({ image: 'memcached:1.6' }))).toBe('cache');
  });

  it('detects queue from image', () => {
    expect(inferServiceCategory('mq', makeService({ image: 'rabbitmq:3-management' }))).toBe('queue');
  });

  it('detects proxy from image', () => {
    expect(inferServiceCategory('lb', makeService({ image: 'nginx:1.25' }))).toBe('proxy');
    expect(inferServiceCategory('lb', makeService({ image: 'traefik:v3' }))).toBe('proxy');
  });

  it('detects database from env patterns', () => {
    expect(
      inferServiceCategory(
        'mydb',
        makeService({ environment: { POSTGRES_USER: 'admin' } }),
      ),
    ).toBe('database');
  });

  it('detects category from port', () => {
    expect(
      inferServiceCategory(
        'svc',
        makeService({ ports: [{ target: 5432, protocol: 'tcp' }] }),
      ),
    ).toBe('database');
  });

  it('detects category from name', () => {
    expect(inferServiceCategory('worker', makeService())).toBe('worker');
    expect(inferServiceCategory('cache', makeService())).toBe('cache');
    expect(inferServiceCategory('api', makeService())).toBe('api');
  });

  it('falls back to api', () => {
    expect(inferServiceCategory('unknown-svc', makeService({ image: 'custom:latest' }))).toBe('api');
  });
});

describe('inferWorkloadType', () => {
  it('returns StatefulSet for database', () => {
    const svc = makeService({ image: 'postgres:16' });
    expect(inferWorkloadType('db', svc, 'database')).toBe('StatefulSet');
  });

  it('returns StatefulSet for cache', () => {
    const svc = makeService({ image: 'redis:7' });
    expect(inferWorkloadType('cache', svc, 'cache')).toBe('StatefulSet');
  });

  it('returns Deployment for web/api', () => {
    const svc = makeService({ image: 'node:20' });
    expect(inferWorkloadType('api', svc, 'api')).toBe('Deployment');
  });

  it('returns Deployment for proxy', () => {
    const svc = makeService({ image: 'nginx:1.25' });
    expect(inferWorkloadType('web', svc, 'proxy')).toBe('Deployment');
  });
});
