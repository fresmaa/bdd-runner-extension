import * as path from "path";
import * as vscode from "vscode";
import {
  buildCommand,
  buildExampleCommand,
  buildFeatureCommand,
  buildScenarioCommand,
} from "./commandBuilder";
import { getAllScenarioContexts, getFeatureContext, getScenarioContext } from "./gherkin";
import {
  detectShellDialect,
  executeCommandWithOutput,
  getConfiguredForceShell,
  normalizeCommandForDialect,
  resolveGitBashPath,
  resolvePwshPath,
  resolveTerminalShell,
  stripAnsi,
} from "./shell";
import { FeatureContext, RunCommandInput, RunMode, ScenarioContext, ScenarioLocation } from "./types";

const TEST_CONTROLLER_ID = "bddScenarioRunner.controller";
const TEST_DATA = new WeakMap<vscode.TestItem, ScenarioLocation>();
const SHOWN_TERMINAL_WARNINGS = new Set<string>();

let testController: vscode.TestController;

export function activate(context: vscode.ExtensionContext): void {
  const runScenarioTag = vscode.commands.registerCommand(
    "bddScenarioRunner.runScenarioTag",
    async (input?: RunCommandInput) => {
      const editor = await resolveEditor(input);
      if (!editor) {
        vscode.window.showWarningMessage("No active editor found.");
        return;
      }
      if (!editor.document.fileName.endsWith(".feature")) {
        vscode.window.showWarningMessage("This command only works for .feature files.");
        return;
      }

      const targetLine = input?.line ?? editor.selection.active.line;
      const scenarioCtx = getScenarioContext(editor.document.getText(), targetLine);
      if (!scenarioCtx) {
        vscode.window.showWarningMessage("No scenario found at current cursor position.");
        return;
      }

      const config = vscode.workspace.getConfiguration("bddScenarioRunner");
      const runMode = await resolveRunMode(config);
      if (!runMode) {
        return;
      }

      runScenarioByContext(editor.document, scenarioCtx, runMode);
    },
  );

  const runScenarioTagAtLine = vscode.commands.registerCommand(
    "bddScenarioRunner.runScenarioTagAtLine",
    async (uri: vscode.Uri, line: number) => {
      await vscode.commands.executeCommand("bddScenarioRunner.runScenarioTag", {
        uri,
        line,
      } as RunCommandInput);
    },
  );

  const rerunFailed = vscode.commands.registerCommand(
    "bddScenarioRunner.rerunFailed",
    async () => {
      const config = vscode.workspace.getConfiguration("bddScenarioRunner");
      const runMode = await resolveRunMode(config);
      if (!runMode) {
        return;
      }

      runRerunFailed(runMode);
    },
  );

  const diagnoseEnvironment = vscode.commands.registerCommand(
    "bddScenarioRunner.diagnoseEnvironment",
    async () => {
      await runEnvironmentDiagnosis();
    },
  );

  const runCurrentFeature = vscode.commands.registerCommand(
    "bddScenarioRunner.runCurrentFeature",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || !isFeatureDocument(editor.document)) {
        vscode.window.showWarningMessage("Open a .feature file to run current feature.");
        return;
      }

      const featureCtx = getFeatureContext(editor.document.getText(), editor.document.fileName);
      if (!featureCtx) {
        vscode.window.showWarningMessage("Feature title was not found in current file.");
        return;
      }

      const config = vscode.workspace.getConfiguration("bddScenarioRunner");
      const runMode = await resolveRunMode(config);
      if (!runMode) {
        return;
      }

      runCurrentFeatureByContext(editor.document, featureCtx, runMode);
    },
  );

  testController = vscode.tests.createTestController(TEST_CONTROLLER_ID, "BDD Scenario Runner");
  const runHeadlessProfile = testController.createRunProfile(
    "Run Headless",
    vscode.TestRunProfileKind.Run,
    (request) => runFromTestItems(request, "headless"),
    true,
  );
  const runHeadedProfile = testController.createRunProfile(
    "Run Headed",
    vscode.TestRunProfileKind.Run,
    (request) => runFromTestItems(request, "headed"),
    false,
  );

  context.subscriptions.push(runHeadlessProfile, runHeadedProfile, testController);

  vscode.workspace.textDocuments.forEach((doc) => {
    refreshTestItemsForDocument(doc);
  });

  const openDocDisposable = vscode.workspace.onDidOpenTextDocument((doc) => {
    refreshTestItemsForDocument(doc);
  });
  const changeDocDisposable = vscode.workspace.onDidChangeTextDocument((event) => {
    refreshTestItemsForDocument(event.document);
  });
  const closeDocDisposable = vscode.workspace.onDidCloseTextDocument((doc) => {
    if (!isFeatureDocument(doc)) {
      return;
    }
    testController.items.delete(doc.uri.toString());
  });

  context.subscriptions.push(
    runScenarioTag,
    runScenarioTagAtLine,
    runCurrentFeature,
    rerunFailed,
    diagnoseEnvironment,
    openDocDisposable,
    changeDocDisposable,
    closeDocDisposable,
  );
}

export function deactivate(): void {
  // No-op
}

function runCurrentFeatureByContext(
  document: vscode.TextDocument,
  featureCtx: FeatureContext,
  runMode: RunMode,
): void {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  const command = buildFeatureCommand(document, featureCtx, runMode);

  runCommandInTerminal(command, workspaceFolder?.uri);
  vscode.window.showInformationMessage(`Running feature \"${featureCtx.featureName}\" (${runMode})`);
}

function runScenarioByContext(
  document: vscode.TextDocument,
  scenarioCtx: ScenarioContext,
  runMode: RunMode,
): void {
  const scenarioName = scenarioCtx.scenarioName;
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  const command = buildScenarioCommand(document, scenarioCtx, runMode);

  runCommandInTerminal(command, workspaceFolder?.uri);
  vscode.window.showInformationMessage(`Running scenario \"${scenarioName}\" (${runMode})`);
}

function runRerunFailed(runMode: RunMode): void {
  const config = vscode.workspace.getConfiguration("bddScenarioRunner");
  const template = config.get<string>(
    "rerunFailedCommandTemplate",
    "pnpm bddgen && pnpm playwright test --last-failed{headedFlag}",
  );
  const command = buildCommand(template, {
    scenario: "",
    featureName: "",
    example: "",
    scenarioExampleRegex: "",
    featurePath: "",
    runMode,
  });

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri;
  runCommandInTerminal(command, workspaceFolder);
  vscode.window.showInformationMessage(`Re-running failed tests (${runMode})`);
}

function runCommandInTerminal(command: string, cwd: vscode.Uri | undefined): void {
  const config = vscode.workspace.getConfiguration("bddScenarioRunner");
  const terminalName = config.get<string>("terminalName", "BDD Scenario Runner");
  const autoClearTerminal = config.get<boolean>("autoClearTerminal", true);
  const showTerminalOnRun = config.get<boolean>("showTerminalOnRun", false);
  const dialect = detectShellDialect();
  const normalizedCommand = normalizeCommandForDialect(command, dialect);

  const terminal = getOrCreateTerminal(terminalName, cwd);
  if (showTerminalOnRun) {
    terminal.show(true);
  }

  if (autoClearTerminal) {
    const clearCommand = process.platform === "win32" ? "cls" : "clear";
    terminal.sendText(clearCommand, true);
  }

  terminal.sendText(normalizedCommand, true);
}

function getOrCreateTerminal(name: string, cwd: vscode.Uri | undefined): vscode.Terminal {
  const configuredDialect = detectShellDialect();
  const terminalShell = resolveTerminalShell(configuredDialect);
  const existing = vscode.window.terminals.find((terminal) => terminal.name === name);

  if (existing && !terminalShell.recreateExisting) {
    return existing;
  }

  if (existing && terminalShell.recreateExisting) {
    existing.dispose();
  }

  if (terminalShell.warningKey && terminalShell.warningMessage) {
    showTerminalWarningOnce(terminalShell.warningKey, terminalShell.warningMessage);
  }

  if (terminalShell.shellPath) {
    return vscode.window.createTerminal({
      name,
      cwd,
      shellPath: terminalShell.shellPath,
      shellArgs: terminalShell.shellArgs,
    });
  }

  if (cwd) {
    return vscode.window.createTerminal({
      name,
      cwd,
    });
  }

  return vscode.window.createTerminal(name);
}

function showTerminalWarningOnce(key: string, message: string): void {
  if (SHOWN_TERMINAL_WARNINGS.has(key)) {
    return;
  }
  SHOWN_TERMINAL_WARNINGS.add(key);
  vscode.window.showWarningMessage(message);
}

function isFeatureDocument(document: vscode.TextDocument): boolean {
  return document.fileName.endsWith(".feature") || document.languageId === "feature";
}

function refreshTestItemsForDocument(document: vscode.TextDocument): void {
  if (!isFeatureDocument(document)) {
    return;
  }

  const fileId = document.uri.toString();
  let fileItem = testController.items.get(fileId);

  if (!fileItem) {
    fileItem = testController.createTestItem(fileId, path.basename(document.fileName), document.uri);
    testController.items.add(fileItem);
  }

  fileItem.children.replace([]);

  const featureCtx = getFeatureContext(document.getText(), document.fileName);
  const featureItem = featureCtx
    ? testController.createTestItem(`${fileId}:feature`, featureCtx.featureName, document.uri)
    : null;
  if (featureItem && featureCtx) {
    const featureLineText = document.lineAt(featureCtx.featureLine).text;
    featureItem.range = new vscode.Range(
      featureCtx.featureLine,
      0,
      featureCtx.featureLine,
      featureLineText.length,
    );
    fileItem.children.add(featureItem);
  }

  for (const scenario of getAllScenarioContexts(document.getText())) {
    const itemId = `${fileId}:${scenario.scenarioLine}`;
    const item = testController.createTestItem(itemId, scenario.scenarioName, document.uri);
    item.range = new vscode.Range(
      scenario.scenarioLine,
      0,
      scenario.scenarioLine,
      document.lineAt(scenario.scenarioLine).text.length,
    );
    TEST_DATA.set(item, {
      uri: document.uri,
      line: scenario.scenarioLine,
      kind: "scenario",
    });

    scenario.exampleRows.forEach((exampleRow, index) => {
      const exampleItem = testController.createTestItem(
        `${itemId}:example:${exampleRow.line}`,
        `Example ${index + 1}: ${exampleRow.label}`,
        document.uri,
      );
      exampleItem.range = new vscode.Range(
        exampleRow.line,
        0,
        exampleRow.line,
        document.lineAt(exampleRow.line).text.length,
      );
      TEST_DATA.set(exampleItem, {
        uri: document.uri,
        line: exampleRow.line,
        kind: "example",
        exampleValue: exampleRow.exampleValue,
        exampleIndex: exampleRow.exampleIndex,
      });
      item.children.add(exampleItem);
    });

    if (featureItem) {
      featureItem.children.add(item);
    } else {
      fileItem.children.add(item);
    }
  }
}

async function resolveEditor(input?: RunCommandInput): Promise<vscode.TextEditor | null> {
  if (input?.uri) {
    const document = await vscode.workspace.openTextDocument(input.uri);
    return await vscode.window.showTextDocument(document, { preview: false });
  }

  return vscode.window.activeTextEditor ?? null;
}

async function resolveRunMode(config: vscode.WorkspaceConfiguration): Promise<RunMode | null> {
  const askRunMode = config.get<boolean>("askRunMode", true);
  const defaultRunMode = config.get<RunMode>("defaultRunMode", "headless");

  if (!askRunMode) {
    return defaultRunMode;
  }

  const picked = await vscode.window.showQuickPick(
    [
      { label: "Headless", value: "headless" as const, description: "Run in background" },
      { label: "Headed", value: "headed" as const, description: "Open browser UI" },
    ],
    {
      placeHolder: "Choose run mode",
      title: "BDD Scenario Runner",
    },
  );

  return picked?.value ?? null;
}

async function runFromTestItems(request: vscode.TestRunRequest, runMode: RunMode): Promise<void> {
  const run = testController.createTestRun(request);
  const testItems = collectTestItems(request);

  for (const item of testItems) {
    const scenarioRef = TEST_DATA.get(item);
    if (!scenarioRef) {
      run.skipped(item);
      continue;
    }

    try {
      const doc = await vscode.workspace.openTextDocument(scenarioRef.uri);
      const ctx = getScenarioContext(doc.getText(), scenarioRef.line);
      if (!ctx) {
        run.errored(item, new vscode.TestMessage("Scenario was not found."));
        continue;
      }

      run.started(item);
      const command =
        scenarioRef.kind === "example" && scenarioRef.exampleIndex
          ? buildExampleCommand(doc, ctx, scenarioRef.exampleIndex, runMode)
          : buildScenarioCommand(doc, ctx, runMode);
      const cwd = vscode.workspace.getWorkspaceFolder(doc.uri)?.uri.fsPath;

      let outputBuffer = `$ ${command}\r\n`;
      run.appendOutput(`$ ${command}\r\n`, undefined, item);

      const capturedLines: string[] = [];
      const result = await executeCommandWithOutput(command, cwd, (line) => {
        outputBuffer += `${line}\r\n`;
        capturedLines.push(stripAnsi(line));
        run.appendOutput(`${line}\r\n`, undefined, item);
      });

      if (outputBuffer.trim().length > 0) {
        run.appendOutput(`${outputBuffer}\r\n`, undefined, item);
      }

      if (result.success) {
        const successDetails = buildSuccessDetails(command, capturedLines);
        run.appendOutput(`\r\n[SUCCESS] Scenario passed\r\n${successDetails}\r\n`, undefined, item);
        run.passed(item);
      } else {
        const reason =
          result.errorMessage ??
          (result.exitCode !== null
            ? `Process exited with code ${result.exitCode}.`
            : "Scenario execution failed.");
        const details = buildFailureDetails(command, capturedLines);
        run.appendOutput(`\r\n[ERROR] ${reason}\r\n`, undefined, item);
        run.failed(item, new vscode.TestMessage(`Scenario execution failed: ${reason}\n\n${details}`));
      }
    } catch (error) {
      run.errored(item, new vscode.TestMessage(String(error)));
    }
  }

  run.end();
}

function buildFailureDetails(command: string, lines: string[]): string {
  const cleaned = lines.map((line) => line.trim()).filter((line) => line.length > 0);
  if (cleaned.length === 0) {
    return `Command: ${command}\nNo stdout/stderr output captured.`;
  }

  const tail = cleaned.slice(-40).join("\n");
  return `Command: ${command}\n\nOutput tail:\n${tail}`;
}

function buildSuccessDetails(command: string, lines: string[]): string {
  const cleaned = lines.map((line) => line.trim()).filter((line) => line.length > 0);
  if (cleaned.length === 0) {
    return `Command: ${command}\nNo stdout/stderr output captured.`;
  }

  const tail = cleaned.slice(-30).join("\n");
  return `Command: ${command}\n\nOutput tail:\n${tail}`;
}

async function runEnvironmentDiagnosis(): Promise<void> {
  const output = vscode.window.createOutputChannel("BDD Runner Diagnose");
  output.clear();
  output.show(true);

  const forceShell = getConfiguredForceShell();
  const dialect = detectShellDialect();
  const config = vscode.workspace.getConfiguration("terminal.integrated");
  const defaultWindowsProfile = config.get<string>("defaultProfile.windows", "");

  output.appendLine("BDD Runner Environment Diagnose");
  output.appendLine("================================");
  output.appendLine(`Platform: ${process.platform}`);
  output.appendLine(`Configured forceShell: ${forceShell}`);
  output.appendLine(`Effective shell dialect: ${dialect}`);
  if (process.platform === "win32") {
    output.appendLine(`VS Code defaultProfile.windows: ${defaultWindowsProfile || "(empty)"}`);
    output.appendLine(`Configured gitBashPath: ${resolveGitBashPath() ?? "(not found)"}`);
    output.appendLine(`Configured pwshPath: ${resolvePwshPath()}`);
  }
  output.appendLine("");

  const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspace) {
    output.appendLine("No workspace folder open. Runtime checks skipped.");
    return;
  }

  const checks = ["pnpm --version", "pnpm exec playwright --version", "pnpm exec bddgen --help"];

  for (const check of checks) {
    const lines: string[] = [];
    const result = await executeCommandWithOutput(check, workspace, (line) => {
      if (lines.length < 20) {
        lines.push(line);
      }
    });

    output.appendLine(`$ ${check}`);
    output.appendLine(`Result: ${result.success ? "OK" : "FAILED"}`);
    if (result.errorMessage) {
      output.appendLine(`Error: ${result.errorMessage}`);
    }
    if (lines.length > 0) {
      output.appendLine("Output:");
      lines.forEach((line) => output.appendLine(`  ${line}`));
    }
    output.appendLine("");
  }

  vscode.window.showInformationMessage("BDD Runner diagnose completed. Check 'BDD Runner Diagnose' output.");
}

function collectTestItems(request: vscode.TestRunRequest): vscode.TestItem[] {
  const roots: vscode.TestItem[] =
    request.include && request.include.length > 0 ? [...request.include] : [];
  if (roots.length === 0) {
    testController.items.forEach((item) => roots.push(item));
  }
  const result: vscode.TestItem[] = [];

  const walk = (item: vscode.TestItem): void => {
    if (TEST_DATA.has(item)) {
      result.push(item);
      return;
    }

    item.children.forEach((child) => walk(child));
  };

  roots.forEach((root: vscode.TestItem) => walk(root));
  return result;
}
