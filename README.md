# Ghost (`v1.9.3`) — Windows & Android WhatsApp Scheduler

Ghost is a local WhatsApp scheduler with matching light and dark **Neumorphic Soft UI**, exact recurring schedules, multi-recipient dispatch, contact import, dynamic variables, and persistent queues.

## What’s new in v1.9.3

- **Faster automatic Send**: Removes the fixed eight-second wait before the hidden-control fallback.
- **Adaptive timing**: A verified composer can use the Send-position fallback after about one second; WhatsApp builds exposing no accessibility details use it after about 2.6 seconds.
- **Quicker direct control**: Accessible Send buttons are attempted after the initial half-second stabilization period.
- **Safe behavior retained**: Message verification, foreground checks, custom Chromium control discovery, focused-Enter fallback, Emergency Stop, and visible diagnostics remain active.
- **Timing regression test**: Windows CI now fails if either the accessible-control or hidden-control path exceeds its latency budget.

## Windows desktop release

- Installer: `Ghost-Desktop-v1.9.3-x64-Setup.exe`
- Supported systems: Windows 10 and Windows 11, x64
- Packaging: Electron + NSIS
- Background mode: Windows system tray
- Standard routing: WhatsApp Desktop protocol with official WhatsApp Web fallback
- Business routing: Official WhatsApp Business Web compose route

### Desktop capabilities

- Responsive wide-screen version of the approved light/dark Neumorphic UI
- Contacts, groups, VCF/CSV/text import, multi-recipient dispatch, and dynamic variables
- Once, daily, weekly, monthly, and custom recurrence
- Persistent queue, history, pause/resume, send-now, and emergency stop
- Optional Start with Windows
- Direct Windows UI Automation of the WhatsApp Send control

> **Windows signing note:** The desktop installer is not code-signed. Microsoft SmartScreen may display an **Unknown Publisher** warning. Verify the SHA-256 file published beside the installer before running it.

> **Desktop automation requirement:** WhatsApp must already be signed in, and Windows must be awake and unlocked when a dispatch becomes due. Run Ghost and WhatsApp at the same normal privilege level; do not run only one of them as Administrator.

## Android release

The current Android release remains **v1.8.9** (`versionCode 18`).

- File: `releases/Ghost-v1.8.9.apk`
- Package: `ai.ghost.agent`
- Android: API 26–34
- Signing: `zipalign` plus APK Signature Schemes v2/v3 verification

> **Android install note:** The v1.8.9 APK uses a different certificate from v1.8.8. Uninstall v1.8.8 before installing v1.8.9.

## Shared features

- Light and dark Neumorphic themes using the approved Ghost pigeon identity
- Background-free contact rows and transparent scrolling header
- `Once`, `Daily`, `Weekly`, `Monthly`, and custom interval schedules
- 24-hour time selection
- Strict Android targeting for `com.whatsapp` and `com.whatsapp.w4b`
- Multi-person and broadcast dispatch
- Per-recipient messages and `{name}`, `{first_name}`, `{date}`, and `{day}` variables
- Contact import with long-press editing, favourites, and deletion
- Phone/local cache persistence with zero dummy data
- No AI

## Development

```bash
npm install
npm run dev
npm run build
npm run test:desktop
npm run desktop
npm run build:windows
npm run build:apk
```

The Windows release workflow parses the PowerShell UI Automation script, runs the desktop tests, builds and validates the installer on `windows-latest`, confirms its PE header, generates SHA-256, and publishes both files when a `desktop-v*` tag is pushed.
