import * as p from '@clack/prompts';
import type { AnalysisResult } from '../types/analysis.js';
import type { WizardConfig } from '../types/config.js';
import { selectServices } from './services.js';
import { configureIngress } from './ingress.js';
import { configureSecrets } from './secrets.js';
import { configureStorage } from './storage.js';
import { configureHealth } from './health.js';
import { configureResources } from './resources.js';
import { configureDeploy } from './deploy.js';

/**
 * Run the interactive 7-step wizard.
 */
export async function runWizard(analysis: AnalysisResult): Promise<WizardConfig | null> {
  p.intro('compose2k8s — Docker Compose → Kubernetes');

  // Step 1: Select services
  const selectedServices = await selectServices(analysis);
  if (p.isCancel(selectedServices)) {
    p.cancel('Conversion cancelled.');
    return null;
  }

  // Step 2: Ingress / Gateway API
  const ingress = await configureIngress(analysis, selectedServices);
  if (p.isCancel(ingress)) {
    p.cancel('Conversion cancelled.');
    return null;
  }

  // Step 3: Secrets classification
  const envClassification = await configureSecrets(analysis, selectedServices);
  if (p.isCancel(envClassification)) {
    p.cancel('Conversion cancelled.');
    return null;
  }

  // Step 4: Storage
  const storageConfig = await configureStorage(analysis, selectedServices);
  if (p.isCancel(storageConfig)) {
    p.cancel('Conversion cancelled.');
    return null;
  }

  // Step 5: Health / Dependencies
  const health = await configureHealth(analysis, selectedServices);
  if (p.isCancel(health)) {
    p.cancel('Conversion cancelled.');
    return null;
  }

  // Step 6: Resource limits
  const resourceOverrides = await configureResources(analysis, selectedServices);
  if (p.isCancel(resourceOverrides)) {
    p.cancel('Conversion cancelled.');
    return null;
  }

  // Step 7: Deploy options
  const deploy = await configureDeploy();
  if (p.isCancel(deploy)) {
    p.cancel('Conversion cancelled.');
    return null;
  }

  p.outro('Configuration complete!');

  return {
    selectedServices,
    ingress,
    envClassification,
    storageConfig,
    initContainers: health.initContainers,
    resourceOverrides,
    deploy,
  };
}
