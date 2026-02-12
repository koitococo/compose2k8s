import { z } from 'zod';

const ingressRouteSchema = z.object({
  service: z.string(),
  path: z.string(),
  port: z.number(),
});

const ingressSchema = z.object({
  mode: z.enum(['ingress', 'gateway-api']).default('ingress'),
  domain: z.string().optional(),
  tls: z.boolean().default(false),
  certManager: z.boolean().default(false),
  controller: z.enum(['nginx', 'traefik', 'higress', 'none']).default('nginx'),
  gatewayClass: z.string().optional(),
  routes: z.array(ingressRouteSchema).default([]),
});

const storageItemSchema = z.object({
  volume: z.string(),
  size: z.string().default('10Gi'),
  accessMode: z
    .enum(['ReadWriteOnce', 'ReadWriteMany', 'ReadOnlyMany'])
    .default('ReadWriteOnce'),
  storageClass: z.string().default(''),
});

const resourcesSchema = z.object({
  cpuRequest: z.string().default('100m'),
  cpuLimit: z.string().default('500m'),
  memoryRequest: z.string().default('128Mi'),
  memoryLimit: z.string().default('512Mi'),
});

const workloadOverrideSchema = z.object({
  workloadType: z.enum(['Deployment', 'StatefulSet']),
  replicas: z.number().int().min(1).default(1),
  imagePullPolicy: z.enum(['Always', 'IfNotPresent', 'Never']).optional(),
});

const deploySchema = z.object({
  namespace: z.string().default('default'),
  imagePullPolicy: z
    .enum(['Always', 'IfNotPresent', 'Never'])
    .default('IfNotPresent'),
  imagePullSecrets: z.array(z.string()).default([]),
  format: z.enum(['plain', 'single-file']).default('plain'),
  outputDir: z.string().default('./k8s'),
  migrationScripts: z.boolean().default(true),
  resources: resourcesSchema.default({}),
});

export const configFileSchema = z.object({
  services: z.array(z.string()).optional(),
  ingress: ingressSchema.optional(),
  secrets: z.record(z.string(), z.record(z.string(), z.enum(['configmap', 'secret']))).optional(),
  storage: z.array(storageItemSchema).optional(),
  workloads: z.record(z.string(), workloadOverrideSchema).optional(),
  initContainers: z.enum(['wait-for-port', 'none']).default('wait-for-port'),
  resources: z.record(z.string(), resourcesSchema).optional(),
  deploy: deploySchema.default({}),
});

export type ConfigFile = z.infer<typeof configFileSchema>;
