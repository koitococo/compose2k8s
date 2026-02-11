export interface ComposePort {
  target: number;
  published?: number;
  protocol?: 'tcp' | 'udp';
}

export interface ComposeVolumeMount {
  source: string;
  target: string;
  readOnly: boolean;
  type: 'bind' | 'volume' | 'tmpfs';
}

export interface ComposeHealthcheck {
  test: string[];
  interval?: string;
  timeout?: string;
  retries?: number;
  start_period?: string;
  disable?: boolean;
}

export interface ComposeDeployResources {
  limits?: { cpus?: string; memory?: string };
  reservations?: { cpus?: string; memory?: string };
}

export interface ComposeDeploy {
  replicas?: number;
  resources?: ComposeDeployResources;
  restart_policy?: { condition?: string };
}

export interface ComposeDependsOnEntry {
  condition?: 'service_started' | 'service_healthy' | 'service_completed_successfully';
}

export interface ComposeService {
  image?: string;
  build?: string | { context?: string; dockerfile?: string };
  command?: string | string[];
  entrypoint?: string | string[];
  environment: Record<string, string>;
  env_file?: string[];
  ports: ComposePort[];
  volumes: ComposeVolumeMount[];
  depends_on: Record<string, ComposeDependsOnEntry>;
  labels: Record<string, string>;
  networks?: string[];
  restart?: string;
  healthcheck?: ComposeHealthcheck;
  deploy?: ComposeDeploy;
  working_dir?: string;
  user?: string;
  privileged?: boolean;
  cap_add?: string[];
  cap_drop?: string[];
  tmpfs?: string | string[];
  extra_hosts?: string[];
  [key: string]: unknown;
}

export interface ComposeVolumeConfig {
  driver?: string;
  driver_opts?: Record<string, string>;
  external?: boolean;
  name?: string;
  labels?: Record<string, string>;
}

export interface ComposeNetworkConfig {
  driver?: string;
  external?: boolean;
  name?: string;
}

export interface ComposeProject {
  version?: string;
  services: Record<string, ComposeService>;
  volumes: Record<string, ComposeVolumeConfig | null>;
  networks: Record<string, ComposeNetworkConfig | null>;
}

export interface ParseResult {
  project: ComposeProject;
  warnings: string[];
  sourceFile: string;
}
