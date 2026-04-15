import * as fs from "fs";
import * as path from "path";

export type PackageManagerName = "npm" | "yarn" | "pnpm";

const detectionCache = new Map<string, PackageManagerName>();
const packageRootCache = new Map<string, string>();

export function clearPackageManagerCache(): void {
  detectionCache.clear();
  packageRootCache.clear();
}

export function getPackageManagerRunner(pm: PackageManagerName): string {
  return pm === "npm" ? "npx" : pm;
}

export function getPackageManagerExecPrefix(pm: PackageManagerName): string {
  if (pm === "pnpm") return "pnpm exec";
  if (pm === "yarn") return "yarn";
  return "npx";
}

/**
 * Walks up from `startPath` (a file path) looking for the nearest directory
 * containing a package.json. Stops at `stopAt` (inclusive) or at the filesystem
 * root. Returns `stopAt` (or the top-most visited directory) when none is found.
 */
export function findNearestPackageRoot(startPath: string, stopAt?: string): string {
  const cacheKey = `${startPath}\u0000${stopAt ?? ""}`;
  const cached = packageRootCache.get(cacheKey);
  if (cached !== undefined) return cached;

  let dir = path.dirname(startPath);
  const boundary = stopAt ? path.resolve(stopAt) : undefined;

  while (true) {
    if (fs.existsSync(path.join(dir, "package.json"))) {
      packageRootCache.set(cacheKey, dir);
      return dir;
    }
    if (boundary && path.resolve(dir) === boundary) {
      packageRootCache.set(cacheKey, boundary);
      return boundary;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      const result = boundary ?? dir;
      packageRootCache.set(cacheKey, result);
      return result;
    }
    dir = parent;
  }
}

export function detectPackageManager(workspaceRoot: string): PackageManagerName {
  const cached = detectionCache.get(workspaceRoot);
  if (cached !== undefined) return cached;

  const result = detectPackageManagerUncached(workspaceRoot);
  detectionCache.set(workspaceRoot, result);
  return result;
}

function detectPackageManagerUncached(workspaceRoot: string): PackageManagerName {
  const pkgPath = path.join(workspaceRoot, "package.json");
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    if (typeof pkg.packageManager === "string") {
      const name = pkg.packageManager.split("@")[0];
      if (name === "yarn" || name === "pnpm" || name === "npm") {
        return name;
      }
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(`[bdd-runner] failed to read ${pkgPath}:`, err);
    }
  }

  if (fs.existsSync(path.join(workspaceRoot, "pnpm-lock.yaml"))) return "pnpm";
  if (fs.existsSync(path.join(workspaceRoot, "yarn.lock"))) return "yarn";
  if (fs.existsSync(path.join(workspaceRoot, "package-lock.json"))) return "npm";

  return "npm";
}
