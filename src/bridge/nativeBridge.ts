import type {
  AndroidDeviceStatus,
  SavedContact,
  ScheduledWhatsAppTask,
  SentHistoryItem,
} from '../types/ghost';
import { makeInitials } from '../data/seedData';

interface NativeAndroidInterface {
  getDeviceStatusJson?: () => string;
  setDarkMode?: (dark: boolean) => void;
  saveCacheValue?: (key: string, value: string) => void;
  loadCacheValue?: (key: string) => string;
  clearPhoneCache?: () => void;
  scheduleTask?: (taskJson: string) => string;
  pauseTask?: (taskId: string) => void;
  cancelTask?: (taskId: string) => void;
  getNativeReceiptsJson?: () => string;
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

const LEGACY_DUMMY_KEYS = [
  'ghost_contacts_v1',
  'ghost_contacts_v2',
  'ghost_contacts_v3',
  'ghost_contacts_v4',
  'ghost_tasks_v1',
  'ghost_tasks_v2',
  'ghost_tasks_v3',
  'ghost_tasks_v4',
  'ghost_history_v1',
  'ghost_history_v2',
  'ghost_history_v3',
  'ghost_history_v4',
];

export function purgeLegacyDummyStorage(): void {
  try {
    for (const k of LEGACY_DUMMY_KEYS) {
      localStorage.removeItem(k);
    }
  } catch {
    // Ignore storage errors
  }
}

export function loadFromPhoneCache<T>(key: string, fallback: T): T {
  // 1. Prefer Android Native SharedPreferences Phone Cache when running inside APK
  try {
    if (window.GhostNativeBridge?.loadCacheValue) {
      const nativeRaw = window.GhostNativeBridge.loadCacheValue(key);
      if (nativeRaw && nativeRaw.trim().length > 0) {
        return JSON.parse(nativeRaw) as T;
      }
    }
  } catch {
    // Fallback to WebView/Browser localStorage
  }

  // 2. Fallback to persistent localStorage cache
  try {
    const webRaw = localStorage.getItem(key);
    if (webRaw && webRaw.trim().length > 0) {
      return JSON.parse(webRaw) as T;
    }
  } catch {
    // Return empty fallback
  }

  return fallback;
}

export function saveToPhoneCache<T>(key: string, value: T): void {
  const serialized = JSON.stringify(value);
  try {
    window.GhostNativeBridge?.saveCacheValue?.(key, serialized);
  } catch {
    // Ignore outside native APK
  }
  try {
    localStorage.setItem(key, serialized);
  } catch {
    // Ignore quota errors
  }
}

export function clearAllPhoneCache(keysToClear: string[]): void {
  try {
    window.GhostNativeBridge?.clearPhoneCache?.();
  } catch {}
  try {
    for (const key of keysToClear) {
      localStorage.removeItem(key);
    }
    purgeLegacyDummyStorage();
  } catch {}
}

export function isRunningInNativeApk(): boolean {
  return typeof window !== 'undefined' && Boolean(window.GhostNativeBridge);
}

export function syncNativeDarkMode(dark: boolean): void {
  try {
    window.GhostNativeBridge?.setDarkMode?.(dark);
  } catch {
    // Ignore outside native WebView
  }
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
        whatsappBusinessInstalled: Boolean(raw.whatsappBusinessInstalled),
      };
    } catch {
      // Fallback below
    }
  }

  return {
    isNativeApk: false,
    deviceModel: 'Web Cache Mode',
    androidVersion: 'Android 14',
    accessibilityEnabled: true,
    exactAlarmAllowed: true,
    whatsappInstalled: true,
    whatsappBusinessInstalled: true,
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

export function pauseNativeAlarmTask(taskId: string): void {
  if (window.GhostNativeBridge?.pauseTask) {
    try {
      window.GhostNativeBridge.pauseTask(taskId);
      return;
    } catch {}
  }
  window.GhostNativeBridge?.cancelTask?.(taskId);
}

export function cancelNativeAlarmTask(taskId: string): void {
  window.GhostNativeBridge?.cancelTask?.(taskId);
}

export function loadNativeReceipts(): SentHistoryItem[] {
  if (!window.GhostNativeBridge?.getNativeReceiptsJson) return [];
  try {
    const raw = JSON.parse(
      window.GhostNativeBridge.getNativeReceiptsJson()
    ) as Array<{
      id: string;
      taskId: string;
      contactName: string;
      executedAt: string;
      outcome: string;
      messageText: string;
      reasonDetail?: string;
    }>;

    return raw.map((r) => {
      const ts = Number(r.executedAt);
      const dt = Number.isFinite(ts) && ts > 0 ? new Date(ts) : new Date();
      const h = dt.getHours();
      const m = dt.getMinutes();
      const period = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 === 0 ? 12 : h % 12;
      const sentAt = `${String(h12).padStart(2, '0')}:${String(m).padStart(
        2,
        '0'
      )} ${period}`;
      const isBiz = (r.reasonDetail || '').includes('Business');

      return {
        id: r.id,
        taskId: r.taskId || 'native',
        contactName: r.contactName || 'Contact',
        contactPhone: '',
        messageBody: r.messageText || '',
        whatsappPackage: isBiz ? 'com.whatsapp.w4b' : 'com.whatsapp',
        sentAt,
        status: r.outcome === 'SENT' ? 'SENT' : 'STOPPED',
      };
    });
  } catch {
    return [];
  }
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
