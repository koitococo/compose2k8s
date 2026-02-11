import type { WizardConfig } from '../types/config.js';
import type { AnalysisResult } from '../types/analysis.js';
import type { K8sManifest, GeneratedManifest } from '../types/k8s.js';
import { toK8sName } from '../utils/k8s-names.js';

/**
 * Generate an Ingress manifest from config.
 */
export function generateIngress(
  config: WizardConfig,
  _analysis: AnalysisResult,
): GeneratedManifest | null {
  if (!config.ingress.enabled || config.ingress.routes.length === 0) return null;

  const annotations: Record<string, string> = {};
  const ingressClassName = config.ingress.controller ?? undefined;

  if (config.ingress.tls && config.ingress.certManager) {
    annotations['cert-manager.io/cluster-issuer'] = 'letsencrypt-prod';
  }

  const rules = [
    {
      host: config.ingress.domain ?? 'app.example.com',
      http: {
        paths: config.ingress.routes.map((route) => ({
          path: route.path,
          pathType: 'Prefix',
          backend: {
            service: {
              name: toK8sName(route.serviceName),
              port: { number: route.port },
            },
          },
        })),
      },
    },
  ];

  const manifest: K8sManifest = {
    apiVersion: 'networking.k8s.io/v1',
    kind: 'Ingress',
    metadata: {
      name: 'app-ingress',
      namespace: config.deploy.namespace || undefined,
      labels: {
        'app.kubernetes.io/managed-by': 'compose2k8s',
      },
      ...(Object.keys(annotations).length ? { annotations } : {}),
    },
    spec: {
      ...(ingressClassName ? { ingressClassName } : {}),
      ...(config.ingress.tls
        ? {
            tls: [
              {
                hosts: [config.ingress.domain ?? 'app.example.com'],
                secretName: 'app-tls-secret',
              },
            ],
          }
        : {}),
      rules,
    },
  };

  return {
    filename: 'ingress.yaml',
    manifest,
    serviceName: '_ingress',
    description: 'Ingress for routing external traffic',
  };
}
