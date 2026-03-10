import * as path from "path";
import * as vscode from "vscode";
import { spawn } from "child_process";

type ScenarioContext = {
  scenarioName: string;
  scenarioLine: number;
  isOutline: boolean;
  exampleRows: ExampleRowContext[];
};

type ExampleRowContext = {
  line: number;
  label: string;
  exampleValue: string;
  exampleIndex: number;
};

type FeatureContext = {
  featureName: string;
  featureLine: number;
};

type ShellDialect = "bash" | "powershell" | "cmd" | "posix";

type RunMode = "headless" | "headed";

type RunCommandInput = {
  uri?: vscode.Uri;
  line?: number;
};

type ScenarioLocation = {
  uri: vscode.Uri;
  line: number;
  kind: "scenario" | "example";
  exampleValue?: string;
  exampleIndex?: number;
};

const TEST_CONTROLLER_ID = "bddScenarioRunner.controller";
const TEST_DATA = new WeakMap<vscode.TestItem, ScenarioLocation>();

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
    openDocDisposable,
    changeDocDisposable,
    closeDocDisposable,
  );
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

export function deactivate(): void {
  // No-op
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

function buildScenarioCommand(
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

function buildFeatureCommand(
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
  const dialect = detectShellDialect();
  const existing = vscode.window.terminals.find((terminal) => terminal.name === name);

  // If Windows default profile resolves to bash, force a fresh PowerShell terminal
  // to avoid failing on machines without WSL/Git Bash runtime.
  if (existing && !(process.platform === "win32" && dialect === "bash")) {
    return existing;
  }

  if (existing && process.platform === "win32" && dialect === "bash") {
    existing.dispose();
  }

  if (process.platform === "win32" && dialect === "bash") {
    return vscode.window.createTerminal({
      name,
      cwd,
      shellPath: "powershell.exe",
      shellArgs: ["-NoProfile"],
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

function getScenarioContext(content: string, activeLineNumber: number): ScenarioContext | null {
  const lines = content.split(/\r?\n/);

  let scenarioLine = findScenarioAbove(lines, activeLineNumber);
  if (scenarioLine < 0) {
    scenarioLine = findScenarioBelow(lines, activeLineNumber);
  }

  if (scenarioLine < 0) {
    return null;
  }

  const scenarioName = extractScenarioName(lines[scenarioLine]);
  const isOutline = isScenarioOutlineLine(lines[scenarioLine]);

  return {
    scenarioName,
    scenarioLine,
    isOutline,
    exampleRows: isOutline ? collectExampleRows(lines, scenarioLine) : [],
  };
}

function getAllScenarioContexts(content: string): ScenarioContext[] {
  const lines = content.split(/\r?\n/);
  const scenarios: ScenarioContext[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (!isScenarioLine(lines[i])) {
      continue;
    }

    const scenarioName = extractScenarioName(lines[i]);
    const isOutline = isScenarioOutlineLine(lines[i]);
    scenarios.push({
      scenarioName,
      scenarioLine: i,
      isOutline,
      exampleRows: isOutline ? collectExampleRows(lines, i) : [],
    });
  }

  return scenarios;
}

function getFeatureContext(content: string, fallbackPath: string): FeatureContext | null {
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^\s*Feature:\s*(.+)$/i);
    if (match?.[1]?.trim()) {
      return { featureName: match[1].trim(), featureLine: i };
    }
  }

  const fallbackName = path.basename(fallbackPath, path.extname(fallbackPath));
  return fallbackName ? { featureName: fallbackName, featureLine: 0 } : null;
}

function findScenarioAbove(lines: string[], activeLineNumber: number): number {
  for (let line = activeLineNumber; line >= 0; line--) {
    if (isScenarioLine(lines[line])) {
      return line;
    }
  }

  return -1;
}

function findScenarioBelow(lines: string[], activeLineNumber: number): number {
  for (let line = activeLineNumber + 1; line < lines.length; line++) {
    if (isScenarioLine(lines[line])) {
      return line;
    }
  }

  return -1;
}

function isScenarioLine(line: string): boolean {
  return /^\s*Scenario(?: Outline)?:/i.test(line);
}

function isScenarioOutlineLine(line: string): boolean {
  return /^\s*Scenario\s+Outline:/i.test(line);
}

function extractScenarioName(line: string): string {
  return line.replace(/^\s*Scenario(?: Outline)?:\s*/i, "").trim() || "Unnamed Scenario";
}

function collectExampleRows(lines: string[], scenarioLine: number): ExampleRowContext[] {
  const rows: ExampleRowContext[] = [];
  let inExamples = false;
  let header: string[] = [];

  for (let i = scenarioLine + 1; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (isScenarioLine(raw)) {
      break;
    }

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    if (/^Examples?:/i.test(trimmed)) {
      inExamples = true;
      header = [];
      continue;
    }

    if (!inExamples) {
      continue;
    }

    if (!trimmed.startsWith("|")) {
      continue;
    }

    const cells = parseExamplesCells(trimmed);
    if (cells.length === 0) {
      continue;
    }

    if (header.length === 0) {
      header = cells;
      continue;
    }

    const firstNonEmpty = cells.find((cell) => cell.length > 0) ?? cells.join(" | ");
    const labelParts = cells
      .map((cell, idx) => `${header[idx] ?? `col${idx + 1}`}=${cell}`)
      .filter((part) => !part.endsWith("="));

    rows.push({
      line: i,
      label: labelParts.length > 0 ? labelParts.join(", ") : firstNonEmpty,
      exampleValue: normalizeExampleValue(firstNonEmpty),
      exampleIndex: rows.length + 1,
    });
  }

  return rows;
}

function parseExamplesCells(row: string): string[] {
  const withoutEdges = row.replace(/^\|/, "").replace(/\|$/, "");
  return withoutEdges.split("|").map((cell) => cell.trim());
}

function normalizeExampleValue(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length < 2) {
    return trimmed;
  }

  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

function shellQuote(value: string): string {
  const dialect = detectShellDialect();

  if (dialect === "cmd") {
    // CMD-safe quoting: use double quotes and escape embedded quotes.
    return `"${value.replace(/"/g, '""')}"`;
  }

  if (dialect === "powershell") {
    return `'${value.replace(/'/g, "''")}'`;
  }

  // bash/posix-safe single-quote escaping.
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function buildCommand(
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
  const headedFlag = values.runMode === "headed" ? " --headed" : "";
  const replacements: Record<string, string> = {
    "{scenario}": values.scenario,
    "{scenarioQuoted}": shellQuote(values.scenario),
    "{featureName}": values.featureName,
    "{featureNameQuoted}": shellQuote(values.featureName),
    "{example}": values.example,
    "{exampleQuoted}": shellQuote(values.example),
    "{scenarioExampleRegex}": values.scenarioExampleRegex,
    "{scenarioExampleRegexQuoted}": shellQuote(values.scenarioExampleRegex),
    "{featurePath}": values.featurePath,
    "{featurePathQuoted}": shellQuote(values.featurePath),
    "{runMode}": values.runMode,
    "{headedFlag}": headedFlag,
  };

  let command = template;
  for (const [key, value] of Object.entries(replacements)) {
    command = command.split(key).join(value);
  }

  return command;
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

function buildExampleCommand(
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

function buildScenarioExampleRegex(scenarioName: string, exampleIndex: number): string {
  const escapedScenario = escapeRegex(scenarioName);
  const escapedExampleIndex = escapeRegex(`Example #${exampleIndex}`);
  return `(?=.*${escapedScenario})(?=.*${escapedExampleIndex})`;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function executeCommandWithOutput(
  command: string,
  cwd: string | undefined,
  onLine: (line: string) => void,
): Promise<{ success: boolean; exitCode: number | null; errorMessage?: string }> {
  return new Promise((resolve) => {
    const dialect = detectShellDialect();
    const normalizedCommand = normalizeCommandForDialect(command, dialect);
    const { shell, args } = getShellExecution(normalizedCommand, dialect);
    const proc = spawn(shell, args, {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const emitChunk = (chunk: Buffer): void => {
      const text = chunk.toString();
      text.split(/\r?\n/).forEach((line) => {
        if (line.length > 0) {
          onLine(line);
        }
      });
    };

    proc.stdout.on("data", (chunk: Buffer) => emitChunk(chunk));
    proc.stderr.on("data", (chunk: Buffer) => emitChunk(chunk));
    proc.on("close", (code) => {
      resolve({
        success: code === 0,
        exitCode: code,
      });
    });
    proc.on("error", (error) => {
      resolve({
        success: false,
        exitCode: null,
        errorMessage: error.message,
      });
    });
  });
}

function detectShellDialect(): ShellDialect {
  if (process.platform !== "win32") {
    return "posix";
  }

  const profile = vscode.workspace
    .getConfiguration("terminal.integrated")
    .get<string>("defaultProfile.windows", "")
    .toLowerCase();

  if (profile.includes("bash")) {
    // Keep this branch so terminal creation can detect and override broken bash
    // profiles on Windows, but command execution will still use PowerShell.
    return "bash";
  }
  if (profile.includes("command prompt") || profile.includes("cmd")) {
    return "cmd";
  }

  return "powershell";
}

function normalizeCommandForDialect(command: string, dialect: ShellDialect): string {
  if (dialect === "powershell") {
    return command.replace(/\s*&&\s*/g, "; ");
  }

  return command;
}

function stripAnsi(input: string): string {
  return input.replace(/\u001b\[[0-9;]*m/g, "");
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

function getShellExecution(
  command: string,
  dialect: ShellDialect,
): { shell: string; args: string[] } {

  if (process.platform === "win32") {
    if (dialect === "cmd") {
      return { shell: "cmd.exe", args: ["/d", "/c", command] };
    }
    return {
      shell: "powershell.exe",
      args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
    };
  }

  if (dialect === "bash") {
    return { shell: "bash", args: ["-lc", command] };
  }
  if (dialect === "cmd") {
    return { shell: "cmd.exe", args: ["/d", "/c", command] };
  }
  if (dialect === "powershell") {
    return {
      shell: "powershell.exe",
      args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
    };
  }

  return { shell: "sh", args: ["-c", command] };
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
