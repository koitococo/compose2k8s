import { describe, it, expect } from 'vitest';
import { parseEnvFile, interpolateVariables } from '../../src/parser/env.js';

describe('parseEnvFile', () => {
  it('parses simple key=value pairs', () => {
    const content = 'FOO=bar\nBAZ=qux';
    expect(parseEnvFile(content)).toEqual({ FOO: 'bar', BAZ: 'qux' });
  });

  it('skips comments and blank lines', () => {
    const content = '# comment\n\nFOO=bar\n  # indented comment\nBAZ=qux';
    expect(parseEnvFile(content)).toEqual({ FOO: 'bar', BAZ: 'qux' });
  });

  it('handles quoted values', () => {
    const content = 'FOO="hello world"\nBAR=\'single quoted\'';
    expect(parseEnvFile(content)).toEqual({
      FOO: 'hello world',
      BAR: 'single quoted',
    });
  });

  it('handles empty values', () => {
    const content = 'FOO=\nBAR';
    expect(parseEnvFile(content)).toEqual({ FOO: '', BAR: '' });
  });

  it('handles values containing equals signs', () => {
    const content = 'DATABASE_URL=postgres://user:pass@host:5432/db?sslmode=require';
    expect(parseEnvFile(content)).toEqual({
      DATABASE_URL: 'postgres://user:pass@host:5432/db?sslmode=require',
    });
  });
});

describe('interpolateVariables', () => {
  const env = { DB_HOST: 'localhost', DB_PORT: '5432' };

  it('interpolates ${VAR} syntax', () => {
    expect(interpolateVariables('host=${DB_HOST}', env)).toBe('host=localhost');
  });

  it('interpolates $VAR syntax', () => {
    expect(interpolateVariables('host=$DB_HOST', env)).toBe('host=localhost');
  });

  it('uses default with ${VAR:-default}', () => {
    expect(interpolateVariables('${MISSING:-fallback}', env)).toBe('fallback');
  });

  it('prefers env value over default', () => {
    expect(interpolateVariables('${DB_HOST:-other}', env)).toBe('localhost');
  });

  it('replaces missing vars with empty string', () => {
    expect(interpolateVariables('${MISSING}', env)).toBe('');
  });

  it('handles multiple interpolations', () => {
    expect(interpolateVariables('${DB_HOST}:${DB_PORT}', env)).toBe(
      'localhost:5432',
    );
  });
});
