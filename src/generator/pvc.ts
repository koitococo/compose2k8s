import type { AnalyzedVolume } from '../types/analysis.js';
import type { WizardConfig, StorageConfig } from '../types/config.js';
import type { K8sManifest, GeneratedManifest } from '../types/k8s.js';
import { toK8sName, standardLabels } from '../utils/k8s-names.js';

/**
 * Generate a PersistentVolumeClaim for a volume.
 * Only for Deployment workloads — StatefulSet uses volumeClaimTemplates.
 */
export function generatePVC(
  serviceName: string,
  volume: AnalyzedVolume,
  config: WizardConfig,
): GeneratedManifest {
  const volName = toK8sName(volume.suggestedName);
  const labels = standardLabels(serviceName);
  const storageConf = config.storageConfig.find(
    (s) => s.volumeName === volName,
  );

  const manifest: K8sManifest = {
    apiVersion: 'v1',
    kind: 'PersistentVolumeClaim',
    metadata: {
      name: volName,
      namespace: config.deploy.namespace || undefined,
      labels,
    },
    spec: {
      accessModes: [storageConf?.accessMode ?? 'ReadWriteOnce'],
      resources: {
        requests: {
          storage: storageConf?.size ?? '1Gi',
        },
      },
      ...(storageConf?.storageClass
        ? { storageClassName: storageConf.storageClass }
        : {}),
    },
  };

  return {
    filename: `${volName}-pvc.yaml`,
    manifest,
    serviceName,
    description: `PersistentVolumeClaim for ${serviceName}: ${volume.mount.target}`,
  };
}
