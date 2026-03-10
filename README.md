# BDD Scenario Runner

`BDD Scenario Runner` is a Visual Studio Code extension that executes Playwright BDD tests directly from Gherkin `.feature` files.

It is designed for fast local feedback, minimal context switching, and consistent execution across different terminal shells.

## Overview

- Execute the current scenario from the editor or command palette.
- Execute all scenarios in the current feature file.
- Re-run failed tests in one action.
- Run individual `Scenario Outline` example rows from the Testing view.
- Keep command quoting safe across PowerShell, CMD, and Bash.

## Capability Matrix

| Capability | Description |
| --- | --- |
| Current scenario run | Detects scenario from cursor position and runs it immediately |
| Current feature run | Runs all scenarios in the active `.feature` file |
| Re-run failed | Uses Playwright's last failed filter |
| Scenario Outline support | Generates run items per `Examples` row |
| Run mode selection | Supports `headless` and `headed` execution |
| Configurable templates | Supports placeholder-based command customization |

## Available Commands

| Command | Purpose |
| --- | --- |
| `BDD Runner: Run Current Scenario` | Run scenario at the active cursor context |
| `BDD Runner: Run Current Feature` | Run all scenarios in current feature file |
| `BDD Runner: Re-run Failed` | Re-run failed test cases from previous run |
| `BDD Runner: Diagnose Environment` | Validate shell/tool runtime and print diagnostics |

## Default Command Templates

```bash
# Scenario
pnpm bddgen && pnpm playwright test --grep {scenarioQuoted}{headedFlag}

# Feature
pnpm bddgen && pnpm playwright test --grep {featureNameQuoted}{headedFlag}

# Example row (Scenario Outline)
pnpm bddgen && pnpm playwright test --grep {scenarioExampleRegexQuoted}{headedFlag}

# Re-run failed
pnpm bddgen && pnpm playwright test --last-failed{headedFlag}
```

## Usage

1. Open a `.feature` file.
2. Place the cursor inside a `Scenario` or `Scenario Outline`.
3. Trigger execution from editor title, command palette, or Testing panel.
4. Select run mode (`Headless` or `Headed`) when prompted.
5. Review output in the `BDD Scenario Runner` terminal and Testing results.

## Configuration Reference

Search for `bddScenarioRunner` in VS Code Settings.

| Setting | Type | Default | Description |
| --- | --- | --- | --- |
| `bddScenarioRunner.commandTemplate` | `string` | `pnpm bddgen && pnpm playwright test --grep {scenarioQuoted}{headedFlag}` | Template for current scenario runs |
| `bddScenarioRunner.featureCommandTemplate` | `string` | `pnpm bddgen && pnpm playwright test --grep {featureNameQuoted}{headedFlag}` | Template for feature-level runs |
| `bddScenarioRunner.exampleCommandTemplate` | `string` | `pnpm bddgen && pnpm playwright test --grep {scenarioExampleRegexQuoted}{headedFlag}` | Template for `Scenario Outline` example-row runs |
| `bddScenarioRunner.rerunFailedCommandTemplate` | `string` | `pnpm bddgen && pnpm playwright test --last-failed{headedFlag}` | Template for failed-test reruns |
| `bddScenarioRunner.terminalName` | `string` | `BDD Scenario Runner` | Terminal name used by the extension |
| `bddScenarioRunner.autoClearTerminal` | `boolean` | `true` | Clears terminal before each execution |
| `bddScenarioRunner.showTerminalOnRun` | `boolean` | `false` | Reveals terminal automatically on run |
| `bddScenarioRunner.askRunMode` | `boolean` | `true` | Prompts mode selection for each run |
| `bddScenarioRunner.defaultRunMode` | `headless \| headed` | `headless` | Fallback mode when prompt is disabled |
| `bddScenarioRunner.forceShell` | `auto \| git-bash \| pwsh \| powershell \| cmd \| bash` | `auto` | Force shell runtime with fallback logic |
| `bddScenarioRunner.gitBashPath` | `string` | `` | Optional absolute path to `bash.exe` on Windows |
| `bddScenarioRunner.pwshPath` | `string` | `pwsh` | Command/path used when `forceShell = pwsh` |

## Placeholder Reference

- `{scenario}` / `{scenarioQuoted}`
- `{featureName}` / `{featureNameQuoted}`
- `{example}` / `{exampleQuoted}`
- `{scenarioExampleRegex}` / `{scenarioExampleRegexQuoted}`
- `{featurePath}` / `{featurePathQuoted}`
- `{runMode}`
- `{headedFlag}`

## Build and Package

```bash
cd /path/to/bdd-runner-extension
npm install
npm run compile
npm run package
```

Packaging generates a `.vsix` artifact in the project root.

## Install from VSIX

1. Open `Extensions` in VS Code.
2. Select `...` (More Actions).
3. Click `Install from VSIX...`.
4. Choose the generated `.vsix` file.

## Compatibility Notes

- Intended for Playwright + Gherkin BDD projects.
- PowerShell 5 and PowerShell 7 are both supported.
- On PowerShell 5 profiles, `&&` command chains are converted to fail-fast PowerShell-compatible chaining.
- On PowerShell 7 (`pwsh`), commands run natively without `&&` rewriting.
- With `forceShell = auto`, the extension resolves shell per OS and falls back safely when a runtime is missing.
- If you force `git-bash` on Windows without Git Bash installed, it falls back to PowerShell and shows a warning.
