# Ghost (`v1.2.0`) — Scheduled WhatsApp Sender APK

Simple, minimal Android APK built in **Light Grey (`#ECEEF1`)** + **Fluorescent Red (`#FF1E38`)** to select a contact, pick **any exact time/date**, and automatically send a WhatsApp message on your behalf.

## Features

- **Select Any Contact**: Pick directly from your Android phonebook (`Intent.ACTION_PICK`) or add any contact & phone number.
- **Any Exact Time & Date**: Choose any hour (`01–12`), minute (`00–59`), `AM/PM`, specific date, or **Every Day** repeat—fires to the exact minute via `AlarmManager.setAlarmClock`.
- **Automatic WhatsApp Send**: Wakes the device, opens WhatsApp (`com.whatsapp` or `com.whatsapp.w4b`) directly to the contact's chat, fills your message, and automatically taps **Send** via Android `AccessibilityService`.
- **Signed Release APK**: `releases/Ghost-v1.2.0.apk` (`versionCode 3`, API 26–34, `zipalign` + APK Signature Scheme v2/v3 verified).

## Development

```bash
npm install
npm run dev
npm run build:apk
```
