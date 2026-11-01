import type {
  AndroidDeviceStatus,
  SavedContact,
  ScheduledWhatsAppTask,
} from '../types/ghost';
import { makeInitials } from '../data/seedData';

interface NativeAndroidInterface {
  getDeviceStatusJson?: () => string;
  scheduleTask?: (taskJson: string) => string;
  cancelTask?: (taskId: string) => void;
  executeTaskNow?: (taskJson: string) => string;
  emergencyStop?: () => void;
  openAccessibilitySettings?: () => void;
  openExactAlarmSettings?: () => void;
  pickPhoneContact?: () => void;
  getDeviceContactsJson?: () => string;
}

declare global {
  interface Window {
    GhostNativeBridge?: NativeAndroidInterface;
    onGhostContactPicked?: (contact: { name: string; phone: string }) => void;
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
        deviceModel: raw.deviceModel || 'Android Phone',
        androidVersion: raw.androidVersion || 'Android',
        accessibilityEnabled: Boolean(raw.accessibilityEnabled),
        exactAlarmAllowed: Boolean(raw.exactAlarmAllowed),
        whatsappInstalled: Boolean(raw.whatsappInstalled),
      };
    } catch {
      // Fallback below
    }
  }

  return {
    isNativeApk: false,
    deviceModel: 'Android Preview',
    androidVersion: 'Android 14',
    accessibilityEnabled: true,
    exactAlarmAllowed: true,
    whatsappInstalled: true,
  };
}

export function scheduleNativeAlarmTask(task: ScheduledWhatsAppTask): boolean {
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

export function executeNativeTaskNow(task: ScheduledWhatsAppTask): boolean {
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

export function openNativeSettings(target: 'accessibility' | 'alarm'): boolean {
  if (!window.GhostNativeBridge) return false;
  if (
    target === 'accessibility' &&
    window.GhostNativeBridge.openAccessibilitySettings
  ) {
    window.GhostNativeBridge.openAccessibilitySettings();
    return true;
  }
  if (target === 'alarm' && window.GhostNativeBridge.openExactAlarmSettings) {
    window.GhostNativeBridge.openExactAlarmSettings();
    return true;
  }
  return false;
}

export function launchNativeContactPicker(
  onPicked: (c: SavedContact) => void
): boolean {
  if (!window.GhostNativeBridge?.pickPhoneContact) return false;
  window.onGhostContactPicked = (data) => {
    if (data && data.phone) {
      const cleanPhone = data.phone.replace(/[^\d+]/g, '');
      const cleanName = (data.name || cleanPhone).trim();
      onPicked({
        id: `c-picked-${Date.now()}`,
        name: cleanName,
        phone: cleanPhone,
        initials: makeInitials(cleanName),
      });
    }
  };
  window.GhostNativeBridge.pickPhoneContact();
  return true;
}

export function loadNativeContactsList(): SavedContact[] {
  if (!window.GhostNativeBridge?.getDeviceContactsJson) return [];
  try {
    const raw = JSON.parse(
      window.GhostNativeBridge.getDeviceContactsJson()
    ) as Array<{ name: string; phone: string }>;
    return raw.map((item, idx) => ({
      id: `c-dev-${idx}-${item.phone}`,
      name: item.name,
      phone: item.phone.replace(/[^\d+]/g, ''),
      initials: makeInitials(item.name),
    }));
  } catch {
    return [];
  }
}
