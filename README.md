# Ghost (`ai.ghost.agent` · v1.1.0)

Minimal, context-aware Android screen agent APK built in **Light Grey (`#ECEEF1`)** + **Fluorescent Red (`#FF1E38`)**.

## Highlights

- **Natural Scheduling**: Schedule actions like `"please msg jasmine at 5 am Good morning"` on WhatsApp with instant contact disambiguation, natural timing jitter (`±4m`), and per-contact tone matching.
- **Smart Read-Before-Send**: Checks recent incoming chat messages before sending—automatically pausing if an urgent overnight text arrived.
- **Safety Guardrails & Instant Stop**: Hard-blocks voice/video call buttons and payment screens in native Java, and stops immediately on screen tap or physical **Volume-Down**.
- **Signed Release APK**: `releases/Ghost-v1.1.0.apk` (`minSdk 26`, `targetSdk 34`, APK Signature Scheme v2/v3 verified).

## Quick Start

```bash
npm install
npm run dev
```
