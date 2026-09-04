import type { Locator, Page } from "playwright-core";
import { CHATGPT_EFFORT_MENU_SELECTOR } from "../../chatgpt-session";
import { CHATGPT_WEB_ASTRA_BACKEND_MODEL, CHATGPT_WEB_BACKEND_MODEL } from "../../chatgpt-web-models";
import { ChatGptWebAdapterError } from "./adapter-error";

export type ChatGptWebModelFamily = "sol" | "astra";

// Model names are product identities, not translated effort labels. Do not accept plain "Pro":
// both Sol Pro and GPT-6 Pro can occupy the last reasoning-slider position.
const FAMILY_LABELS: Record<ChatGptWebModelFamily, RegExp> = {
  sol: /^(?:GPT[-\s\u2010-\u2015]*5\.6(?:\s+Sol)?(?:\s+Pro)?|Sol(?:\s+Pro)?)$/i,
  astra: /^(?:GPT[-\s\u2010-\u2015]*6(?:\s+Astra)?(?:\s+Pro)?|Astra(?:\s+Pro)?)$/i,
};

export function chatGptWebModelFamilyFromLabel(label: string): ChatGptWebModelFamily | undefined {
  // A menu row can have a descriptive second line. Match its complete title, never a substring.
  const title = label.trim().split(/\r?\n/)[0]?.trim().replace(/\s+/g, " ") ?? "";
  return (Object.keys(FAMILY_LABELS) as ChatGptWebModelFamily[])
    .find(family => FAMILY_LABELS[family].test(title));
}

function familyError(message: string, mismatch = false): ChatGptWebAdapterError {
  return new ChatGptWebAdapterError(message, {
    status: mismatch ? 502 : 400,
    errorType: mismatch ? "upstream_error" : "invalid_request_error",
    code: mismatch ? "chatgpt_model_mismatch" : "chatgpt_model_unavailable",
    retryable: false,
  });
}

async function openModelMenu(page: Page, trigger: Locator): Promise<Locator> {
  const menu = page.locator(CHATGPT_EFFORT_MENU_SELECTOR).last();
  if (!await menu.isVisible()) await trigger.click({ force: true });
  await menu.waitFor({ state: "visible", timeout: 5_000 });
  return menu;
}

interface FamilyRow { family: ChatGptWebModelFamily; row: Locator }

async function inspectFamilyRows(menu: Locator): Promise<{ rows: FamilyRow[]; unknownModel: boolean }> {
  const candidates = menu.getByRole("menuitemradio").filter({ visible: true });
  const rows: FamilyRow[] = [];
  let unknownModel = false;
  for (let index = 0; index < await candidates.count(); index += 1) {
    const row = candidates.nth(index);
    const text = await row.innerText();
    const ariaLabel = await row.getAttribute("aria-label");
    let family = chatGptWebModelFamilyFromLabel(ariaLabel ?? "") ?? chatGptWebModelFamilyFromLabel(text);
    // Accessible names may combine a title with a description. An exact nested title is also
    // evidence; arbitrary text mentioning a model in a paragraph is deliberately not accepted.
    if (!family) {
      for (const candidate of ["sol", "astra"] as const) {
        if (await row.getByText(FAMILY_LABELS[candidate]).count() === 1) {
          family = candidate;
          break;
        }
      }
    }
    if (family) rows.push({ family, row });
    else if (/^GPT[-\s\u2010-\u2015]*\d/i.test((ariaLabel ?? text).trim())) unknownModel = true;
  }
  return { rows, unknownModel };
}

async function uniqueFamilyRow(menu: Locator, family: ChatGptWebModelFamily): Promise<Locator> {
  const { rows } = await inspectFamilyRows(menu);
  const matches = rows.filter(candidate => candidate.family === family);
  if (matches.length !== 1) {
    throw familyError(
      `ChatGPT did not expose exactly one ${family === "astra" ? "GPT-6 Astra / GPT-6 Pro" : "GPT-5.6 Sol"} model row`
      + ` (found ${matches.length}). Verify account access and the model picker; no other model will be used.`,
    );
  }
  return matches[0]!.row;
}

/** Confirm identity without repairing it: changing a family here could reset the selected effort. */
export async function assertChatGptWebModelFamily(
  page: Page,
  trigger: Locator,
  family: ChatGptWebModelFamily,
): Promise<void> {
  const menu = await openModelMenu(page, trigger);
  const row = await uniqueFamilyRow(menu, family);
  const { rows } = await inspectFamilyRows(menu);
  if (await row.getAttribute("aria-checked") !== "true"
    || (await Promise.all(rows.filter(candidate => candidate.family !== family)
      .map(candidate => candidate.row.getAttribute("aria-checked")))).includes("true")) {
    throw familyError(`ChatGPT did not confirm the selected ${family} model after effort selection; refusing to send the prompt.`, true);
  }
}

/** Select an explicit family before effort selection; old effort-only Sol pickers remain supported. */
export async function selectChatGptWebModelFamily(
  page: Page,
  trigger: Locator,
  modelId: string,
  captureDiagnostic?: (checkpoint: string) => Promise<void>,
  confirmationTimeoutMs = 5_000,
): Promise<ChatGptWebModelFamily | undefined> {
  const family = modelId === CHATGPT_WEB_ASTRA_BACKEND_MODEL ? "astra"
    : modelId === CHATGPT_WEB_BACKEND_MODEL ? "sol" : undefined;
  if (!family) throw familyError(`Unsupported ChatGPT model-family selection: ${modelId}`);
  const menu = await openModelMenu(page, trigger);
  const inspected = await inspectFamilyRows(menu);
  if (family === "sol" && inspected.rows.length === 0 && !inspected.unknownModel) return undefined;
  const row = await uniqueFamilyRow(menu, family);
  if (await row.getAttribute("aria-disabled") === "true" || !await row.isEnabled()) {
    throw familyError(`ChatGPT ${family} is disabled for this account; no fallback will be used.`);
  }
  const checked = await row.getAttribute("aria-checked");
  if (checked !== "true" && checked !== "false") {
    throw familyError(`ChatGPT ${family} model row has no semantic checked state.`, true);
  }
  if (checked === "false") {
    await row.click({ force: true });
    const deadline = Date.now() + confirmationTimeoutMs;
    while (true) {
      const refreshed = await uniqueFamilyRow(await openModelMenu(page, trigger), family);
      if (await refreshed.getAttribute("aria-checked") === "true") break;
      if (Date.now() >= deadline) throw familyError(`ChatGPT did not switch to ${family}; refusing to send the prompt.`, true);
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
  await assertChatGptWebModelFamily(page, trigger, family);
  await captureDiagnostic?.(`model-family-${family}-confirmed`);
  return family;
}
