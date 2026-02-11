import { describe, it, expect } from 'vitest';
import { toK8sName, standardLabels, selectorLabels } from '../../src/utils/k8s-names.js';

describe('toK8sName', () => {
  it('converts underscores to hyphens', () => {
    expect(toK8sName('my_service')).toBe('my-service');
  });

  it('converts dots to hyphens', () => {
    expect(toK8sName('my.service')).toBe('my-service');
  });

  it('lowercases', () => {
    expect(toK8sName('MyService')).toBe('myservice');
  });

  it('strips invalid characters', () => {
    expect(toK8sName('my@service!')).toBe('myservice');
  });

  it('collapses multiple hyphens', () => {
    expect(toK8sName('my__service')).toBe('my-service');
  });

  it('trims leading/trailing hyphens', () => {
    expect(toK8sName('-service-')).toBe('service');
  });

  it('truncates to 63 chars', () => {
    const long = 'a'.repeat(100);
    expect(toK8sName(long).length).toBeLessThanOrEqual(63);
  });

  it('ensures starts with alphanumeric', () => {
    expect(toK8sName('---foo')).toBe('foo');
  });

  it('returns unnamed for empty', () => {
    expect(toK8sName('')).toBe('unnamed');
  });
});

describe('standardLabels', () => {
  it('includes name and managed-by', () => {
    const labels = standardLabels('my_api');
    expect(labels['app.kubernetes.io/name']).toBe('my-api');
    expect(labels['app.kubernetes.io/managed-by']).toBe('compose2k8s');
  });
});

describe('selectorLabels', () => {
  it('returns name label only', () => {
    const labels = selectorLabels('api');
    expect(labels).toEqual({ 'app.kubernetes.io/name': 'api' });
  });
});
