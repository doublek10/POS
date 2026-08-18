# POS Till Launcher

A small desktop icon for the till machine. Click it once and Microsoft
Edge opens straight into the POS — no address bar, no tabs, no other
browser chrome — with its own distinct icon so it's instantly
recognizable on a busy desktop.

**Honest scope:** this is a one-click *shortcut*, not a code-signed
installer package (.exe/.dmg with an installer wizard and
auto-updates). That's a materially bigger project. What you get here
is functionally the same end result — one download, one setup click,
then click-and-go every time after — using Microsoft Edge's own
built-in `--app=<url>` mode, a standard supported feature, not a hack.

## Setup — Windows (two clicks, total)

1. **Edit the URL once:** open `Install POS Shortcut.cmd` in Notepad
   (right-click → Edit) and change the `POS_URL` line near the top to
   your real POS address. Skip this if you're just testing locally —
   it defaults to `http://localhost:3000`.
2. **Double-click `Install POS Shortcut.cmd`.**

That's it. A **"POS Till"** icon appears on your Desktop with the
till-badge icon. From now on, only ever click that — the installer
file isn't needed again.

Windows may show a SmartScreen prompt the first time you run an
unsigned script (`More info` → `Run anyway`) — expected for any
non-code-signed `.cmd`/`.ps1`, not a sign anything is broken.

### Auto-launch when the till PC boots

Open `Install POS Shortcut.cmd` in Notepad and uncomment the
`AUTOSTART_FLAG` line before running it. The POS will then open
automatically every time the till machine's cashier account logs in.

## Setup — macOS (two clicks, total)

1. Edit the `POS_URL` line near the top of
   `Install POS Shortcut.command` (right-click → Open With → TextEdit).
2. Double-click `Install POS Shortcut.command`. The first run, macOS
   will block it as unsigned — right-click it and choose **Open** once
   to approve it, then it runs normally.

A **"POS Till"** icon appears on your Desktop.

## Changing the URL later

Re-open the same installer file, edit the URL, double-click it again —
it overwrites the shortcut in place.

## Files in this folder

| File                              | Purpose                                                        |
|------------------------------------|------------------------------------------------------------------|
| `Install POS Shortcut.cmd`         | **Windows: run this once.** Creates the real Desktop icon.       |
| `Install POS Shortcut.command`     | **macOS: run this once.** Creates the real Desktop icon.         |
| `install-windows.ps1`              | Does the actual shortcut creation (called by the .cmd above)     |
| `install-mac.sh`                   | Does the actual shortcut creation (called by the .command above) |
| `launch-pos.vbs` / `launch-pos.bat`| Windows launcher the shortcut points to                          |
| `launch-pos-mac.command`           | macOS launcher the shortcut points to                            |
| `pos-icon.ico` / `.png`            | The till-badge icon used by the shortcut                         |

## Why there isn't a pre-made shortcut file in this zip

Windows/macOS shortcuts store the exact file-system location of what
they point to. A shortcut built on one machine and copied into a zip
would break the moment you extract it somewhere else — the whole
reason installers create shortcuts *at* install time rather than
shipping them pre-made. The one-click installer above does that step
for you automatically, which is the standard, correct way to do this.
