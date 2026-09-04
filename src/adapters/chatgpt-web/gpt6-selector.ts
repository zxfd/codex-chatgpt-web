import type { Locator, Page } from "playwright-core";
import { activateChatGptEffortMenu, CHATGPT_EFFORT_ITEM_SELECTOR } from "../../chatgpt-session";
import { ChatGptWebAdapterError } from "./adapter-error";

/** Match a complete model title, not a description mentioning GPT-6 or the generic Pro slot. */
export function isChatGptGpt6ModelTitle(value: string): boolean {
  const title = (value.split(/\r?\n/, 1)[0] ?? "")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\s+/g, " ").trim();
  return /^GPT-6(?: (?:Astra(?: Pro)?|Pro))?$/i.test(title);
}

function unavailable(detail: string): ChatGptWebAdapterError {
  return new ChatGptWebAdapterError(
    `ChatGPT GPT-6 selection failed: ${detail}. This selection attempt did not submit a prompt or choose a fallback model. Confirm the named GPT-6/Astra row in the launcher browser, or select the legacy Pro route explicitly.`,
    { status: 424, errorType: "invalid_request_error", code: "model_not_available", retryable: false },
  );
}

/**
 * Select the explicitly named model family and read back its semantic checked state. The legacy
 * Pro slider is deliberately not evidence of GPT-6. Reacquire rows after every menu re-render;
 * never count model radio rows as reasoning levels or cache their positions across a click.
 */
export async function selectChatGptGpt6Model(
  page: Page,
  control: Locator,
  captureDiagnostic?: (checkpoint: string) => Promise<void>,
  options: { timeoutMs?: number; pollMs?: number } = {},
): Promise<void> {
  const deadline = Date.now() + (options.timeoutMs ?? 15_000);
  let activated = false;
  let lastReason = "the account did not expose a named GPT-6/Astra model row";
  try {
    do {
      const { menu } = await activateChatGptEffortMenu(page, control, {
        settleMs: Math.max(1, Math.min(3_000, deadline - Date.now())),
      });
      const rows = menu.locator(CHATGPT_EFFORT_ITEM_SELECTOR).filter({ visible: true });
      const matches: Locator[] = [];
      const count = await rows.count();
      for (let index = 0; index < count; index++) {
        const row = rows.nth(index);
        const accessibleName = await row.getAttribute("aria-label");
        const title = accessibleName?.trim() || await row.innerText();
        if (isChatGptGpt6ModelTitle(title)) matches.push(row);
      }
      if (matches.length > 1) throw unavailable("the model picker exposed ambiguous GPT-6 rows");
      const row = matches[0];
      if (row) {
        if (await row.getAttribute("aria-disabled") === "true"
          || await row.getAttribute("data-disabled") !== null) {
          throw unavailable("the named GPT-6 row is disabled (account access or usage limit)");
        }
        const checked = await row.getAttribute("aria-checked");
        if (checked !== "true" && checked !== "false") {
          throw unavailable("the named GPT-6 row has no verifiable checked state");
        }
        if (checked === "true") {
          await captureDiagnostic?.("gpt6-model-selected");
          return;
        }
        lastReason = "ChatGPT did not confirm the selected GPT-6 model";
        if (!activated) {
          // A model radio row needs a real click; Enter can leave it silently unselected.
          // Do not force a click through a disabled row or an unrelated overlay.
          await row.click({ timeout: Math.max(1, Math.min(5_000, deadline - Date.now())) });
          activated = true;
          await captureDiagnostic?.("gpt6-model-clicked");
          continue;
        }
      }
      if (Date.now() >= deadline) break;
      await new Promise(resolve => setTimeout(resolve, options.pollMs ?? 100));
    } while (Date.now() < deadline);
    throw unavailable(lastReason);
  } finally {
    await page.keyboard.press("Escape").catch(() => {});
  }
}
