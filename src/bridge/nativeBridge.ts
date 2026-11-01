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
  getNativeTasksJson?: () => string;
  getNativeReceiptsJson?: () => string;
  executeTaskNow?: (taskJson: string) => string;
  emergencyStop?: () => void;
  openAccessibilitySettings?: () => void;
  openExactAlarmSettings?: () => void;
  openBatteryOptimizationSettings?: () => void;
  openOverlaySettings?: () => void;
  openSecurityLockSettings?: () => void;
  pickPhoneContact?: () => void;
  requestBulkPhoneContacts?: () => void;
  getDeviceContactsJson?: () => string;
}

interface WebContactsNavigator extends Navigator {
  contacts?: {
    select: (
      properties: Array<'name' | 'tel'>,
      options?: { multiple?: boolean }
    ) => Promise<Array<{ name?: string[]; tel?: string[] }>>;
  };
}

declare global {
  interface Window {
    GhostNativeBridge?: NativeAndroidInterface;
    onGhostContactPicked?: (contact: { name: string; phone: string }) => void;
    onGhostBulkContactsLoaded?: (
      contacts: Array<{ name: string; phone: string }>
    ) => void;
    onGhostBulkContactsDenied?: () => void;
  }
}

export type NativeSettingsTarget =
  | 'accessibility'
  | 'alarm'
  | 'battery'
  | 'overlay'
  | 'security';

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
        batteryUnrestricted:
          raw.batteryUnrestricted !== undefined
            ? Boolean(raw.batteryUnrestricted)
            : true,
        overlayAllowed:
          raw.overlayAllowed !== undefined ? Boolean(raw.overlayAllowed) : true,
        screenLockSecure: Boolean(raw.screenLockSecure),
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
    batteryUnrestricted: true,
    overlayAllowed: true,
    screenLockSecure: false,
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

export function loadNativeTaskStates(): Array<{
  id: string;
  enabled: boolean;
  scheduledDate?: string;
  triggerAtMillis?: number;
}> {
  if (!window.GhostNativeBridge?.getNativeTasksJson) return [];
  try {
    return JSON.parse(window.GhostNativeBridge.getNativeTasksJson());
  } catch {
    return [];
  }
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
        messageBody: r.messageText || r.reasonDetail || '',
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

export function openNativeSettings(target: NativeSettingsTarget): boolean {
  const b = window.GhostNativeBridge;
  if (!b) return false;
  if (target === 'accessibility' && b.openAccessibilitySettings) {
    b.openAccessibilitySettings();
    return true;
  }
  if (target === 'alarm' && b.openExactAlarmSettings) {
    b.openExactAlarmSettings();
    return true;
  }
  if (target === 'battery' && b.openBatteryOptimizationSettings) {
    b.openBatteryOptimizationSettings();
    return true;
  }
  if (target === 'overlay' && b.openOverlaySettings) {
    b.openOverlaySettings();
    return true;
  }
  if (target === 'security' && b.openSecurityLockSettings) {
    b.openSecurityLockSettings();
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

/**
 * Fetches phone contacts for Multi-Select Bulk Import:
 * 1) Inside Android APK: requests READ_CONTACTS runtime permission if needed
 *    and queries ContactsContract.CommonDataKinds.Phone.
 * 2) Mobile Chrome Web Contact Picker API ({ multiple: true }) if available.
 * 3) Otherwise returns empty list so the modal allows bulk paste / .vcf import.
 */
export async function fetchPhoneContactsForBulkImport(
  onLoaded: (contacts: SavedContact[]) => void,
  onPermissionDenied?: () => void
): Promise<'native' | 'web_picker' | 'manual_sheet'> {
  if (window.GhostNativeBridge?.requestBulkPhoneContacts) {
    window.onGhostBulkContactsLoaded = (rawList) => {
      const mapped = (rawList || [])
        .filter((item) => item && item.phone)
        .map((item, idx) => {
          const cleanPhone = item.phone.replace(/[^\d+]/g, '');
          const cleanName = (item.name || cleanPhone).trim();
          return {
            id: `c-bulk-${Date.now()}-${idx}`,
            name: cleanName,
            phone: cleanPhone,
            initials: makeInitials(cleanName),
          };
        });
      onLoaded(mapped);
    };
    window.onGhostBulkContactsDenied = () => {
      onPermissionDenied?.();
    };
    window.GhostNativeBridge.requestBulkPhoneContacts();
    return 'native';
  }

  const nav = navigator as WebContactsNavigator;
  if (nav.contacts?.select) {
    try {
      const picked = await nav.contacts.select(['name', 'tel'], {
        multiple: true,
      });
      const mapped: SavedContact[] = [];
      picked.forEach((entry, idx) => {
        const rawPhone = entry.tel?.[0] || '';
        const cleanPhone = rawPhone.replace(/[^\d+]/g, '');
        if (cleanPhone.replace(/\D/g, '').length >= 5) {
          const cleanName = (entry.name?.[0] || cleanPhone).trim();
          mapped.push({
            id: `c-webbulk-${Date.now()}-${idx}`,
            name: cleanName,
            phone: cleanPhone,
            initials: makeInitials(cleanName),
          });
        }
      });
      onLoaded(mapped);
      return 'web_picker';
    } catch {
      // User cancelled or unsupported; fall through to manual sheet
    }
  }

  onLoaded([]);
  return 'manual_sheet';
}
