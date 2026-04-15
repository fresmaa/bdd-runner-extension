import * as vscode from "vscode";
import {
  PackageManagerName,
  detectPackageManager,
  getPackageManagerRunner,
} from "./packageManagerDetect";

export {
  PackageManagerName,
  clearPackageManagerCache,
  detectPackageManager,
  findNearestPackageRoot,
  getPackageManagerExecPrefix,
  getPackageManagerRunner,
} from "./packageManagerDetect";

export function resolveRunner(workspaceFolder?: vscode.Uri): string {
  return getPackageManagerRunner(resolvePackageManager(workspaceFolder));
}

export function resolvePackageManager(workspaceFolder?: vscode.Uri): PackageManagerName {
  const config = vscode.workspace.getConfiguration("bddScenarioRunner");
  const setting = config.get<string>("packageManager", "auto");

  if (setting === "npm" || setting === "yarn" || setting === "pnpm") {
    return setting;
  }

  const root = workspaceFolder?.fsPath ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) {
    return "npm";
  }

  return detectPackageManager(root);
}
