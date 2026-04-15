import test = require("node:test");
import assert = require("node:assert/strict");
import { buildCommand, buildScenarioExampleRegex, shellQuote } from "../commandTemplate";

test("shellQuote handles cmd escaping", () => {
  const actual = shellQuote('say "hi"', "cmd");
  assert.equal(actual, '"say ""hi"""');
});

test("shellQuote handles powershell escaping", () => {
  const actual = shellQuote("O'Reilly", "powershell");
  assert.equal(actual, "'O''Reilly'");
});

test("buildScenarioExampleRegex escapes regex special chars", () => {
  const actual = buildScenarioExampleRegex("Price (A+B)?", 3);
  assert.equal(actual, "(?=.*Price \\(A\\+B\\)\\?)(?=.*Example #3)");
});

test("buildCommand replaces placeholders and headed flag", () => {
  const actual = buildCommand(
    "pnpm test --grep {scenarioQuoted}{headedFlag} --path {featurePathQuoted}",
    {
      scenario: "Checkout flow",
      featureName: "",
      example: "",
      scenarioExampleRegex: "",
      featurePath: "features/checkout.feature",
      runMode: "headed",
    },
    "bash",
  );

  assert.equal(
    actual,
    "pnpm test --grep 'Checkout flow' --headed --path 'features/checkout.feature'",
  );
});

test("buildCommand replaces {pm} placeholder", () => {
  const actual = buildCommand(
    "{pm} bddgen && {pm} playwright test --grep {scenarioQuoted}{headedFlag}",
    {
      scenario: "Login",
      featureName: "",
      example: "",
      scenarioExampleRegex: "",
      featurePath: "",
      runMode: "headless",
      pm: "yarn",
    },
    "bash",
  );

  assert.equal(actual, "yarn bddgen && yarn playwright test --grep 'Login'");
});

test("buildCommand defaults {pm} to npx when not provided", () => {
  const actual = buildCommand(
    "{pm} bddgen && {pm} playwright test --grep {scenarioQuoted}{headedFlag}",
    {
      scenario: "Login",
      featureName: "",
      example: "",
      scenarioExampleRegex: "",
      featurePath: "",
      runMode: "headless",
    },
    "bash",
  );

  assert.equal(actual, "npx bddgen && npx playwright test --grep 'Login'");
});
