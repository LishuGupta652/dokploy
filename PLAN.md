# Dokploy Deploy Automation - Plan

## Problem

The Terraform provider for Dokploy (v0.4.0) has multiple bugs:
- Missing required fields (`buildArgs`, `buildSecrets`, `createEnvFile`)
- Unknown values after apply (`repository_url`, `description`)
- Can't rename default environments
- GitHub provider fields not set on application create

The Dokploy API itself works fine - it's a clean tRPC-style REST API. We just need a tool that calls it correctly.

## Solution

A **CLI tool** (Node.js/TypeScript) that reads a simple YAML config file and orchestrates the full Dokploy API call sequence to deploy apps, compose stacks, and databases.

### Why a CLI, not a web service

- You want to run this locally or in CI/CD
- No server to maintain
- YAML config lives in your repo alongside your code
- Simple: `dokploy apply` and it works

## Architecture

```
dokploy-deploy-automation/
├── src/
│   ├── index.ts              # CLI entry point
│   ├── client.ts             # Dokploy API client (typed, wraps all endpoints)
│   ├── config.ts             # YAML config parser + validation (Zod)
│   ├── commands/
│   │   ├── apply.ts          # Read config → create/update resources in order
│   │   ├── destroy.ts        # Tear down everything in reverse order
│   │   ├── status.ts         # Show current state of all resources
│   │   └── deploy.ts         # Trigger deployment for an app/compose
│   └── resources/
│       ├── project.ts        # Create/update/delete project
│       ├── environment.ts    # Create/update/delete environment
│       ├── application.ts    # Full app lifecycle (create → github → build → env → domain → deploy)
│       ├── compose.ts        # Compose stack lifecycle
│       ├── database.ts       # Database lifecycle (postgres, mysql, redis, etc.)
│       ├── domain.ts         # Domain CRUD
│       └── backup.ts         # Backup destination + volume backups
├── package.json
├── tsconfig.json
└── examples/
    ├── simple-app.yaml
    ├── fullstack.yaml
    └── compose-stack.yaml
```

## Config Format (YAML)

The config is the single source of truth. One file describes everything.

```yaml
# dokploy.yaml
host: https://srv1212550.hstgr.cloud/api
# api_key comes from DOKPLOY_API_KEY env var (never in config)

project:
  name: "My App"
  description: "Deployed via dokploy-deploy"

# Environment (optional - uses project default if omitted)
environment:
  name: production

# Applications
applications:
  - name: frontend
    source: github
    github:
      id: "Pitn0FdkUpj_MIEdH1j-C"    # from github.githubProviders
      owner: trippl-hq-dokploy-02
      repository: trippl-prototype-frontend
      branch: main
      buildPath: "/"
      triggerType: push                 # push | tag
    build:
      type: dockerfile                  # dockerfile | nixpacks | railpack | heroku_buildpacks | static
      dockerfile: Dockerfile
      contextPath: "."
      # buildStage: production          # for multi-stage
    env:
      VITE_BACKEND_URL: "https://prototype-service.trippl.in"
      VITE_KINDE_CLIENT_ID: "ef14072ea6c04688b84c1d27974dcfd6"
      VITE_KINDE_DOMAIN: "https://lishu-termite.au.kinde.com"
    domains:
      - host: terraform-dokploy-test.trippl.in
        port: 80
        path: "/"
        https: true
        certificate: letsencrypt        # letsencrypt | none | custom
    deploy: true                        # trigger deploy after setup

  # Another app example
  - name: api
    source: github
    github:
      id: "Pitn0FdkUpj_MIEdH1j-C"
      owner: trippl-hq-dokploy-02
      repository: my-api
      branch: main
      buildPath: "/"
    build:
      type: nixpacks
    env:
      PORT: "8080"
      DATABASE_URL: "postgres://..."
    domains:
      - host: api.example.com
        port: 8080
        https: true
        certificate: letsencrypt

# Compose stacks (optional)
compose:
  - name: monitoring
    source: raw
    content: |
      version: "3.8"
      services:
        grafana:
          image: grafana/grafana:latest
          ports:
            - "3001:3000"
    env:
      GF_SECURITY_ADMIN_PASSWORD: "secret"
    domains:
      - host: grafana.example.com
        serviceName: grafana
        port: 3000
        https: true
        certificate: letsencrypt

# Databases (optional)
databases:
  - name: app-db
    type: postgres           # postgres | mysql | mariadb | mongo | redis
    version: "16"
```

## API Call Sequence

This is the key insight - Dokploy requires a specific order of API calls. The CLI handles this automatically.

### For an application:

```
1. project.create          → projectId
2. environment.create      → environmentId (or use default from project)
3. application.create      → applicationId
4. application.saveGithubProvider   (set repo, branch, owner, githubId)
5. application.saveBuildType        (set dockerfile, context, build stage)
6. application.saveEnvironment      (set env vars, buildArgs, buildSecrets)
7. domain.create                    (attach domain to applicationId)
8. application.deploy               (trigger build + deploy)
```

### For a compose stack:

```
1. project.create          → projectId
2. environment.create      → environmentId
3. compose.create          → composeId
4. compose.update          (set compose file content or git source)
5. domain.create           (per service)
6. compose.deploy          (trigger deploy)
```

### For a database:

```
1. project.create          → projectId
2. environment.create      → environmentId
3. <type>.create           → e.g. postgres via project endpoint
4. <type>.deploy
```

## State Management

Unlike Terraform, we keep it simple:

- **On `apply`**: check if resources exist first (by name within project), update if they do, create if they don't
- **State file** (`dokploy-state.json`): stores resource IDs mapped to config names so we know what was created
- **Idempotent**: running `apply` twice produces the same result

```json
{
  "project": { "name": "My App", "id": "SXnjIG9Epjv2r0M0-bDVI" },
  "environment": { "name": "production", "id": "sAyvucui6vI4gephEatjB" },
  "applications": {
    "frontend": {
      "id": "abc123",
      "domains": ["domain-id-1"],
      "deployed": true
    }
  }
}
```

## CLI Commands

```bash
# Deploy everything in the config
dokploy apply

# Deploy with a specific config file
dokploy apply -f my-config.yaml

# Show what would change (dry run)
dokploy apply --dry-run

# Trigger a redeploy of a specific app
dokploy deploy frontend

# Show status of all resources
dokploy status

# Tear down everything
dokploy destroy

# Destroy a specific app only
dokploy destroy frontend
```

## Tech Stack

- **TypeScript** - type safety for API calls
- **Commander.js** - CLI framework
- **Zod** - config validation (matches Dokploy's own validation)
- **yaml** - parse YAML configs
- **Node.js fetch** - HTTP client (no deps needed, built into Node 18+)
- **chalk** - colored CLI output

No framework (no NestJS). This is a CLI tool, not a web server. Keep it lean.

## Implementation Order

### Phase 1: Core (MVP)
1. API client (`client.ts`) - typed wrapper around all Dokploy endpoints
2. Config parser with Zod validation
3. `apply` command for applications (the most common use case)
4. State file read/write

### Phase 2: Full Resource Support
5. Compose stack support
6. Database support
7. Backup destination + volume backup support
8. `destroy` command
9. `status` command

### Phase 3: Polish
10. `--dry-run` flag
11. `deploy` command (quick redeploy)
12. Better error messages with hints
13. Config validation with helpful errors
14. `init` command to generate a starter config

## Environment Variables

```bash
DOKPLOY_API_KEY=your-api-key    # required, never stored in config
DOKPLOY_HOST=https://...        # optional, overrides config file
```
