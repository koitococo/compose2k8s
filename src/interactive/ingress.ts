import * as p from '@clack/prompts';
import type { AnalysisResult } from '../types/analysis.js';
import type { IngressConfig, IngressRoute } from '../types/config.js';

/**
 * Step 2: Configure Ingress.
 */
export async function configureIngress(
  analysis: AnalysisResult,
  selectedServices: string[],
): Promise<IngressConfig | symbol> {
  const enabled = await p.confirm({
    message: 'Do you want to generate an Ingress resource?',
    initialValue: false,
  });
  if (p.isCancel(enabled)) return enabled;

  if (!enabled) {
    return {
      enabled: false,
      tls: false,
      certManager: false,
      controller: 'none',
      routes: [],
    };
  }

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

  const controller = await p.select({
    message: 'Ingress controller type:',
    options: [
      { value: 'nginx' as const, label: 'NGINX Ingress Controller' },
      { value: 'traefik' as const, label: 'Traefik' },
      { value: 'none' as const, label: 'None (generic)' },
    ],
  });
  if (p.isCancel(controller)) return controller;

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
    domain: domain as string,
    tls,
    certManager,
    controller,
    routes,
  };
}
