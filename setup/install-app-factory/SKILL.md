---
name: install-app-factory
description: Installs or updates the app-factory plugin into the project folder that is open in this window, to whatever is latest on its marketplace (a local dev folder or a GitHub repo — same command either way, no git clone needed). Use only when the user types /install-app-factory or asks to install or update app-factory in this project.
---

Install or update the app-factory plugin into the current project, from whichever marketplace it is already registered under (`app-factory-dev` on this machine, unless the user says otherwise). Do exactly this and nothing else:

1. Find the marketplace name: run `claude plugin marketplace list` with the Bash tool. If it lists `app-factory-dev` (or a marketplace the user named), use that name below. If it lists none, this is a brand-new machine with no app-factory marketplace yet — stop and tell the user: "No app-factory marketplace is registered on this machine. Run this once in a terminal (not this chat): `claude plugin marketplace add <owner/repo or local folder>` then `claude plugin install app-factory@<that marketplace name>`. After that, /install-app-factory will update it from then on." Do not guess the source yourself.

2. Run these two commands with the Bash tool, in order, from the current working directory:

   ```sh
   claude plugin marketplace update <marketplace name>
   claude plugin install app-factory@<marketplace name> --scope project
   ```

   (`install` on a plugin already installed in this project updates it to what the marketplace just reported; it is not an error if it says the plugin is already installed at the latest version.)

3. Show the user both commands' output.
   - If both succeeded, tell the user: "Reload this window (Cmd+Shift+P → Developer: Reload Window), start a new chat, then type /app-factory:build-app."
   - If either failed, show the exact error line and stop. Do not try to fix it, and do not run any other install command.

Do not edit any file, and do not run the pipeline.
