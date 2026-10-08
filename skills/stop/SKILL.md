---
name: stop
description: Stops a running app-factory build in the middle and frees what it held (run lock, shared device lock, the plugin's simulators and emulators), keeping all work so it can be continued later. Use only when the user types /app-factory:stop or asks to stop, cancel or halt the app-factory run.
---

Stop the app-factory run. Do exactly these steps, in order, and nothing else.

**1. Find the run.** Look in this conversation for the Workflow tool call that started `app-factory:build-app` and its result, which gives the run's task ID and its run ID (`wf_…`). If there are several, take the newest one still running; if the user named a project, take that project's. The project is the folder the run worked in (the one with `.pipeline/`).

- **No such call in this conversation:** the run was started in another chat. A workflow can only be stopped from the session that started it. Tell the user: "Open the chat that started the run and type /app-factory:stop there, or there run /workflows, select the run and press x." Then stop here — do not release any lock, because a live run would lose it. Only if the user says that chat or window is already closed (the run is dead), skip step 2 and do step 3 with that project's folder and no `--run`.

**2. Stop the workflow:** call TaskStop with the run's task ID. If the result says agent processes are still running, call TaskStop once more — Claude Code signals those processes again. If it says the task is not running, it was already stopped (for example with /workflows → x): go on to step 3, which still has to free its locks.

**3. Free what it held**, with the Bash tool, from the project folder:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/pipeline.mjs" stop "<project folder>" --run <run ID> --sdk "$HOME/Library/Android/sdk"
```

(If the run was started with an `androidSdk` arg, pass that path to `--sdk` instead.) It records the stop in the run's timing, shuts down the plugin's own `app-factory-*` simulators and `af-*` emulators — only if this run held the device lock, never any other device, and it deletes none — and releases the device lock and the run lock. It keeps the code and its git history, `.pipeline/` state, test worktrees and branches, and screenshots.

**4. Tell the user,** in this order: the lines the command printed, exactly; then "To continue later, say 'continue the app-factory run' in this chat."

## Continuing a stopped run (only when the user asks)

1. From the project folder: `node "${CLAUDE_PLUGIN_ROOT}/scripts/pipeline.mjs" resume "<project folder>"`. It takes the run lock again and, if the run had them, the shared devices. If it fails because another project's run holds the devices, tell the user that project's name from the message and stop — continue after that run ends.
2. Call the Workflow tool with `name: "app-factory:build-app"`, the same `args` as the stopped run, and `resumeFromRunId` set to the run ID the resume command printed. Steps that had finished return their saved results; the steps that were running when it stopped start over.
3. If the Workflow tool answers that there is nothing to resume (the run was started in another session), tell the user the run cannot be continued from here and that `/app-factory:build-app` starts it over as a new run.

To abandon a stopped run instead and remove its leftovers (worktrees, build output and caches, backup files): `node "${CLAUDE_PLUGIN_ROOT}/scripts/pipeline.mjs" cleanup "<project folder>" --done` from the project folder — only when the user asks for it.
