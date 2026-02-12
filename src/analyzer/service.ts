import type { ComposeService } from '../types/compose.js';
import type { ServiceCategory, WorkloadType } from '../types/analysis.js';

const IMAGE_CATEGORY_MAP: Record<string, ServiceCategory> = {
  postgres: 'database',
  postgresql: 'database',
  mysql: 'database',
  mariadb: 'database',
  mongo: 'database',
  mongodb: 'database',
  redis: 'cache',
  memcached: 'cache',
  rabbitmq: 'queue',
  kafka: 'queue',
  nats: 'queue',
  nginx: 'proxy',
  traefik: 'proxy',
  haproxy: 'proxy',
  caddy: 'proxy',
  httpd: 'web',
  apache: 'web',
};

const PORT_CATEGORY_MAP: Record<number, ServiceCategory> = {
  5432: 'database',
  3306: 'database',
  27017: 'database',
  6379: 'cache',
  11211: 'cache',
  5672: 'queue',
  15672: 'queue',
  9092: 'queue',
  80: 'web',
  443: 'web',
  8080: 'api',
  3000: 'api',
  4000: 'api',
  8000: 'api',
};

const NAME_CATEGORY_MAP: Record<string, ServiceCategory> = {
  db: 'database',
  database: 'database',
  postgres: 'database',
  mysql: 'database',
  mongo: 'database',
  redis: 'cache',
  cache: 'cache',
  memcached: 'cache',
  rabbitmq: 'queue',
  kafka: 'queue',
  queue: 'queue',
  worker: 'worker',
  celery: 'worker',
  cron: 'worker',
  scheduler: 'worker',
  nginx: 'proxy',
  proxy: 'proxy',
  traefik: 'proxy',
  web: 'web',
  frontend: 'web',
  api: 'api',
  backend: 'api',
  app: 'api',
  server: 'api',
};

// These env patterns indicate the service IS that type (server-side config),
// NOT that it connects to that type. Patterns like REDIS_URL or DATABASE_URL
// indicate a client, not the server itself.
const ENV_CATEGORY_PATTERNS: Array<[RegExp, ServiceCategory]> = [
  [/^POSTGRES_(USER|PASSWORD|DB|HOST_AUTH_METHOD|INITDB)/, 'database'],
  [/^MYSQL_(ROOT_PASSWORD|DATABASE|USER|PASSWORD|ALLOW)/, 'database'],
  [/^MONGO_INITDB/, 'database'],
  [/^REDIS_(PASSWORD|MAXMEMORY|APPENDONLY)$/, 'cache'],
  [/^RABBITMQ_(DEFAULT_USER|DEFAULT_PASS|DEFAULT_VHOST)/, 'queue'],
];

const STATEFUL_CATEGORIES: Set<ServiceCategory> = new Set([
  'database',
  'cache',
  'queue',
]);

/**
 * Infer the service category from image, env vars, ports, and name.
 */
export function inferServiceCategory(
  name: string,
  service: ComposeService,
): ServiceCategory {
  // 1. Image name match
  if (service.image) {
    const imageName = (service.image.split(':')[0].split('/').pop() ?? '').toLowerCase();
    for (const [pattern, category] of Object.entries(IMAGE_CATEGORY_MAP)) {
      if (imageName.includes(pattern)) return category;
    }
  }

  // 2. Environment variable patterns
  for (const envKey of Object.keys(service.environment)) {
    for (const [pattern, category] of ENV_CATEGORY_PATTERNS) {
      if (pattern.test(envKey)) return category;
    }
  }

  // 3. Port patterns
  for (const port of service.ports) {
    const category = PORT_CATEGORY_MAP[port.target];
    if (category) return category;
  }

  // 4. Service name patterns
  const lowerName = name.toLowerCase();
  for (const [pattern, category] of Object.entries(NAME_CATEGORY_MAP)) {
    if (lowerName.includes(pattern)) return category;
  }

  // 5. Fallback
  return 'api';
}

/**
 * Infer the workload type (Deployment vs StatefulSet).
 */
export function inferWorkloadType(
  _name: string,
  service: ComposeService,
  category: ServiceCategory,
): WorkloadType {
  // Stateful categories get StatefulSet
  if (STATEFUL_CATEGORIES.has(category)) return 'StatefulSet';

  // Services with named volumes (persistent data) get StatefulSet
  const hasNamedVolume = service.volumes.some(
    (v) => v.type === 'volume' && v.source !== '',
  );
  if (hasNamedVolume && category !== 'api' && category !== 'web' && category !== 'proxy') {
    return 'StatefulSet';
  }

  return 'Deployment';
}
