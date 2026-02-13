import * as p from '@clack/prompts';
import type { AnalysisResult, AnalyzedService } from '../types/analysis.js';
import type {
  WizardConfig,
  IngressConfig,
  ServiceExposure,
  ExposureType,
  ResourceConfig,
  StorageConfig,
  PodSecurityStandard,
} from '../types/config.js';
import { selectServices } from './services.js';
import { generateDefaults } from './defaults.js';
import { toK8sName } from '../utils/k8s-names.js';

/** Unwrap a @clack/prompts value that has been checked for isCancel. */
function unwrap<T>(val: T | symbol): T {
  return val as T;
}

/**
 * Run the tree-menu wizard. Configure-by-exception: start with smart defaults,
 * only modify what you want.
 */
export async function runTreeWizard(
  analysis: AnalysisResult,
  preset?: WizardConfig,
): Promise<WizardConfig | null> {
  p.intro('compose2k8s — Docker Compose → Kubernetes');

  // Step 1: Select services (reuse existing multiselect)
  const selectedServices = await selectServices(analysis);
  if (p.isCancel(selectedServices)) {
    p.cancel('Conversion cancelled.');
    return null;
  }

  // Initialize config with preset or smart defaults
  const config = preset ? { ...preset } : generateDefaults(analysis);
  config.selectedServices = selectedServices;

  // Main loop
  while (true) {
    const mainChoice = await mainMenu(config, analysis);
    if (p.isCancel(mainChoice)) {
      p.cancel('Conversion cancelled.');
      return null;
    }

    if (mainChoice === '__done__') break;
    if (mainChoice === '__global__') {
      const cancelled = await globalSettingsMenu(config, analysis);
      if (cancelled) return null;
    } else {
      // Per-service menu
      const cancelled = await serviceMenu(mainChoice, config, analysis);
      if (cancelled) return null;
    }
  }

  // Finalize: compute ingress.routes from serviceExposures
  finalizeConfig(config, analysis);

  p.outro('Configuration complete!');
  return config;
}

// ── Main Menu ───────────────────────────────────────────────────────────────

async function mainMenu(
  config: WizardConfig,
  analysis: AnalysisResult,
): Promise<string | symbol> {
  const serviceOptions = config.selectedServices.map((name) => {
    const override = config.workloadOverrides[name];
    const exposure = config.serviceExposures[name];
    const workload = override?.workloadType ?? analysis.services[name]?.workloadType ?? 'Deployment';
    const replicas = override?.replicas ?? 1;
    const exposureHint = formatExposureHint(exposure);

    return {
      value: name,
      label: name,
      hint: `${workload}, ${replicas} replica${replicas !== 1 ? 's' : ''}, ${exposureHint}`,
    };
  });

  const globalHint = `ns: ${config.deploy.namespace}, pss: ${config.podSecurityStandard}, format: ${config.deploy.outputFormat}`;

  return p.select({
    message: 'Configure services or generate manifests:',
    options: [
      ...serviceOptions,
      { value: '__global__', label: 'Global settings', hint: globalHint },
      { value: '__done__', label: 'Done — generate manifests' },
    ],
  });
}

function formatExposureHint(exposure?: ServiceExposure): string {
  if (!exposure) return 'ClusterIP';
  if (exposure.type === 'Ingress') {
    return `Ingress ${exposure.ingressPath ?? '/'}`;
  }
  if (exposure.type === 'NodePort' && exposure.nodePort) {
    return `NodePort:${exposure.nodePort}`;
  }
  return exposure.type;
}

// ── Per-service Menu ────────────────────────────────────────────────────────

async function serviceMenu(
  serviceName: string,
  config: WizardConfig,
  analysis: AnalysisResult,
): Promise<boolean> {
  const svc = analysis.services[serviceName];
  if (!svc) return false;

  while (true) {
    const options: { value: string; label: string; hint?: string }[] = [];

    const override = config.workloadOverrides[serviceName];
    const workload = override?.workloadType ?? svc.workloadType;
    const replicas = override?.replicas ?? 1;
    const pullPolicy = override?.imagePullPolicy ?? config.deploy.imagePullPolicy;

    options.push(
      { value: 'workload', label: 'Workload type', hint: workload },
      { value: 'replicas', label: 'Replicas', hint: String(replicas) },
      { value: 'pull-policy', label: 'Image pull policy', hint: pullPolicy },
    );

    if (svc.ports.length > 0) {
      const exposure = config.serviceExposures[serviceName];
      options.push({
        value: 'exposure',
        label: 'Exposure',
        hint: formatExposureHint(exposure),
      });
    }

    if (svc.envVars.length > 0) {
      const classification = config.envClassification[serviceName] ?? {};
      const secretCount = Object.values(classification).filter((v) => v === 'secret').length;
      const configmapCount = Object.values(classification).filter((v) => v === 'configmap').length;
      options.push({
        value: 'secrets',
        label: 'Env vars / Secrets',
        hint: `${configmapCount} configmap, ${secretCount} secret`,
      });
    }

    const pvcVolumes = svc.volumes.filter((v) => v.classification === 'pvc');
    if (pvcVolumes.length > 0) {
      const storageHint = config.storageConfig
        .filter((s) => pvcVolumes.some((v) => toK8sName(v.suggestedName) === s.volumeName))
        .map((s) => s.size)
        .join(', ') || 'default';
      options.push({ value: 'storage', label: 'Storage', hint: storageHint });
    }

    const resourceOverride = config.resourceOverrides[serviceName];
    options.push({
      value: 'resources',
      label: 'Resources',
      hint: resourceOverride ? 'custom' : 'default',
    });

    options.push({ value: '__back__', label: '← Back' });

    const choice = await p.select({
      message: `Configure ${serviceName}:`,
      options,
    });
    if (p.isCancel(choice)) {
      p.cancel('Conversion cancelled.');
      return true;
    }

    if (choice === '__back__') return false;

    const cancelled = await handleServiceEdit(
      choice as string,
      serviceName,
      config,
      analysis,
    );
    if (cancelled) return true;
  }
}

async function handleServiceEdit(
  action: string,
  serviceName: string,
  config: WizardConfig,
  analysis: AnalysisResult,
): Promise<boolean> {
  const svc = analysis.services[serviceName];

  switch (action) {
    case 'workload': {
      const current = config.workloadOverrides[serviceName]?.workloadType ?? svc.workloadType;
      const val = await p.select({
        message: `Workload type for ${serviceName}:`,
        options: [
          { value: 'Deployment' as const, label: 'Deployment', hint: current === 'Deployment' ? 'current' : undefined },
          { value: 'StatefulSet' as const, label: 'StatefulSet', hint: current === 'StatefulSet' ? 'current' : undefined },
        ],
        initialValue: current,
      });
      if (p.isCancel(val)) return true;
      ensureWorkloadOverride(config, serviceName, svc);
      config.workloadOverrides[serviceName].workloadType = val;
      break;
    }
    case 'replicas': {
      const current = config.workloadOverrides[serviceName]?.replicas ?? 1;
      const val = await p.text({
        message: `Replica count for ${serviceName}:`,
        initialValue: String(current),
        validate: (v) => {
          const n = Number(v);
          if (!Number.isInteger(n) || n < 1) return 'Must be a positive integer';
        },
      });
      if (p.isCancel(val)) return true;
      ensureWorkloadOverride(config, serviceName, svc);
      config.workloadOverrides[serviceName].replicas = Number(val);
      break;
    }
    case 'pull-policy': {
      const current = config.workloadOverrides[serviceName]?.imagePullPolicy ?? config.deploy.imagePullPolicy;
      const val = await p.select({
        message: `Image pull policy for ${serviceName}:`,
        options: [
          { value: 'Always' as const, label: 'Always' },
          { value: 'IfNotPresent' as const, label: 'IfNotPresent' },
          { value: 'Never' as const, label: 'Never' },
        ],
        initialValue: current,
      });
      if (p.isCancel(val)) return true;
      ensureWorkloadOverride(config, serviceName, svc);
      config.workloadOverrides[serviceName].imagePullPolicy = val;
      break;
    }
    case 'exposure': {
      const cancelled = await editExposure(serviceName, config, analysis);
      if (cancelled) return true;
      break;
    }
    case 'secrets': {
      const cancelled = await editSecrets(serviceName, config, svc);
      if (cancelled) return true;
      break;
    }
    case 'storage': {
      const cancelled = await editStorage(serviceName, config, svc);
      if (cancelled) return true;
      break;
    }
    case 'resources': {
      const cancelled = await editResources(serviceName, config);
      if (cancelled) return true;
      break;
    }
  }

  return false;
}

function ensureWorkloadOverride(
  config: WizardConfig,
  serviceName: string,
  svc: AnalyzedService,
): void {
  if (!config.workloadOverrides[serviceName]) {
    config.workloadOverrides[serviceName] = {
      workloadType: svc.workloadType,
      replicas: svc.service.deploy?.replicas ?? 1,
    };
  }
}

// ── Exposure editor ─────────────────────────────────────────────────────────

async function editExposure(
  serviceName: string,
  config: WizardConfig,
  analysis: AnalysisResult,
): Promise<boolean> {
  const current = config.serviceExposures[serviceName]?.type ?? 'ClusterIP';
  const svc = analysis.services[serviceName];
  const defaultPath = svc.category === 'api' ? '/api' : '/';

  const val = await p.select({
    message: `Exposure type for ${serviceName}:`,
    options: [
      { value: 'ClusterIP' as const, label: 'ClusterIP', hint: 'internal only' },
      { value: 'NodePort' as const, label: 'NodePort', hint: 'expose on each node' },
      { value: 'LoadBalancer' as const, label: 'LoadBalancer', hint: 'cloud load balancer' },
      { value: 'Ingress' as const, label: 'Ingress', hint: 'HTTP routing via Ingress' },
    ],
    initialValue: current,
  });
  if (p.isCancel(val)) return true;

  const exposure: ServiceExposure = { type: val as ExposureType };

  if (val === 'Ingress') {
    const path = await p.text({
      message: `Ingress path for ${serviceName}:`,
      initialValue: config.serviceExposures[serviceName]?.ingressPath ?? defaultPath,
      validate: (v) => {
        if (!v.startsWith('/')) return 'Path must start with /';
      },
    });
    if (p.isCancel(path)) return true;
    exposure.ingressPath = unwrap(path);

    // If ingress domain not set, trigger global ingress config
    if (!config.ingress.domain) {
      p.log.info('Ingress requires a domain. Configuring ingress settings...');
      const cancelled = await editIngressGlobal(config);
      if (cancelled) return true;
    }
  }

  if (val === 'NodePort') {
    const setPort = await p.confirm({
      message: 'Set a specific node port? (30000-32767)',
      initialValue: false,
    });
    if (p.isCancel(setPort)) return true;

    if (setPort) {
      const port = await p.text({
        message: 'Node port:',
        initialValue: config.serviceExposures[serviceName]?.nodePort?.toString() ?? '30080',
        validate: (v) => {
          const n = Number(v);
          if (!Number.isInteger(n) || n < 30000 || n > 32767)
            return 'Must be an integer between 30000 and 32767';
        },
      });
      if (p.isCancel(port)) return true;
      exposure.nodePort = Number(port);
    }
  }

  config.serviceExposures[serviceName] = exposure;
  return false;
}

// ── Secrets editor ──────────────────────────────────────────────────────────

async function editSecrets(
  serviceName: string,
  config: WizardConfig,
  svc: AnalyzedService,
): Promise<boolean> {
  if (!config.envClassification[serviceName]) {
    config.envClassification[serviceName] = {};
  }

  const currentSecrets = new Set(
    Object.entries(config.envClassification[serviceName])
      .filter(([, v]) => v === 'secret')
      .map(([k]) => k),
  );

  const secretVars = await p.multiselect({
    message: `Select secret env vars for ${serviceName}:`,
    options: svc.envVars.map((v) => ({
      value: v.name,
      label: v.name,
      hint: v.sensitive ? 'auto-detected' : undefined,
    })),
    initialValues: [...currentSecrets],
    required: false,
  });
  if (p.isCancel(secretVars)) return true;

  const secretSet = new Set(secretVars);
  for (const v of svc.envVars) {
    config.envClassification[serviceName][v.name] = secretSet.has(v.name) ? 'secret' : 'configmap';
  }

  return false;
}

// ── Storage editor ──────────────────────────────────────────────────────────

async function editStorage(
  serviceName: string,
  config: WizardConfig,
  svc: AnalyzedService,
): Promise<boolean> {
  const pvcVolumes = svc.volumes.filter((v) => v.classification === 'pvc');

  for (const vol of pvcVolumes) {
    const volName = toK8sName(vol.suggestedName);
    const existing = config.storageConfig.find((s) => s.volumeName === volName);
    const isDb = svc.category === 'database';
    const defaultSize = isDb ? '10Gi' : '1Gi';

    p.log.info(`Storage: ${volName} → ${vol.mount.target}`);

    const storageClass = await p.text({
      message: `Storage class for ${volName}:`,
      placeholder: '(default)',
      initialValue: existing?.storageClass ?? '',
    });
    if (p.isCancel(storageClass)) return true;

    const size = await p.text({
      message: `Size for ${volName}:`,
      initialValue: existing?.size ?? defaultSize,
      validate: (v) => {
        if (!/^\d+[KMGT]i$/.test(v)) return 'Use format like 1Gi, 10Gi, 500Mi';
      },
    });
    if (p.isCancel(size)) return true;

    const accessMode = await p.select({
      message: `Access mode for ${volName}:`,
      options: [
        { value: 'ReadWriteOnce' as const, label: 'ReadWriteOnce (single node)' },
        { value: 'ReadWriteMany' as const, label: 'ReadWriteMany (multiple nodes)' },
        { value: 'ReadOnlyMany' as const, label: 'ReadOnlyMany (read-only)' },
      ],
      initialValue: existing?.accessMode ?? 'ReadWriteOnce',
    });
    if (p.isCancel(accessMode)) return true;

    if (existing) {
      existing.storageClass = unwrap(storageClass);
      existing.size = unwrap(size);
      existing.accessMode = accessMode;
    } else {
      config.storageConfig.push({
        volumeName: volName,
        storageClass: unwrap(storageClass),
        size: unwrap(size),
        accessMode,
      });
    }
  }

  return false;
}

// ── Resources editor ────────────────────────────────────────────────────────

async function editResources(
  serviceName: string,
  config: WizardConfig,
): Promise<boolean> {
  const defaults = config.deploy.resourceDefaults;
  const current = config.resourceOverrides[serviceName];

  const cpuRequest = await p.text({
    message: `${serviceName} — CPU request:`,
    initialValue: current?.cpuRequest ?? defaults.cpuRequest,
  });
  if (p.isCancel(cpuRequest)) return true;

  const cpuLimit = await p.text({
    message: `${serviceName} — CPU limit:`,
    initialValue: current?.cpuLimit ?? defaults.cpuLimit,
  });
  if (p.isCancel(cpuLimit)) return true;

  const memoryRequest = await p.text({
    message: `${serviceName} — Memory request:`,
    initialValue: current?.memoryRequest ?? defaults.memoryRequest,
  });
  if (p.isCancel(memoryRequest)) return true;

  const memoryLimit = await p.text({
    message: `${serviceName} — Memory limit:`,
    initialValue: current?.memoryLimit ?? defaults.memoryLimit,
  });
  if (p.isCancel(memoryLimit)) return true;

  config.resourceOverrides[serviceName] = {
    cpuRequest: unwrap(cpuRequest),
    cpuLimit: unwrap(cpuLimit),
    memoryRequest: unwrap(memoryRequest),
    memoryLimit: unwrap(memoryLimit),
  };

  return false;
}

// ── Global Settings Menu ────────────────────────────────────────────────────

async function globalSettingsMenu(
  config: WizardConfig,
  analysis: AnalysisResult,
): Promise<boolean> {
  while (true) {
    const options: { value: string; label: string; hint?: string }[] = [
      { value: 'namespace', label: 'Namespace', hint: config.deploy.namespace },
    ];

    // Check if any service has dependencies
    const hasDeps = config.selectedServices.some(
      (name) => analysis.services[name]?.dependsOn.length > 0,
    );
    if (hasDeps) {
      options.push({
        value: 'init-containers',
        label: 'Init containers',
        hint: config.initContainers,
      });
    }

    options.push({
      value: 'pod-security',
      label: 'Pod security standard',
      hint: config.podSecurityStandard,
    });

    // Show ingress settings if any service uses Ingress exposure
    const hasIngress = Object.values(config.serviceExposures).some(
      (e) => e.type === 'Ingress',
    );
    if (hasIngress) {
      options.push({
        value: 'ingress',
        label: 'Ingress settings',
        hint: config.ingress.domain ?? 'not configured',
      });
    }

    options.push(
      { value: 'format', label: 'Output format', hint: config.deploy.outputFormat },
      { value: 'output-dir', label: 'Output directory', hint: config.deploy.outputDir },
      {
        value: 'pull-secrets',
        label: 'Image pull secrets',
        hint: config.deploy.imagePullSecrets.length > 0
          ? config.deploy.imagePullSecrets.join(', ')
          : 'none',
      },
      { value: '__back__', label: '← Back' },
    );

    const choice = await p.select({
      message: 'Global settings:',
      options,
    });
    if (p.isCancel(choice)) {
      p.cancel('Conversion cancelled.');
      return true;
    }

    if (choice === '__back__') return false;

    const cancelled = await handleGlobalEdit(choice as string, config);
    if (cancelled) return true;
  }
}

async function handleGlobalEdit(action: string, config: WizardConfig): Promise<boolean> {
  switch (action) {
    case 'namespace': {
      const val = await p.text({
        message: 'Kubernetes namespace:',
        initialValue: config.deploy.namespace,
        validate: (v) => {
          if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(v))
            return 'Must be a valid K8s namespace (lowercase alphanumeric and hyphens, max 63 chars)';
        },
      });
      if (p.isCancel(val)) return true;
      config.deploy.namespace = unwrap(val);
      break;
    }
    case 'init-containers': {
      const val = await p.select({
        message: 'How should service dependencies be handled?',
        options: [
          { value: 'wait-for-port' as const, label: 'Wait-for-port init containers' },
          { value: 'none' as const, label: 'None' },
        ],
        initialValue: config.initContainers,
      });
      if (p.isCancel(val)) return true;
      config.initContainers = val;
      break;
    }
    case 'pod-security': {
      const val = await p.select({
        message: 'Pod security standard:',
        options: [
          { value: 'restricted' as const, label: 'Restricted', hint: 'PSS restricted (recommended for production)' },
          { value: 'baseline' as const, label: 'Baseline', hint: 'Hardened but less strict' },
          { value: 'none' as const, label: 'None', hint: 'No security context added (dev clusters)' },
        ],
        initialValue: config.podSecurityStandard,
      });
      if (p.isCancel(val)) return true;
      config.podSecurityStandard = val as PodSecurityStandard;
      break;
    }
    case 'ingress': {
      const cancelled = await editIngressGlobal(config);
      if (cancelled) return true;
      break;
    }
    case 'format': {
      const val = await p.select({
        message: 'Output format:',
        options: [
          { value: 'plain' as const, label: 'Individual files', hint: 'One YAML file per resource' },
          { value: 'single-file' as const, label: 'Single file', hint: 'All resources in one file' },
        ],
        initialValue: config.deploy.outputFormat,
      });
      if (p.isCancel(val)) return true;
      config.deploy.outputFormat = val;
      break;
    }
    case 'output-dir': {
      const val = await p.text({
        message: 'Output directory:',
        initialValue: config.deploy.outputDir,
        validate: (v) => {
          if (!v.trim()) return 'Output directory is required';
        },
      });
      if (p.isCancel(val)) return true;
      config.deploy.outputDir = unwrap(val);
      break;
    }
    case 'pull-secrets': {
      const has = await p.confirm({
        message: 'Do you need image pull secrets for private registries?',
        initialValue: config.deploy.imagePullSecrets.length > 0,
      });
      if (p.isCancel(has)) return true;

      if (has) {
        const val = await p.text({
          message: 'Image pull secret name(s):',
          placeholder: 'my-registry-secret (comma-separated for multiple)',
          initialValue: config.deploy.imagePullSecrets.join(', '),
          validate: (v) => {
            if (!v.trim()) return 'At least one secret name is required';
          },
        });
        if (p.isCancel(val)) return true;
        config.deploy.imagePullSecrets = unwrap(val)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      } else {
        config.deploy.imagePullSecrets = [];
      }
      break;
    }
  }

  return false;
}

// ── Ingress global settings ─────────────────────────────────────────────────

async function editIngressGlobal(config: WizardConfig): Promise<boolean> {
  const mode = await p.select({
    message: 'Routing API:',
    options: [
      { value: 'ingress' as const, label: 'Ingress', hint: 'Traditional Ingress resource' },
      { value: 'gateway-api' as const, label: 'Gateway API', hint: 'Modern Gateway API' },
    ],
    initialValue: config.ingress.mode,
  });
  if (p.isCancel(mode)) return true;

  const domain = await p.text({
    message: 'Domain name:',
    placeholder: 'app.example.com',
    initialValue: config.ingress.domain ?? '',
    validate: (v) => {
      if (!v.trim()) return 'Domain is required';
      if (!/^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$/.test(v.trim()))
        return 'Must be a valid domain name';
    },
  });
  if (p.isCancel(domain)) return true;

  const tls = await p.confirm({
    message: 'Enable TLS?',
    initialValue: config.ingress.tls,
  });
  if (p.isCancel(tls)) return true;

  let certManager = config.ingress.certManager;
  if (tls) {
    const cm = await p.confirm({
      message: 'Use cert-manager for automatic TLS certificates?',
      initialValue: config.ingress.certManager,
    });
    if (p.isCancel(cm)) return true;
    certManager = cm;
  }

  let controller = config.ingress.controller;
  let gatewayClass = config.ingress.gatewayClass;

  if (mode === 'ingress') {
    const ctrl = await p.select({
      message: 'Ingress controller type:',
      options: [
        { value: 'nginx' as const, label: 'NGINX Ingress Controller' },
        { value: 'traefik' as const, label: 'Traefik' },
        { value: 'higress' as const, label: 'Higress' },
        { value: 'none' as const, label: 'None (generic)' },
      ],
      initialValue: controller,
    });
    if (p.isCancel(ctrl)) return true;
    controller = ctrl;
  } else {
    const gc = await p.text({
      message: 'GatewayClass name:',
      initialValue: gatewayClass ?? 'istio',
      placeholder: 'e.g. istio, cilium, nginx, higress',
    });
    if (p.isCancel(gc)) return true;
    gatewayClass = unwrap(gc);
  }

  config.ingress.mode = mode;
  config.ingress.domain = unwrap(domain);
  config.ingress.tls = tls;
  config.ingress.certManager = certManager;
  config.ingress.controller = controller;
  config.ingress.gatewayClass = gatewayClass;

  return false;
}

// ── Finalize config ─────────────────────────────────────────────────────────

function finalizeConfig(config: WizardConfig, analysis: AnalysisResult): void {
  // Compute ingress.routes from serviceExposures
  const ingressServices = Object.entries(config.serviceExposures)
    .filter(([, e]) => e.type === 'Ingress')
    .map(([name]) => name);

  if (ingressServices.length > 0) {
    config.ingress.enabled = true;
    config.ingress.routes = ingressServices.map((name) => {
      const svc = analysis.services[name];
      const exposure = config.serviceExposures[name];
      return {
        serviceName: name,
        path: exposure.ingressPath ?? '/',
        port: svc?.ports[0]?.containerPort ?? 80,
      };
    });
  } else {
    config.ingress.enabled = false;
    config.ingress.routes = [];
  }
}
