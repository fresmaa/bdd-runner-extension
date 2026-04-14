import * as path from "path";
import * as vscode from "vscode";
import { FeatureContext, ReportType, RunMode, ScenarioContext } from "./types";
import { detectShellDialect } from "./shell";
import {
  buildCommand as buildCommandWithDialect,
  buildScenarioExampleRegex,
} from "./commandTemplate";

const REPORT_TEMPLATE_CONFIG_KEY: Record<ReportType, string> = {
  playwright: "playwrightReportCommandTemplate",
  allure: "allureReportCommandTemplate",
};

const REPORT_TEMPLATE_DEFAULT: Record<ReportType, string> = {
  playwright: "pnpm playwright show-report",
  allure: "npx allure generate allure-results --clean && npx allure open allure-report",
};

export function buildScenarioCommand(
  document: vscode.TextDocument,
  scenarioCtx: ScenarioContext,
  runMode: RunMode,
): string {
  const config = vscode.workspace.getConfiguration("bddScenarioRunner");
  const template = config.get<string>(
    "commandTemplate",
    "pnpm test:run --scenario {scenarioQuoted}{headedFlag}",
  );
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  const featurePathRelative = workspaceFolder
    ? path.relative(workspaceFolder.uri.fsPath, document.uri.fsPath)
    : document.uri.fsPath;

  return buildCommand(template, {
    scenario: scenarioCtx.scenarioName,
    featureName: "",
    example: "",
    scenarioExampleRegex: "",
    featurePath: featurePathRelative,
    runMode,
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
    "pnpm bddgen && pnpm playwright test --grep {featureNameQuoted}{headedFlag}",
  );
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  const featurePathRelative = workspaceFolder
    ? path.relative(workspaceFolder.uri.fsPath, document.uri.fsPath)
    : document.uri.fsPath;

  return buildCommand(template, {
    scenario: "",
    featureName: featureCtx.featureName,
    example: "",
    scenarioExampleRegex: "",
    featurePath: featurePathRelative,
    runMode,
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
    "pnpm bddgen && pnpm playwright test --grep {scenarioExampleRegexQuoted}{headedFlag}",
  );
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  const featurePathRelative = workspaceFolder
    ? path.relative(workspaceFolder.uri.fsPath, document.uri.fsPath)
    : document.uri.fsPath;
  const scenarioExampleRegex = buildScenarioExampleRegex(scenarioCtx.scenarioName, exampleIndex);

  return buildCommand(template, {
    scenario: scenarioCtx.scenarioName,
    featureName: "",
    example: `Example #${exampleIndex}`,
    scenarioExampleRegex,
    featurePath: featurePathRelative,
    runMode,
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
  },
): string {
  return buildCommandWithDialect(template, values, detectShellDialect());
}

export function buildReportCommand(reportType: ReportType): string {
  const config = vscode.workspace.getConfiguration("bddScenarioRunner");
  const key = REPORT_TEMPLATE_CONFIG_KEY[reportType];
  const template = config.get<string>(key, REPORT_TEMPLATE_DEFAULT[reportType]);

  return buildCommand(template, {
    scenario: "",
    featureName: "",
    example: "",
    scenarioExampleRegex: "",
    featurePath: "",
    runMode: "headless",
  });
}
