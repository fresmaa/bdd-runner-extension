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
