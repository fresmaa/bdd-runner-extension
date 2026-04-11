# BDD Scenario Runner

Run Playwright BDD scenarios directly from `.feature` files in VS Code.

This extension helps you run tests faster without leaving your feature file.

## Who Is This For

- QA engineers and test automation users working with Gherkin `.feature` files.
- Teams using Playwright BDD in their project.

## What You Can Do

- Run the scenario where your cursor is.
- Run all scenarios in the current feature file.
- Re-run only failed tests.
- Run specific `Scenario Outline` example rows from the Testing panel.
- Choose `headless` or `headed` mode on each run.

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
| `BDD Runner: Run Current Scenario` | Run scenario at current cursor |
| `BDD Runner: Run Current Feature` | Run all scenarios in open feature file |
| `BDD Runner: Re-run Failed` | Re-run failed tests from previous run |
| `BDD Runner: Diagnose Environment` | Check shell/runtime configuration |

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

