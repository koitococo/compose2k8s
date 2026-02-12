import { describe, it, expect } from 'vitest';
import { generateInitContainers } from '../../src/generator/init-container.js';
import type { AnalyzedService } from '../../src/types/analysis.js';
import type { WizardConfig } from '../../src/types/config.js';

function makeConfig(overrides: Partial<WizardConfig> = {}): WizardConfig {
  return {
    selectedServices: ['api', 'postgres', 'redis'],
    workloadOverrides: {},
    serviceExposures: {},
    ingress: { enabled: false, tls: false, certManager: false, controller: 'none', routes: [] },
    envClassification: {},
    storageConfig: [],
    initContainers: 'wait-for-port',
    resourceOverrides: {},
    deploy: {
      namespace: 'default',
      imagePullPolicy: 'IfNotPresent',
      imagePullSecrets: [],
      outputFormat: 'plain',
      outputDir: './k8s',
      migrationScripts: true,
      resourceDefaults: {
        cpuRequest: '100m',
        cpuLimit: '500m',
        memoryRequest: '128Mi',
        memoryLimit: '512Mi',
      },
    },
    ...overrides,
  };
}

function makeService(overrides: Partial<AnalyzedService> = {}): AnalyzedService {
  return {
    name: 'api',
    service: {
      image: 'myapp/api:latest',
      environment: {},
      ports: [{ target: 3000, published: 3000, protocol: 'tcp' }],
      volumes: [],
      depends_on: {},
      labels: {},
    },
    category: 'api',
    workloadType: 'Deployment',
    volumes: [],
    ports: [{ containerPort: 3000, protocol: 'tcp', publishedPort: 3000 }],
    envVars: [],
    dependsOn: ['postgres', 'redis'],
    ...overrides,
  };
}

function makePostgres(): AnalyzedService {
  return {
    name: 'postgres',
    service: {
      image: 'postgres:16-alpine',
      environment: { POSTGRES_DB: 'mydb' },
      ports: [{ target: 5432, published: 5432, protocol: 'tcp' }],
      volumes: [],
      depends_on: {},
      labels: {},
    },
    category: 'database',
    workloadType: 'StatefulSet',
    volumes: [],
    ports: [{ containerPort: 5432, protocol: 'tcp', publishedPort: 5432 }],
    envVars: [],
    dependsOn: [],
  };
}

function makeRedis(): AnalyzedService {
  return {
    name: 'redis',
    service: {
      image: 'redis:7-alpine',
      environment: {},
      ports: [{ target: 6379, published: 6379, protocol: 'tcp' }],
      volumes: [],
      depends_on: {},
      labels: {},
    },
    category: 'cache',
    workloadType: 'StatefulSet',
    volumes: [],
    ports: [{ containerPort: 6379, protocol: 'tcp', publishedPort: 6379 }],
    envVars: [],
    dependsOn: [],
  };
}

describe('generateInitContainers', () => {
  it('returns empty when initContainers is none', () => {
    const config = makeConfig({ initContainers: 'none' });
    const result = generateInitContainers(makeService(), config);
    expect(result).toEqual([]);
  });

  it('uses pg_isready for postgres dependency', () => {
    const allServices = { api: makeService(), postgres: makePostgres(), redis: makeRedis() };
    const config = makeConfig({ selectedServices: ['api', 'postgres'] });
    const api = makeService({ dependsOn: ['postgres'] });

    const result = generateInitContainers(api, config, allServices);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('wait-for-postgres');
    expect(result[0].image).toBe('postgres:16-alpine');
    const cmd = (result[0].command as string[])[2];
    expect(cmd).toContain('pg_isready -h postgres -p 5432 -q');
    expect(cmd).not.toContain('nc -z');
  });

  it('uses redis-cli for redis dependency', () => {
    const allServices = { api: makeService(), postgres: makePostgres(), redis: makeRedis() };
    const config = makeConfig({ selectedServices: ['api', 'redis'] });
    const api = makeService({ dependsOn: ['redis'] });

    const result = generateInitContainers(api, config, allServices);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('wait-for-redis');
    expect(result[0].image).toBe('redis:7-alpine');
    const cmd = (result[0].command as string[])[2];
    expect(cmd).toContain('redis-cli -h redis -p 6379 ping | grep -q PONG');
  });

  it('uses mysqladmin for mysql dependency', () => {
    const mysql: AnalyzedService = {
      name: 'mysql',
      service: {
        image: 'mysql:8.0',
        environment: {},
        ports: [{ target: 3306, published: 3306, protocol: 'tcp' }],
        volumes: [],
        depends_on: {},
        labels: {},
      },
      category: 'database',
      workloadType: 'StatefulSet',
      volumes: [],
      ports: [{ containerPort: 3306, protocol: 'tcp', publishedPort: 3306 }],
      envVars: [],
      dependsOn: [],
    };
    const api = makeService({ dependsOn: ['mysql'] });
    const allServices = { api, mysql };
    const config = makeConfig({ selectedServices: ['api', 'mysql'] });

    const result = generateInitContainers(api, config, allServices);

    expect(result[0].image).toBe('mysql:8.0');
    const cmd = (result[0].command as string[])[2];
    expect(cmd).toContain('mysqladmin ping -h mysql -P 3306 --silent');
  });

  it('uses mariadb-admin for mariadb dependency', () => {
    const mariadb: AnalyzedService = {
      name: 'mariadb',
      service: {
        image: 'mariadb:11',
        environment: {},
        ports: [{ target: 3306, published: 3306, protocol: 'tcp' }],
        volumes: [],
        depends_on: {},
        labels: {},
      },
      category: 'database',
      workloadType: 'StatefulSet',
      volumes: [],
      ports: [{ containerPort: 3306, protocol: 'tcp', publishedPort: 3306 }],
      envVars: [],
      dependsOn: [],
    };
    const api = makeService({ dependsOn: ['mariadb'] });
    const allServices = { api, mariadb };
    const config = makeConfig({ selectedServices: ['api', 'mariadb'] });

    const result = generateInitContainers(api, config, allServices);

    expect(result[0].image).toBe('mariadb:11');
    const cmd = (result[0].command as string[])[2];
    expect(cmd).toContain('mariadb-admin ping -h mariadb -P 3306 --silent');
  });

  it('uses mongosh for mongo dependency', () => {
    const mongo: AnalyzedService = {
      name: 'mongo',
      service: {
        image: 'mongo:7',
        environment: {},
        ports: [{ target: 27017, published: 27017, protocol: 'tcp' }],
        volumes: [],
        depends_on: {},
        labels: {},
      },
      category: 'database',
      workloadType: 'StatefulSet',
      volumes: [],
      ports: [{ containerPort: 27017, protocol: 'tcp', publishedPort: 27017 }],
      envVars: [],
      dependsOn: [],
    };
    const api = makeService({ dependsOn: ['mongo'] });
    const allServices = { api, mongo };
    const config = makeConfig({ selectedServices: ['api', 'mongo'] });

    const result = generateInitContainers(api, config, allServices);

    expect(result[0].image).toBe('mongo:7');
    const cmd = (result[0].command as string[])[2];
    expect(cmd).toContain('mongosh --host mongo --port 27017 --quiet');
  });

  it('falls back to busybox nc for unknown images', () => {
    const unknown: AnalyzedService = {
      name: 'custom-svc',
      service: {
        image: 'my-company/custom-service:v2',
        environment: {},
        ports: [{ target: 8080, published: 8080, protocol: 'tcp' }],
        volumes: [],
        depends_on: {},
        labels: {},
      },
      category: 'api',
      workloadType: 'Deployment',
      volumes: [],
      ports: [{ containerPort: 8080, protocol: 'tcp', publishedPort: 8080 }],
      envVars: [],
      dependsOn: [],
    };
    const api = makeService({ dependsOn: ['custom-svc'] });
    const allServices = { api, 'custom-svc': unknown };
    const config = makeConfig({ selectedServices: ['api', 'custom-svc'] });

    const result = generateInitContainers(api, config, allServices);

    expect(result[0].image).toBe('busybox:1.37');
    const cmd = (result[0].command as string[])[2];
    expect(cmd).toContain('nc -z custom-svc 8080');
  });

  it('falls back to busybox when dependency has no image', () => {
    const noImage: AnalyzedService = {
      name: 'svc',
      service: {
        environment: {},
        ports: [],
        volumes: [],
        depends_on: {},
        labels: {},
      },
      category: 'api',
      workloadType: 'Deployment',
      volumes: [],
      ports: [],
      envVars: [],
      dependsOn: [],
    };
    const api = makeService({ dependsOn: ['svc'] });
    const allServices = { api, svc: noImage };
    const config = makeConfig({ selectedServices: ['api', 'svc'] });

    const result = generateInitContainers(api, config, allServices);

    expect(result[0].image).toBe('busybox:1.37');
  });

  it('generates multiple init containers with mixed strategies', () => {
    const allServices = { api: makeService(), postgres: makePostgres(), redis: makeRedis() };
    const config = makeConfig();
    const api = makeService();

    const result = generateInitContainers(api, config, allServices);

    expect(result).toHaveLength(2);

    // postgres uses native check
    expect(result[0].image).toBe('postgres:16-alpine');
    expect((result[0].command as string[])[2]).toContain('pg_isready');

    // redis uses native check
    expect(result[1].image).toBe('redis:7-alpine');
    expect((result[1].command as string[])[2]).toContain('redis-cli');
  });

  it('handles custom registry postgres image', () => {
    const pg: AnalyzedService = {
      ...makePostgres(),
      service: {
        ...makePostgres().service,
        image: 'my-registry.io/infra/postgres:16',
      },
    };
    const api = makeService({ dependsOn: ['postgres'] });
    const allServices = { api, postgres: pg };
    const config = makeConfig({ selectedServices: ['api', 'postgres'] });

    const result = generateInitContainers(api, config, allServices);

    expect(result[0].image).toBe('my-registry.io/infra/postgres:16');
    expect((result[0].command as string[])[2]).toContain('pg_isready');
  });

  it('skips dependencies not in selectedServices', () => {
    const allServices = { api: makeService(), postgres: makePostgres(), redis: makeRedis() };
    const config = makeConfig({ selectedServices: ['api', 'postgres'] });
    const api = makeService(); // dependsOn: ['postgres', 'redis']

    const result = generateInitContainers(api, config, allServices);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('wait-for-postgres');
  });

  it('includes retry logic in all generated commands', () => {
    const allServices = { api: makeService(), postgres: makePostgres() };
    const config = makeConfig({ selectedServices: ['api', 'postgres'] });
    const api = makeService({ dependsOn: ['postgres'] });

    const result = generateInitContainers(api, config, allServices);
    const cmd = (result[0].command as string[])[2];

    expect(cmd).toContain('i=0; until');
    expect(cmd).toContain('i=$((i+1))');
    expect(cmd).toContain('if [ $i -ge 150 ]');
    expect(cmd).toContain('Timeout waiting for postgres');
    expect(cmd).toContain('sleep 2');
  });
});
