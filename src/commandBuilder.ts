import * as path from "path";
import * as vscode from "vscode";
import { FeatureContext, RunMode, ScenarioContext } from "./types";
import { detectShellDialect } from "./shell";
import {
  buildCommand as buildCommandWithDialect,
  buildScenarioExampleRegex,
} from "./commandTemplate";
import { findNearestPackageRoot, resolveRunner } from "./packageManager";

function getPackageRoot(document: vscode.TextDocument): string {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  return findNearestPackageRoot(document.uri.fsPath, workspaceFolder?.uri.fsPath);
}

export function resolveRunCwd(document: vscode.TextDocument): vscode.Uri {
  return vscode.Uri.file(getPackageRoot(document));
}

function resolveDocumentContext(document: vscode.TextDocument) {
  const packageRoot = getPackageRoot(document);
  const featurePathRelative = path.relative(packageRoot, document.uri.fsPath);
  const pm = resolveRunner(vscode.Uri.file(packageRoot));
  return { featurePathRelative, pm };
}

export function buildScenarioCommand(
  document: vscode.TextDocument,
  scenarioCtx: ScenarioContext,
  runMode: RunMode,
): string {
  const config = vscode.workspace.getConfiguration("bddScenarioRunner");
  const template = config.get<string>(
    "commandTemplate",
    "{pm} bddgen && {pm} playwright test --grep {scenarioQuoted}{headedFlag}",
  );
  const { featurePathRelative, pm } = resolveDocumentContext(document);

  return buildCommand(template, {
    scenario: scenarioCtx.scenarioName,
    featureName: "",
    example: "",
    scenarioExampleRegex: "",
    featurePath: featurePathRelative,
    runMode,
    pm,
  });
}

export function buildFeatureCommand(
  document: vscode.TextDocument,
  featureCtx: FeatureContext,
  runMode: RunMode,
): string {
  const config = vscode.workspace.getConfiguration("bddScenarioRunner");
  const template = config.get<string>(
    "featureCommandTemplate",
    "{pm} bddgen && {pm} playwright test --grep {featureNameQuoted}{headedFlag}",
  );
  const { featurePathRelative, pm } = resolveDocumentContext(document);

  return buildCommand(template, {
    scenario: "",
    featureName: featureCtx.featureName,
    example: "",
    scenarioExampleRegex: "",
    featurePath: featurePathRelative,
    runMode,
    pm,
  });
}

export function buildExampleCommand(
  document: vscode.TextDocument,
  scenarioCtx: ScenarioContext,
  exampleIndex: number,
  runMode: RunMode,
): string {
  const config = vscode.workspace.getConfiguration("bddScenarioRunner");
  const template = config.get<string>(
    "exampleCommandTemplate",
    "{pm} bddgen && {pm} playwright test --grep {scenarioExampleRegexQuoted}{headedFlag}",
  );
  const { featurePathRelative, pm } = resolveDocumentContext(document);
  const scenarioExampleRegex = buildScenarioExampleRegex(scenarioCtx.scenarioName, exampleIndex);

  return buildCommand(template, {
    scenario: scenarioCtx.scenarioName,
    featureName: "",
    example: `Example #${exampleIndex}`,
    scenarioExampleRegex,
    featurePath: featurePathRelative,
    runMode,
    pm,
  });
}

export function buildCommand(
  template: string,
  values: {
    scenario: string;
    featureName: string;
    example: string;
    scenarioExampleRegex: string;
    featurePath: string;
    runMode: RunMode;
    pm?: string;
  },
): string {
  return buildCommandWithDialect(template, values, detectShellDialect());
}
