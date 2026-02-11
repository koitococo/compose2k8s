import type { AnalyzedService } from '../types/analysis.js';
import type { WizardConfig } from '../types/config.js';
import type { K8sManifest, GeneratedManifest } from '../types/k8s.js';
import { toK8sName, standardLabels, selectorLabels } from '../utils/k8s-names.js';
import { buildContainerSpec } from './container.js';

/**
 * Generate a StatefulSet + headless Service for a stateful service.
 */
export function generateStatefulSet(
  serviceName: string,
  analyzed: AnalyzedService,
  config: WizardConfig,
  allServices?: Record<string, AnalyzedService>,
): GeneratedManifest[] {
  const k8sName = toK8sName(serviceName);
  const labels = standardLabels(serviceName);
  const selector = selectorLabels(serviceName);

  const { container, volumes } = buildContainerSpec(serviceName, analyzed, config, allServices);

  // Filter out PVC volumes — they become volumeClaimTemplates
  const pvcVolumes = analyzed.volumes.filter((v) => v.classification === 'pvc');
  const nonPvcVolumes = volumes.filter(
    (v) => !(v as Record<string, unknown>).persistentVolumeClaim,
  );

  // Build volumeClaimTemplates
  const volumeClaimTemplates = pvcVolumes.map((vol) => {
    const volName = toK8sName(vol.suggestedName);
    const storageConf = config.storageConfig.find((s) => s.volumeName === volName);
    return {
      metadata: { name: volName },
      spec: {
        accessModes: [storageConf?.accessMode ?? 'ReadWriteOnce'],
        resources: {
          requests: {
            storage: storageConf?.size ?? '10Gi',
          },
        },
        ...(storageConf?.storageClass
          ? { storageClassName: storageConf.storageClass }
          : {}),
      },
    };
  });

  const replicas = analyzed.service.deploy?.replicas;

  const statefulSet: K8sManifest = {
    apiVersion: 'apps/v1',
    kind: 'StatefulSet',
    metadata: {
      name: k8sName,
      namespace: config.deploy.namespace || undefined,
      labels,
    },
    spec: {
      serviceName: `${k8sName}-headless`,
      ...(replicas != null && replicas !== 1 ? { replicas } : {}),
      selector: { matchLabels: selector },
      template: {
        metadata: { labels: { ...labels, ...selector } },
        spec: {
          ...(container.initContainers?.length
            ? { initContainers: container.initContainers }
            : {}),
          containers: [container.main],
          ...(nonPvcVolumes.length ? { volumes: nonPvcVolumes } : {}),
        },
      },
      ...(volumeClaimTemplates.length ? { volumeClaimTemplates } : {}),
    },
  };

  // Headless Service for StatefulSet
  const headlessService: K8sManifest = {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: {
      name: `${k8sName}-headless`,
      namespace: config.deploy.namespace || undefined,
      labels,
    },
    spec: {
      clusterIP: 'None',
      selector,
      ports: analyzed.ports.map((p) => {
        const proto = p.protocol.toUpperCase();
        return {
          port: p.containerPort,
          ...(proto !== 'TCP' ? { protocol: proto } : {}),
          name: `${p.protocol}-${p.containerPort}`,
        };
      }),
    },
  };

  const results: GeneratedManifest[] = [
    {
      filename: `${k8sName}-statefulset.yaml`,
      manifest: statefulSet,
      serviceName,
      description: `StatefulSet for ${serviceName}`,
    },
  ];

  if (analyzed.ports.length > 0) {
    results.push({
      filename: `${k8sName}-headless-service.yaml`,
      manifest: headlessService,
      serviceName,
      description: `Headless Service for ${serviceName} StatefulSet`,
    });
  }

  return results;
}
