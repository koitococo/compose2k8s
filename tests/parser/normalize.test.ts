import { describe, it, expect } from 'vitest';
import {
  normalizeEnvironment,
  normalizePorts,
  normalizeVolumeMounts,
  normalizeDependsOn,
  normalizeLabels,
} from '../../src/parser/normalize.js';

describe('normalizeEnvironment', () => {
  it('normalizes string array format', () => {
    const env = ['FOO=bar', 'BAZ=qux'];
    expect(normalizeEnvironment(env)).toEqual({ FOO: 'bar', BAZ: 'qux' });
  });

  it('normalizes record format', () => {
    const env = { FOO: 'bar', NUM: 42, BOOL: true, NIL: null };
    expect(normalizeEnvironment(env)).toEqual({
      FOO: 'bar',
      NUM: '42',
      BOOL: 'true',
      NIL: '',
    });
  });

  it('handles key without value', () => {
    expect(normalizeEnvironment(['KEY_ONLY'])).toEqual({ KEY_ONLY: '' });
  });

  it('returns empty for undefined', () => {
    expect(normalizeEnvironment(undefined)).toEqual({});
  });
});

describe('normalizePorts', () => {
  it('parses "host:container" string', () => {
    expect(normalizePorts(['8080:80'])).toEqual([
      { target: 80, published: 8080, protocol: 'tcp' },
    ]);
  });

  it('parses "container" only string', () => {
    expect(normalizePorts(['80'])).toEqual([
      { target: 80, protocol: 'tcp' },
    ]);
  });

  it('parses port with protocol', () => {
    expect(normalizePorts(['53:53/udp'])).toEqual([
      { target: 53, published: 53, protocol: 'udp' },
    ]);
  });

  it('parses IP binding format', () => {
    expect(normalizePorts(['0.0.0.0:8080:80'])).toEqual([
      { target: 80, published: 8080, protocol: 'tcp' },
    ]);
  });

  it('handles number input', () => {
    expect(normalizePorts([3000])).toEqual([
      { target: 3000, protocol: 'tcp' },
    ]);
  });

  it('handles object input', () => {
    expect(normalizePorts([{ target: 80, published: 8080, protocol: 'tcp' }])).toEqual([
      { target: 80, published: 8080, protocol: 'tcp' },
    ]);
  });
});

describe('normalizeVolumeMounts', () => {
  const topLevelVolumes = new Set(['pgdata', 'redis-data']);

  it('parses named volume string', () => {
    const result = normalizeVolumeMounts(['pgdata:/var/lib/postgresql/data'], topLevelVolumes);
    expect(result).toEqual([
      { source: 'pgdata', target: '/var/lib/postgresql/data', readOnly: false, type: 'volume' },
    ]);
  });

  it('parses bind mount string', () => {
    const result = normalizeVolumeMounts(['./data:/app/data'], topLevelVolumes);
    expect(result).toEqual([
      { source: './data', target: '/app/data', readOnly: false, type: 'bind' },
    ]);
  });

  it('parses read-only mount', () => {
    const result = normalizeVolumeMounts(['./nginx.conf:/etc/nginx/nginx.conf:ro'], topLevelVolumes);
    expect(result[0].readOnly).toBe(true);
    expect(result[0].type).toBe('bind');
  });

  it('handles anonymous volume', () => {
    const result = normalizeVolumeMounts(['/data'], topLevelVolumes);
    expect(result[0]).toEqual({ source: '', target: '/data', readOnly: false, type: 'volume' });
  });
});

describe('normalizeDependsOn', () => {
  it('normalizes string array', () => {
    expect(normalizeDependsOn(['db', 'cache'])).toEqual({
      db: { condition: 'service_started' },
      cache: { condition: 'service_started' },
    });
  });

  it('passes through record format', () => {
    const input = { db: { condition: 'service_healthy' as const } };
    expect(normalizeDependsOn(input)).toEqual(input);
  });
});

describe('normalizeLabels', () => {
  it('normalizes string array', () => {
    expect(normalizeLabels(['foo=bar', 'baz=qux'])).toEqual({
      foo: 'bar',
      baz: 'qux',
    });
  });

  it('passes through record format', () => {
    expect(normalizeLabels({ foo: 'bar' })).toEqual({ foo: 'bar' });
  });
});
