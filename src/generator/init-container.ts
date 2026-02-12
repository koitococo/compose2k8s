import type { AnalyzedService } from '../types/analysis.js';
import type { WizardConfig } from '../types/config.js';
import { toK8sName } from '../utils/k8s-names.js';

/**
 * Default ports for common service categories.
 */
const CATEGORY_DEFAULT_PORTS: Record<string, number> = {
  database: 5432,
  cache: 6379,
  queue: 5672,
  web: 80,
  proxy: 80,
  api: 3000,
};

/** Maximum number of retries before the init container gives up. */
const MAX_RETRIES = 150;

/**
 * Native readiness checks for well-known service images.
 * Uses the service's own image and built-in CLI tools instead of TCP port probing.
 */
interface NativeReadinessCheck {
  imagePattern: string;
  command: (host: string, port: number) => string;
}

const NATIVE_READINESS_CHECKS: NativeReadinessCheck[] = [
  {
    imagePattern: 'postgres',
    command: (host, port) => `pg_isready -h ${host} -p ${port} -q`,
  },
  {
    imagePattern: 'mysql',
    command: (host, port) => `mysqladmin ping -h ${host} -P ${port} --silent`,
  },
  {
    imagePattern: 'mariadb',
    command: (host, port) => `mariadb-admin ping -h ${host} -P ${port} --silent`,
  },
  {
    imagePattern: 'redis',
    command: (host, port) => `redis-cli -h ${host} -p ${port} ping | grep -q PONG`,
  },
  {
    imagePattern: 'mongo',
    command: (host, port) =>
      `mongosh --host ${host} --port ${port} --quiet --eval "db.adminCommand('ping')"`,
  },
];

/**
 * Generate init containers for dependency readiness checking.
 * Uses native readiness tools (pg_isready, redis-cli, etc.) for known images,
 * falls back to busybox nc port probe for unknown services.
 */
export function generateInitContainers(
  analyzed: AnalyzedService,
  config: WizardConfig,
  allServices?: Record<string, AnalyzedService>,
): Record<string, unknown>[] {
  if (config.initContainers !== 'wait-for-port') return [];

  const initContainers: Record<string, unknown>[] = [];

  for (const dep of analyzed.dependsOn) {
    if (!config.selectedServices.includes(dep)) continue;

    const depName = toK8sName(dep);
    const depPort = getDepPort(dep, allServices);
    const depImage = allServices?.[dep]?.service.image;
    const nativeCheck = depImage ? findNativeCheck(depImage) : null;

    if (nativeCheck) {
      initContainers.push({
        name: `wait-for-${depName}`,
        image: depImage,
        command: [
          'sh',
          '-c',
          buildWaitScript(nativeCheck.command(depName, depPort), dep),
        ],
      });
    } else {
      initContainers.push({
        name: `wait-for-${depName}`,
        image: 'busybox:1.37',
        command: [
          'sh',
          '-c',
          buildWaitScript(`nc -z ${depName} ${depPort}`, dep),
        ],
      });
    }
  }

  return initContainers;
}

function buildWaitScript(checkCmd: string, depName: string): string {
  return `i=0; until ${checkCmd}; do i=$((i+1)); if [ $i -ge ${MAX_RETRIES} ]; then echo "Timeout waiting for ${depName} after ${MAX_RETRIES} attempts"; exit 1; fi; echo "Waiting for ${depName}... ($i/${MAX_RETRIES})"; sleep 2; done`;
}

function findNativeCheck(image: string): NativeReadinessCheck | null {
  const imageName = image.split(':')[0].split('/').pop()!.toLowerCase();
  return NATIVE_READINESS_CHECKS.find((c) => imageName.includes(c.imagePattern)) ?? null;
}

function getDepPort(
  depName: string,
  allServices?: Record<string, AnalyzedService>,
): number {
  if (allServices) {
    const depSvc = allServices[depName];
    if (depSvc && depSvc.ports.length > 0) {
      return depSvc.ports[0].containerPort;
    }
    if (depSvc) {
      return CATEGORY_DEFAULT_PORTS[depSvc.category] ?? 80;
    }
  }
  return 80;
}
