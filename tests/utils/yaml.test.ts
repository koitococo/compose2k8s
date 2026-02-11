import { describe, it, expect } from 'vitest';
import { manifestToYaml, manifestsToMultiDoc } from '../../src/utils/yaml.js';
import type { K8sManifest } from '../../src/types/k8s.js';

describe('manifestToYaml', () => {
  it('serializes with correct key ordering', () => {
    const manifest: K8sManifest = {
      spec: { replicas: 1 },
      kind: 'Deployment',
      apiVersion: 'apps/v1',
      metadata: { name: 'test' },
    };

    const yaml = manifestToYaml(manifest);
    const lines = yaml.split('\n');

    const apiVersionIdx = lines.findIndex((l) => l.startsWith('apiVersion'));
    const kindIdx = lines.findIndex((l) => l.startsWith('kind'));
    const metadataIdx = lines.findIndex((l) => l.startsWith('metadata'));
    const specIdx = lines.findIndex((l) => l.startsWith('spec'));

    expect(apiVersionIdx).toBeLessThan(kindIdx);
    expect(kindIdx).toBeLessThan(metadataIdx);
    expect(metadataIdx).toBeLessThan(specIdx);
  });

  it('uses 2-space indentation', () => {
    const manifest: K8sManifest = {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: { name: 'test', labels: { app: 'test' } },
    };

    const yaml = manifestToYaml(manifest);
    expect(yaml).toContain('  name: test');
  });
});

describe('manifestsToMultiDoc', () => {
  it('separates manifests with ---', () => {
    const manifests: K8sManifest[] = [
      { apiVersion: 'v1', kind: 'Service', metadata: { name: 'a' } },
      { apiVersion: 'v1', kind: 'Service', metadata: { name: 'b' } },
    ];

    const result = manifestsToMultiDoc(manifests);
    const docs = result.split('---\n');

    // First element is empty (before first ---)
    expect(docs.length).toBe(3);
    expect(docs[1]).toContain('name: a');
    expect(docs[2]).toContain('name: b');
  });
});
