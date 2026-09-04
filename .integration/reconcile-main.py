from pathlib import Path
import re
root = Path.cwd()
UPSTREAM = '184b1d69b764982f9a34dce127d5f4d826afa9d8'
def edit(path, fn):
 p=root/path; p.write_text(fn(p.read_text()))
def conflicts(text, choose):
 pattern=r'<<<<<<< HEAD\n(.*?)=======\n(.*?)>>>>>>> '+UPSTREAM+r'\n'
 return re.sub(pattern,lambda m:choose(m.group(1),m.group(2)),text,flags=re.S)
def worker_choice(a,b):
 if 'waitForConnectorMentionRow' in a:return a+'}\n\n'+b
 if 'const efforts:' in a:return a[:a.index('  const requestedContextWindow')]
 raise RuntimeError('Unreviewed browser-worker conflict')
edit('src/adapters/chatgpt-web/browser-worker.ts',lambda t:conflicts(t,worker_choice))
edit('src/chatgpt-session.ts',lambda t:conflicts(t,lambda a,b:a))
edit('src/adapters/chatgpt-web/usage.ts',lambda t:conflicts(t,lambda a,b:a+b))
def model_choice(a,b):
 if 'displayName:' in a:return a.replace('    backendModel:','    interactionMode: "automatic",\n    backendModel:',1)
 return a+b
edit('src/chatgpt-web-models.ts',lambda t:conflicts(t,model_choice))
def config_choice(a,b):
 if 'const manual' in b:return b.replace('    : [model];','    : [model, ...(config.solAvailable && config.proAvailable ? [CHATGPT_WEB_ASTRA_BACKEND_MODEL] : [])];')
 if 'modelInputModalities:' in b:return b.replace('[modelId, efforts]','[modelId, modelId === CHATGPT_WEB_ASTRA_BACKEND_MODEL ? ["max"] : efforts]').replace('[modelId, manual ? "low" : config.solAvailable ? "high" : "low"]','[modelId, modelId === CHATGPT_WEB_ASTRA_BACKEND_MODEL ? "max" : manual ? "low" : config.solAvailable ? "high" : "low"]')
 raise RuntimeError('Unreviewed provider conflict')
edit('src/config.ts',lambda t:conflicts(t,config_choice))
def family_order(t):
 block='''    const selectedFamily = await selectChatGptWebModelFamily(page, currentEffort, modelId, captureDiagnostic);
    const confirmFamily = async (): Promise<void> => {
      if (selectedFamily) await assertChatGptWebModelFamily(page, currentEffort, selectedFamily);
    };
'''
 assert t.count(block)==1
 t=t.replace(block,'',1)
 needle='    const activation = await activateChatGptEffortMenu(page, currentEffort);'
 assert t.count(needle)==1
 t=t.replace(needle,'    let activation = await activateChatGptEffortMenu(page, currentEffort);',1)
 needle='    const effortMenu = activation.menu;'
 t=t.replace(needle,'''    // Control readiness and an expired-session alert can resolve in the same event-loop turn.
    // Recheck authoritative failures after activation, before inspecting or changing the model.
    await throwIfChatGptSessionFailureAlert(page);
    await throwIfChatGptRateLimitDialog(page);
'''+block+'''    // Selecting Astra/Sol can close and rebuild the menu; reacquire its semantic controls.
    activation = await activateChatGptEffortMenu(page, currentEffort);
'''+needle,1)
 needle='        effortChoice.waitFor({ state: "visible", timeout: 70_000, signal: waitAbort.signal }).then(() => "effort" as const),'
 assert t.count(needle)==1
 return t.replace(needle,'''        // Named model radio rows are not the old effort-only radio menu.
        ...(selectedFamily ? [] : [
          effortChoice.waitFor({ state: "visible", timeout: 70_000, signal: waitAbort.signal }).then(() => "effort" as const),
        ]),''',1)
edit('src/adapters/chatgpt-web/browser-worker.ts',family_order)
def catalog(t):
 t=t.replace('  CHATGPT_WEB_MODEL_PREFIX,','  CHATGPT_WEB_MODEL_PREFIX,\n  CHATGPT_WEB_LUNA_BACKEND_MODEL,',1)
 t=t.replace('  if (model.visibility !== "list") return false;','''  // A row hidden solely by this fork still carries valid protocol metadata on refresh.
  if (model.visibility !== "list"
    && !(model.visibility === "hide" && shouldHideNativeSelectorModel(model))) return false;''',1)
 return t.replace('.map(route => buildChatGptWebModel(template, route, config));','''.map(route => {
      const model = buildChatGptWebModel(template, route, config);
      if (route.backendModel === CHATGPT_WEB_LUNA_BACKEND_MODEL) model.visibility = "hide";
      return model;
    });''',1)
edit('src/model-catalog.ts',catalog)
edit('tests/model-catalog.test.ts',lambda t:t.replace('publishes Luna and Think routes when the account exposes no Sol selector','retains hidden Luna and Think routes when the account exposes no Sol selector').replace('expect(web).toHaveLength(2);\n    expect(web.map(model => model.slug))','expect(web).toHaveLength(2);\n    expect(web.every(model => model.visibility === "hide")).toBeTrue();\n    expect(web.map(model => model.slug))'))
edit('tests/gpt6-model-family.test.ts',lambda t:t.replace('resolveChatGptWebMultipartStagingMode(CHATGPT_WEB_ASTRA_BACKEND_MODEL, pro, "max", 1_000, 4_000)','resolveChatGptWebMultipartStagingMode(CHATGPT_WEB_ASTRA_BACKEND_MODEL, pro, 1_000, 4_000)'))
p=root/'tests/gpt6-catalog.test.ts'
p.write_text(p.read_text()+'''

test("hidden Luna-only metadata stays usable after refreshing the local picker", () => {
  const config = defaultConfig("full");
  config.solAvailable = false;
  const input = { models: [listModel("gpt-5.6-luna", "5.6 Luna")] };
  const result = augmentNativeModelCatalog(input, config);
  const models = result.models as Array<Record<string, unknown>>;
  expect(models.map(model => model.visibility)).toEqual(["hide", "hide", "hide"]);
  expect(augmentNativeModelCatalog(result, config)).toEqual(result);
  expect(input.models[0]?.visibility).toBe("list");
});
''')
(root/'tests/gpt6-upstream-integration.test.ts').write_text('''import { expect, test } from "bun:test";
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
''')
(root/'docs/fork-upstream-gpt6.md').write_text('''# Upstream v5.0.2 + latest fork GPT-6 integration

The integrated source is based on upstream `184b1d69b764982f9a34dce127d5f4d826afa9d8`
(v5.0.2), and fork main `c2de3fa39bf30ce86e4d42caba57fce838df51a6` (PR #1).
PR #1 landed while upstream integration was being prepared. Its stable route and model-family
selection are retained; the earlier proposed duplicate GPT-6 selector was removed.

## Behavior

- `chatgpt-web/pro` remains **ChatGPT Web — GPT-6 Pro**, routed to the internal Astra identity.
  This is not an official API model parameter. No silent fallback to generic Sol Pro is allowed.
- Named Astra/Sol family selection precedes effort selection. Menu and slider locators are
  reacquired after the family switch. Named model radio rows cannot be used as effort positions.
  Selected family is verified again after reasoning selection.
- The existing Mac connector fixes remain: exact visible titles, CRLF handling, duplicate
  rejection, bounded hydration waits, keyboard activation in the hidden maintenance viewport,
  and slider-only Pro capability detection.
- Native Luna/Terra aliases and Web Luna/Think are hidden from the local picker. Their old routes
  and protocol metadata remain for compatibility. Repeated catalog refresh stays idempotent.
- Upstream v5 manual Zero Risk, runtime recovery, cancellation and other changes are preserved.
  Manual providers never expose automatic Astra; Astra multipart staging never switches to Sol.
- GPT-6 uses the existing conservative Pro browser budgets, not the advertised API context size.

## Local verification boundary

CI covers typechecking, dependency audits, unit tests, renderer/runtime builds and runtime smoke.
It does not log in to the user's Mac browser or prove the service-side model identity. The named
browser row must be enabled for this account; accounts with only generic Pro fail rather than guess.
The route is offered using the existing Pro capability probe, which is not proof of GPT-6 rollout.

For a source installation, fully quit the launcher, update this fork and run `bun run app`.
Use **Install Models / Repair Codex Setup**, fully quit/reopen Codex, keep the launcher running,
and choose **ChatGPT Web — GPT-6 Pro** in a fresh task. Confirm the browser's named Astra/GPT-6
selection and complete one harmless read-only local tool call. A model's self-reported name is
not verification. Pulling source does not update an installed packaged Mac app; rebuild this fork
or run from source rather than replacing it with an upstream binary that lacks the fork patches.
''')
for p in root.rglob('*.ts'):
 if '.git' not in p.parts and re.search(r'^(<<<<<<<|=======|>>>>>>>)',p.read_text(),re.M):raise RuntimeError(f'Unresolved conflict: {p}')
print('Reconciled upstream v5.0.2 with latest main and preserved the stable GPT-6 Pro route.')
