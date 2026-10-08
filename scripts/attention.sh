#!/bin/bash
# Claude Code attention hook. Clicking the notification brings VS Code forward.
#
# Built on alerter (brew: vjeantet/tap/alerter), not terminal-notifier: terminal-notifier posts
# and exits immediately, so clicking it later requires macOS to relaunch it to run a callback —
# and Apple now blocks that relaunch-to-activate path (its own -activate/-execute are logged, not
# run; verified on this machine). alerter instead stays running and blocks until you click or it
# times out, then reports which one happened as real JSON. No relaunch, so nothing to block.
in=$(cat)
PATH=/opt/homebrew/bin:/usr/local/bin:$PATH  # hooks launched from a GUI app may not inherit Homebrew's PATH

# Skip entirely if you're already in the editor/terminal — nothing to draw you back to.
front=$(lsappinfo info -only name "$(lsappinfo front)" | cut -d'"' -f4)
case "$front" in Code|Cursor|Terminal|iTerm2|Ghostty) exit 0 ;; esac

case "$(jq -r '.hook_event_name' <<<"$in")" in
  Stop)       msg="Finished — ready for your review"; sound=Hero ;;
  PreToolUse) msg=$(jq -r '.tool_input.questions[0].question // "Claude has a question"' <<<"$in"); sound=Glass ;;
  *)          msg=$(jq -r '.message // "Claude needs your input"' <<<"$in"); sound=Glass ;;
esac

if command -v alerter >/dev/null; then
  # --sender impersonates VS Code's own bundle id, so the banner is branded as VS Code, not alerter.
  result=$(alerter --title "Claude Code" --message "$msg" --sender com.microsoft.VSCode --sound "$sound" --timeout 30 --json)
  [ "$(jq -r '.activationType' <<<"$result")" = "contentsClicked" ] && open -a "Visual Studio Code"
else
  # alerter not installed: plain banner, no click detection possible, so focus right away instead.
  osascript -e 'on run argv' -e 'display notification (item 1 of argv) with title "Claude Code" sound name (item 2 of argv)' -e 'end run' "$msg" "$sound"
  open -a "Visual Studio Code"
fi
