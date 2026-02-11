import type { AnalyzedService } from '../types/analysis.js';
import type { WizardConfig } from '../types/config.js';
import type { K8sManifest, GeneratedManifest } from '../types/k8s.js';
import { toK8sName, standardLabels } from '../utils/k8s-names.js';

/**
 * Generate Secrets for a service.
 * Uses stringData with REPLACE_ME placeholders — never embeds real values.
 */
export function generateSecretsForService(
  serviceName: string,
  analyzed: AnalyzedService,
  config: WizardConfig,
): GeneratedManifest[] {
  const manifests: GeneratedManifest[] = [];
  const k8sName = toK8sName(serviceName);
  const labels = standardLabels(serviceName);
  const svcEnvClassification = config.envClassification[serviceName] ?? {};

  // Env-based secrets
  const secretData: Record<string, string> = {};
  for (const envVar of analyzed.envVars) {
    const classification = svcEnvClassification[envVar.name] ??
      (envVar.sensitive ? 'secret' : 'configmap');
    if (classification === 'secret') {
      secretData[envVar.name] = 'REPLACE_ME';
    }
  }

  if (Object.keys(secretData).length > 0) {
    const manifest: K8sManifest = {
      apiVersion: 'v1',
      kind: 'Secret',
      metadata: {
        name: `${k8sName}-secret`,
        namespace: config.deploy.namespace || undefined,
        labels,
      },
      type: 'Opaque',
      stringData: secretData,
    };

    manifests.push({
      filename: `${k8sName}-secret.yaml`,
      manifest,
      serviceName,
      description: `Secret for ${serviceName} (replace REPLACE_ME with real values)`,
    });
  }

  // File-based secrets from volume mounts classified as secret
  for (const vol of analyzed.volumes) {
    if (vol.classification !== 'secret') continue;

    const volName = toK8sName(vol.suggestedName);
    const fileName = vol.mount.target.split('/').pop() ?? 'secret-file';

    const manifest: K8sManifest = {
      apiVersion: 'v1',
      kind: 'Secret',
      metadata: {
        name: `${k8sName}-${volName}`,
        namespace: config.deploy.namespace || undefined,
        labels,
      },
      type: 'Opaque',
      stringData: {
        [fileName]: 'REPLACE_ME',
      },
    };

    manifests.push({
      filename: `${k8sName}-secret-${volName}.yaml`,
      manifest,
      serviceName,
      description: `File secret for ${serviceName}: ${fileName} (replace REPLACE_ME with real content)`,
    });
  }

  return manifests;
}
