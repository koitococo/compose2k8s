import { describe, it, expect } from 'vitest';
import { analyzeDependencies } from '../../src/analyzer/dependency.js';
import type { ComposeService } from '../../src/types/compose.js';

function makeService(deps: string[]): ComposeService {
  const depends_on: Record<string, { condition?: 'service_started' }> = {};
  for (const dep of deps) {
    depends_on[dep] = { condition: 'service_started' };
  }
  return {
    environment: {},
    ports: [],
    volumes: [],
    depends_on,
    labels: {},
  };
}

describe('analyzeDependencies', () => {
  it('produces correct topological order', () => {
    const services: Record<string, ComposeService> = {
      web: makeService(['api']),
      api: makeService(['db']),
      db: makeService([]),
    };

    const result = analyzeDependencies(services);
    expect(result.hasCycles).toBe(false);
    expect(result.order.indexOf('db')).toBeLessThan(result.order.indexOf('api'));
    expect(result.order.indexOf('api')).toBeLessThan(result.order.indexOf('web'));
  });

  it('handles services with no dependencies', () => {
    const services: Record<string, ComposeService> = {
      a: makeService([]),
      b: makeService([]),
      c: makeService([]),
    };

    const result = analyzeDependencies(services);
    expect(result.hasCycles).toBe(false);
    expect(result.order).toHaveLength(3);
  });

  it('detects cycles', () => {
    const services: Record<string, ComposeService> = {
      a: makeService(['b']),
      b: makeService(['a']),
    };

    const result = analyzeDependencies(services);
    expect(result.hasCycles).toBe(true);
  });

  it('builds correct edges', () => {
    const services: Record<string, ComposeService> = {
      web: makeService(['api', 'db']),
      api: makeService(['db']),
      db: makeService([]),
    };

    const result = analyzeDependencies(services);
    expect(result.edges.web).toEqual(['api', 'db']);
    expect(result.edges.api).toEqual(['db']);
    expect(result.edges.db).toEqual([]);
  });
});
