# Codex Windows connector for Prism Hub

This local variant fixes compatibility with Prism Hub 0.1.15 on Windows while
leaving the official `codex` plugin installed and disabled for remote access.
Select **Codex Windows** in Prism Panel and on the glasses.

## Why a separate connector

Hub 0.1.15 reports `desktop process discovery is unsupported on windows` for its
built-in Codex managed-desktop integration. Its automatic path also points to a
nonexistent `Programs/Codex/Codex.exe` for this Microsoft Store installation.
The upstream Windows process discovery still relies on WMIC and only looks for
`Codex.exe`, while the installed Codex desktop runs as `ChatGPT.exe`.

The separate `codex-windows` plugin opts out of managed application launch. It
discovers the actual running desktop using Windows CIM, reads its current CDP
port, and then uses the upstream plugin's existing CDP and session interfaces.
It does not force capability probes to succeed, open network listeners, change
Codex permissions, launch a second Codex instance, or restart Codex.

## Normal use and limitations

1. Open the **Codex + Prism** desktop shortcut. It starts Codex with a dynamically
   selected local CDP port and opens or reloads Prism Hub. Close an already running
   Codex normally first if it was started without CDP; the launcher never closes it.
2. Start Prism Hub and choose **Codex Windows** in the remote panel or glasses.
3. Version `windows.2` and later rediscover the desktop at each capability probe and after
   a lost connection. Restart Prism Hub after reopening Codex if it still shows
   an older unavailable status.

Detection accepts known Codex desktop installation paths, excludes renderer and
CLI processes, and refuses ambiguous desktop instances. A fixed, nonzero CDP
port is required. Localhost endpoints are still validated by the upstream CDP
probe against the actual Codex workspace target.

There is no managed launch/relaunch button for this connector. Detailed native
menu interactions still inherit the upstream plugin's Windows limitations.
An actual glasses voice command and its returned answer require wearer testing.
The launcher's check-only mode is safe while Codex is running:

```powershell
.\scripts\start-codex-prism.ps1 -CheckOnly
```

## Validation performed

- 206 Node tests passed, including seven Windows discovery and three SQLite
  resolution regression cases.
- Installed connector probe returned `available: true` and verified discovery.
- Session listing returned 49 local Codex sessions without printing their content.
- Hub registered `codex-windows`, subscribed to its reverse-sync stream and
  published 49 conversations to Prism.
- Prism dashboard showed **Runtime available / Remote enabled**.
- The wearer reopened Codex using the shortcut. Its CDP endpoint is reachable;
  no additional Codex restart was performed during validation.
- Version `windows.3` handles Hub child environments without `LOCALAPPDATA` or
  the Android SDK on PATH. Hub and cloud again published 49 conversations.
- A screenshot from the actual RV101 showed the populated conversation inbox.
  Sending Android Enter opened the selected conversation, and a second screenshot
  showed its recent messages and the live assistant reply. Logs confirmed
  `conversation.messages.turn` frames and a completed page without an error.
- Speech recognition and sending a new voice message still require wearer testing.
- Version `windows.4` emits its generated progress, task, trace, and action labels
  in English so the Vietnamese glasses UI does not receive Chinese status text.
  User and assistant content and labels read from the desktop are preserved.
  All 206 plugin tests passed after updating the expected translated labels.

## Rebuild and install

Run `npm ci --ignore-scripts`, then:

```powershell
node --test --test-reporter=dot test/*.test.js history_stream.test.js
node scripts/stage-windows-local.mjs
```

Import `release/codex-windows-local` through Prism's plugin installer. This
artifact includes its SDK dependency. Its top level intentionally has no
`package.json`, since Hub's source installer otherwise invokes a global `npm`
which is unavailable in its Windows environment. The source project's own
`package.json` and lockfile remain intact and reproducible.

## Recovery

Disable **Codex Windows** remote access in Prism. The original plugin and Codex
data are unchanged. The pre-install Prism configuration backup is stored in
`~/.prism/backups/windows-compat-20261016/config.yaml`; it contains credentials
and must stay private. Source changes are on branch `codex/windows-connection`.
