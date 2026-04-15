import { RunMode, ShellDialect } from "./types";

export function buildCommand(
  template: string,
  values: {
    scenario: string;
    featureName: string;
    example: string;
    scenarioExampleRegex: string;
    featurePath: string;
    runMode: RunMode;
    pm?: string;
  },
  dialect: ShellDialect,
): string {
  const headedFlag = values.runMode === "headed" ? " --headed" : "";
  const replacements: Record<string, string> = {
    "{pm}": values.pm ?? "npx",
    "{scenario}": values.scenario,
    "{scenarioQuoted}": shellQuote(values.scenario, dialect),
    "{featureName}": values.featureName,
    "{featureNameQuoted}": shellQuote(values.featureName, dialect),
    "{example}": values.example,
    "{exampleQuoted}": shellQuote(values.example, dialect),
    "{scenarioExampleRegex}": values.scenarioExampleRegex,
    "{scenarioExampleRegexQuoted}": shellQuote(values.scenarioExampleRegex, dialect),
    "{featurePath}": values.featurePath,
    "{featurePathQuoted}": shellQuote(values.featurePath, dialect),
    "{runMode}": values.runMode,
    "{headedFlag}": headedFlag,
  };

  let command = template;
  for (const [key, value] of Object.entries(replacements)) {
    command = command.split(key).join(value);
  }

  return command;
}

export function buildScenarioExampleRegex(scenarioName: string, exampleIndex: number): string {
  const escapedScenario = escapeRegex(scenarioName);
  const escapedExampleIndex = escapeRegex(`Example #${exampleIndex}`);
  return `(?=.*${escapedScenario})(?=.*${escapedExampleIndex})`;
}

export function shellQuote(value: string, dialect: ShellDialect): string {
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

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
