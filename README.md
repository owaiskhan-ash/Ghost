# Ghost (`v1.8.8`) — Scheduled WhatsApp & WA Business Sender APK

Ghost is an Android WhatsApp scheduler with matching light and dark **Neumorphic Soft UI**, theme-aware Ghost pigeon branding, exact recurring schedules, multi-recipient dispatch, phone-contact import, and closed-app Android automation.

## What’s new in v1.8.8

- **New white Neumorphic app icon**: The Android launcher now uses the approved white-themed sculpted pigeon logo instead of the former fluorescent-green artwork.
- **Adaptive Android artwork**: The new logo is packaged as the API 26+ adaptive foreground with a matching `#E0E5EC` background.
- **Complete launcher coverage**: Updated `mdpi`, `hdpi`, `xhdpi`, `xxhdpi`, and `xxxhdpi` fallback icons keep the identity consistent across launchers and device densities.
- **Unchanged in-app branding**: Circular light and dark header logos still switch automatically with the selected theme.

## Core features

- **Polished contact import**: Clean rounded rows, inset avatars, circular selection controls, search, Select All/Clear, and a selection summary.
- **Non-scrolling recurrence selector**: Full-width `Once` plus a stable 2×2 `Daily / Weekly / Monthly / Custom` grid.
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

- File: `releases/Ghost-v1.8.8.apk`
- Package: `ai.ghost.agent`
- Version: `1.8.8` (`versionCode 17`)
- Android: API 26–34
- Signing: `zipalign` plus APK Signature Schemes v2/v3 verification

> **Install note:** This build uses a newly generated release certificate. Android will not install it over the differently signed public `v1.8.7` APK; uninstall the older Ghost build first, then install `v1.8.8`.

## Development

```bash
npm install
npm run dev
npm run build
npm run build:apk
```
