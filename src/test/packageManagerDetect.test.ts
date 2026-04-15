import test = require("node:test");
import assert = require("node:assert/strict");
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  clearPackageManagerCache,
  detectPackageManager,
  findNearestPackageRoot,
  getPackageManagerExecPrefix,
  getPackageManagerRunner,
} from "../packageManagerDetect";

function mkTmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "bdd-runner-pm-"));
}

function writePkg(dir: string, content: object): void {
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(content));
}

test("getPackageManagerRunner maps npm to npx and leaves others", () => {
  assert.equal(getPackageManagerRunner("npm"), "npx");
  assert.equal(getPackageManagerRunner("yarn"), "yarn");
  assert.equal(getPackageManagerRunner("pnpm"), "pnpm");
});

test("getPackageManagerExecPrefix returns correct exec prefix", () => {
  assert.equal(getPackageManagerExecPrefix("npm"), "npx");
  assert.equal(getPackageManagerExecPrefix("yarn"), "yarn");
  assert.equal(getPackageManagerExecPrefix("pnpm"), "pnpm exec");
});

test("detectPackageManager reads packageManager field from package.json", () => {
  clearPackageManagerCache();
  const dir = mkTmp();
  writePkg(dir, { packageManager: "yarn@4.0.0" });
  assert.equal(detectPackageManager(dir), "yarn");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("detectPackageManager falls back to lockfile when field is missing", () => {
  clearPackageManagerCache();
  const dir = mkTmp();
  writePkg(dir, { name: "x" });
  fs.writeFileSync(path.join(dir, "pnpm-lock.yaml"), "");
  assert.equal(detectPackageManager(dir), "pnpm");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("detectPackageManager prefers yarn.lock over package-lock.json", () => {
  clearPackageManagerCache();
  const dir = mkTmp();
  writePkg(dir, { name: "x" });
  fs.writeFileSync(path.join(dir, "yarn.lock"), "");
  fs.writeFileSync(path.join(dir, "package-lock.json"), "");
  assert.equal(detectPackageManager(dir), "yarn");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("detectPackageManager defaults to npm when nothing is present", () => {
  clearPackageManagerCache();
  const dir = mkTmp();
  assert.equal(detectPackageManager(dir), "npm");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("detectPackageManager ignores unknown packageManager values", () => {
  clearPackageManagerCache();
  const dir = mkTmp();
  writePkg(dir, { packageManager: "bun@1.0.0" });
  fs.writeFileSync(path.join(dir, "pnpm-lock.yaml"), "");
  assert.equal(detectPackageManager(dir), "pnpm");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("findNearestPackageRoot finds monorepo package root from feature file", () => {
  clearPackageManagerCache();
  const root = mkTmp();
  const pkg = path.join(root, "packages", "app");
  const features = path.join(pkg, "src", "features");
  fs.mkdirSync(features, { recursive: true });
  writePkg(root, { name: "root" });
  writePkg(pkg, { name: "app" });
  const feature = path.join(features, "login.feature");
  fs.writeFileSync(feature, "");

  assert.equal(findNearestPackageRoot(feature, root), pkg);
  fs.rmSync(root, { recursive: true, force: true });
});

test("findNearestPackageRoot stops at workspace boundary", () => {
  clearPackageManagerCache();
  const root = mkTmp();
  const sub = path.join(root, "packages", "app", "src");
  fs.mkdirSync(sub, { recursive: true });
  writePkg(root, { name: "root" });
  const feature = path.join(sub, "login.feature");
  fs.writeFileSync(feature, "");

  assert.equal(findNearestPackageRoot(feature, root), root);
  fs.rmSync(root, { recursive: true, force: true });
});

test("findNearestPackageRoot returns workspace root when no package.json exists anywhere", () => {
  clearPackageManagerCache();
  const root = mkTmp();
  const sub = path.join(root, "features");
  fs.mkdirSync(sub, { recursive: true });
  const feature = path.join(sub, "login.feature");
  fs.writeFileSync(feature, "");

  assert.equal(findNearestPackageRoot(feature, root), root);
  fs.rmSync(root, { recursive: true, force: true });
});
