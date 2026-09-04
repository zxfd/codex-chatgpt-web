import { expect, test } from "bun:test";
import { CHATGPT_WEB_MODEL_ROUTES } from "../src/chatgpt-web-models";
import { defaultConfig } from "../src/config";
import { augmentNativeModelCatalog } from "../src/model-catalog";

function listModel(slug: string, displayName: string): Record<string, unknown> {
  return {
    slug,
    display_name: displayName,
    visibility: "list",
    supported_in_api: true,
    multi_agent_version: "v2",
    supported_reasoning_levels: [{ effort: "high", description: "High" }],
    tool_mode: "code_mode_only",
  };
}

test("the Pro Web route advertises GPT-6 while keeping the stable Pro slug", () => {
  const pro = CHATGPT_WEB_MODEL_ROUTES.find(route => route.slug === "chatgpt-web/pro");
  expect(pro).toBeDefined();
  expect(pro?.displayName).toBe("ChatGPT Web — GPT-6 Pro");
  expect(pro?.adapterEffort).toBe("max");
  expect(pro?.description).toContain("GPT-6 Astra");
});

test("native Luna and Terra rows are hidden without suppressing Sol or GPT-6 Astra", () => {
  const config = defaultConfig("full");
  config.proAvailable = true;
  const result = augmentNativeModelCatalog({
    models: [
      listModel("gpt-5.6-sol", "5.6 Sol"),
      listModel("gpt-5.6-luna", "5.6 Luna"),
      listModel("gpt-5.6-terra", "5.6 Terra"),
      listModel("gpt-6-astra", "6 Astra"),
    ],
  }, config);
  const models = result.models as Array<Record<string, unknown>>;
  const visibility = new Map(models
    .filter(model => !String(model.slug).startsWith("chatgpt-web/"))
    .map(model => [String(model.slug), model.visibility]));

  expect(visibility.get("gpt-5.6-sol")).toBe("list");
  expect(visibility.get("gpt-5.6-luna")).toBe("hide");
  expect(visibility.get("gpt-5.6-terra")).toBe("hide");
  expect(visibility.get("gpt-6-astra")).toBe("list");
});
