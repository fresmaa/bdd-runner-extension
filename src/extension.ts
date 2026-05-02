import * as path from "path";
import * as vscode from "vscode";
import {
  buildCommand,
  buildExampleCommand,
  buildFeatureCommand,
  buildScenarioCommand,
  resolveRunCwd,
} from "./commandBuilder";
import { getAllScenarioContexts, getFeatureContext, getScenarioContext } from "./gherkin";
import {
  clearPackageManagerCache,
  getPackageManagerExecPrefix,
  getPackageManagerRunner,
  resolvePackageManager,
  resolveRunner,
} from "./packageManager";
import {
  detectShellDialect,
  executeCommandWithOutput,
  getRunningProcessCount,
  getConfiguredForceShell,
  getShellExecution,
  normalizeCommandForDialect,
  onRunningProcessCountChanged,
  resolveGitBashPath,
  resolvePwshPath,
  resolveTerminalShell,
  stopRunningProcesses,
  stripAnsi,
} from "./shell";
import { FeatureContext, RunCommandInput, RunMode, ScenarioContext, ScenarioLocation } from "./types";

const TEST_CONTROLLER_ID = "bddScenarioRunner.controller";
const TEST_DATA = new WeakMap<vscode.TestItem, ScenarioLocation>();
const SHOWN_TERMINAL_WARNINGS = new Set<string>();

let testController: vscode.TestController;
let stopAllTestItemsRequested = false;
let activeTestRunCount = 0;
let runSummaryStatusBar: vscode.StatusBarItem;
let activeTerminalRunStartedAt: number | null = null;
let activeTerminalRunLabel: string | null = null;
let activeTerminalRunTerminal: vscode.Terminal | null = null;

export function activate(context: vscode.ExtensionContext): void {
  const stopStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1100);
  stopStatusBar.text = "$(stop-circle) Stop Playwright BDD Run";
  stopStatusBar.command = "bddScenarioRunner.stopRunning";
  stopStatusBar.tooltip = "Stop currently running BDD scenario process";

  runSummaryStatusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    1090,
  );
  runSummaryStatusBar.text = "$(beaker) BDD: idle";
  runSummaryStatusBar.tooltip = "Last BDD run summary";
  runSummaryStatusBar.show();

  const hasActiveFeatureEditor = (): boolean => {
    const editor = vscode.window.activeTextEditor;
    return !!editor && isFeatureDocument(editor.document);
  };

  const syncStopStatusBar = (runningCount: number): void => {
    if (runningCount > 0 || hasActiveFeatureEditor()) {
      stopStatusBar.show();
    } else {
      stopStatusBar.hide();
    }
  };

  syncStopStatusBar(getRunningProcessCount());
  const runningProcessDisposable = onRunningProcessCountChanged((count) => syncStopStatusBar(count));
  const activeEditorDisposable = vscode.window.onDidChangeActiveTextEditor(() => {
    syncStopStatusBar(getRunningProcessCount());
  });

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

  const runAtCursor = vscode.commands.registerCommand(
    "bddScenarioRunner.runAtCursor",
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
      const runMode = config.get<RunMode>("defaultRunMode", "headless");
      const exampleRow = scenarioCtx.exampleRows.find((row) => row.line === targetLine);

      if (scenarioCtx.isOutline && exampleRow?.exampleIndex) {
        runExampleByContext(editor.document, scenarioCtx, exampleRow.exampleIndex, runMode);
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

  const stopRunning = vscode.commands.registerCommand(
    "bddScenarioRunner.stopRunning",
    async () => {
      await stopRunningScenario();
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

  testController = vscode.tests.createTestController(TEST_CONTROLLER_ID, "Playwright BDD Runner");
  const runHeadlessProfile = testController.createRunProfile(
    "Run Headless",
    vscode.TestRunProfileKind.Run,
    (request, token) => runFromTestItems(request, "headless", token),
    true,
  );
  const runHeadedProfile = testController.createRunProfile(
    "Run Headed",
    vscode.TestRunProfileKind.Run,
    (request, token) => runFromTestItems(request, "headed", token),
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

  const configChangeDisposable = vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration("bddScenarioRunner.packageManager")) {
      clearPackageManagerCache();
    }
  });

  const terminalCloseDisposable = vscode.window.onDidCloseTerminal((terminal) => {
    if (terminal === activeTerminalRunTerminal) {
      finalizeTerminalRunSummary("completed");
      activeTerminalRunTerminal = null;
    }
  });

  context.subscriptions.push(
    runScenarioTag,
    runAtCursor,
    runScenarioTagAtLine,
    runCurrentFeature,
    rerunFailed,
    diagnoseEnvironment,
    stopRunning,
    stopStatusBar,
    runSummaryStatusBar,
    runningProcessDisposable,
    activeEditorDisposable,
    openDocDisposable,
    changeDocDisposable,
    closeDocDisposable,
    configChangeDisposable,
    terminalCloseDisposable,
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
  const command = buildFeatureCommand(document, featureCtx, runMode);

  runCommandInTerminal(command, resolveRunCwd(document), "Feature", runMode);
  vscode.window.showInformationMessage(`Running feature \"${featureCtx.featureName}\" (${runMode})`);
}

function runScenarioByContext(
  document: vscode.TextDocument,
  scenarioCtx: ScenarioContext,
  runMode: RunMode,
): void {
  const scenarioName = scenarioCtx.scenarioName;
  const command = buildScenarioCommand(document, scenarioCtx, runMode);

  runCommandInTerminal(command, resolveRunCwd(document), "Scenario", runMode);
  vscode.window.showInformationMessage(`Running scenario \"${scenarioName}\" (${runMode})`);
}

function runExampleByContext(
  document: vscode.TextDocument,
  scenarioCtx: ScenarioContext,
  exampleIndex: number,
  runMode: RunMode,
): void {
  const command = buildExampleCommand(document, scenarioCtx, exampleIndex, runMode);

  runCommandInTerminal(command, resolveRunCwd(document), `Example #${exampleIndex}`, runMode);
  vscode.window.showInformationMessage(
    `Running scenario example #${exampleIndex} for \"${scenarioCtx.scenarioName}\" (${runMode})`,
  );
}

function runRerunFailed(runMode: RunMode): void {
  const config = vscode.workspace.getConfiguration("bddScenarioRunner");
  const template = config.get<string>(
    "rerunFailedCommandTemplate",
    "{pm} bddgen && {pm} playwright test --last-failed{headedFlag}",
  );
  const activeDoc = vscode.window.activeTextEditor?.document;
  const cwd = activeDoc && isFeatureDocument(activeDoc)
    ? resolveRunCwd(activeDoc)
    : vscode.workspace.workspaceFolders?.[0]?.uri;
  const pm = resolveRunner(cwd);
  const command = buildCommand(template, {
    scenario: "",
    featureName: "",
    example: "",
    scenarioExampleRegex: "",
    featurePath: "",
    runMode,
    pm,
  });
  runCommandInTerminal(command, cwd, "Re-run failed", runMode);
  vscode.window.showInformationMessage(`Re-running failed tests (${runMode})`);
}

function runCommandInTerminal(
  command: string,
  cwd: vscode.Uri | undefined,
  label: string,
  runMode: RunMode,
): void {
  const config = vscode.workspace.getConfiguration("bddScenarioRunner");
  const terminalName = config.get<string>("terminalName", "Playwright BDD Runner");
  const autoClearTerminal = config.get<boolean>("autoClearTerminal", true);
  const showTerminalOnRun = config.get<boolean>("showTerminalOnRun", false);
  const runBehavior = config.get<string>("terminalRunBehavior", "transient");
  const dialect = detectShellDialect();
  const normalizedCommand = normalizeCommandForDialect(command, dialect);

  activeTerminalRunStartedAt = Date.now();
  activeTerminalRunLabel = label;
  runSummaryStatusBar.text = `$(beaker) BDD: running (${label}, ${runMode})`;
  runSummaryStatusBar.tooltip = `BDD terminal run in progress (${label}, ${runMode})`;

  if (runBehavior === "transient") {
    const { shell, args } = getShellExecution(normalizedCommand, dialect);
    const terminal = vscode.window.createTerminal({
      name: terminalName,
      cwd,
      shellPath: shell,
      shellArgs: args,
    });
    activeTerminalRunTerminal = terminal;
    if (showTerminalOnRun) {
      terminal.show(true);
    }
    return;
  }

  const terminal = getOrCreateTerminal(terminalName, cwd);
  activeTerminalRunTerminal = terminal;
  if (showTerminalOnRun) {
    terminal.show(true);
  }

  if (autoClearTerminal) {
    const clearCommand = process.platform === "win32" ? "cls" : "clear";
    terminal.sendText(clearCommand, true);
  }

  terminal.sendText(normalizedCommand, true);
}

async function stopRunningScenario(): Promise<void> {
  const hadActiveTestRun = activeTestRunCount > 0;
  if (hadActiveTestRun) {
    stopAllTestItemsRequested = true;
  }

  if (!hadActiveTestRun) {
    finalizeTerminalRunSummary("stopped");
  }

  const config = vscode.workspace.getConfiguration("bddScenarioRunner");
  const terminalName = config.get<string>("terminalName", "Playwright BDD Runner");
  const terminal = vscode.window.terminals.find((item) => item.name === terminalName);

  if (terminal) {
    terminal.show(true);
    await vscode.commands.executeCommand("workbench.action.terminal.sendSequence", { text: "\u0003" });
  }

  const stoppedProcessCount = stopRunningProcesses();

  if (hadActiveTestRun || terminal || stoppedProcessCount > 0) {
    const segments: string[] = [];
    if (hadActiveTestRun) {
      segments.push("active test batch will stop after current scenario");
    }
    if (terminal) {
      segments.push("terminal interrupted");
    }
    if (stoppedProcessCount > 0) {
      segments.push(`killed ${stoppedProcessCount} background process(es)`);
    }
    const details = segments.length > 0 ? ` (${segments.join(", ")})` : "";
    vscode.window.showInformationMessage(`Stop signal sent${details}.`);
    return;
  }

  vscode.window.showWarningMessage("No running BDD scenario process was detected.");
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
      title: "Playwright BDD Runner",
    },
  );

  return picked?.value ?? null;
}

async function runFromTestItems(
  request: vscode.TestRunRequest,
  runMode: RunMode,
  token: vscode.CancellationToken,
): Promise<void> {
  if (activeTestRunCount === 0) {
    stopAllTestItemsRequested = false;
  }
  activeTestRunCount += 1;

  const run = testController.createTestRun(request);
  const testItems = collectTestItems(request);
  const runStartedAt = Date.now();
  let passedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  let erroredCount = 0;
  let stopNoticeWritten = false;
  runSummaryStatusBar.text = "$(beaker) BDD: running";
  runSummaryStatusBar.tooltip = "BDD run in progress";
  const cancellationDisposable = token.onCancellationRequested(() => {
    const stoppedCount = stopRunningProcesses();
    run.appendOutput(
      `\r\n[INFO] Run cancellation requested${stoppedCount > 0 ? `, stopping ${stoppedCount} process(es)` : ""}.\r\n`,
    );
  });

  try {
    for (const item of testItems) {
      if (token.isCancellationRequested || stopAllTestItemsRequested) {
        if (stopAllTestItemsRequested && !stopNoticeWritten) {
          run.appendOutput("\r\n[INFO] Stopped by user. Remaining scenarios in this feature run were cancelled.\r\n");
          stopNoticeWritten = true;
        }
        run.skipped(item);
        skippedCount += 1;
        continue;
      }

      const scenarioRef = TEST_DATA.get(item);
      if (!scenarioRef) {
        run.skipped(item);
        skippedCount += 1;
        continue;
      }

      try {
        const doc = await vscode.workspace.openTextDocument(scenarioRef.uri);
        const ctx = getScenarioContext(doc.getText(), scenarioRef.line);
        if (!ctx) {
          run.errored(item, new vscode.TestMessage("Scenario was not found."));
          erroredCount += 1;
          continue;
        }

        run.started(item);
        const command =
          scenarioRef.kind === "example" && scenarioRef.exampleIndex
            ? buildExampleCommand(doc, ctx, scenarioRef.exampleIndex, runMode)
            : buildScenarioCommand(doc, ctx, runMode);
        const cwd = resolveRunCwd(doc)?.fsPath;

        run.appendOutput(`$ ${command}\r\n`, undefined, item);

        const capturedLines: string[] = [];
        let activeCommand = command;
        let result = await executeCommandWithOutput(activeCommand, cwd, (line) => {
          capturedLines.push(stripAnsi(line));
          run.appendOutput(`${line}\r\n`, undefined, item);
        });

        if (!result.success && shouldRetryWithFlexibleGrep(capturedLines)) {
          const retryCommand = replaceGrepPattern(activeCommand, buildFlexibleScenarioPattern(ctx.scenarioName));
          if (retryCommand && retryCommand !== activeCommand) {
            run.appendOutput(
              "\r\n[INFO] No tests found with exact grep. Retrying with flexible scenario pattern...\r\n",
              undefined,
              item,
            );
            activeCommand = retryCommand;
            run.appendOutput(`$ ${activeCommand}\r\n`, undefined, item);

            result = await executeCommandWithOutput(activeCommand, cwd, (line) => {
              capturedLines.push(stripAnsi(line));
              run.appendOutput(`${line}\r\n`, undefined, item);
            });
          }
        }

        if (stopAllTestItemsRequested) {
          if (!stopNoticeWritten) {
            run.appendOutput("\r\n[INFO] Stopped by user. Remaining scenarios in this feature run were cancelled.\r\n");
            stopNoticeWritten = true;
          }
          run.skipped(item);
          skippedCount += 1;
          continue;
        }

        if (result.success) {
          const successDetails = buildSuccessDetails(activeCommand, capturedLines);
          run.appendOutput(`\r\n[SUCCESS] Scenario passed\r\n${successDetails}\r\n`, undefined, item);
          run.passed(item);
          passedCount += 1;
        } else {
          const reason =
            result.errorMessage ??
            (result.exitCode !== null
              ? `Process exited with code ${result.exitCode}.`
              : "Scenario execution failed.");
          const details = buildFailureDetails(activeCommand, capturedLines);
          run.appendOutput(`\r\n[ERROR] ${reason}\r\n`, undefined, item);
          run.failed(item, new vscode.TestMessage(`Scenario execution failed: ${reason}\n\n${details}`));
          failedCount += 1;
        }
      } catch (error) {
        run.errored(item, new vscode.TestMessage(String(error)));
        erroredCount += 1;
      }
    }
  } finally {
    const durationMs = Date.now() - runStartedAt;
    const durationLabel = formatDuration(durationMs);
    const summary = buildRunSummaryText({
      passed: passedCount,
      failed: failedCount,
      skipped: skippedCount,
      errored: erroredCount,
      durationLabel,
    });
    runSummaryStatusBar.text = `$(beaker) ${summary}`;
    runSummaryStatusBar.tooltip = `Last BDD run: ${summary}`;
    cancellationDisposable.dispose();
    run.end();

    activeTestRunCount = Math.max(0, activeTestRunCount - 1);
    if (activeTestRunCount === 0) {
      stopAllTestItemsRequested = false;
    }
  }
}

function finalizeTerminalRunSummary(reason: "stopped" | "completed"): void {
  if (!activeTerminalRunStartedAt || !activeTerminalRunLabel) {
    return;
  }

  const durationLabel = formatDuration(Date.now() - activeTerminalRunStartedAt);
  const label = activeTerminalRunLabel;
  runSummaryStatusBar.text = `$(beaker) BDD: terminal ${reason} (${label}) • ${durationLabel}`;
  runSummaryStatusBar.tooltip = `Last terminal run ${reason} (${label}) in ${durationLabel}. Results shown in terminal.`;
  activeTerminalRunStartedAt = null;
  activeTerminalRunLabel = null;
}

function buildRunSummaryText(input: {
  passed: number;
  failed: number;
  skipped: number;
  errored: number;
  durationLabel: string;
}): string {
  const parts = [
    `${input.passed} passed`,
    `${input.failed} failed`,
    `${input.skipped} skipped`,
    `${input.errored} errored`,
  ];
  return `BDD: ${parts.join(", ")} • ${input.durationLabel}`;
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }

  const seconds = durationMs / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
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

function shouldRetryWithFlexibleGrep(lines: string[]): boolean {
  return lines.some((line) => /No tests found\./i.test(line));
}

function buildFlexibleScenarioPattern(scenarioName: string): string {
  const words = scenarioName
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .map((word) => escapeRegexLiteral(word));

  return words.length > 0 ? words.join(".*") : escapeRegexLiteral(scenarioName);
}

function replaceGrepPattern(command: string, newPattern: string): string | null {
  const grepWithQuote = /--grep(\s+|=)(["'])(.*?)\2/;
  if (grepWithQuote.test(command)) {
    return command.replace(grepWithQuote, (_m, sep: string, quote: string) => {
      const escaped = quote === '"' ? newPattern.replace(/"/g, '\\"') : newPattern.replace(/'/g, "\\'");
      return `--grep${sep}${quote}${escaped}${quote}`;
    });
  }

  const grepNoQuote = /--grep(\s+|=)(\S+)/;
  if (grepNoQuote.test(command)) {
    return command.replace(grepNoQuote, (_m, sep: string) => `--grep${sep}"${newPattern}"`);
  }

  return null;
}

function escapeRegexLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function runEnvironmentDiagnosis(): Promise<void> {
  const output = vscode.window.createOutputChannel("Playwright BDD Runner Diagnose");
  output.clear();
  output.show(true);

  const forceShell = getConfiguredForceShell();
  const dialect = detectShellDialect();
  const config = vscode.workspace.getConfiguration("terminal.integrated");
  const defaultWindowsProfile = config.get<string>("defaultProfile.windows", "");

  output.appendLine("Playwright BDD Runner Environment Diagnose");
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

  const pm = resolvePackageManager(vscode.Uri.file(workspace));
  const runner = getPackageManagerRunner(pm);
  const execPrefix = getPackageManagerExecPrefix(pm);
  const checks = [`${runner} --version`, `${execPrefix} playwright --version`, `${execPrefix} bddgen --help`];

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

  vscode.window.showInformationMessage("Playwright BDD Runner diagnose completed. Check 'Playwright BDD Runner Diagnose' output.");
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
