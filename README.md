# Dokploy

YAML-driven CLI for applying Dokploy projects through the Dokploy API.

## Install

```bash
npm install
npm run build
```

Run locally during development:

```bash
npm run dev -- apply -f examples/simple-app.yaml --dry-run
```

After build, the CLI binary is `dokploy`.

For global install after publishing:

```bash
npm install -g @lishugupta652/dokploy
dokploy --help
```

For a local install, run the binary through npm:

```bash
npm install @lishugupta652/dokploy
npx dokploy --help
npm exec dokploy -- --help
```

## Environment

```bash
export DOKPLOY_API_KEY=your-api-key
export DOKPLOY_HOST=https://your-dokploy.example.com/api
```

`DOKPLOY_HOST` is optional when `host` is set in the YAML file. API keys are never read from config. The CLI accepts either `https://your-dokploy.example.com` or `https://your-dokploy.example.com/api` and normalizes root hosts to `/api`.

## Commands

```bash
dokploy projects --host https://your-dokploy.example.com/api
dokploy projects --summary --host https://your-dokploy.example.com/api
dokploy projects --json --host https://your-dokploy.example.com/api
dokploy projects --host https://your-dokploy.example.com
dokploy apply -f dokploy.yaml
dokploy apply -f dokploy.yaml --dry-run
dokploy deploy frontend -f dokploy.yaml
dokploy status -f dokploy.yaml
dokploy destroy frontend -f dokploy.yaml
dokploy destroy -f dokploy.yaml
dokploy init
```

State is written next to the config as `dokploy-state.json` unless `stateFile` or `--state` is provided.

## Publishing

The npm package name is `@lishugupta652/dokploy`; the command is `dokploy`.

```bash
npm publish --access public
```

`prepublishOnly` runs the TypeScript check and build before publishing.

Or use the helper script:

```bash
./scripts/publish.sh npm
./scripts/publish.sh npm --publish
./scripts/publish.sh pnpm
./scripts/publish.sh pnpm --publish
```

The script defaults to dry-run mode and publishes only when `--publish` is passed.

## Commit Version Hook

Install the repo hook once:

```bash
npm run hooks:install
```

The pre-commit hook bumps the package patch version and stages `package.json` plus `package-lock.json`. Set `SKIP_DOKPLOY_VERSION_BUMP=1` to skip it for a commit.

## Notes

- `apply` is idempotent by name within the selected environment where Dokploy exposes search endpoints.
- Applications are configured in Dokploy's required order: create, source provider, build type, environment, domains, deploy.
- Database creation requires a password because the Dokploy API requires one on create.
