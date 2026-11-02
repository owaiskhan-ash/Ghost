# Ghost (`v1.9.0`) — Windows & Android WhatsApp Scheduler

Ghost is a local WhatsApp scheduler with matching light and dark **Neumorphic Soft UI**, exact recurring schedules, multi-recipient dispatch, contact import, dynamic variables, and persistent queues.

## What’s new in v1.9.0

- **Windows desktop app**: Ghost now packages as a native Windows x64 `.exe` installer with Electron.
- **Responsive wide-screen UI**: The same approved Soft UI, shadows, controls, branding, light theme, and dark theme are recomposed for large displays.
- **Tray scheduling**: Closing the window keeps Ghost and its active schedules running in the Windows system tray.
- **WhatsApp desktop control**: Ghost opens the correct compose route, activates a WhatsApp window, and issues the Send key through native Windows UI automation.
- **Desktop contact import**: Import `.vcf`, CSV, text, or pasted contact lists without dummy data.
- **Desktop queue parity**: Contacts, groups, personalized messages, dynamic variables, recurrence, pause/resume, send-now, history, and local persistence remain available.
- **Safe Windows behavior**: Ghost requires an awake, unlocked, signed-in desktop and never attempts to bypass Windows sign-in or the lock screen.

## Windows desktop release

- Installer: `Ghost-Desktop-v1.9.0-x64-Setup.exe`
- Supported systems: Windows 10 and Windows 11, x64
- Packaging: Electron + NSIS
- Background mode: Windows system tray
- Standard routing: WhatsApp Desktop protocol with official WhatsApp Web fallback
- Business routing: Official WhatsApp Business Web compose route

> **Windows signing note:** The first desktop installer is not code-signed. Microsoft SmartScreen may display an **Unknown Publisher** warning. Verify the SHA-256 file published beside the installer before running it.

> **Desktop automation requirement:** WhatsApp must already be signed in, and Windows must be awake and unlocked when a dispatch becomes due. UI automation can be affected by future WhatsApp interface changes.

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

The Windows release workflow builds and validates the installer on `windows-latest`, confirms its PE header, generates a SHA-256 checksum, and publishes both files when a `desktop-v*` tag is pushed.
