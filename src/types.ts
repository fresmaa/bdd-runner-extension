import type * as vscode from "vscode";

export type ScenarioContext = {
  scenarioName: string;
  scenarioLine: number;
  isOutline: boolean;
  exampleRows: ExampleRowContext[];
};

export type ExampleRowContext = {
  line: number;
  label: string;
  exampleValue: string;
  exampleIndex: number;
};

export type FeatureContext = {
  featureName: string;
  featureLine: number;
};

export type ShellDialect = "bash" | "powershell" | "cmd" | "posix";
export type ForceShell = "auto" | "git-bash" | "pwsh" | "powershell" | "cmd" | "bash";

export type RunMode = "headless" | "headed";

export type RunCommandInput = {
  uri?: vscode.Uri;
  line?: number;
};

export type ScenarioLocation = {
  uri: vscode.Uri;
  line: number;
  kind: "scenario" | "example";
  exampleValue?: string;
  exampleIndex?: number;
};
