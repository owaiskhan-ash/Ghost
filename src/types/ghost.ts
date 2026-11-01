export type RepeatMode = 'once' | 'daily';

export type TargetWhatsApp = 'com.whatsapp' | 'com.whatsapp.w4b';

export interface SavedContact {
  id: string;
  name: string;
  phone: string;
  initials: string;
}

export interface ScheduledWhatsAppTask {
  id: string;
  contactId: string;
  contactName: string;
  contactPhone: string;
  contactInitials: string;
  messageBody: string;
  scheduledTime24: string; // "HH:MM" (00:00 - 23:59)
  scheduledDate: string;   // "YYYY-MM-DD"
  triggerAtMillis: number;
  repeatMode: RepeatMode;
  whatsappPackage: TargetWhatsApp;
  enabled: boolean;
  lastSentAt?: string;
}

export interface SentHistoryItem {
  id: string;
  taskId: string;
  contactName: string;
  contactPhone: string;
  messageBody: string;
  sentAt: string;
  status: 'SENT' | 'STOPPED';
}

export interface AndroidDeviceStatus {
  isNativeApk: boolean;
  deviceModel: string;
  androidVersion: string;
  accessibilityEnabled: boolean;
  exactAlarmAllowed: boolean;
  whatsappInstalled: boolean;
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
