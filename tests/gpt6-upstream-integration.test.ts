import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { defaultConfig, providerConfig } from "../src/config";
import { CHATGPT_WEB_ASTRA_BACKEND_MODEL, CHATGPT_WEB_ZERO_RISK_BACKEND_MODEL, CHATGPT_WEB_ZERO_RISK_PRO_BACKEND_MODEL, availableChatGptWebModelRoutes } from "../src/chatgpt-web-models";

test("upstream Zero Risk remains manual-only and never registers automatic Astra", () => {
  const config = defaultConfig("full");
  config.browserInteractionMode = "manual";
  config.solAvailable = true;
  config.proAvailable = true;
  config.zeroRiskProEnabled = true;
  const provider = providerConfig(config);
  expect(provider.models).toEqual([CHATGPT_WEB_ZERO_RISK_BACKEND_MODEL, CHATGPT_WEB_ZERO_RISK_PRO_BACKEND_MODEL]);
  expect(provider.models).not.toContain(CHATGPT_WEB_ASTRA_BACKEND_MODEL);
  expect(provider.modelReasoningEfforts?.[CHATGPT_WEB_ZERO_RISK_PRO_BACKEND_MODEL]).toEqual(["low"]);
  expect(availableChatGptWebModelRoutes(config).every(route => route.interactionMode === "manual")).toBeTrue();
});

test("family selection precedes fresh effort controls and named model rows cannot win the effort race", () => {
  const source = readFileSync(new URL("../src/adapters/chatgpt-web/browser-worker.ts", import.meta.url), "utf8");
  const start = source.indexOf("private async selectModelAndEffort(");
  const method = source.slice(start, source.indexOf("private async", start + 10));
  const family = method.indexOf("const selectedFamily = await selectChatGptWebModelFamily");
  const refresh = method.indexOf("activation = await activateChatGptEffortMenu", family);
  const controls = method.indexOf("const effortMenu = activation.menu");
  expect(family).toBeGreaterThan(0);
  expect(refresh).toBeGreaterThan(family);
  expect(controls).toBeGreaterThan(refresh);
  expect(method).toContain("...(selectedFamily ? [] : [");
  expect(method).toContain("await confirmFamily()");
});
