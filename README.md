# Ghost (`v1.9.2`) — Windows & Android WhatsApp Scheduler

Ghost is a local WhatsApp scheduler with matching light and dark **Neumorphic Soft UI**, exact recurring schedules, multi-recipient dispatch, contact import, dynamic variables, and persistent queues.

## What’s new in v1.9.2

- **Modern WhatsApp control discovery**: Ghost now recognizes custom Chromium controls as well as standard Windows buttons and editors.
- **Point-based UIA discovery**: The desktop worker probes the visible composer/footer when controls are missing from the normal accessibility tree.
- **Physical Send fallback**: If WhatsApp hides its footer controls from UI Automation, Ghost clicks the settled Send position beside the composer before considering Enter.
- **No misleading permission switch**: Settings now explains that Windows has no automation permission prompt and that Ghost/WhatsApp must run at the same privilege level.
- **Visible failure diagnostics**: A failed desktop dispatch automatically opens History, displays the full reason, and includes it in the Windows notification.
- **Real Windows integration tests**: CI opens synthetic WhatsApp windows and verifies both an accessible Send-control click and the hidden-control coordinate fallback.
- **Existing safeguards retained**: Expected-message verification, foreground checks, delayed focused-Enter fallback, Emergency Stop, and structured receipts remain active.

## Windows desktop release

- Installer: `Ghost-Desktop-v1.9.2-x64-Setup.exe`
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
