# Ghost (`v1.8.5`) — Scheduled WhatsApp & WA Business Sender APK

Ghost is an Android WhatsApp scheduler with a unified light-grey and charcoal **Neumorphic Soft UI**, an approved black-pigeon launcher identity, exact recurring schedules, multi-recipient dispatch, phone-contact import, and closed-app Android automation.

## What’s new in v1.8.5

- **Complete light and dark Soft UI**: Every screen, card, field, control, navigation item, overlay, modal, shadow, browser surface, Android system bar, and WebView canvas now follows the same tactile Neumorphic system.
- **Minimal Inter typography**: The Ghost wordmark and section titles use restrained, normally capitalized Inter typography without outlined lettering or excessive tracking.
- **Import-only contact creation**: New contacts are added through the phone-book multi-select flow or `.vcf` / CSV import. Long-press actions still support favourites, editing, and deletion.
- **Focused message composer**: The visible template button and template creation/selection strip are temporarily removed. Dynamic variables (`{name}`, `{date}`, `{day}`) remain available.
- **Unified tactile hierarchy**: Large rounded cards, pill rows and navigation, inset fields, circular icon wells, and paired raised/inset shadows are consistent in both themes.

## Core features

- **Exact and recurring schedules**: `Once`, `Daily`, `Weekly` (any `Sun–Sat` combination), `Monthly` (`Day 1–31`), and `Custom` (`Every N days`).
- **Strict app targeting**: WhatsApp opens only `com.whatsapp`; WA Business opens only `com.whatsapp.w4b`.
- **Multi-person and broadcast dispatch**: Select multiple recipients, create groups, or provide per-person messages.
- **Dynamic variables**: Resolve `{name}`, `{date}`, and `{day}` independently for each recipient at send time.
- **Closed-app execution**: Native `AlarmManager`, foreground service, accessibility automation, unrestricted-battery guidance, and appear-on-top support keep schedules active when Ghost is closed.
- **Lock-screen safeguards**: Ghost can wake and dismiss `None` or `Swipe` locks. It never bypasses a PIN, pattern, password, or biometric lock; securely locked sends are skipped and surfaced by notification.
- **Queue control and persistence**: Pause/resume individual or all schedules, retain contacts/groups/history in phone cache, and cleanly return Home after the final send.
- **No AI and no dummy data**: Scheduling and automation remain deterministic and local to the app/device bridge.

## Release APK

- File: `releases/Ghost-v1.8.5.apk`
- Package: `ai.ghost.agent`
- Version: `1.8.5` (`versionCode 14`)
- Android: API 26–34
- Signing: `zipalign` plus APK Signature Schemes v2/v3 verification

> **Install note:** This build uses a newly generated release certificate. Android will not install it over the differently signed `v1.8.4` APK; uninstall the older Ghost build first, then install `v1.8.5`.

## Development

```bash
npm install
npm run dev
npm run build
npm run build:apk
```
