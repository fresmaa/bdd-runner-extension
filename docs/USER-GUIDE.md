# Playwright BDD Runner User Guide

This guide is for daily users of Playwright BDD Runner.

## 1. Prerequisites

Before running commands from VS Code:

- Project already uses Playwright and BDD flow.
- Dependencies are installed.
- Feature files use .feature extension.

## 2. First Run

1. Open your project folder in VS Code.
2. Open any .feature file.
3. Put cursor inside a Scenario block.
4. Open Command Palette.
5. Run Playwright BDD Runner: Run Scenario.
6. Choose run mode (headless or headed) if prompted.
7. Watch terminal output in Playwright BDD Runner terminal.

## 3. Command Reference

| Command | What it does | Typical use |
| --- | --- | --- |
| Playwright BDD Runner: Run Scenario | Runs scenario at cursor | Fast scenario-level check |
| Playwright BDD Runner: Run Feature | Runs all scenarios in active file | Validate full feature |
| Playwright BDD Runner: Re-run Failed | Runs last failed set | Verify bug fix quickly |
| Playwright BDD Runner: Stop | Sends stop signal to active run | Stop long-running or stuck scenario |
| Playwright BDD Runner: Diagnose Environment | Checks shell/runtime setup | Debug execution issues |

## 4. Testing Panel Usage

- Scenario nodes can be run directly from Testing view.
- For Scenario Outline, example rows can be run individually.
- This is useful for isolating specific data rows.

## 5. Settings You May Want to Change

| Setting | When to change |
| --- | --- |
| bddScenarioRunner.packageManager | Set to `npm`, `yarn`, `pnpm`, or `bun` to override auto-detection |
| bddScenarioRunner.askRunMode | Disable if you always use one mode |
| bddScenarioRunner.defaultRunMode | Set preferred default when prompt is off |
| bddScenarioRunner.showTerminalOnRun | Enable if you want terminal to auto-open |
| bddScenarioRunner.autoClearTerminal | Disable if you want to keep previous logs |
| bddScenarioRunner.forceShell | Use only when auto shell detection is not suitable |

## 6. Windows Shell Tips

If your environment behaves differently than expected:

- Try bddScenarioRunner.forceShell = pwsh
- Or bddScenarioRunner.forceShell = powershell
- Use Diagnose Environment to confirm effective shell and available commands

## 7. Common Issues

1. Command seems to do nothing
- Ensure the active file is .feature.

2. Tooling not found (bddgen, playwright)
- Install dependencies in project, then rerun Diagnose Environment.
- In a monorepo, commands run from the nearest `package.json` to the feature file. If the script lives in the workspace root instead, open a feature file inside that package or override `bddScenarioRunner.packageManager`.

3. Wrong package manager invoked
- The extension auto-detects `npm`/`yarn`/`pnpm`/`bun` from the `packageManager` field in `package.json` or from lockfiles (`pnpm-lock.yaml`, `yarn.lock`, `bun.lockb`, `bun.lock`, `package-lock.json`). Set `bddScenarioRunner.packageManager` to force a specific one.

4. Wrong command behavior due to shell differences
- Force shell via setting and retry.

## 8. Quick Validation Checklist

- Run Current Scenario works
- Run Current Feature works
- Re-run Failed works
- Testing panel scenario run works
- Diagnose Environment returns expected results

## 9. Platform Notes

- Windows: PowerShell, pwsh, CMD, Git Bash supported with fallback logic.
- Linux/macOS: POSIX shell path with optional bash or pwsh depending on environment.

## 10. Support Workflow

When reporting issues, include:

- Operating system
- Shell profile
- Exact command used
- Output snippet from terminal
- Diagnose Environment output summary
