import { stringify } from 'yaml';
import type { K8sManifest } from '../types/k8s.js';

/**
 * Serialize a K8s manifest to YAML with proper ordering.
 */
export function manifestToYaml(manifest: K8sManifest): string {
  // Enforce K8s key ordering
  const ordered: Record<string, unknown> = {};
  const keyOrder = ['apiVersion', 'kind', 'metadata', 'type', 'spec', 'data', 'stringData'];

  for (const key of keyOrder) {
    if (key in manifest && manifest[key] !== undefined) {
      ordered[key] = manifest[key];
    }
  }

  // Add any remaining keys
  for (const [key, value] of Object.entries(manifest)) {
    if (!(key in ordered) && value !== undefined) {
      ordered[key] = value;
    }
  }

  return stringify(ordered, {
    indent: 2,
    lineWidth: 0,
    defaultStringType: 'PLAIN',
    defaultKeyType: 'PLAIN',
    nullStr: '',
  });
}

/**
 * Combine multiple manifests into a single multi-document YAML string.
 */
export function manifestsToMultiDoc(manifests: K8sManifest[]): string {
  return manifests.map((m) => `---\n${manifestToYaml(m)}`).join('\n');
}
