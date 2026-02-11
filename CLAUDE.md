# compose2k8s

A TypeScript CLI tool that converts Docker Compose files to Kubernetes manifests with an interactive wizard.

## Quick Start

```sh
pnpm install
pnpm tsx src/index.ts -f path/to/docker-compose.yml          # interactive mode
pnpm tsx src/index.ts -f path/to/docker-compose.yml --non-interactive  # use defaults
```

## Commands

```sh
pnpm dev                    # Run with tsx (pass CLI args after --)
pnpm build                  # Bundle to dist/index.js via tsdown
pnpm test                   # Run all tests via vitest
pnpm lint                   # Lint with oxlint
```

## Architecture

**5-phase pipeline:** Parse → Analyze → Interactive → Generate → Output

```
src/
├── parser/          # Phase 1: Read compose YAML, interpolate env vars, validate, normalize
│   ├── compose.ts   # Main orchestrator: parseComposeFile()
│   ├── env.ts       # .env parsing, ${VAR:-default} interpolation
│   ├── normalize.ts # Normalize ports, volumes, env, depends_on, labels
│   └── schema.ts    # Zod schemas with .passthrough() for lenient parsing
├── analyzer/        # Phase 2: Classify services and resources for K8s
│   ├── index.ts     # Orchestrator: analyzeProject()
│   ├── service.ts   # Infer category (web/db/cache/queue/worker/proxy) and workload type
│   ├── volume.ts    # Classify volumes (configmap/secret/pvc/emptydir)
│   ├── secrets.ts   # Detect sensitive env vars by name/value patterns
│   └── dependency.ts # Build dependency graph, topological sort, cycle detection
├── interactive/     # Phase 3: 6-step @clack/prompts wizard
│   ├── wizard.ts    # Main flow: intro → 6 steps → outro
│   ├── services.ts  # Step 1: multiselect services
│   ├── ingress.ts   # Step 2: configure ingress (domain, TLS, controller, routes)
│   ├── secrets.ts   # Step 3: review/override env var classifications
│   ├── storage.ts   # Step 4: configure PVC storage (class, size, access mode)
│   ├── health.ts    # Step 5: dependency handling (init containers) + probes
│   ├── deploy.ts    # Step 6: namespace, imagePullPolicy, output format/dir
│   └── defaults.ts  # Generate WizardConfig without prompts (--non-interactive)
├── generator/       # Phase 4: Produce K8s manifest objects
│   ├── index.ts     # Orchestrator: generateManifests()
│   ├── container.ts # Shared container spec builder (env, volumes, probes, resources)
│   ├── deployment.ts
│   ├── statefulset.ts  # Includes headless Service + volumeClaimTemplates
│   ├── service.ts      # ClusterIP Service
│   ├── ingress.ts      # Ingress with nginx/traefik annotations, TLS, cert-manager
│   ├── configmap.ts    # File-based (from bind mounts) and env-based ConfigMaps
│   ├── secret.ts       # stringData with REPLACE_ME placeholders (never real values)
│   ├── pvc.ts          # PersistentVolumeClaim (Deployment only; StatefulSet uses VCTs)
│   ├── init-container.ts  # busybox wait-for-port using actual dependency ports
│   ├── probes.ts       # Compose healthcheck → liveness/readiness probes
│   ├── migration-script.ts # pg_dump, mysqldump, mongodump, redis BGSAVE scripts
│   └── readme.ts       # Generate deployment README
├── output/          # Phase 5: Write files to disk
│   ├── index.ts     # Route by outputFormat
│   ├── plain.ts     # One YAML per manifest + migration scripts in scripts/
│   └── single-file.ts # All manifests in one multi-doc YAML
├── commands/        # CLI command handlers
│   ├── convert.ts   # Main pipeline: parse → analyze → wizard → generate → write
│   ├── validate.ts  # Check apiVersion/kind/metadata.name in generated YAML
│   └── apply.ts     # Print kubectl apply command
├── types/           # TypeScript interfaces (no runtime code)
│   ├── compose.ts   # ComposeProject, ComposeService, ComposePort, etc.
│   ├── analysis.ts  # AnalyzedService, ServiceCategory, WorkloadType, etc.
│   ├── config.ts    # WizardConfig, IngressConfig, StorageConfig, DeployOptions
│   └── k8s.ts       # K8sManifest, GeneratedManifest, GeneratorOutput
├── utils/
│   ├── k8s-names.ts # toK8sName(), standardLabels(), selectorLabels()
│   ├── yaml.ts      # manifestToYaml() with K8s key ordering, manifestsToMultiDoc()
│   └── detect.ts    # Auto-detect compose file and .env file
└── index.ts         # CLI entry point (commander)

tests/               # Mirrors src/ structure
├── parser/          # env, normalize, compose tests
├── analyzer/        # service, volume, secrets, dependency tests
├── generator/       # deployment, service, configmap tests
├── utils/           # k8s-names, yaml tests
├── e2e/             # Full pipeline tests with all fixtures
└── fixtures/        # basic, complex, wordpress, fullstack compose files
```

## Key Design Decisions

- **ESM only** — `"type": "module"`, chalk v5, `moduleResolution: "bundler"`
- **Native `node:fs/promises`** — no fs-extra dependency
- **Zod `.passthrough()`** — tolerates unknown compose fields without failing
- **Secrets safety** — never embeds real values; uses `stringData` with REPLACE_ME
- **Named volume disambiguation** — checks top-level `volumes:` to distinguish `pgdata:/data` (named) from `./data:/app` (bind)
- **Port mapping** — container port (right side of `8080:80`) for K8s Service port + targetPort
- **Env detection** — distinguishes server-config vars (`POSTGRES_USER` → this IS postgres) from client-connection vars (`REDIS_URL` → this CONNECTS TO redis)
- **One service = one workload** — each compose service becomes its own Deployment or StatefulSet
- **Init containers use actual ports** — looks up dependency's first exposed port from analysis, falls back to category defaults (5432 for database, 6379 for cache)
- **Compose entrypoint → K8s command, compose command → K8s args**

## Test Fixtures

- `tests/fixtures/basic-compose.yml` — nginx + node API + postgres (3 services)
- `tests/fixtures/complex-compose.yml` — proxy + app + db + cache + worker with healthchecks, deploy config, env_file, secrets, multiple networks
- `tests/fixtures/wordpress-compose.yml` — WordPress + MySQL
- `tests/fixtures/fullstack-compose.yml` — nginx + node API + postgres + redis

## CLI Usage

```sh
# Convert (default command)
compose2k8s -f docker-compose.yml                    # interactive wizard
compose2k8s -f docker-compose.yml --non-interactive  # use inferred defaults
compose2k8s -f docker-compose.yml -o ./manifests --format single-file --namespace myapp

# Validate generated manifests
compose2k8s validate -d ./k8s

# Show apply command
compose2k8s apply -d ./k8s -n myapp --dry-run
```

## Adding a New Generator

1. Create `src/generator/<resource>.ts` with a function that takes `(serviceName, analyzed, config)` and returns `GeneratedManifest`
2. Call it from `src/generator/index.ts` in the main loop
3. Add tests in `tests/generator/<resource>.test.ts`
