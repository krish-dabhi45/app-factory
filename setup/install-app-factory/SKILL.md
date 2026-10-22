---
name: install-app-factory
description: Installs or updates the app-factory plugin into the project folder that is open in this window, to whatever is latest on its marketplace (a local dev folder or a GitHub repo — same command either way, no git clone needed). Use only when the user types /install-app-factory or asks to install or update app-factory in this project.
---

Install or update the app-factory plugin into the current project, from whichever marketplace it is already registered under (`app-factory-dev`, unless the user says otherwise). Do exactly this and nothing else.

`claude` is usually not on PATH when Claude Code is used through the VS Code extension; the extension carries its own copy. Every command below finds it the same way `install.sh` does — PATH first, else the newest one inside the VS Code extension — and runs under `bash` (the shell here may be zsh, which errors on an unmatched glob). Run each command exactly as written, with the Bash tool, from the current working directory.

1. Find the marketplace name:

   ```sh
   bash -c 'C=$(command -v claude || ls -d "$HOME"/.vscode/extensions/anthropic.claude-code-*/resources/native-binary/claude* 2>/dev/null | sort -V | tail -1); [ -n "$C" ] || { echo "error: no Claude Code binary on PATH or in ~/.vscode/extensions"; exit 1; }; "$C" plugin marketplace list'
   ```

   If it lists `app-factory-dev` (or a marketplace the user named), use that name below. If it lists no app-factory marketplace, this machine has never had app-factory — stop and tell the user: "app-factory isn't on this machine yet. Do the one-time install in GUIDE.md §2b: type /plugins → Marketplaces tab → add `krish-dabhi45/app-factory` → Plugins tab → app-factory → Install → Install for this project. After that, /install-app-factory updates it." Do not add a marketplace yourself.

2. Update it (replace both `<marketplace name>` with the name from step 1):

   ```sh
   bash -c 'C=$(command -v claude || ls -d "$HOME"/.vscode/extensions/anthropic.claude-code-*/resources/native-binary/claude* 2>/dev/null | sort -V | tail -1); "$C" plugin marketplace update <marketplace name> && "$C" plugin install app-factory@<marketplace name> --scope project'
   ```

   (`install` on a plugin already installed in this project updates it to what the marketplace just reported; it is not an error if it says the plugin is already installed at the latest version.)

3. Show the user the command output.
   - If it succeeded, tell the user: "Reload this window (Cmd+Shift+P → Developer: Reload Window), start a new chat, then type /app-factory:build-app."
   - If it failed, show the exact error line and stop. Do not try to fix it, and do not run any other install command.

Do not edit any file, and do not run the pipeline.
