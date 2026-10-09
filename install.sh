#!/bin/sh
# Installs the app-factory plugin into one project folder (the folder you open in VS Code).
# Usage: <app-factory folder>/install.sh <project-folder>   (macOS, Linux, or Windows in Git Bash — Claude Code's shell there)
set -eu

PLUGIN_DIR=$(cd "$(dirname "$0")" && pwd)
[ $# -eq 1 ] || { echo "usage: $0 <project-folder>" >&2; exit 2; }
mkdir -p "$1"
PROJECT=$(cd "$1" && pwd)

# The Claude Code binary: on PATH, or the newest one shipped inside the VS Code extension.
CLAUDE=$(command -v claude || true)
[ -n "$CLAUDE" ] || CLAUDE=$(ls -d "$HOME"/.vscode/extensions/anthropic.claude-code-*/resources/native-binary/claude "$HOME"/.vscode/extensions/anthropic.claude-code-*/resources/native-binary/claude.exe 2>/dev/null | sort -V | tail -1)
[ -x "$CLAUDE" ] || { echo "error: Claude Code not found — install the Claude Code extension in VS Code first" >&2; exit 1; }

echo "plugin : $PLUGIN_DIR ($(sed -n 's/.*"version": *"\(.*\)".*/\1/p' "$PLUGIN_DIR/.claude-plugin/plugin.json"))"
echo "project: $PROJECT"
echo "claude : $CLAUDE"

# Tools the pipeline calls. Missing ones are reported, not installed.
for t in node npx git; do command -v "$t" >/dev/null || { echo "error: $t not found" >&2; exit 1; }; done
# The workflow's defaults (this folder, Flutter, Android SDK, Java, emulator image) for this machine — WARNING lines name what is missing.
node "$PLUGIN_DIR/scripts/configure.mjs" || { echo "error: could not configure workflows/build-app.js" >&2; exit 1; }
for t in cwebp gif2webp webpmux; do command -v "$t" >/dev/null || echo "warning: $t not found — a run with a Figma design stops at image compression (macOS: brew install webp; Debian/Ubuntu: apt install webp; Windows: Google's libwebp binaries on PATH)"; done
if [ "$(uname -s)" = Darwin ]; then
  command -v xcrun >/dev/null || echo "warning: xcrun not found — install Xcode for iOS builds and simulators; without it the run tests on Android only"
  command -v xcodegen >/dev/null || echo "warning: xcodegen not found — the SwiftUI stack will fail (brew install xcodegen)"
else
  echo "note: not macOS — iOS cannot be built or tested here (Apple's Xcode runs only on macOS); runs build and test the Android app"
fi

cd "$PROJECT"
if "$CLAUDE" plugin marketplace list 2>/dev/null | grep -q "app-factory-dev"; then
  "$CLAUDE" plugin marketplace update app-factory-dev >/dev/null
else
  "$CLAUDE" plugin marketplace add "$PLUGIN_DIR" >/dev/null
fi
"$CLAUDE" plugin install app-factory@app-factory-dev --scope project >/dev/null
"$CLAUDE" plugin update app-factory@app-factory-dev --scope project >/dev/null

grep -q '"app-factory@app-factory-dev": *true' "$PROJECT/.claude/settings.json" ||
  { echo "error: plugin is not enabled in $PROJECT/.claude/settings.json" >&2; exit 1; }

echo "installed. Next: open $PROJECT in VS Code, open the Claude Code panel in a NEW chat, type /app-factory:build-app"
