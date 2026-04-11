import test = require("node:test");
import assert = require("node:assert/strict");
import { getAllScenarioContexts, getFeatureContext, getScenarioContext } from "../gherkin";

const featureText = `
Feature: Login feature

  Scenario: Valid login
    Given user is on login page
    When user submits valid credentials
    Then dashboard is shown

  Scenario Outline: Invalid login
    Given user is on login page
    When user submits <username> and <password>
    Then error is shown

    Examples:
      | username | password |
      | alice    | wrong1   |
      | bob      | wrong2   |
`;

test("getFeatureContext returns declared feature name", () => {
  const ctx = getFeatureContext(featureText, "fallback-name.feature");
  assert.ok(ctx, "feature context should exist");
  assert.equal(ctx.featureName, "Login feature");
});

test("getFeatureContext falls back to file name when Feature line is missing", () => {
  const ctx = getFeatureContext("Scenario: A", "checkout.feature");
  assert.ok(ctx, "fallback feature context should exist");
  assert.equal(ctx.featureName, "checkout");
});

test("getScenarioContext finds nearest scenario and parses outline examples", () => {
  const lines = featureText.split(/\r?\n/);
  const activeLine = lines.findIndex((line) => line.includes("wrong2"));
  const ctx = getScenarioContext(featureText, activeLine);

  assert.ok(ctx, "scenario context should exist");
  assert.equal(ctx.scenarioName, "Invalid login");
  assert.equal(ctx.isOutline, true);
  assert.equal(ctx.exampleRows.length, 2);
  assert.equal(ctx.exampleRows[0].label, "username=alice, password=wrong1");
  assert.equal(ctx.exampleRows[1].exampleIndex, 2);
});

test("getAllScenarioContexts returns both regular and outline scenarios", () => {
  const scenarios = getAllScenarioContexts(featureText);

  assert.equal(scenarios.length, 2);
  assert.equal(scenarios[0].scenarioName, "Valid login");
  assert.equal(scenarios[1].scenarioName, "Invalid login");
  assert.equal(scenarios[1].exampleRows.length, 2);
});
