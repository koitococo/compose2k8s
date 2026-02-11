import type { AnalyzedService, AnalyzedVolume } from '../types/analysis.js';
import type { WizardConfig } from '../types/config.js';
import { toK8sName } from '../utils/k8s-names.js';
import { healthcheckToProbes } from './probes.js';
import { generateInitContainers } from './init-container.js';

interface ContainerSpec {
  main: Record<string, unknown>;
  initContainers?: Record<string, unknown>[];
}

interface ContainerResult {
  container: ContainerSpec;
  volumes: Record<string, unknown>[];
}

/**
 * Build the container spec and volumes shared by Deployment and StatefulSet.
 */
export function buildContainerSpec(
  serviceName: string,
  analyzed: AnalyzedService,
  config: WizardConfig,
  allServices?: Record<string, AnalyzedService>,
): ContainerResult {
  const k8sName = toK8sName(serviceName);
  const service = analyzed.service;

  // Container ports
  const ports = analyzed.ports.map((p) => ({
    containerPort: p.containerPort,
    protocol: p.protocol.toUpperCase(),
  }));

  // Environment variables
  const env: Record<string, unknown>[] = [];
  const envFrom: Record<string, unknown>[] = [];
  const svcEnvClassification = config.envClassification[serviceName] ?? {};

  const configMapEnvVars: Record<string, string> = {};
  const secretEnvVars: Record<string, string> = {};

  for (const envVar of analyzed.envVars) {
    const classification = svcEnvClassification[envVar.name] ??
      (envVar.sensitive ? 'secret' : 'configmap');

    if (classification === 'secret') {
      secretEnvVars[envVar.name] = envVar.value;
      env.push({
        name: envVar.name,
        valueFrom: {
          secretKeyRef: {
            name: `${k8sName}-secret`,
            key: envVar.name,
          },
        },
      });
    } else {
      configMapEnvVars[envVar.name] = envVar.value;
    }
  }

  // Use envFrom for configmap vars if there are any
  if (Object.keys(configMapEnvVars).length > 0) {
    envFrom.push({
      configMapRef: { name: `${k8sName}-env` },
    });
  }

  // Volume mounts and volumes
  const volumeMounts: Record<string, unknown>[] = [];
  const volumes: Record<string, unknown>[] = [];

  for (const vol of analyzed.volumes) {
    const volName = toK8sName(vol.suggestedName);
    const mountSpec: Record<string, unknown> = {
      name: volName,
      mountPath: vol.mount.target,
    };
    if (vol.mount.readOnly) mountSpec.readOnly = true;

    // If mount target is a file (has extension), add subPath
    const targetBase = vol.mount.target.split('/').pop() ?? '';
    if (targetBase.includes('.') && (vol.classification === 'configmap' || vol.classification === 'secret')) {
      mountSpec.subPath = targetBase;
    }

    volumeMounts.push(mountSpec);

    const volumeSpec = buildVolumeSpec(volName, vol, k8sName);
    if (volumeSpec) volumes.push(volumeSpec);
  }

  // Command and args mapping
  // compose entrypoint → k8s command, compose command → k8s args
  const command = service.entrypoint
    ? Array.isArray(service.entrypoint)
      ? service.entrypoint
      : parseShellWords(service.entrypoint)
    : undefined;

  const args = service.command
    ? Array.isArray(service.command)
      ? service.command
      : parseShellWords(service.command)
    : undefined;

  // Resources
  const resources = buildResources(analyzed, config);

  // Probes
  const probes = service.healthcheck && !service.healthcheck.disable
    ? healthcheckToProbes(service.healthcheck, analyzed.ports)
    : {};

  // Build main container
  const main: Record<string, unknown> = {
    name: k8sName,
    image: service.image ?? `${k8sName}:latest`,
    imagePullPolicy: config.deploy.imagePullPolicy,
    ...(ports.length ? { ports } : {}),
    ...(env.length ? { env } : {}),
    ...(envFrom.length ? { envFrom } : {}),
    ...(volumeMounts.length ? { volumeMounts } : {}),
    ...(command ? { command } : {}),
    ...(args ? { args } : {}),
    ...(Object.keys(resources).length ? { resources } : {}),
    ...probes,
  };

  // Init containers
  const initContainers = config.initContainers === 'wait-for-port'
    ? generateInitContainers(analyzed, config, allServices)
    : [];

  return {
    container: {
      main,
      initContainers: initContainers.length > 0 ? initContainers : undefined,
    },
    volumes,
  };
}

function buildVolumeSpec(
  volName: string,
  vol: AnalyzedVolume,
  k8sName: string,
): Record<string, unknown> | null {
  switch (vol.classification) {
    case 'configmap':
      return {
        name: volName,
        configMap: { name: `${k8sName}-${volName}` },
      };
    case 'secret':
      return {
        name: volName,
        secret: { secretName: `${k8sName}-${volName}` },
      };
    case 'emptydir':
      return {
        name: volName,
        emptyDir: {},
      };
    case 'pvc':
      // PVC volumes are added as volume references; the PVC itself is separate
      return {
        name: volName,
        persistentVolumeClaim: { claimName: volName },
      };
    default:
      return null;
  }
}

function buildResources(
  analyzed: AnalyzedService,
  config: WizardConfig,
): Record<string, unknown> {
  const deploy = analyzed.service.deploy;
  const defaults = config.deploy.resourceDefaults;

  if (deploy?.resources) {
    const result: Record<string, unknown> = {};
    if (deploy.resources.limits) {
      result.limits = {
        ...(deploy.resources.limits.cpus ? { cpu: deploy.resources.limits.cpus } : {}),
        ...(deploy.resources.limits.memory ? { memory: deploy.resources.limits.memory } : {}),
      };
    }
    if (deploy.resources.reservations) {
      result.requests = {
        ...(deploy.resources.reservations.cpus ? { cpu: deploy.resources.reservations.cpus } : {}),
        ...(deploy.resources.reservations.memory ? { memory: deploy.resources.reservations.memory } : {}),
      };
    }
    return result;
  }

  // Use defaults
  return {
    requests: {
      cpu: defaults.cpuRequest,
      memory: defaults.memoryRequest,
    },
    limits: {
      cpu: defaults.cpuLimit,
      memory: defaults.memoryLimit,
    },
  };
}

/**
 * Parse a shell command string into words, respecting quoted arguments.
 * Handles single quotes, double quotes, and escaped characters.
 */
function parseShellWords(input: string): string[] {
  const words: string[] = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;
  let escaped = false;

  for (const ch of input) {
    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\' && !inSingle) {
      escaped = true;
      continue;
    }
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }
    if (/\s/.test(ch) && !inSingle && !inDouble) {
      if (current) {
        words.push(current);
        current = '';
      }
      continue;
    }
    current += ch;
  }
  if (current) words.push(current);
  return words;
}
