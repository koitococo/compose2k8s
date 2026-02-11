import * as p from '@clack/prompts';
import type { AnalysisResult } from '../types/analysis.js';
import type { IngressConfig, IngressRoute } from '../types/config.js';

/**
 * Step 2: Configure external traffic routing (Ingress or Gateway API).
 */
export async function configureIngress(
  analysis: AnalysisResult,
  selectedServices: string[],
): Promise<IngressConfig | symbol> {
  const enabled = await p.confirm({
    message: 'Do you want to configure external traffic routing?',
    initialValue: false,
  });
  if (p.isCancel(enabled)) return enabled;

  if (!enabled) {
    return {
      enabled: false,
      mode: 'ingress',
      tls: false,
      certManager: false,
      controller: 'none',
      routes: [],
    };
  }

  const mode = await p.select({
    message: 'Routing API:',
    options: [
      { value: 'ingress' as const, label: 'Ingress', hint: 'Traditional Ingress resource (networking.k8s.io/v1)' },
      { value: 'gateway-api' as const, label: 'Gateway API', hint: 'Modern Gateway API (gateway.networking.k8s.io/v1)' },
    ],
  });
  if (p.isCancel(mode)) return mode;

  const domain = await p.text({
    message: 'What is the domain name?',
    placeholder: 'app.example.com',
    validate: (v) => (!v.trim() ? 'Domain is required' : undefined),
  });
  if (p.isCancel(domain)) return domain;

  const tls = await p.confirm({
    message: 'Enable TLS?',
    initialValue: true,
  });
  if (p.isCancel(tls)) return tls;

  let certManager = false;
  if (tls) {
    const cm = await p.confirm({
      message: 'Use cert-manager for automatic TLS certificates?',
      initialValue: true,
    });
    if (p.isCancel(cm)) return cm;
    certManager = cm;
  }

  let controller: IngressConfig['controller'] = 'none';
  let gatewayClass: string | undefined;

  if (mode === 'ingress') {
    const ctrl = await p.select({
      message: 'Ingress controller type:',
      options: [
        { value: 'nginx' as const, label: 'NGINX Ingress Controller' },
        { value: 'traefik' as const, label: 'Traefik' },
        { value: 'higress' as const, label: 'Higress' },
        { value: 'none' as const, label: 'None (generic)' },
      ],
    });
    if (p.isCancel(ctrl)) return ctrl;
    controller = ctrl;
  } else {
    const gc = await p.text({
      message: 'GatewayClass name:',
      initialValue: 'istio',
      placeholder: 'e.g. istio, cilium, nginx, higress',
    });
    if (p.isCancel(gc)) return gc;
    gatewayClass = gc as string;
  }

  // Build routes from web/api services with ports
  const routeServices = selectedServices.filter((name) => {
    const svc = analysis.services[name];
    return svc && svc.ports.length > 0 &&
      ['web', 'api', 'proxy'].includes(svc.category);
  });

  const routes: IngressRoute[] = [];
  for (const svcName of routeServices) {
    const svc = analysis.services[svcName];
    const defaultPath = svc.category === 'api' ? `/api` : '/';

    const path = await p.text({
      message: `Path for ${svcName}:`,
      initialValue: defaultPath,
    });
    if (p.isCancel(path)) return path;

    routes.push({
      serviceName: svcName,
      path,
      port: svc.ports[0].containerPort,
    });
  }

  return {
    enabled: true,
    mode,
    domain: domain as string,
    tls,
    certManager,
    controller,
    gatewayClass,
    routes,
  };
}
