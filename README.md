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

