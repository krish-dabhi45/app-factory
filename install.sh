#!/bin/sh
# Installs the app-factory plugin into one project folder (the folder you open in VS Code).
# Usage: /Users/mach/testing/app-factory/install.sh <project-folder>
set -eu

PLUGIN_DIR=$(cd "$(dirname "$0")" && pwd)
[ $# -eq 1 ] || { echo "usage: $0 <project-folder>" >&2; exit 2; }
mkdir -p "$1"
PROJECT=$(cd "$1" && pwd)

# The Claude Code binary: on PATH, or the newest one shipped inside the VS Code extension.
CLAUDE=$(command -v claude || true)
[ -n "$CLAUDE" ] || CLAUDE=$(ls -d "$HOME"/.vscode/extensions/anthropic.claude-code-*/resources/native-binary/claude 2>/dev/null | sort -V | tail -1)
[ -x "$CLAUDE" ] || { echo "error: Claude Code not found — install the Claude Code extension in VS Code first" >&2; exit 1; }

echo "plugin : $PLUGIN_DIR ($(sed -n 's/.*"version": *"\(.*\)".*/\1/p' "$PLUGIN_DIR/.claude-plugin/plugin.json"))"
echo "project: $PROJECT"
echo "claude : $CLAUDE"

# The workflow finds its script and skill through ROOT; it must point at this folder.
grep -q "ARGS.root || '$PLUGIN_DIR'" "$PLUGIN_DIR/workflows/build-app.js" ||
  { echo "error: ROOT in workflows/build-app.js is not $PLUGIN_DIR — edit that line first" >&2; exit 1; }

# Tools the pipeline calls. Missing ones are reported, not installed.
for t in node npx xcrun git; do command -v "$t" >/dev/null || { echo "error: $t not found" >&2; exit 1; }; done
FLUTTER=$(sed -n "s/^const FLUTTER = ARGS.flutter || '\(.*\)'$/\1/p" "$PLUGIN_DIR/workflows/build-app.js")
[ -x "$FLUTTER" ] || echo "warning: Flutter not at $FLUTTER — \"stack\":\"flutter\" will fail until FLUTTER in workflows/build-app.js is fixed"
for t in cwebp gif2webp webpmux; do command -v "$t" >/dev/null || echo "warning: $t not found — a run with a Figma design stops at image compression (brew install webp)"; done
command -v xcodegen >/dev/null || echo "warning: xcodegen not found — the default SwiftUI stack will fail (brew install xcodegen)"

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
