import { readFile } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';
import type { AnalysisResult } from '../types/analysis.js';
import type { WizardConfig } from '../types/config.js';
import { generateDefaults } from '../interactive/defaults.js';
import { toK8sName } from '../utils/k8s-names.js';
import { configFileSchema, type ConfigFile } from './schema.js';

/**
 * Load a pre-answer config file and merge with analysis defaults.
 */
export async function loadConfigFile(
  configPath: string,
  analysis: AnalysisResult,
): Promise<{ config: WizardConfig; warnings: string[] }> {
  const raw = await readFile(configPath, 'utf-8');
  const parsed = parseYaml(raw);
  const userConfig = configFileSchema.parse(parsed ?? {});

  const warnings: string[] = [];
  const defaults = generateDefaults(analysis);

  const ingress = resolveIngress(userConfig, defaults);
  const serviceExposures = resolveExposures(userConfig, defaults, ingress, analysis, warnings);

  const config: WizardConfig = {
    ...defaults,
    selectedServices: resolveServices(userConfig, defaults, analysis, warnings),
    workloadOverrides: resolveWorkloads(userConfig, defaults, analysis, warnings),
    serviceExposures,
    ingress,
    envClassification: resolveSecrets(userConfig, defaults, analysis, warnings),
    storageConfig: resolveStorage(userConfig, defaults),
    initContainers: userConfig.initContainers,
    podSecurityStandard: userConfig.podSecurityStandard,
    resourceOverrides: userConfig.resources ?? {},
    deploy: resolveDeploy(userConfig, defaults),
  };

  return { config, warnings };
}

function resolveServices(
  userConfig: ConfigFile,
  defaults: WizardConfig,
  analysis: AnalysisResult,
  warnings: string[],
): string[] {
  if (!userConfig.services) return defaults.selectedServices;

  const allServiceNames = Object.keys(analysis.services);
  const valid: string[] = [];
  for (const name of userConfig.services) {
    if (allServiceNames.includes(name)) {
      valid.push(name);
    } else {
      warnings.push(`Unknown service "${name}" in config — skipping.`);
    }
  }
  return valid.length > 0 ? valid : defaults.selectedServices;
}

function resolveWorkloads(
  userConfig: ConfigFile,
  defaults: WizardConfig,
  analysis: AnalysisResult,
  warnings: string[],
): WizardConfig['workloadOverrides'] {
  const result = { ...defaults.workloadOverrides };

  if (!userConfig.workloads) return result;

  for (const [svcName, override] of Object.entries(userConfig.workloads)) {
    if (!analysis.services[svcName]) {
      warnings.push(`Unknown service "${svcName}" in workloads config — skipping.`);
      continue;
    }
    result[svcName] = {
      workloadType: override.workloadType,
      replicas: override.replicas,
    };
  }

  return result;
}

function resolveIngress(
  userConfig: ConfigFile,
  defaults: WizardConfig,
): WizardConfig['ingress'] {
  if (!userConfig.ingress) return defaults.ingress;

  const ing = userConfig.ingress;
  return {
    enabled: true,
    mode: ing.mode,
    domain: ing.domain,
    tls: ing.tls,
    certManager: ing.certManager,
    controller: ing.controller,
    gatewayClass: ing.gatewayClass,
    routes: ing.routes.map((r) => ({
      serviceName: r.service,
      path: r.path,
      port: r.port,
    })),
  };
}

function resolveExposures(
  userConfig: ConfigFile,
  defaults: WizardConfig,
  ingress: WizardConfig['ingress'],
  analysis: AnalysisResult,
  warnings: string[],
): WizardConfig['serviceExposures'] {
  const result = { ...defaults.serviceExposures };

  // If user specified explicit exposures, merge them
  if (userConfig.exposures) {
    for (const [svcName, exposure] of Object.entries(userConfig.exposures)) {
      if (!analysis.services[svcName]) {
        warnings.push(`Unknown service "${svcName}" in exposures config — skipping.`);
        continue;
      }
      result[svcName] = {
        type: exposure.type,
        ...(exposure.ingressPath ? { ingressPath: exposure.ingressPath } : {}),
        ...(exposure.nodePort != null ? { nodePort: exposure.nodePort } : {}),
      };
    }
    return result;
  }

  // Backward compat: if ingress.routes exist but no exposures, derive from routes
  if (ingress.enabled && ingress.routes.length > 0) {
    const routeServices = new Set(ingress.routes.map((r) => r.serviceName));
    for (const svcName of Object.keys(result)) {
      if (routeServices.has(svcName)) {
        const route = ingress.routes.find((r) => r.serviceName === svcName);
        if (!route) continue;
        result[svcName] = { type: 'Ingress', ingressPath: route.path };
      }
    }
  }

  return result;
}

function resolveSecrets(
  userConfig: ConfigFile,
  defaults: WizardConfig,
  analysis: AnalysisResult,
  warnings: string[],
): WizardConfig['envClassification'] {
  const result = { ...defaults.envClassification };

  if (!userConfig.secrets) return result;

  for (const [svcName, vars] of Object.entries(userConfig.secrets)) {
    if (!analysis.services[svcName]) {
      warnings.push(`Unknown service "${svcName}" in secrets config — skipping.`);
      continue;
    }
    if (!result[svcName]) result[svcName] = {};

    const knownVars = new Set(analysis.services[svcName].envVars.map((e) => e.name));
    for (const [varName, classification] of Object.entries(vars)) {
      if (!knownVars.has(varName)) {
        warnings.push(`Unknown env var "${varName}" for service "${svcName}" — applying anyway.`);
      }
      result[svcName][varName] = classification;
    }
  }

  return result;
}

function resolveStorage(
  userConfig: ConfigFile,
  defaults: WizardConfig,
): WizardConfig['storageConfig'] {
  if (!userConfig.storage) return defaults.storageConfig;

  const result = [...defaults.storageConfig];

  for (const item of userConfig.storage) {
    const volName = toK8sName(item.volume);
    const existing = result.find((s) => s.volumeName === volName);
    if (existing) {
      existing.size = item.size;
      existing.accessMode = item.accessMode;
      existing.storageClass = item.storageClass;
    } else {
      result.push({
        volumeName: volName,
        size: item.size,
        accessMode: item.accessMode,
        storageClass: item.storageClass,
      });
    }
  }

  return result;
}

function resolveDeploy(
  userConfig: ConfigFile,
  defaults: WizardConfig,
): WizardConfig['deploy'] {
  const d = userConfig.deploy;
  return {
    namespace: d.namespace,
    imagePullPolicy: d.imagePullPolicy,
    imagePullSecrets: d.imagePullSecrets,
    outputFormat: d.format,
    outputDir: d.outputDir,
    migrationScripts: d.migrationScripts,
    resourceDefaults: {
      cpuRequest: d.resources.cpuRequest,
      cpuLimit: d.resources.cpuLimit,
      memoryRequest: d.resources.memoryRequest,
      memoryLimit: d.resources.memoryLimit,
    },
  };
}
