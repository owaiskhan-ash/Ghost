# Ghost (`v1.8.7`) — Scheduled WhatsApp & WA Business Sender APK

Ghost is an Android WhatsApp scheduler with matching light and dark **Neumorphic Soft UI**, theme-aware Ghost pigeon branding, exact recurring schedules, multi-recipient dispatch, phone-contact import, and closed-app Android automation.

## What’s new in v1.8.7

- **True circular header branding**: Light and dark pigeon logos now use optimized circular assets with transparent corners plus a CSS clipping fallback.
- **Cleaner contact import**: The picker now uses consistent rounded contact rows, inset avatars, circular selection controls, improved search, Select All/Clear, and a clear selection summary.
- **No inconsistent picker backgrounds**: Imported, selected, and unselected contact states use the same tactile Soft UI surface and paired shadows.
- **Non-scrolling schedule selector**: `Once` is full width, while `Daily`, `Weekly`, `Monthly`, and `Custom` use a stable 2×2 pill grid.
- **Taller schedule card**: Recurrence controls remain fully visible without a horizontal scrollbar.

## Core features

- **24-hour scheduling**: Select `00–23` hours and view dispatch, queue, live, and history timestamps as `HH:mm`.
- **Exact and recurring schedules**: `Once`, `Daily`, `Weekly` (any `Sun–Sat` combination), `Monthly` (`Day 1–31`), and `Custom` (`Every N days`).
- **Strict app targeting**: WhatsApp opens only `com.whatsapp`; WA Business opens only `com.whatsapp.w4b`.
- **Multi-person and broadcast dispatch**: Select multiple recipients, create groups, or provide per-person messages.
- **Dynamic variables**: Resolve `{name}`, `{date}`, and `{day}` independently for each recipient at send time.
- **Import-only contact creation**: Add contacts from the phone book or `.vcf` / CSV import; long-press editing, favourites, and deletion remain available.
- **Reliable permissions UI**: Permission controls refresh after returning from Android Settings and reflect actual native state.
- **Closed-app execution**: Native `AlarmManager`, foreground service, accessibility automation, unrestricted-battery guidance, and appear-on-top support keep schedules active when Ghost is closed.
- **Lock-screen safeguards**: Ghost can wake and dismiss `None` or `Swipe` locks. It never bypasses a PIN, pattern, password, or biometric lock.
- **No AI and no dummy data**: Scheduling and automation remain deterministic and local to the app/device bridge.

## Release APK

- File: `releases/Ghost-v1.8.7.apk`
- Package: `ai.ghost.agent`
- Version: `1.8.7` (`versionCode 16`)
- Android: API 26–34
- Signing: `zipalign` plus APK Signature Schemes v2/v3 verification

> **Install note:** This build uses a newly generated release certificate. Android will not install it over the differently signed public `v1.8.6` APK; uninstall the older Ghost build first, then install `v1.8.7`.

## Development

```bash
npm install
npm run dev
npm run build
npm run build:apk
```
