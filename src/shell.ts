import * as fs from "fs";
import { spawn, spawnSync } from "child_process";
import * as vscode from "vscode";
import { ForceShell, ShellDialect } from "./types";

const SHOWN_SHELL_WARNINGS = new Set<string>();

export function executeCommandWithOutput(
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

export function detectShellDialect(): ShellDialect {
  const forceShell = getConfiguredForceShell();

  if (forceShell !== "auto") {
    if ((forceShell === "git-bash" || forceShell === "bash") && process.platform === "win32") {
      if (!resolveGitBashPath()) {
        return "powershell";
      }
    }

    if (forceShell === "pwsh") {
      if (!isExecutableAvailable(resolvePwshPath())) {
        return process.platform === "win32" ? "powershell" : "posix";
      }
    }

    return mapForceShellToDialect(forceShell);
  }

  if (process.platform !== "win32") {
    return "posix";
  }

  const profile = vscode.workspace
    .getConfiguration("terminal.integrated")
    .get<string>("defaultProfile.windows", "")
    .toLowerCase();

  if (profile.includes("bash")) {
    return resolveGitBashPath() ? "bash" : "powershell";
  }
  if (profile.includes("command prompt") || profile.includes("cmd")) {
    return "cmd";
  }

  return "powershell";
}

export function normalizeCommandForDialect(command: string, dialect: ShellDialect): string {
  // Only Windows PowerShell 5.1 needs && emulation.
  if (dialect === "powershell" && shouldUseLegacyWindowsPowerShell()) {
    return normalizePowerShellChain(command);
  }

  return command;
}

export function stripAnsi(input: string): string {
  return input.replace(/\u001b\[[0-9;]*m/g, "");
}

export function getShellExecution(
  command: string,
  dialect: ShellDialect,
): { shell: string; args: string[] } {
  const forceShell = getConfiguredForceShell();

  if (process.platform === "win32") {
    if (dialect === "cmd") {
      return { shell: "cmd.exe", args: ["/d", "/c", command] };
    }

    if (forceShell === "git-bash" || forceShell === "bash") {
      const gitBash = resolveGitBashPath();
      if (gitBash) {
        return { shell: gitBash, args: ["-lc", command] };
      }

      showWarningOnce(
        "missing-git-bash",
        "BDD Runner: forced shell is Git Bash, but bash was not found. Falling back to PowerShell.",
      );
    }

    if (forceShell === "pwsh") {
      const pwshPath = resolvePwshPath();
      if (!isExecutableAvailable(pwshPath)) {
        showWarningOnce(
          "missing-pwsh",
          "BDD Runner: forced shell is pwsh, but executable was not found. Falling back to PowerShell.",
        );
        return {
          shell: "powershell.exe",
          args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
        };
      }

      return {
        shell: pwshPath,
        args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
      };
    }

    if (dialect === "bash") {
      const gitBash = resolveGitBashPath();
      if (gitBash) {
        return { shell: gitBash, args: ["-lc", command] };
      }
    }

    if (dialect === "powershell") {
      const shell = resolvePowerShellExecutableForAuto();
      return {
        shell,
        args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
      };
    }

    return {
      shell: "powershell.exe",
      args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
    };
  }

  if (forceShell === "pwsh") {
    const pwshPath = resolvePwshPath();
    if (!isExecutableAvailable(pwshPath)) {
      showWarningOnce(
        "missing-pwsh-nonwin",
        "BDD Runner: forced shell is pwsh, but executable was not found. Falling back to POSIX shell.",
      );
      return { shell: "sh", args: ["-c", command] };
    }

    return {
      shell: pwshPath,
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

export function getConfiguredForceShell(): ForceShell {
  const config = vscode.workspace.getConfiguration("bddScenarioRunner");
  return config.get<ForceShell>("forceShell", "auto");
}

export function resolvePwshPath(): string {
  const config = vscode.workspace.getConfiguration("bddScenarioRunner");
  return config.get<string>("pwshPath", "pwsh");
}

export function resolveGitBashPath(): string | undefined {
  if (process.platform !== "win32") {
    return undefined;
  }

  const config = vscode.workspace.getConfiguration("bddScenarioRunner");
  const configured = config.get<string>("gitBashPath", "").trim();
  if (configured.length > 0 && fs.existsSync(configured)) {
    return configured;
  }

  const defaults = [
    "C:/Program Files/Git/bin/bash.exe",
    "C:/Program Files (x86)/Git/bin/bash.exe",
  ];

  for (const candidate of defaults) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

export function resolveTerminalShell(dialect: ShellDialect): {
  shellPath?: string;
  shellArgs?: string[];
  recreateExisting: boolean;
  warningKey?: string;
  warningMessage?: string;
} {
  const forceShell = getConfiguredForceShell();

  if (process.platform === "win32" && (forceShell === "git-bash" || forceShell === "bash")) {
    const gitBash = resolveGitBashPath();
    if (gitBash) {
      return {
        shellPath: gitBash,
        shellArgs: ["--login", "-i"],
        recreateExisting: true,
      };
    }

    return {
      shellPath: "powershell.exe",
      shellArgs: ["-NoProfile"],
      recreateExisting: true,
      warningKey: "missing-git-bash-terminal",
      warningMessage:
        "BDD Runner: forced shell is Git Bash, but bash was not found. Terminal falls back to PowerShell.",
    };
  }

  if (process.platform === "win32" && forceShell === "pwsh") {
    const pwshPath = resolvePwshPath();
    if (!isExecutableAvailable(pwshPath)) {
      return {
        shellPath: "powershell.exe",
        shellArgs: ["-NoProfile"],
        recreateExisting: true,
        warningKey: "missing-pwsh-terminal",
        warningMessage:
          "BDD Runner: forced shell is pwsh, but executable was not found. Terminal falls back to PowerShell.",
      };
    }

    return {
      shellPath: pwshPath,
      shellArgs: ["-NoProfile"],
      recreateExisting: true,
    };
  }

  // Auto fallback for Windows profile pointing to bash when runtime is not available.
  if (process.platform === "win32" && forceShell === "auto" && dialect === "bash") {
    const gitBash = resolveGitBashPath();
    if (gitBash) {
      return {
        shellPath: gitBash,
        shellArgs: ["--login", "-i"],
        recreateExisting: false,
      };
    }

    return {
      shellPath: "powershell.exe",
      shellArgs: ["-NoProfile"],
      recreateExisting: true,
      warningKey: "auto-bash-fallback-terminal",
      warningMessage:
        "BDD Runner: VS Code default profile is bash, but bash was not found. Terminal falls back to PowerShell.",
    };
  }

  return { recreateExisting: false };
}

function showWarningOnce(key: string, message: string): void {
  if (SHOWN_SHELL_WARNINGS.has(key)) {
    return;
  }
  SHOWN_SHELL_WARNINGS.add(key);
  vscode.window.showWarningMessage(message);
}

function normalizePowerShellChain(command: string): string {
  const parts = command
    .split(/\s*&&\s*/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (parts.length <= 1) {
    return command;
  }

  const joined = parts.join("; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; ");
  return `${joined}; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }`;
}

function resolvePowerShellExecutableForAuto(): string {
  const forceShell = getConfiguredForceShell();
  if (forceShell === "pwsh") {
    const pwshPath = resolvePwshPath();
    if (isExecutableAvailable(pwshPath)) {
      return pwshPath;
    }
    return "powershell.exe";
  }
  if (forceShell === "powershell") {
    return "powershell.exe";
  }

  if (process.platform !== "win32") {
    return resolvePwshPath();
  }

  const profile = vscode.workspace
    .getConfiguration("terminal.integrated")
    .get<string>("defaultProfile.windows", "")
    .toLowerCase();

  // Prefer pwsh when profile hints to modern PowerShell.
  if ((profile.includes("pwsh") || profile.includes("powershell")) && !profile.includes("windows")) {
    const pwshPath = resolvePwshPath();
    if (isExecutableAvailable(pwshPath)) {
      return pwshPath;
    }
  }

  return "powershell.exe";
}

function shouldUseLegacyWindowsPowerShell(): boolean {
  if (process.platform !== "win32") {
    return false;
  }

  const forceShell = getConfiguredForceShell();
  if (forceShell === "pwsh") {
    return false;
  }
  if (forceShell === "powershell") {
    return true;
  }

  return resolvePowerShellExecutableForAuto().toLowerCase().includes("powershell.exe");
}

function mapForceShellToDialect(forceShell: ForceShell): ShellDialect {
  if (forceShell === "cmd") {
    return "cmd";
  }
  if (forceShell === "bash" || forceShell === "git-bash") {
    return "bash";
  }
  if (forceShell === "pwsh" || forceShell === "powershell") {
    return "powershell";
  }

  if (process.platform === "win32") {
    return "powershell";
  }
  return "posix";
}

function isExecutableAvailable(executable: string): boolean {
  try {
    const probeArgs = executable.toLowerCase().includes("cmd") ? ["/d", "/c", "echo", "ok"] : ["--version"];
    const result = spawnSync(executable, probeArgs, { stdio: "ignore" });
    return !result.error;
  } catch {
    return false;
  }
}
