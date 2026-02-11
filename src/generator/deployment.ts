import type { AnalyzedService } from '../types/analysis.js';
import type { WizardConfig } from '../types/config.js';
import type { K8sManifest, GeneratedManifest } from '../types/k8s.js';
import { toK8sName, standardLabels, selectorLabels } from '../utils/k8s-names.js';
import { buildContainerSpec } from './container.js';

/**
 * Generate a Deployment manifest for a service.
 */
export function generateDeployment(
  serviceName: string,
  analyzed: AnalyzedService,
  config: WizardConfig,
): GeneratedManifest {
  const k8sName = toK8sName(serviceName);
  const labels = standardLabels(serviceName);
  const selector = selectorLabels(serviceName);

  const { container, volumes } = buildContainerSpec(serviceName, analyzed, config);

  const replicas = analyzed.service.deploy?.replicas ?? 1;

  const manifest: K8sManifest = {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name: k8sName,
      namespace: config.deploy.namespace || undefined,
      labels,
    },
    spec: {
      replicas,
      selector: { matchLabels: selector },
      template: {
        metadata: { labels: { ...labels, ...selector } },
        spec: {
          ...(container.initContainers?.length
            ? { initContainers: container.initContainers }
            : {}),
          containers: [container.main],
          ...(volumes.length ? { volumes } : {}),
          restartPolicy: 'Always',
        },
      },
    },
  };

  return {
    filename: `${k8sName}-deployment.yaml`,
    manifest,
    serviceName,
    description: `Deployment for ${serviceName}`,
  };
}
