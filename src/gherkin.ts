import * as path from "path";
import { FeatureContext, ScenarioContext, ExampleRowContext } from "./types";

export function getScenarioContext(content: string, activeLineNumber: number): ScenarioContext | null {
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

export function getAllScenarioContexts(content: string): ScenarioContext[] {
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

export function getFeatureContext(content: string, fallbackPath: string): FeatureContext | null {
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
