# compose2k8s

Convert Docker Compose files to production-ready Kubernetes manifests — with an interactive wizard or fully automated.

## Features

- **Interactive tree-menu wizard** — configure-by-exception: starts with smart defaults, you only change what you need
- **Non-interactive mode** — CI-friendly, uses sensible defaults or a pre-answer config file
- **Smart service analysis** — auto-detects databases, caches, queues, proxies, and workers from image names, ports, and environment variables
- **Workload type inference** — databases and caches get StatefulSets with volume claim templates; stateless services get Deployments
- **Per-service exposure** — ClusterIP, NodePort, LoadBalancer, or Ingress per service
- **Ingress & Gateway API** — generates Ingress (nginx / traefik / higress) or Gateway API resources with optional TLS and cert-manager
- **Secrets safety** — sensitive env vars are placed in Kubernetes Secrets with `REPLACE_ME` placeholders (never real values)
- **Init containers** — generates dependency wait containers using native health checks (`pg_isready`, `redis-cli ping`, `mysqladmin ping`, `mongosh`, `mariadb-admin`) with busybox `nc` fallback
- **Migration scripts** — optional `pg_dump`, `mysqldump`, `mongodump`, `redis BGSAVE` helper scripts
- **Compose features** — handles `${VAR:-default}` interpolation, `.env` files, bind mounts, named volumes, healthchecks, deploy configs, labels, depends_on, entrypoint/command mapping

## Install

```sh
# From source
git clone https://github.com/koitococo/compose2k8s.git
cd compose2k8s
pnpm install
pnpm build

# Run directly
pnpm dev -- -f docker-compose.yml
```

## Quick Start

```sh
# Interactive wizard (auto-detects compose file in cwd)
compose2k8s

# Specify a compose file
compose2k8s -f docker-compose.yml

# Non-interactive with defaults
compose2k8s -f docker-compose.yml --non-interactive

# Custom namespace + single-file output
compose2k8s -f docker-compose.yml -o ./manifests --namespace myapp --format single-file
```

## Usage

### Convert (default command)

```sh
compose2k8s [convert] [options]
```

| Flag | Description |
|------|-------------|
| `-f, --file <path>` | Path to compose file (auto-detected if omitted) |
| `-e, --env-file <path>` | Path to `.env` file |
| `-o, --output <dir>` | Output directory (default: `./k8s`) |
| `-c, --config <path>` | Pre-answer config file (skip interactive prompts) |
| `--non-interactive` | Use inferred defaults without prompting |
| `--format <type>` | `plain` (one file per resource) or `single-file` |
| `--namespace <ns>` | Kubernetes namespace |
| `--auto-clean <mode>` | Output dir exists: `force` / `never` / `interactive` |
| `--image-pull-secret <names>` | Comma-separated image pull secret names |
| `--chdir <dir>` | Working directory for resolving relative paths |

### Validate

Check generated manifests for required fields:

```sh
compose2k8s validate -d ./k8s
```

### Apply

Print the `kubectl apply` command:

```sh
compose2k8s apply -d ./k8s -n myapp --dry-run
```

## How It Works

compose2k8s uses a 5-phase pipeline:

```
Docker Compose YAML
        │
        ▼
   ┌─────────┐
   │  Parse  │  Read YAML, interpolate env vars, normalize ports/volumes/depends_on
   └────┬────┘
        ▼
   ┌─────────┐
   │ Analyze │  Classify services (web/db/cache/queue/worker/proxy),
   └────┬────┘  infer workload types, build dependency graph
        ▼
   ┌─────────┐
   │ Wizard  │  Tree-menu wizard (interactive) or smart defaults (--non-interactive)
   └────┬────┘
        ▼
   ┌─────────┐
   │Generate │  Produce K8s manifests: Deployment, StatefulSet, Service,
   └────┬────┘  Ingress/Gateway, ConfigMap, Secret, PVC, init containers
        ▼
   ┌─────────┐
   │ Output  │  Write YAML files (individual or single multi-doc)
   └─────────┘
```

### Generated Resources

For each compose service, compose2k8s generates:

| Compose Concept | Kubernetes Resource |
|----------------|---------------------|
| Stateless service | Deployment + Service |
| Stateful service (db, cache, queue) | StatefulSet + headless Service + volumeClaimTemplates |
| Named volumes | PersistentVolumeClaim (or VCT for StatefulSets) |
| Bind mounts (config files) | ConfigMap + volumeMount |
| Environment variables | ConfigMap (non-sensitive) + Secret (sensitive) |
| `ports` | Service (ClusterIP / NodePort / LoadBalancer) |
| Ingress-exposed services | Ingress or Gateway + HTTPRoute |
| `depends_on` | Init containers with readiness probes |
| `healthcheck` | Liveness + readiness probes |
| `deploy.replicas` | `spec.replicas` |
| `entrypoint` / `command` | `command` / `args` |

## Config File

Skip interactive prompts with a YAML config file (`-c config.yml`):

```yaml
services: [api, postgres, redis]

workloads:
  postgres:
    workloadType: StatefulSet
    replicas: 1

exposures:
  api:
    type: Ingress
    ingressPath: /
  postgres:
    type: ClusterIP

ingress:
  mode: ingress          # or gateway-api
  domain: app.example.com
  tls: true
  certManager: true
  controller: nginx      # nginx | traefik | higress | none
  routes:
    - service: api
      path: /
      port: 3000

secrets:
  postgres:
    POSTGRES_PASSWORD: secret
    POSTGRES_USER: configmap

storage:
  - volume: pgdata
    size: 20Gi
    accessMode: ReadWriteOnce

deploy:
  namespace: production
  imagePullPolicy: IfNotPresent
  imagePullSecrets: [my-registry-secret]
  format: plain
  outputDir: ./k8s
```

## Example

Given a typical `docker-compose.yml`:

```yaml
services:
  api:
    image: node:20-alpine
    command: ["node", "server.js"]
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      DATABASE_URL: postgres://db:5432/myapp
    depends_on:
      - postgres

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: myapp
      POSTGRES_USER: admin
      POSTGRES_PASSWORD: secret
    volumes:
      - pgdata:/var/lib/postgresql/data
    ports:
      - "5432:5432"

volumes:
  pgdata:
```

Running `compose2k8s --non-interactive` generates:

```
k8s/
├── api-deployment.yaml
├── api-service.yaml
├── api-configmap-env.yaml
├── api-secret.yaml
├── postgres-statefulset.yaml
├── postgres-headless-service.yaml
├── postgres-service.yaml
├── postgres-configmap-env.yaml
├── postgres-secret.yaml
└── README.md
```

## Development

```sh
pnpm install          # Install dependencies
pnpm dev -- [args]    # Run with tsx
pnpm build            # Bundle to dist/
pnpm test             # Run tests (vitest)
pnpm lint             # Lint (oxlint)
```

## License

MIT
