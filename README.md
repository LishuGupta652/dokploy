# Dokploy CLI

YAML-driven CLI for managing Dokploy projects through the Dokploy API.

Use it locally or in CI to inspect projects, create/update applications, attach domains, deploy compose stacks, provision databases, and trigger redeploys without relying on the Terraform provider.

## Features

- Inspect all Dokploy projects with `project.all`.
- Apply a declarative YAML config.
- Manage projects, environments, applications, compose stacks, databases, domains, backups, and volume backups.
- Trigger app or compose redeploys.
- Keep a small local `dokploy-state.json` file for resource IDs.
- Use colored terminal output with a raw JSON option for scripts.
- Accept either a Dokploy root URL or `/api` URL.

## Requirements

- Node.js 18 or newer
- A running Dokploy instance
- A Dokploy API key

The API key is read only from `DOKPLOY_API_KEY`. Do not put it in YAML config.

## Install

Global install:

```bash
npm install -g @lishugupta652/dokploy
dokploy --help
```

One-off use with npm:

```bash
npx @lishugupta652/dokploy --help
npx @lishugupta652/dokploy projects --host https://your-dokploy.example.com
```

Local project install:

```bash
npm install @lishugupta652/dokploy
npx dokploy --help
npm exec dokploy -- --help
```

## Authentication

```bash
export DOKPLOY_API_KEY=your-api-key
export DOKPLOY_HOST=https://your-dokploy.example.com
```

`DOKPLOY_HOST` is optional when `host` is set in `dokploy.yaml`.

Both forms work:

```bash
https://your-dokploy.example.com
https://your-dokploy.example.com/api
```

The CLI normalizes root hosts to `/api`.

## Quick Start

1. Check your API connection:

```bash
dokploy projects --host https://your-dokploy.example.com --summary
```

2. Create a starter config:

```bash
dokploy init
```

3. Edit `dokploy.yaml`.

4. Preview the changes:

```bash
dokploy apply -f dokploy.yaml --dry-run
```

5. Apply the config:

```bash
dokploy apply -f dokploy.yaml
```

6. Check status:

```bash
dokploy status -f dokploy.yaml
```

## Commands

```bash
dokploy projects --host https://your-dokploy.example.com
dokploy projects --summary --host https://your-dokploy.example.com
dokploy projects --json --host https://your-dokploy.example.com

dokploy init
dokploy init --output dokploy.yaml --force

dokploy apply -f dokploy.yaml
dokploy apply -f dokploy.yaml --dry-run
dokploy apply -f dokploy.yaml --state .dokploy-state.json

dokploy deploy frontend -f dokploy.yaml
dokploy status -f dokploy.yaml

dokploy destroy frontend -f dokploy.yaml
dokploy destroy -f dokploy.yaml
dokploy destroy -f dokploy.yaml --delete-volumes
```

## Example Config

```yaml
host: https://your-dokploy.example.com

project:
  name: My App
  description: Deployed via dokploy

environment:
  name: production

applications:
  - name: frontend
    source: github
    github:
      id: your-github-provider-id
      owner: your-org
      repository: your-repo
      branch: main
      buildPath: /
      triggerType: push
    build:
      type: dockerfile
      dockerfile: Dockerfile
      contextPath: .
    env:
      NODE_ENV: production
      VITE_BACKEND_URL: https://api.example.com
    domains:
      - host: app.example.com
        port: 80
        path: /
        https: true
        certificate: letsencrypt
    deploy: true

databases:
  - name: app-db
    type: postgres
    version: "16"
    databaseName: app
    databaseUser: app
    password: change-me
    deploy: true
```

More examples are in [`examples/`](examples/).

## Config Notes

- `host` can be the Dokploy root URL or `/api` URL.
- `environment` is optional. If omitted, the CLI uses the first environment returned by Dokploy for the project.
- `applications[].deploy: true` triggers a deploy after configuration.
- `buildArgs`, `buildSecrets`, and `createEnvFile` are supported for applications.
- Database creation requires a password because the Dokploy API requires one.
- State is written next to the config as `dokploy-state.json` unless `stateFile` or `--state` is provided.

## Project Inspection

Human-readable output:

```bash
dokploy projects --host https://your-dokploy.example.com
```

Short table only:

```bash
dokploy projects --summary --host https://your-dokploy.example.com
```

Raw JSON for scripts:

```bash
dokploy projects --json --host https://your-dokploy.example.com
```

## Troubleshooting

`zsh: command not found: dokploy`

You probably installed the package locally. Use:

```bash
npx dokploy --help
```

or install globally:

```bash
npm install -g @lishugupta652/dokploy
```

`Dokploy API /project.all failed with HTTP 404` and the response is HTML

The request hit the Dokploy web UI instead of the API. Use a recent package version and pass either:

```bash
dokploy projects --host https://your-dokploy.example.com
dokploy projects --host https://your-dokploy.example.com/api
```

`DOKPLOY_API_KEY is required`

Set the API key before running commands:

```bash
export DOKPLOY_API_KEY=your-api-key
```

## Development

```bash
npm install
npm run check
npm run build
npm run dev -- projects --host https://your-dokploy.example.com --summary
```

Using pnpm is fine if you switch the lockfile:

```bash
rm package-lock.json
pnpm install
pnpm run check
pnpm run build
```

## Publishing

The package name is `@lishugupta652/dokploy`; the binary is `dokploy`.

Safe dry-run:

```bash
./scripts/publish.sh npm
```

Publish:

```bash
./scripts/publish.sh npm --publish
```

If the current package version is already on npm, the publish script bumps `patch` automatically before publishing. Override the bump when needed:

```bash
./scripts/publish.sh npm --publish --bump patch
./scripts/publish.sh npm --publish --bump minor
./scripts/publish.sh npm --publish --bump major
./scripts/publish.sh npm --publish --bump none
```

pnpm flow:

```bash
./scripts/publish.sh pnpm
./scripts/publish.sh pnpm --publish
```

Publishing generates `CHANGELOG.md` from git commits since the latest tag. Conventional Commit messages are grouped into sections such as Features, Fixes, Breaking Changes, and Chores.

Direct `npm publish --access public` is also protected by `prepublishOnly`: it checks whether the current version already exists on npm and bumps `patch` when needed before building and generating the changelog.

## Commit Messages And Versioning

Install hooks:

```bash
npm run hooks:install
```

The `commit-msg` hook enforces Conventional Commits and bumps `package.json` plus `package-lock.json` from the commit message:

```text
feat: add project listing          # minor
fix(projects): normalize host      # patch
perf: improve status lookup        # patch
feat!: change config schema        # major
docs: update usage                 # no version bump
```

Use `SKIP_DOKPLOY_VERSION_BUMP=1` to keep commit validation but skip version changes. Use `SKIP_DOKPLOY_COMMIT_CHECK=1` only when you intentionally need to bypass the hook.
