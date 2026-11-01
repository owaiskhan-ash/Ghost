# Ghost (`v1.7.0`) — Scheduled WhatsApp & WA Business Sender APK

Clean Bento-Grid Android APK built with **Black + Fluorescent Green (`#32FF4A`)** in Dark Mode and **Fluorescent Green BG + Black (`#07090A`)** in Light Mode, featuring a **Floating Dock**, **Contact Groups & Broadcast Lists**, **Quick Message Templates**, **Pause/Resume Schedules**, and **Native Phone Cache Storage** (zero dummy data).

## Features

- **Contact Groups & Broadcast Lists**: Build reusable broadcast groups from saved contacts (or long-press to edit/delete) and schedule either a shared message or custom per-person messages.
- **Quick Message Templates**: Save any message as a 1-tap reusable template chip right inside the composer.
- **Pause / Resume Scheduled Messages**: Explicitly pause or resume individual schedules (or **Pause All / Resume All**) while keeping native Android `AlarmManager` state synchronized.
- **100% Phone Cache Persistence (Zero Dummy Data)**: All contacts, broadcast groups, templates, schedules, delivery receipts, and theme settings are stored directly in Android native `SharedPreferences` phone cache + WebView storage.
- **Strict WhatsApp vs WA Business Routing**: Selecting **WhatsApp** strictly targets `com.whatsapp`, and selecting **WA Business** strictly targets `com.whatsapp.w4b`.
- **Signed Release APK**: `releases/Ghost-v1.7.0.apk` (`versionCode 8`, API 26–34, `zipalign` + APK Signature Scheme v2/v3 verified).

## Development

```bash
npm install
npm run dev
npm run build:apk
```
