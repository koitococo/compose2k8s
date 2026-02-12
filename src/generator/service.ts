import type { AnalyzedService } from '../types/analysis.js';
import type { WizardConfig } from '../types/config.js';
import type { K8sManifest, GeneratedManifest } from '../types/k8s.js';
import { toK8sName, standardLabels, selectorLabels } from '../utils/k8s-names.js';

/**
 * Generate a ClusterIP Service for a compose service.
 * Only generated if the service has ports.
 */
export function generateService(
  serviceName: string,
  analyzed: AnalyzedService,
  config: WizardConfig,
): GeneratedManifest | null {
  if (analyzed.ports.length === 0) return null;

  const k8sName = toK8sName(serviceName);
  const labels = standardLabels(serviceName);
  const selector = selectorLabels(serviceName);

  const exposure = config.serviceExposures?.[serviceName];
  const exposureType = exposure?.type ?? 'ClusterIP';

  const ports = analyzed.ports.map((p) => {
    const proto = p.protocol.toUpperCase();
    return {
      port: p.containerPort,
      ...(proto !== 'TCP' ? { protocol: proto } : {}),
      name: `${p.protocol}-${p.containerPort}`,
      ...(exposureType === 'NodePort' && exposure?.nodePort != null
        ? { nodePort: exposure.nodePort }
        : {}),
    };
  });

  // Determine spec.type: omit for ClusterIP/Ingress (K8s default), set for NodePort/LoadBalancer
  const serviceType =
    exposureType === 'NodePort' || exposureType === 'LoadBalancer'
      ? exposureType
      : undefined;

  const manifest: K8sManifest = {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: {
      name: k8sName,
      namespace: config.deploy.namespace || undefined,
      labels,
    },
    spec: {
      ...(serviceType ? { type: serviceType } : {}),
      selector,
      ports,
    },
  };

  return {
    filename: `${k8sName}-service.yaml`,
    manifest,
    serviceName,
    description: `Service for ${serviceName}`,
  };
}
