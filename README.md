# Ghost (`v1.9.4`) — Windows & Android WhatsApp Scheduler

Ghost is a local WhatsApp scheduler with matching light and dark **Neumorphic Soft UI**, exact recurring schedules, multi-recipient dispatch, contact import, dynamic variables, and persistent queues.

## What’s new in v1.9.4

- **High-volume dispatch**: Replaces the fixed 2.2-second gap after every recipient with a 75 ms confirmed handoff or a conservative 300 ms unverified handoff.
- **Faster Send detection**: Polls the WhatsApp accessibility tree every 75 ms and reaches the hidden-control fallback after about 1.9 seconds.
- **Less repeated work**: Skips focus delays when WhatsApp is already foregrounded and checkpoints bulk receipt history every 25 successful sends.
- **Safe sequential routing**: Each recipient still completes before the next route opens; expected-message checks, a same-message route guard, confirmation checks, and Emergency Stop remain active.
- **New black application icon**: Includes the approved white pigeon on black for the installer, taskbar, and system tray.

For a 1,000-recipient confirmed batch, the handoff change removes roughly 35 minutes of Ghost-imposed idle time. Actual throughput still depends on WhatsApp Desktop, the PC, the connection, and WhatsApp account limits. Ghost does not parallelize one WhatsApp window because doing so could cross recipients and messages.

## Windows desktop release

- Installer: `Ghost-Desktop-v1.9.4-x64-Setup.exe`
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

> **Bulk messaging:** Use Ghost only for recipients who consented to receive messages. WhatsApp can rate-limit or restrict accounts independently of Ghost. For sustained campaigns to thousands of recipients, use the official WhatsApp Business Platform and its approved templates and limits.

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
