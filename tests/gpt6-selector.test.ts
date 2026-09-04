import { expect, test } from "bun:test";
import { isChatGptGpt6ModelTitle, selectChatGptGpt6Model } from "../src/adapters/chatgpt-web/gpt6-selector";
import { CHATGPT_EFFORT_SLIDER_SELECTOR } from "../src/chatgpt-session";

test("GPT-6 titles are exact and do not mistake generic Pro, Sol, or descriptions for GPT-6", () => {
  for (const title of ["GPT-6", "GPT-6 Astra", "GPT-6 Pro", "GPT-6 Astra Pro", "GPT‑6 Astra\r\nDetails"]) {
    expect(isChatGptGpt6ModelTitle(title)).toBeTrue();
  }
  for (const title of ["Pro", "GPT-5.6 Sol", "GPT-60", "GPT-6 mini", "GPT-6 Astra preview", "About GPT-6", "Pro\nGPT-6 Astra"]) {
    expect(isChatGptGpt6ModelTitle(title)).toBeFalse();
  }
});

type Row = { title: string; label?: string; checked?: string; disabled?: boolean; dataDisabled?: boolean; hidden?: boolean };
function fixture(initial: Row[], options: { noOpClick?: boolean; lateRow?: Row } = {}) {
  let records = initial.map(row => ({ ...row }));
  let opened = true;
  let scans = 0;
  const clicks: string[] = [];
  const checkpoints: string[] = [];
  const rowLocator = (record: Row) => ({
    getAttribute: async (name: string) => {
      if (name === "aria-label") return record.label ?? null;
      if (name === "aria-checked") return record.checked ?? null;
      if (name === "aria-disabled") return record.disabled ? "true" : "false";
      if (name === "data-disabled") return record.dataDisabled ? "" : null;
      return null;
    },
    innerText: async () => record.title,
    click: async () => {
      clicks.push(record.title);
      opened = false;
      // Re-render and reorder: retaining an index or a detached row would give the wrong result.
      records = records.map(row => ({ ...row, checked: options.noOpClick ? row.checked : row.title === record.title ? "true" : "false" })).reverse();
    },
  });
  const rows = {
    filter() { return this; },
    count: async () => {
      scans++;
      if (scans === 2 && options.lateRow) records.push(options.lateRow);
      return records.filter(row => !row.hidden).length;
    },
    nth: (index: number) => rowLocator(records.filter(row => !row.hidden)[index]!),
  };
  const menu = { isVisible: async () => opened, locator: () => rows };
  const slider = { filter() { return this; }, last() { return this; }, isVisible: async () => false };
  const control = {
    getAttribute: async (name: string) => name === "aria-controls" ? "test-menu" : name === "aria-expanded" ? String(opened) : null,
    click: async () => { opened = true; },
  };
  const page = {
    locator: (selector: string) => selector === CHATGPT_EFFORT_SLIDER_SELECTOR ? slider : menu,
    keyboard: { press: async () => { opened = false; } },
  };
  const run = () => selectChatGptGpt6Model(page as never, control as never, async name => { checkpoints.push(name); }, { timeoutMs: 35, pollMs: 1 });
  return { run, clicks, checkpoints, isOpen: () => opened };
}

test("selects the named row with a click then reacquires and verifies after re-render", async () => {
  const f = fixture([{ title: "GPT-5.6 Sol", checked: "true" }, { title: "GPT-6 Astra", checked: "false" }]);
  await f.run();
  expect(f.clicks).toEqual(["GPT-6 Astra"]);
  expect(f.checkpoints).toEqual(["gpt6-model-clicked", "gpt6-model-selected"]);
  expect(f.isOpen()).toBeFalse();
});

test("already-selected GPT-6 is verified without toggling it", async () => {
  const f = fixture([{ title: "GPT-6 Pro", checked: "true" }]);
  await f.run();
  expect(f.clicks).toEqual([]);
  expect(f.checkpoints).toEqual(["gpt6-model-selected"]);
});

test("waits for late hydrated GPT-6 rows instead of treating earlier Sol rows as effort positions", async () => {
  const f = fixture([{ title: "Pro", checked: "true" }], { lateRow: { title: "GPT-6 Astra", checked: "false" } });
  await f.run();
  expect(f.clicks).toEqual(["GPT-6 Astra"]);
});

test("ignores hidden duplicate rows", async () => {
  const f = fixture([{ title: "GPT-6 Astra", checked: "true" }, { title: "GPT-6 Pro", checked: "false", hidden: true }]);
  await f.run();
  expect(f.clicks).toEqual([]);
});

test("an accessible GPT-6 title is sufficient when the rendered text has extra decoration", async () => {
  const f = fixture([{ title: "Decorated title", label: "GPT-6 Astra", checked: "true" }]);
  await f.run();
  expect(f.checkpoints).toContain("gpt6-model-selected");
});

for (const disabled of [{ disabled: true }, { dataDisabled: true }]) {
  test(`disabled GPT-6 is rejected without a click (${JSON.stringify(disabled)})`, async () => {
    const f = fixture([{ title: "GPT-6 Astra", checked: "false", ...disabled }]);
    await expect(f.run()).rejects.toThrow("disabled");
    expect(f.clicks).toEqual([]);
    expect(f.isOpen()).toBeFalse();
  });
}

test("ambiguous named rows fail closed", async () => {
  const f = fixture([{ title: "GPT-6 Astra", checked: "false" }, { title: "GPT-6 Pro", checked: "false" }]);
  await expect(f.run()).rejects.toThrow("ambiguous");
  expect(f.clicks).toEqual([]);
});

test("generic Pro is not a GPT-6 fallback", async () => {
  const f = fixture([{ title: "Pro", checked: "true" }]);
  await expect(f.run()).rejects.toThrow("did not expose a named GPT-6");
  expect(f.clicks).toEqual([]);
});

test("a no-op click cannot report GPT-6 as selected", async () => {
  const f = fixture([{ title: "GPT-6 Astra", checked: "false" }], { noOpClick: true });
  await expect(f.run()).rejects.toThrow("did not confirm");
  expect(f.clicks).toEqual(["GPT-6 Astra"]);
  expect(f.checkpoints).not.toContain("gpt6-model-selected");
});

test("missing semantic checked state is rejected", async () => {
  const f = fixture([{ title: "GPT-6 Astra" }]);
  await expect(f.run()).rejects.toThrow("no verifiable checked state");
  expect(f.clicks).toEqual([]);
});
