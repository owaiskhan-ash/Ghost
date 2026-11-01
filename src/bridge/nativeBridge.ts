import type { AndroidDeviceStatus, GhostTask } from '../types/ghost';

interface NativeAndroidInterface {
  getDeviceStatusJson?: () => string;
  scheduleTask?: (taskJson: string) => string;
  cancelTask?: (taskId: string) => void;
  executeTaskNow?: (taskJson: string) => string;
  emergencyStop?: () => void;
  openAccessibilitySettings?: () => void;
  openExactAlarmSettings?: () => void;
  openOverlaySettings?: () => void;
  getDeviceContactsJson?: () => string;
  startSkillRecording?: (skillName: string) => void;
  stopSkillRecording?: () => string;
}

declare global {
  interface Window {
    GhostNativeBridge?: NativeAndroidInterface;
  }
}

export function isRunningInNativeApk(): boolean {
  return typeof window !== 'undefined' && Boolean(window.GhostNativeBridge);
}

export function getAndroidDeviceStatus(): AndroidDeviceStatus {
  if (window.GhostNativeBridge?.getDeviceStatusJson) {
    try {
      const raw = JSON.parse(window.GhostNativeBridge.getDeviceStatusJson());
      return {
        isNativeApk: true,
        deviceModel: raw.deviceModel || 'Android Device',
        androidVersion: raw.androidVersion || 'Android 14 (API 34)',
        accessibilityEnabled: Boolean(raw.accessibilityEnabled),
        exactAlarmAllowed: Boolean(raw.exactAlarmAllowed),
        overlayAllowed: Boolean(raw.overlayAllowed),
        devicePinLocked: Boolean(raw.devicePinLocked),
        whatsappInstalled: Boolean(raw.whatsappInstalled),
      };
    } catch {
      // Fallback if JSON parse fails
    }
  }

  return {
    isNativeApk: false,
    deviceModel: 'Pixel 8 Pro · Viewport Simulator',
    androidVersion: 'Android 14 · API 34',
    accessibilityEnabled: true,
    exactAlarmAllowed: true,
    overlayAllowed: true,
    devicePinLocked: true,
    whatsappInstalled: true,
  };
}

export function scheduleNativeAlarmTask(task: GhostTask): boolean {
  if (window.GhostNativeBridge?.scheduleTask) {
    try {
      window.GhostNativeBridge.scheduleTask(JSON.stringify(task));
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export function cancelNativeAlarmTask(taskId: string): void {
  window.GhostNativeBridge?.cancelTask?.(taskId);
}

export function executeNativeTaskNow(task: GhostTask): boolean {
  if (window.GhostNativeBridge?.executeTaskNow) {
    try {
      window.GhostNativeBridge.executeTaskNow(JSON.stringify(task));
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export function triggerNativeEmergencyStop(): void {
  window.GhostNativeBridge?.emergencyStop?.();
}

export function openNativeSettings(
  target: 'accessibility' | 'alarm' | 'overlay'
): boolean {
  if (!window.GhostNativeBridge) return false;
  if (target === 'accessibility' && window.GhostNativeBridge.openAccessibilitySettings) {
    window.GhostNativeBridge.openAccessibilitySettings();
    return true;
  }
  if (target === 'alarm' && window.GhostNativeBridge.openExactAlarmSettings) {
    window.GhostNativeBridge.openExactAlarmSettings();
    return true;
  }
  if (target === 'overlay' && window.GhostNativeBridge.openOverlaySettings) {
    window.GhostNativeBridge.openOverlaySettings();
    return true;
  }
  return false;
}
