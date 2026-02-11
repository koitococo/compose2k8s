export interface IngressRoute {
  serviceName: string;
  path: string;
  port: number;
}

export interface IngressConfig {
  enabled: boolean;
  mode: 'ingress' | 'gateway-api';
  domain?: string;
  tls: boolean;
  certManager: boolean;
  controller: 'nginx' | 'traefik' | 'higress' | 'none';
  gatewayClass?: string;
  routes: IngressRoute[];
}

export interface StorageConfig {
  volumeName: string;
  storageClass: string;
  size: string;
  accessMode: 'ReadWriteOnce' | 'ReadWriteMany' | 'ReadOnlyMany';
}

export interface DeployOptions {
  namespace: string;
  imagePullPolicy: 'Always' | 'IfNotPresent' | 'Never';
  outputFormat: 'plain' | 'single-file';
  outputDir: string;
  migrationScripts: boolean;
  resourceDefaults: {
    cpuRequest: string;
    cpuLimit: string;
    memoryRequest: string;
    memoryLimit: string;
  };
}

export interface WizardConfig {
  selectedServices: string[];
  ingress: IngressConfig;
  envClassification: Record<string, Record<string, 'configmap' | 'secret'>>;
  storageConfig: StorageConfig[];
  initContainers: 'wait-for-port' | 'none';
  deploy: DeployOptions;
}
