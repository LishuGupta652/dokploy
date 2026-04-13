import { access, writeFile } from "node:fs/promises";
import path from "node:path";

export type InitOptions = {
  output?: string;
  force?: boolean;
};

export async function initCommand(options: InitOptions): Promise<void> {
  const output = path.resolve(options.output ?? "dokploy.yaml");

  if (!options.force && (await exists(output))) {
    throw new Error(`${output} already exists. Pass --force to overwrite it.`);
  }

  await writeFile(output, starterConfig, "utf8");
  console.log(`Wrote ${output}`);
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

const starterConfig = `host: https://your-dokploy.example.com/api

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
    build:
      type: dockerfile
      dockerfile: Dockerfile
      contextPath: .
    env:
      NODE_ENV: production
    domains:
      - host: app.example.com
        port: 80
        path: /
        https: true
        certificate: letsencrypt
    deploy: true
`;
