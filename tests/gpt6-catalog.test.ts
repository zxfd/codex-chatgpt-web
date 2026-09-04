import { expect, test } from "bun:test";
import {
  CHATGPT_WEB_BACKEND_MODEL, CHATGPT_WEB_GPT6_BACKEND_MODEL, CHATGPT_WEB_MODEL_ROUTES,
  resolveChatGptWebContextLimits,
} from "../src/chatgpt-web-models";
import { defaultConfig, providerConfig } from "../src/config";
import { augmentNativeModelCatalog } from "../src/model-catalog";
import { routeChatGptWebRequest } from "../src/server";
import { resolveChatGptWebModelMode } from "../src/adapters/chatgpt-web/model";
import { assertChatGptWebInputWithinLimits, resolveChatGptWebMultipartStagingMode } from "../src/adapters/chatgpt-web/browser-worker";
import type { CodexParsedRequest } from "../src/types";

function listModel(slug: string): Record<string, unknown> {
  return {
    slug, display_name: slug, visibility: "list", supported_in_api: true,
    multi_agent_version: "v2", supported_reasoning_levels: [{ effort: "high", description: "High" }],
    tool_mode: "code_mode_only",
  };
}
const capabilities = { solAvailable: true, proAvailable: true, localToolsEnabled: true };

test("GPT-6 is a distinct browser identity, not a relabelled generic Pro slot", () => {
  const pro = CHATGPT_WEB_MODEL_ROUTES.find(route => route.slug === "chatgpt-web/pro")!;
  const gpt6 = CHATGPT_WEB_MODEL_ROUTES.find(route => route.slug === "chatgpt-web/gpt-6")!;
  expect(pro.displayName).toBe("ChatGPT Web — Pro");
  expect(pro.backendModel).toBe(CHATGPT_WEB_BACKEND_MODEL);
  expect(gpt6.displayName).toBe("ChatGPT Web — GPT-6 Astra");
  expect(gpt6.backendModel).toBe(CHATGPT_WEB_GPT6_BACKEND_MODEL);
  expect(resolveChatGptWebModelMode(gpt6.backendModel, "max", capabilities)).toMatchObject({
    modelId: CHATGPT_WEB_GPT6_BACKEND_MODEL, displayLabel: "GPT-6 Astra", uiEffortIndex: null, localTools: true,
  });
  expect(() => resolveChatGptWebModelMode(gpt6.backendModel, "low", capabilities)).toThrow("not supported");
  expect(() => resolveChatGptWebModelMode(gpt6.backendModel, "max", { ...capabilities, proAvailable: false }))
    .toThrow("not available");
});

test("GPT-6 route is registered by the provider and ignores contradictory native effort", () => {
  const config = defaultConfig("full");
  config.proAvailable = true;
  const provider = providerConfig(config);
  expect(provider.models).toContain(CHATGPT_WEB_GPT6_BACKEND_MODEL);
  expect(provider.modelReasoningEfforts?.[CHATGPT_WEB_GPT6_BACKEND_MODEL]).toEqual(["max"]);
  expect(provider.modelDefaultReasoningEfforts?.[CHATGPT_WEB_GPT6_BACKEND_MODEL]).toBe("max");
  const request: CodexParsedRequest = {
    modelId: "chatgpt-web/gpt-6", context: { messages: [] }, stream: false,
    options: { reasoning: "low" }, _rawBody: { model: "chatgpt-web/gpt-6", reasoning: { effort: "low" } },
  };
  routeChatGptWebRequest(request, config);
  expect(request.modelId).toBe(CHATGPT_WEB_GPT6_BACKEND_MODEL);
  expect(request.options.reasoning).toBe("max");
  expect(request._rawBody).toMatchObject({ model: "chatgpt-web/gpt-6" });
});

test("GPT-6 keeps conservative browser limits and never stages multipart on a different model", () => {
  const limits = resolveChatGptWebContextLimits(CHATGPT_WEB_GPT6_BACKEND_MODEL, "max", capabilities);
  expect(limits.contextWindow).toBe(112_193);
  expect(limits.autoCompactTokenLimit).toBe(95_000);
  expect(() => assertChatGptWebInputWithinLimits(100, 100, CHATGPT_WEB_GPT6_BACKEND_MODEL, "max", capabilities, 100))
    .not.toThrow();
  expect(() => assertChatGptWebInputWithinLimits(limits.contextWindow, 100, CHATGPT_WEB_GPT6_BACKEND_MODEL, "max", capabilities))
    .toThrow("exceeds");
  expect(resolveChatGptWebMultipartStagingMode(CHATGPT_WEB_GPT6_BACKEND_MODEL, capabilities, 100, 100))
    .toMatchObject({ modelId: CHATGPT_WEB_GPT6_BACKEND_MODEL, effort: "max" });
});

test("native Luna/Terra variants are hidden while Sol and native GPT-6 remain selectable", () => {
  const config = defaultConfig("full");
  config.proAvailable = true;
  const original = { models: ["gpt-5.6-sol", "gpt-5.6-luna", "gpt-5.6-terra", "gpt-6-astra", "gpt-6-luna-latest", "terra"].map(listModel) };
  const snapshot = structuredClone(original);
  const result = augmentNativeModelCatalog(original, config);
  const models = result.models as Array<Record<string, unknown>>;
  const visible = models.filter(model => model.visibility === "list").map(model => model.slug);
  expect(visible).toEqual(["gpt-5.6-sol", "gpt-6-astra", "chatgpt-web/high", "chatgpt-web/extra-high", "chatgpt-web/pro", "chatgpt-web/gpt-6"]);
  expect(original).toEqual(snapshot);
  expect(augmentNativeModelCatalog(result, config)).toEqual(result);
});

test("Luna and Think are not offered in the local picker even for Luna-only accounts", () => {
  const config = defaultConfig("full");
  config.solAvailable = false;
  const result = augmentNativeModelCatalog({ models: [listModel("gpt-5.6-luna")] }, config);
  const models = result.models as Array<Record<string, unknown>>;
  expect(models.map(model => model.visibility)).toEqual(["hide", "hide", "hide"]);
  // The sole native row may still supply protocol metadata; a second refresh stays idempotent.
  expect(augmentNativeModelCatalog(result, config)).toEqual(result);
});
