# Ghost (`v1.8.6`) — Scheduled WhatsApp & WA Business Sender APK

Ghost is an Android WhatsApp scheduler with matching light and dark **Neumorphic Soft UI**, theme-aware Ghost pigeon branding, exact recurring schedules, multi-recipient dispatch, phone-contact import, and closed-app Android automation.

## What’s new in v1.8.6

- **Theme-aware Ghost header logo**: The light interface uses the light-grey sculpted pigeon, while dark mode automatically switches to the black charcoal Neumorphic version.
- **True 24-hour time UI**: Hours now run from `00` through `23`; AM/PM and the `+1m`, `+5m`, and `9a` shortcuts were removed.
- **Consistent 24-hour timestamps**: Dispatch summaries, queue rows, live status, and new history receipts all use `HH:mm`.
- **Reliable permission toggles**: Permission state refreshes immediately after returning from Android Settings, with visibility/focus events and a settings-only OEM fallback poll.
- **Stronger accessibility detection**: Android now matches both full and shortened service component names before marking Auto-Tap Send as enabled.

## Core features

- **Exact and recurring schedules**: `Once`, `Daily`, `Weekly` (any `Sun–Sat` combination), `Monthly` (`Day 1–31`), and `Custom` (`Every N days`).
- **Strict app targeting**: WhatsApp opens only `com.whatsapp`; WA Business opens only `com.whatsapp.w4b`.
- **Multi-person and broadcast dispatch**: Select multiple recipients, create groups, or provide per-person messages.
- **Dynamic variables**: Resolve `{name}`, `{date}`, and `{day}` independently for each recipient at send time.
- **Import-only contact creation**: Add contacts from the phone book or `.vcf` / CSV import; long-press editing, favourites, and deletion remain available.
- **Closed-app execution**: Native `AlarmManager`, foreground service, accessibility automation, unrestricted-battery guidance, and appear-on-top support keep schedules active when Ghost is closed.
- **Lock-screen safeguards**: Ghost can wake and dismiss `None` or `Swipe` locks. It never bypasses a PIN, pattern, password, or biometric lock.
- **No AI and no dummy data**: Scheduling and automation remain deterministic and local to the app/device bridge.

## Release APK

- File: `releases/Ghost-v1.8.6.apk`
- Package: `ai.ghost.agent`
- Version: `1.8.6` (`versionCode 15`)
- Android: API 26–34
- Signing: `zipalign` plus APK Signature Schemes v2/v3 verification

> **Install note:** This build uses a newly generated release certificate. Android will not install it over the differently signed public `v1.8.5` APK; uninstall the older Ghost build first, then install `v1.8.6`.

## Development

```bash
npm install
npm run dev
npm run build
npm run build:apk
```
