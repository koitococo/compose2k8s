import type { WizardConfig } from '../types/config.js';
import type { AnalysisResult } from '../types/analysis.js';
import type { K8sManifest, GeneratedManifest } from '../types/k8s.js';
import { toK8sName } from '../utils/k8s-names.js';

/**
 * Generate Gateway API resources (Gateway + HTTPRoute) from config.
 */
export function generateGatewayAPI(
  config: WizardConfig,
  _analysis: AnalysisResult,
): GeneratedManifest[] {
  if (!config.ingress.enabled || config.ingress.routes.length === 0) return [];

  const manifests: GeneratedManifest[] = [];
  const namespace = config.deploy.namespace || undefined;
  const domain = config.ingress.domain ?? 'app.example.com';
  const gatewayClass = config.ingress.gatewayClass ?? 'istio';

  // Generate Gateway resource
  const listeners: Record<string, unknown>[] = [];

  if (config.ingress.tls) {
    listeners.push({
      name: 'https',
      protocol: 'HTTPS',
      port: 443,
      hostname: domain,
      tls: {
        mode: 'Terminate',
        certificateRefs: [{ kind: 'Secret', name: `${toK8sName(namespace ?? 'app')}-tls-secret` }],
      },
      allowedRoutes: { namespaces: { from: 'Same' } },
    });
    // HTTP listener for redirect
    listeners.push({
      name: 'http',
      protocol: 'HTTP',
      port: 80,
      hostname: domain,
      allowedRoutes: { namespaces: { from: 'Same' } },
    });
  } else {
    listeners.push({
      name: 'http',
      protocol: 'HTTP',
      port: 80,
      hostname: domain,
      allowedRoutes: { namespaces: { from: 'Same' } },
    });
  }

  const gatewayAnnotations: Record<string, string> = {};
  if (config.ingress.tls && config.ingress.certManager) {
    gatewayAnnotations['cert-manager.io/cluster-issuer'] = 'letsencrypt-prod';
  }

  const gatewayManifest: K8sManifest = {
    apiVersion: 'gateway.networking.k8s.io/v1',
    kind: 'Gateway',
    metadata: {
      name: `${toK8sName(namespace ?? 'app')}-gateway`,
      namespace,
      labels: {
        'app.kubernetes.io/managed-by': 'compose2k8s',
      },
      ...(Object.keys(gatewayAnnotations).length ? { annotations: gatewayAnnotations } : {}),
    },
    spec: {
      gatewayClassName: gatewayClass,
      listeners,
    },
  };

  manifests.push({
    filename: 'gateway.yaml',
    manifest: gatewayManifest,
    serviceName: '_gateway',
    description: 'Gateway for external traffic routing',
  });

  // Generate HTTPRoute resource
  const rules = config.ingress.routes.map((route) => ({
    matches: [
      {
        path: {
          type: 'PathPrefix',
          value: route.path,
        },
      },
    ],
    backendRefs: [
      {
        name: toK8sName(route.serviceName),
        port: route.port,
      },
    ],
  }));

  const httpRouteManifest: K8sManifest = {
    apiVersion: 'gateway.networking.k8s.io/v1',
    kind: 'HTTPRoute',
    metadata: {
      name: `${toK8sName(namespace ?? 'app')}-httproute`,
      namespace,
      labels: {
        'app.kubernetes.io/managed-by': 'compose2k8s',
      },
    },
    spec: {
      parentRefs: [{ name: `${toK8sName(namespace ?? 'app')}-gateway` }],
      hostnames: [domain],
      rules,
    },
  };

  manifests.push({
    filename: 'httproute.yaml',
    manifest: httpRouteManifest,
    serviceName: '_gateway',
    description: 'HTTPRoute for path-based routing',
  });

  return manifests;
}
