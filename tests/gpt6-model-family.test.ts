import { expect, test } from "bun:test";
import { CHATGPT_WEB_ASTRA_BACKEND_MODEL, CHATGPT_WEB_BACKEND_MODEL, requireChatGptWebModelRoute, resolveChatGptWebContextLimits, resolveChatGptWebTransportLimits } from "../src/chatgpt-web-models";
import { resolveChatGptWebModelMode } from "../src/adapters/chatgpt-web/model";
import { assertChatGptWebModelFamily, chatGptWebModelFamilyFromLabel, selectChatGptWebModelFamily } from "../src/adapters/chatgpt-web/model-family";
import { assertChatGptWebInputWithinLimits, resolveChatGptWebMultipartStagingMode } from "../src/adapters/chatgpt-web/browser-worker";
import { defaultConfig, providerConfig } from "../src/config";

const pro = { solAvailable: true, proAvailable: true, localToolsEnabled: true };

interface RowState {
  text: string;
  checked?: string;
  ariaLabel?: string;
  title?: string;
  disabled?: boolean;
}

function picker(initial: RowState[], options: { sticky?: boolean; closeOnClick?: boolean } = {}) {
  const state = initial.map(row => ({ ...row }));
  let visible = true;
  let opens = 0;
  const clicks: string[] = [];
  const rows = state.map(row => ({
    innerText: async () => row.text,
    getAttribute: async (name: string) => name === "aria-label" ? row.ariaLabel ?? null
      : name === "aria-disabled" ? (row.disabled ? "true" : "false")
      : name === "aria-checked" ? row.checked ?? null : null,
    isEnabled: async () => !row.disabled,
    getByText: (pattern: RegExp) => ({ count: async () => row.title && pattern.test(row.title) ? 1 : 0 }),
    click: async () => {
      clicks.push(row.text);
      if (!options.sticky) {
        for (const other of state) other.checked = other === row ? "true" : "false";
      }
      if (options.closeOnClick) visible = false;
    },
  }));
  const list = {
    filter() { return this; },
    count: async () => rows.length,
    nth: (index: number) => rows[index],
  };
  const menu = {
    last() { return this; },
    isVisible: async () => visible,
    waitFor: async () => { if (!visible) throw new Error("menu closed"); },
    getByRole: (role: string) => { expect(role).toBe("menuitemradio"); return list; },
  };
  return {
    state, clicks,
    get opens() { return opens; },
    page: { locator: () => menu } as never,
    trigger: { click: async () => { visible = true; opens += 1; } } as never,
  };
}

for (const label of ["GPT-6", "GPT-6 Pro", "GPT-6 Astra", "GPT-6 Astra Pro", "GPT‑6 Pro", "Astra", " GPT-6 Pro\nMost capable model "]) {
  test(`recognizes the complete Astra product title: ${label}`, () => {
    expect(chatGptWebModelFamilyFromLabel(label)).toBe("astra");
  });
}
for (const label of ["Pro", "GPT-60", "GPT-6.1", "GPT-6 mini", "Use GPT-6 Pro", "GPT-5.6 Luna"]) {
  test(`does not mistake another label for Astra: ${label}`, () => {
    expect(chatGptWebModelFamilyFromLabel(label)).toBeUndefined();
  });
}

test("the stable Pro slug routes to Astra, not the Sol Pro slot", () => {
  const route = requireChatGptWebModelRoute("chatgpt-web/pro", pro);
  expect(route.backendModel).toBe(CHATGPT_WEB_ASTRA_BACKEND_MODEL);
  expect(route.adapterEffort).toBe("max");
  expect(resolveChatGptWebModelMode(route.backendModel, route.adapterEffort, pro)).toMatchObject({
    modelId: "gpt-6-astra", displayLabel: "GPT-6 Pro", uiEffortIndex: 4, localTools: true,
  });
  expect(resolveChatGptWebModelMode(route.backendModel, undefined, pro).effort).toBe("max");
  expect(() => resolveChatGptWebModelMode(route.backendModel, "high", pro)).toThrow("effort is not supported");
  expect(() => resolveChatGptWebModelMode(route.backendModel, "max", { ...pro, proAvailable: false })).toThrow("not available");
});

test("Astra provider registration is Pro-gated and leaves the Sol default unchanged", () => {
  const config = defaultConfig("full");
  expect(providerConfig(config).models).not.toContain(CHATGPT_WEB_ASTRA_BACKEND_MODEL);
  config.proAvailable = true;
  const provider = providerConfig(config);
  expect(provider.models).toContain(CHATGPT_WEB_ASTRA_BACKEND_MODEL);
  expect(provider.defaultModel).toBe(CHATGPT_WEB_BACKEND_MODEL);
  expect(provider.modelReasoningEfforts?.[CHATGPT_WEB_ASTRA_BACKEND_MODEL]).toEqual(["max"]);
  expect(provider.modelDefaultReasoningEfforts?.[CHATGPT_WEB_ASTRA_BACKEND_MODEL]).toBe("max");
});

test("Astra budgets are conservative Pro browser budgets, not the API's model window", () => {
  expect(resolveChatGptWebContextLimits(CHATGPT_WEB_ASTRA_BACKEND_MODEL, "max", pro))
    .toEqual(resolveChatGptWebContextLimits(CHATGPT_WEB_BACKEND_MODEL, "max", pro));
  expect(resolveChatGptWebTransportLimits(CHATGPT_WEB_ASTRA_BACKEND_MODEL, "max", pro))
    .toEqual(resolveChatGptWebTransportLimits(CHATGPT_WEB_BACKEND_MODEL, "max", pro));
  expect(() => resolveChatGptWebContextLimits(CHATGPT_WEB_ASTRA_BACKEND_MODEL, "high", pro)).toThrow("max browser effort");
  expect(() => assertChatGptWebInputWithinLimits(9_000, 808, CHATGPT_WEB_ASTRA_BACKEND_MODEL, "max", pro, 2_000)).not.toThrow();
  expect(() => assertChatGptWebInputWithinLimits(120_000, 110_000, CHATGPT_WEB_ASTRA_BACKEND_MODEL, "max", pro)).toThrow("message boundary");
  const stage = resolveChatGptWebMultipartStagingMode(CHATGPT_WEB_ASTRA_BACKEND_MODEL, pro, 1_000, 4_000);
  expect(stage).toMatchObject({ modelId: CHATGPT_WEB_ASTRA_BACKEND_MODEL, effort: "max" });
});

test("explicit Astra selection reopens a closed menu and confirms semantic identity", async () => {
  const ui = picker([
    { text: "GPT-5.6 Sol", checked: "true" },
    { text: "GPT-6 Astra", checked: "false" },
  ], { closeOnClick: true });
  const diagnostics: string[] = [];
  expect(await selectChatGptWebModelFamily(ui.page, ui.trigger, CHATGPT_WEB_ASTRA_BACKEND_MODEL,
    async checkpoint => { diagnostics.push(checkpoint); })).toBe("astra");
  expect(ui.clicks).toEqual(["GPT-6 Astra"]);
  expect(ui.opens).toBe(1);
  expect(diagnostics).toEqual(["model-family-astra-confirmed"]);
});

test("an already selected Astra row is verified without clicking again", async () => {
  const ui = picker([{ text: "GPT-6 Pro", checked: "true" }]);
  await selectChatGptWebModelFamily(ui.page, ui.trigger, CHATGPT_WEB_ASTRA_BACKEND_MODEL);
  expect(ui.clicks).toEqual([]);
});

test("combined accessible descriptions can be identified by an exact nested model title", async () => {
  const ui = picker([{ text: "GPT-6 Astra Most capable model", title: "GPT-6 Astra", checked: "true" }]);
  expect(await selectChatGptWebModelFamily(ui.page, ui.trigger, CHATGPT_WEB_ASTRA_BACKEND_MODEL)).toBe("astra");
});

test("plain Pro without Astra never masquerades as GPT-6", async () => {
  const ui = picker([{ text: "Pro", checked: "true" }]);
  await expect(selectChatGptWebModelFamily(ui.page, ui.trigger, CHATGPT_WEB_ASTRA_BACKEND_MODEL))
    .rejects.toMatchObject({ code: "chatgpt_model_unavailable", retryable: false });
  expect(ui.clicks).toEqual([]);
});

test("unavailable rollout and disabled Astra fail without falling back to Sol", async () => {
  for (const rows of [
    [{ text: "GPT-5.6 Sol", checked: "true" }],
    [{ text: "GPT-5.6 Sol", checked: "true" }, { text: "GPT-6 Pro", checked: "false", disabled: true }],
  ]) {
    const ui = picker(rows);
    await expect(selectChatGptWebModelFamily(ui.page, ui.trigger, CHATGPT_WEB_ASTRA_BACKEND_MODEL))
      .rejects.toMatchObject({ code: "chatgpt_model_unavailable", retryable: false });
    expect(ui.clicks).toEqual([]);
  }
});

test("duplicate, uncheckable, or stuck Astra controls fail closed", async () => {
  for (const rows of [
    [{ text: "GPT-6 Pro", checked: "true" }, { text: "GPT-6 Astra", checked: "false" }],
    [{ text: "GPT-6 Pro" }],
    [{ text: "GPT-6 Pro", checked: "false" }],
  ]) {
    const ui = picker(rows, { sticky: true });
    await expect(selectChatGptWebModelFamily(ui.page, ui.trigger, CHATGPT_WEB_ASTRA_BACKEND_MODEL, undefined, 0)).rejects.toThrow();
  }
});

test("post-effort verification rejects a model switch rather than repairing it silently", async () => {
  const ui = picker([{ text: "GPT-5.6 Sol", checked: "false" }, { text: "GPT-6 Pro", checked: "true" }]);
  await selectChatGptWebModelFamily(ui.page, ui.trigger, CHATGPT_WEB_ASTRA_BACKEND_MODEL);
  ui.state[0]!.checked = "true";
  ui.state[1]!.checked = "false";
  await expect(assertChatGptWebModelFamily(ui.page, ui.trigger, "astra"))
    .rejects.toMatchObject({ code: "chatgpt_model_mismatch", retryable: false });
  expect(ui.clicks).toEqual([]);
});

test("Sol routes explicitly leave Astra selected by a previous chat", async () => {
  const ui = picker([{ text: "GPT-6 Astra", checked: "true" }, { text: "GPT-5.6 Sol", checked: "false" }]);
  expect(await selectChatGptWebModelFamily(ui.page, ui.trigger, CHATGPT_WEB_BACKEND_MODEL)).toBe("sol");
  expect(ui.clicks).toEqual(["GPT-5.6 Sol"]);
});

test("legacy effort-only Sol pickers still work, but unknown model families do not", async () => {
  const legacy = picker([{ text: "High", checked: "true" }, { text: "Pro", checked: "false" }]);
  expect(await selectChatGptWebModelFamily(legacy.page, legacy.trigger, CHATGPT_WEB_BACKEND_MODEL)).toBeUndefined();
  const changed = picker([{ text: "GPT-7", checked: "true" }]);
  await expect(selectChatGptWebModelFamily(changed.page, changed.trigger, CHATGPT_WEB_BACKEND_MODEL)).rejects.toThrow("no other model");
});
