---
name: install-app-factory
description: Installs the app-factory plugin into the project folder that is open in this window. Use only when the user types /install-app-factory or asks to install or update app-factory in this project.
---

Install the app-factory plugin into the current project. Do exactly this and nothing else:

1. Run this one command with the Bash tool, from the current working directory:

   ```sh
   /Users/mach/testing/app-factory/install.sh "$PWD"
   ```

   (On another computer, use the folder where app-factory is: `<that folder>/install.sh "$PWD"`. On Windows it runs in Git Bash, Claude Code's shell there.)

2. Show the user the command's output.
   - If the last line starts with `installed.`, tell the user: "Reload this window (Cmd+Shift+P → Developer: Reload Window), start a new chat, then type /app-factory:build-app."
   - If any line starts with `error:`, show that line and stop. Do not try to fix it, and do not run any other install command.

Do not edit any file, and do not run the pipeline.
