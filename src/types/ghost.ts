export type RepeatMode = 'once' | 'daily' | 'weekly' | 'monthly' | 'interval';

export type TargetWhatsApp = 'com.whatsapp' | 'com.whatsapp.w4b';

export interface SavedContact {
  id: string;
  name: string;
  phone: string;
  initials: string;
  isFavourite?: boolean;
}

export interface ContactGroup {
  id: string;
  name: string;
  memberIds: string[];
}

export interface QuickTemplate {
  id: string;
  label: string;
  text: string;
}

export interface BatchRecipient {
  contactId: string;
  contactName: string;
  contactPhone: string;
  contactInitials: string;
  messageBody: string;
}

export interface ScheduledWhatsAppTask {
  id: string;
  contactId: string;
  contactName: string;
  contactPhone: string;
  contactInitials: string;
  groupId?: string;
  groupName?: string;
  messageBody: string;
  recipients?: BatchRecipient[];
  scheduledTime24: string; // "HH:MM" (00:00 - 23:59)
  scheduledDate: string;   // "YYYY-MM-DD"
  triggerAtMillis: number;
  repeatMode: RepeatMode;
  repeatDays?: number[];         // 0 = Sun .. 6 = Sat (when repeatMode === 'weekly')
  repeatMonthDay?: number;       // 1 .. 31 (when repeatMode === 'monthly')
  repeatIntervalDays?: number;   // >= 2 (when repeatMode === 'interval')
  whatsappPackage: TargetWhatsApp;
  enabled: boolean;              // true = Active, false = Paused
  lastSentAt?: string;
}

export interface SentHistoryItem {
  id: string;
  taskId: string;
  contactName: string;
  contactPhone: string;
  messageBody: string;
  whatsappPackage?: TargetWhatsApp;
  sentAt: string;
  status: 'SENT' | 'STOPPED';
}

export interface AndroidDeviceStatus {
  isNativeApk: boolean;
  deviceModel: string;
  androidVersion: string;
  accessibilityEnabled: boolean;
  exactAlarmAllowed: boolean;
  batteryUnrestricted: boolean;
  overlayAllowed: boolean;
  screenLockSecure: boolean; // false = None or Swipe (locked without password works!)
  whatsappInstalled: boolean;
  whatsappBusinessInstalled: boolean;
}

export interface ApkMetadata {
  available: boolean;
  fileName: string;
  packageName: string;
  versionName: string;
  versionCode: number;
  minSdk: number;
  targetSdk: number;
  sizeBytes: number;
  sha256: string;
  builtAt?: string;
  signatureSchemes: string[];
}
