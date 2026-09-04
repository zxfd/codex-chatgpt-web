from pathlib import Path
import re
root=Path.cwd()
def edit(path, fn):
 p=root/path; p.write_text(fn(p.read_text()))
def resolve_conflicts(text, choose):
 pat=r'<<<<<<< HEAD\n(.*?)=======\n(.*?)>>>>>>> 184b1d69b764982f9a34dce127d5f4d826afa9d8\n'
 return re.sub(pat,lambda m: choose(m.group(1),m.group(2)),text,flags=re.S)
edit('src/adapters/chatgpt-web/browser-worker.ts',lambda t:resolve_conflicts(t,lambda a,b:a+'}\n\n'+b))
edit('src/chatgpt-session.ts',lambda t:resolve_conflicts(t,lambda a,b:a))
edit('src/chatgpt-web-models.ts',lambda t:resolve_conflicts(t,lambda a,b:b))
def routes(t):
 t=t.replace('export const CHATGPT_WEB_LUNA_BACKEND_MODEL =', '/** Adapter identity only; the browser must confirm a named GPT-6 model row before sending. */\nexport const CHATGPT_WEB_GPT6_BACKEND_MODEL = "gpt-6-astra";\nexport const CHATGPT_WEB_LUNA_BACKEND_MODEL =',1)
 t=t.replace('| typeof CHATGPT_WEB_LUNA_BACKEND_MODEL;', '| typeof CHATGPT_WEB_LUNA_BACKEND_MODEL\n  | typeof CHATGPT_WEB_GPT6_BACKEND_MODEL;',1)
 pos=t.index('const CHATGPT_WEB_PREFERRED_SOL_MODEL_ROUTES =')
 before=t[:pos]
 ending='  },\n];\n\n'
 assert before.endswith(ending)
 before=before[:-len(ending)]+'''  },
  {
    slug: "chatgpt-web/gpt-6",
    displayName: "ChatGPT Web — GPT-6 Astra",
    description: "Explicit GPT-6/Astra browser selection; fails if the account does not expose a named, enabled GPT-6 model. Uses conservative existing Pro transport budgets.",
    interactionMode: "automatic",
    backendModel: CHATGPT_WEB_GPT6_BACKEND_MODEL,
    codexEffort: "ultra",
    adapterEffort: "max",
    requiresPro: true,
  },
];

'''
 t=before+t[pos:]
 t=t.replace('|| route.slug === "chatgpt-web/pro"\n','|| route.slug === "chatgpt-web/pro"\n  || route.slug === "chatgpt-web/gpt-6"\n',1)
 t=t.replace('  let limits: ChatGptWebContextLimits;','''  // GPT-6 deliberately inherits this bridge's conservative Pro envelope until a logged-in
  // browser measurement justifies a different limit. This is not its advertised native context.
  let limits: ChatGptWebContextLimits;''',1)
 return t
edit('src/chatgpt-web-models.ts', routes)
def mode(t):
 t=t.replace('  CHATGPT_WEB_BACKEND_MODEL,','  CHATGPT_WEB_BACKEND_MODEL,\n  CHATGPT_WEB_GPT6_BACKEND_MODEL,',1)
 t=t.replace('export const CHATGPT_WEB_MODEL_ID =','export const CHATGPT_WEB_GPT6_MODEL_ID = CHATGPT_WEB_GPT6_BACKEND_MODEL;\nexport const CHATGPT_WEB_MODEL_ID =',1)
 t=t.replace('"Extra High" | "Pro";', '"Extra High" | "Pro" | "GPT-6 Astra";',1)
 needle='  if (modelId === CHATGPT_WEB_LUNA_MODEL_ID) {'
 t=t.replace(needle,'''  if (modelId === CHATGPT_WEB_GPT6_MODEL_ID) {
    if (!capabilities.solAvailable || !capabilities.proAvailable) {
      throw new Error("ChatGPT GPT-6 Astra is not available for this account; run Repair after confirming Pro access");
    }
    const effort = reasoning ?? "max";
    if (effort !== "max") throw new Error(`ChatGPT GPT-6 Astra mode is not supported: ${effort}`);
    // Never equate GPT-6 with slider index 4. Its named radio row is verified separately.
    return {
      modelId, effort, displayLabel: "GPT-6 Astra", uiEffortIndex: null,
      thinkEnabled: false, localTools: capabilities.localToolsEnabled,
    };
  }
'''+needle,1)
 return t
edit('src/adapters/chatgpt-web/model.ts', mode)
def worker(t):
 t=t.replace('  CHATGPT_WEB_MODEL_ID,','  CHATGPT_WEB_MODEL_ID,\n  CHATGPT_WEB_GPT6_MODEL_ID,',1)
 t='import { selectChatGptGpt6Model } from "./gpt6-selector";\n'+t
 t=t.replace('modelId !== CHATGPT_WEB_MODEL_ID && modelId !== CHATGPT_WEB_LUNA_MODEL_ID','modelId !== CHATGPT_WEB_MODEL_ID && modelId !== CHATGPT_WEB_LUNA_MODEL_ID\n    && modelId !== CHATGPT_WEB_GPT6_MODEL_ID')
 t=t.replace('if (modelId !== CHATGPT_WEB_MODEL_ID) {','if (modelId !== CHATGPT_WEB_MODEL_ID && modelId !== CHATGPT_WEB_GPT6_MODEL_ID) {')
 t=t.replace('const efforts: readonly ChatGptWebModelMode["effort"][] = capabilities.proAvailable\n    ? ["low", "medium", "max"]\n    : ["low", "medium"];','''// GPT-6 multipart staging stays on GPT-6; never silently stage on Sol/Instant.
  const efforts: readonly ChatGptWebModelMode["effort"][] = modelId === CHATGPT_WEB_GPT6_MODEL_ID
    ? ["max"]
    : capabilities.proAvailable ? ["low", "medium", "max"] : ["low", "medium"];''')
 needle='    const uiEffortIndex = mode.uiEffortIndex;'
 assert t.count(needle)==1
 t=t.replace(needle,'''    if (mode.modelId === CHATGPT_WEB_GPT6_MODEL_ID) {
      await throwIfChatGptRateLimitDialog(page);
      await throwIfChatGptSessionFailureAlert(page);
      const control = composerForm.locator(CHATGPT_EFFORT_CONTROL_SELECTOR).last();
      await control.waitFor({ state: "visible", timeout: 70_000 });
      await selectChatGptGpt6Model(page, control, captureDiagnostic);
      return mode;
    }
'''+needle,1)
 return t
edit('src/adapters/chatgpt-web/browser-worker.ts', worker)
def catalog(t):
 t=t.replace('  CHATGPT_WEB_MODEL_PREFIX,','  CHATGPT_WEB_MODEL_PREFIX,\n  CHATGPT_WEB_LUNA_BACKEND_MODEL,',1)
 assert 'CHATGPT_WEB_LUNA_BACKEND_MODEL' in t[:1000]
 t=t.replace('/^gpt-\\d+(?:\\.\\d+)?-(?:luna|terra)(?:$|[-.])/i','/^(?:gpt-\\d+(?:\\.\\d+)?-)?(?:luna|terra)(?:$|[-.])/i')
 t=t.replace('  if (model.visibility !== "list") return false;', '''  // Picker-hidden Luna/Terra can still supply protocol metadata on a second augmentation.
  if (model.visibility !== "list"
    && !(model.visibility === "hide" && shouldHideNativeSelectorModel(model))) return false;''',1)
 t=t.replace('.map(route => buildChatGptWebModel(template, route, config));','''.map(route => {
      const model = buildChatGptWebModel(template, route, config);
      // Retain explicit legacy routing, but never offer Luna (including Think) in this fork's picker.
      if (route.backendModel === CHATGPT_WEB_LUNA_BACKEND_MODEL) model.visibility = "hide";
      return model;
    });''',1)
 return t
edit('src/model-catalog.ts',catalog)
def provider(t):
 t=t.replace('  CHATGPT_WEB_ZERO_RISK_BACKEND_MODEL,','  CHATGPT_WEB_ZERO_RISK_BACKEND_MODEL,\n  CHATGPT_WEB_GPT6_BACKEND_MODEL,',1)
 t=t.replace('    : [model];','    : [model, ...(config.solAvailable && config.proAvailable ? [CHATGPT_WEB_GPT6_BACKEND_MODEL] : [])];',1)
 t=t.replace('modelReasoningEfforts: Object.fromEntries(models.map(modelId => [modelId, efforts])),','modelReasoningEfforts: Object.fromEntries(models.map(modelId => [modelId, modelId === CHATGPT_WEB_GPT6_BACKEND_MODEL ? ["max"] : efforts])),',1)
 t=t.replace('models.map(modelId => [modelId, manual ? "low" : config.solAvailable ? "high" : "low"]),','models.map(modelId => [modelId, modelId === CHATGPT_WEB_GPT6_BACKEND_MODEL ? "max" : manual ? "low" : config.solAvailable ? "high" : "low"]),',1)
 return t
edit('src/config.ts',provider)
edit('src/adapters/chatgpt-web/prompt.ts',lambda t:t.replace('const label = mode.effort === "max" ? "ChatGPT Pro" : `ChatGPT Web ${mode.displayLabel}`;','const label = mode.displayLabel === "Pro" ? "ChatGPT Pro" : `ChatGPT Web ${mode.displayLabel}`;'))
edit('tests/chatgpt-web-models.test.ts',lambda t:t.replace('["chatgpt-web/pro", "ultra", "max"],','["chatgpt-web/pro", "ultra", "max"],\n      ["chatgpt-web/gpt-6", "ultra", "max"],').replace('      "chatgpt-web/pro",\n','      "chatgpt-web/pro",\n      "chatgpt-web/gpt-6",\n'))
edit('tests/model-catalog.test.ts',lambda t:t.replace('["chatgpt-web/high", "chatgpt-web/extra-high", "chatgpt-web/pro"]','["chatgpt-web/high", "chatgpt-web/extra-high", "chatgpt-web/pro", "chatgpt-web/gpt-6"]').replace('publishes Luna and Think routes when the account exposes no Sol selector','retains hidden Luna and Think routes without publishing picker entries').replace('expect(web).toHaveLength(2);\n    expect(web.map(model => model.slug))','expect(web).toHaveLength(2);\n    expect(web.every(model => model.visibility === "hide")).toBeTrue();\n    expect(web.map(model => model.slug))'))
edit('tests/server-models.test.ts',lambda t:t.replace('    "chatgpt-web/pro",\n','    "chatgpt-web/pro",\n    "chatgpt-web/gpt-6",\n'))
print('Resolved merge conflicts and applied model routing/catalog changes.')
