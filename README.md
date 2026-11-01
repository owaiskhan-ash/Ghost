# Ghost (`v1.4.0`) — Scheduled WhatsApp Sender APK

Simple, minimal Android APK built in **Light Grey (`#ECEEF1`)** + **Fluorescent Red (`#FF1E38`)** to select one or multiple contacts, pick **any exact time/date**, and automatically send WhatsApp messages (same or custom per person) on your behalf.

## Features

- **Single or Multi-Contact Screen Control**: Tap **`Multi`** to select multiple contacts at once with **Per Person** (different message to each person) or **Same** message—Ghost sequentially opens each chat, verifies the text, and taps **Send** back-to-back (~1.5s apart).
- **Long-Tap Contact Options**: Hold any contact for **Favourite** (pins to front with star), **Edit**, or **Delete**.
- **Any Exact Time & Date**: Choose any hour (`01–12`), minute (`00–59`), `AM/PM`, specific date, or **Every Day** repeat—fires to the exact minute via `AlarmManager.setAlarmClock`.
- **Signed Release APK**: `releases/Ghost-v1.4.0.apk` (`versionCode 5`, API 26–34, `zipalign` + APK Signature Scheme v2/v3 verified).

## Development

```bash
npm install
npm run dev
npm run build:apk
```
