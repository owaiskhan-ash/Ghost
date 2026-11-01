# Ghost (`v1.5.0`) — Scheduled WhatsApp & WA Business Sender APK

Minimal, boxy Android APK built with **Light Grey + Fluorescent Red** and **Black + Fluorescent Red Dark Mode** to select one or multiple contacts, pick **any exact time/date**, and automatically send messages via **WhatsApp** or **WhatsApp Business**.

## Features

- **Boxy UI + Dark Mode (Black & Red)**: Sharp industrial boxy layout with crisp **Outlined** and **Solid** buttons, plus a **Light / Dark (Black & Red)** theme toggle in **Settings** (syncs Android system status & navigation bars natively).
- **Strict WhatsApp vs WA Business Routing**: Selecting **WhatsApp** strictly targets `com.whatsapp`, and selecting **WA Business** strictly targets `com.whatsapp.w4b` via direct `whatsapp://send` package-bound intents and package-matched `AccessibilityService` verification.
- **Single or Multi-Contact Screen Control**: Tap **`Multi`** to select multiple contacts with **Per Person** (custom message per contact) or **Same** message—Ghost sequentially opens each chat and taps **Send** (~1.5s apart).
- **Long-Tap Contact Options**: Hold any contact for **Favourite**, **Edit**, or **Delete**.
- **Signed Release APK**: `releases/Ghost-v1.5.0.apk` (`versionCode 6`, API 26–34, `zipalign` + APK Signature Scheme v2/v3 verified).

## Development

```bash
npm install
npm run dev
npm run build:apk
```
