# Ghost (`v1.8.4`) — Scheduled WhatsApp & WA Business Sender APK

Clean Bento-Grid Android APK built with **Black + Fluorescent Green (`#32FF4A`)** in Dark Mode and **Fluorescent Green BG + Black (`#07090A`)** in Light Mode, featuring a modern **Black Pigeon launcher icon**, **Custom Recurring Schedules**, **Template Dynamic Variables (`{name}`, `{date}`, `{day}`)**, **Bulk Contact Import (Multi-Select)**, **Closed-App Background Execution**, and **Non-Password Lock-Screen Wake & Dismiss**.

## Features

- **Black Pigeon App Icon**: Modern debossed black pigeon with a fluorescent-green eye and background, supplied as adaptive and legacy-density Android launcher artwork.
- **Custom Recurring Schedules**: Schedule `Once`, `Daily`, `Weekly` (any combination of `Sun–Sat`), `Monthly` (`Day 1–31`), or `Custom` (`Every N days`) — automatically rescheduled natively in Android `AlarmManager` even when Ghost is closed.
- **Template Dynamic Variables (`{name}`, `{date}`, `{day}`)**: 1-tap variable chips resolved dynamically at the exact send moment per recipient (both in UI preview and in background native alarms).
- **Bulk Import Phone Contacts (Multi-Select Picker)**: Multi-select phone book contacts with search + `Select All` (plus `.vcf` / CSV support).
- **Works When Ghost App Is Closed & On Non-Password Lock Screens**:
  - `AlarmManager.setAlarmClock` + Android 14 `FOREGROUND_SERVICE_TYPE_SPECIAL_USE` + `GhostAccessibilityService` + `Unrestricted Battery` & `Appear on Top` permissions execute schedules reliably even when Ghost is swiped out of Recent Apps.
  - `GhostWakeAndUnlockActivity` (`showWhenLocked`, `turnScreenOn`, `requestDismissKeyguard`) + `GhostAccessibilityService` swipe-up gesture automatically wake sleeping displays and dismiss `None` or `Swipe` (non-password) lock screens before launching `whatsapp://send`.
  - If a PIN, pattern, password, or biometric keyguard is actively locked at send time, Ghost does not attempt to bypass Android security; it logs the skipped send and shows an **Unlock phone to send** notification instead.
- **Post-Send Screen Cleanup**: After the final queued send, Ghost dismisses the keyboard, returns to the Android Home screen, releases wake locks, and turns the display off on Android 9+.
- **Signed Release APK**: `releases/Ghost-v1.8.4.apk` (`versionCode 13`, API 26–34, `zipalign` + APK Signature Scheme v2/v3 verified).

## Development

```bash
npm install
npm run dev
npm run build:apk
```
