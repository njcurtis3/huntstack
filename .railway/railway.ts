import { defineRailway, github, project, service } from "railway/iac";
// This repository manages only its own resources in the environment. Other
// repositories export their own partial name.
// See https://docs.railway.com/infrastructure-as-code#multi-repo-projects
// (the generator emitted "@huntstack/api", which isn't a valid partial name)
export const partial = "huntstack-api";
export default defineRailway(() => {
  const _huntstackapi = service("@huntstack/api", {
    // Was "nixpacks" under railway.toml; Railway is retiring Nixpacks, so Railpack.
    source: github("njcurtis3/huntstack", { branch: "main", checkSuites: false }),
    build: {
      // No `pnpm db:migrate` here on purpose: schema changes are raw SQL in scripts/,
      // applied by hand (RUNBOOK.md "Deploying", CONSTRAINTS.md §1.1).
      buildCommand: "pnpm install --frozen-lockfile && pnpm --filter @huntstack/db build && pnpm --filter @huntstack/api build",
      builder: "RAILPACK",
      // The API also builds from packages/db and packages/shared
      watchPatterns: ["/apps/api/**", "/packages/**", "/pnpm-lock.yaml", "/package.json", "/pnpm-workspace.yaml"],
    },
    start: "pnpm --filter @huntstack/api start",
    healthcheck: "/api/health/ready",
    healthcheckTimeout: 30,
    replicas: { "us-east4-eqdc4a": 1 },
    networking: { privateNetworkEndpoint: "huntstackapi" },
  });

  return project("huntstack-railway", {
    variables: { managed: false },
    resources: [_huntstackapi],
  });
});
