import { z } from 'zod';

const healthcheckSchema = z
  .object({
    test: z
      .union([z.string(), z.array(z.string())])
      .optional(),
    interval: z.string().optional(),
    timeout: z.string().optional(),
    retries: z.number().optional(),
    start_period: z.string().optional(),
    disable: z.boolean().optional(),
  })
  .passthrough();

const deploySchema = z
  .object({
    replicas: z.number().optional(),
    resources: z
      .object({
        limits: z
          .object({
            cpus: z.string().optional(),
            memory: z.string().optional(),
          })
          .passthrough()
          .optional(),
        reservations: z
          .object({
            cpus: z.string().optional(),
            memory: z.string().optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
    restart_policy: z
      .object({
        condition: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const portObjectSchema = z.object({
  target: z.number(),
  published: z.union([z.number(), z.string()]).optional(),
  protocol: z.enum(['tcp', 'udp']).optional(),
});

const volumeObjectSchema = z.object({
  type: z.enum(['bind', 'volume', 'tmpfs']).optional(),
  source: z.string().optional(),
  target: z.string(),
  read_only: z.boolean().optional(),
});

const dependsOnEntrySchema = z.object({
  condition: z
    .enum(['service_started', 'service_healthy', 'service_completed_successfully'])
    .optional(),
});

const serviceSchema = z
  .object({
    image: z.string().optional(),
    build: z
      .union([
        z.string(),
        z.object({ context: z.string().optional(), dockerfile: z.string().optional() }).passthrough(),
      ])
      .optional(),
    command: z.union([z.string(), z.array(z.string())]).optional(),
    entrypoint: z.union([z.string(), z.array(z.string())]).optional(),
    environment: z
      .union([z.array(z.string()), z.record(z.union([z.string(), z.number(), z.boolean(), z.null()]))])
      .optional(),
    env_file: z
      .union([z.string(), z.array(z.union([z.string(), z.object({ path: z.string() }).passthrough()]))])
      .optional(),
    ports: z
      .array(z.union([z.string(), z.number(), portObjectSchema]))
      .optional(),
    volumes: z.array(z.union([z.string(), volumeObjectSchema])).optional(),
    depends_on: z
      .union([z.array(z.string()), z.record(dependsOnEntrySchema)])
      .optional(),
    labels: z
      .union([z.array(z.string()), z.record(z.string())])
      .optional(),
    networks: z
      .union([z.array(z.string()), z.record(z.unknown())])
      .optional(),
    restart: z.string().optional(),
    healthcheck: healthcheckSchema.optional(),
    deploy: deploySchema.optional(),
    working_dir: z.string().optional(),
    user: z.string().optional(),
    privileged: z.boolean().optional(),
    cap_add: z.array(z.string()).optional(),
    cap_drop: z.array(z.string()).optional(),
    tmpfs: z.union([z.string(), z.array(z.string())]).optional(),
    extra_hosts: z.array(z.string()).optional(),
  })
  .passthrough();

const volumeConfigSchema = z
  .union([
    z
      .object({
        driver: z.string().optional(),
        driver_opts: z.record(z.string()).optional(),
        external: z.boolean().optional(),
        name: z.string().optional(),
        labels: z.union([z.array(z.string()), z.record(z.string())]).optional(),
      })
      .passthrough(),
    z.null(),
  ]);

const networkConfigSchema = z
  .union([
    z
      .object({
        driver: z.string().optional(),
        external: z.boolean().optional(),
        name: z.string().optional(),
      })
      .passthrough(),
    z.null(),
  ]);

export const composeSchema = z
  .object({
    version: z.string().optional(),
    services: z.record(serviceSchema),
    volumes: z.record(volumeConfigSchema).optional(),
    networks: z.record(networkConfigSchema).optional(),
  })
  .passthrough();

export type ComposeSchemaInput = z.input<typeof composeSchema>;
