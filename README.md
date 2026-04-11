# BDD Scenario Runner

![BDD Scenario Runner Banner](docs/images/hero.png)

| Item | Value |
| --- | --- |
| VS Code Engine | `^1.90.0` |
| Category | Testing |
| Language | TypeScript |
| Platforms | Windows, Linux, macOS |
| Test Runner | Node test runner |

<p align="center">
	<a href="#quick-start">Quick Start</a> •
	<a href="#commands">Commands</a> •
	<a href="#recommended-settings">Settings</a> •
	<a href="#cross-platform-validation-matrix">Cross-Platform</a>
</p>

Run Playwright BDD scenarios directly from `.feature` files in VS Code.

This extension helps you run tests faster without leaving your feature file.

## Who Is This For

- QA engineers and test automation users working with Gherkin `.feature` files.
- Teams using Playwright BDD in their project.

## What You Can Do

- <img alt="run" src="docs/images/icon-run.png" width="16" /> Run the scenario where your cursor is.
- <img alt="feature" src="docs/images/icon-feature.png" width="16" /> Run all scenarios in the current feature file.
- <img alt="rerun" src="docs/images/icon-rerun.png" width="16" /> Re-run only failed tests.
- <img alt="outline" src="docs/images/icon-feature.png" width="16" /> Run specific `Scenario Outline` example rows from the Testing panel.
- <img alt="mode" src="docs/images/icon-diag.png" width="16" /> Choose `headless` or `headed` mode on each run.

## Before You Start

Make sure your project already has:

- Playwright test setup.
- BDD workflow/commands used by your team (for example `bddgen`).
- Node dependencies installed.

## Quick Start

1. Open a project that already has Playwright + BDD setup.
2. Open any `.feature` file.
3. Put your cursor inside a `Scenario`.
4. Run command: `BDD Runner: Run Current Scenario`.
5. Check output in terminal: `BDD Scenario Runner`.

## Commands

| Command | When to use |
| --- | --- |
| <img alt="run" src="docs/images/icon-run.png" width="16" /> `BDD Runner: Run Current Scenario` | Run scenario at current cursor |
| <img alt="feature" src="docs/images/icon-feature.png" width="16" /> `BDD Runner: Run Current Feature` | Run all scenarios in open feature file |
| <img alt="rerun" src="docs/images/icon-rerun.png" width="16" /> `BDD Runner: Re-run Failed` | Re-run failed tests from previous run |
| <img alt="diag" src="docs/images/icon-diag.png" width="16" /> `BDD Runner: Diagnose Environment` | Check shell/runtime configuration |

## Recommended Settings

Search `bddScenarioRunner` in VS Code Settings.

| Setting | Default | Why it matters |
| --- | --- | --- |
| `bddScenarioRunner.askRunMode` | `true` | Lets you choose `headless`/`headed` each run |
| `bddScenarioRunner.defaultRunMode` | `headless` | Used when run mode prompt is disabled |
| `bddScenarioRunner.showTerminalOnRun` | `false` | Set `true` if you always want to see logs immediately |
| `bddScenarioRunner.autoClearTerminal` | `true` | Keeps output clean for each run |
| `bddScenarioRunner.forceShell` | `auto` | Use only if shell detection does not match your environment |

## Troubleshooting

1. Command does not run anything:
Make sure active file extension is `.feature`.

2. Wrong shell behavior on Windows:
Set `bddScenarioRunner.forceShell` to `pwsh` or `powershell` explicitly.

3. `pnpm`, `playwright`, or `bddgen` not found:
Install project dependencies first, then run `BDD Runner: Diagnose Environment`.

## Compatibility

- Works with Playwright + Gherkin BDD projects.
- Supports PowerShell 5, PowerShell 7, CMD, and Bash-based flows.
- Handles command-quoting differences across shells.

## Architecture Overview

The extension is organized into focused modules so behavior is easier to maintain and test.

![Runtime Flow](docs/images/workflow.png)

### Module Map

- `src/extension.ts`
Orchestrates VS Code integration: command registration, Testing API wiring, terminal execution trigger, and diagnose command.

- `src/gherkin.ts`
Parses `.feature` text to extract feature title, nearest scenario, all scenarios, and `Scenario Outline` example rows.

- `src/commandBuilder.ts`
Builds runnable commands for scenario, feature, and example row execution using workspace configuration templates.

- `src/commandTemplate.ts`
Pure command templating utilities: placeholder replacement, shell quoting by dialect, and scenario+example regex construction.

- `src/shell.ts`
Runtime shell utilities: dialect detection, fallback logic (pwsh/powershell/cmd/bash), command normalization, process execution, and ANSI stripping.

- `src/types.ts`
Shared type definitions used across modules.

### Runtime Flow

1. A command is triggered from editor/title, command palette, or Testing panel.
2. `extension.ts` reads context from active `.feature` document.
3. `gherkin.ts` resolves feature/scenario/example metadata.
4. `commandBuilder.ts` composes command text from configured templates.
5. `shell.ts` normalizes and runs the command in the selected shell.
6. Output is shown in terminal and mapped to test run status for Testing API execution.

### Unit Tests

The project includes Node test-runner based unit tests for parser and command template logic.

- `src/test/gherkin.test.ts`
- `src/test/commandTemplate.test.ts`

Run tests with:

```bash
npm test
```

## Cross-Platform Validation Matrix

Use this matrix to confirm the extension can run in Windows, Linux, and macOS.

| Area | Windows | Linux | macOS | Pass Criteria |
| --- | --- | --- | --- | --- |
| VS Code Engine | 1.90+ | 1.90+ | 1.90+ | Extension activates on opening a `.feature` file |
| Node Runtime | Available in desktop/remote extension host | Available in desktop/remote extension host | Available in desktop/remote extension host | Commands can spawn child process successfully |
| Default Shell Auto Mode | PowerShell/CMD/Git Bash fallback | POSIX shell | POSIX shell | `Diagnose Environment` shows effective shell and runs checks |
| Force Shell Option | `pwsh`, `powershell`, `cmd`, `git-bash`, `bash` | `pwsh`, `bash` | `pwsh`, `bash` | Forced shell works or safe fallback warning appears |
| Command Run: Current Scenario | Supported | Supported | Supported | Scenario at cursor executes and terminal shows command output |
| Command Run: Current Feature | Supported | Supported | Supported | All scenarios in active feature run |
| Command: Re-run Failed | Supported | Supported | Supported | Last failed test set can be rerun |
| Testing Panel: Scenario | Supported | Supported | Supported | Scenario node executes from Testing view |
| Testing Panel: Scenario Outline Example | Supported | Supported | Supported | Example row node executes with regex targeting |
| Packaging VSIX | Supported | Supported | Supported | `npm run package` completes successfully |

### Per-Platform Checklist

1. Open a workspace that already has Playwright + BDD setup.
2. Open a `.feature` file to trigger extension activation.
3. Run `BDD Runner: Diagnose Environment` and verify all checks are OK.
4. Run `BDD Runner: Run Current Scenario` in `headless` mode.
5. Run `BDD Runner: Run Current Feature` in `headed` mode.
6. Open Testing panel and run one Scenario node.
7. If there is a Scenario Outline, run one Example row node.
8. Run `BDD Runner: Re-run Failed` after creating at least one failure case.

### Suggested Evidence to Record

- OS and shell profile used
- Effective shell shown by diagnose output
- Command output snippet for scenario and feature runs
- Testing panel pass or fail result for scenario and example row
- Any fallback warning shown by shell resolution

