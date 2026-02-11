import { describe, it, expect } from 'vitest';
import { isSensitiveEnvVar } from '../../src/analyzer/secrets.js';

describe('isSensitiveEnvVar', () => {
  it('detects PASSWORD vars', () => {
    expect(isSensitiveEnvVar('POSTGRES_PASSWORD', 'secret')).toBe(true);
    expect(isSensitiveEnvVar('DB_PASSWORD', 'pass123')).toBe(true);
  });

  it('detects SECRET vars', () => {
    expect(isSensitiveEnvVar('JWT_SECRET', 'abc123')).toBe(true);
    expect(isSensitiveEnvVar('API_SECRET', 'xyz')).toBe(true);
  });

  it('detects TOKEN vars', () => {
    expect(isSensitiveEnvVar('AUTH_TOKEN', 'tok-123')).toBe(true);
    expect(isSensitiveEnvVar('ACCESS_TOKEN', 'abc')).toBe(true);
  });

  it('detects API_KEY vars', () => {
    expect(isSensitiveEnvVar('API_KEY', 'key-123')).toBe(true);
    expect(isSensitiveEnvVar('STRIPE_APIKEY', 'sk_test')).toBe(true);
  });

  it('detects connection strings with credentials', () => {
    expect(
      isSensitiveEnvVar('DATABASE_URL', 'postgres://user:pass@host:5432/db'),
    ).toBe(true);
  });

  it('does not flag non-sensitive vars', () => {
    expect(isSensitiveEnvVar('NODE_ENV', 'production')).toBe(false);
    expect(isSensitiveEnvVar('PORT', '3000')).toBe(false);
    expect(isSensitiveEnvVar('DB_HOST', 'localhost')).toBe(false);
  });
});
