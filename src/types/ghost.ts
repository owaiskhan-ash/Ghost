export type ExecutionMode = 'hybrid_dual' | 'screen_wake' | 'headless_linked';

export type TriggerType =
  | 'clock'
  | 'alarm_dismissed'
  | 'bluetooth_location'
  | 'cross_app_chain';

export interface ChatBubble {
  id: string;
  sender: 'them' | 'me';
  text: string;
  time: string;
  isUrgentKeyword?: boolean;
}

export interface ContactProfile {
  id: string;
  name: string;
  tag: string;
  phone: string;
  maskedPhone: string;
  relationship: 'personal' | 'work' | 'group' | 'family';
  avatarInitials: string;
  preferredTone: string;
  toneSample: string;
  whatsappPackage: 'com.whatsapp' | 'com.whatsapp.w4b';
  recentMessagesNormal: ChatBubble[];
  recentMessagesEmergency: ChatBubble[];
}

export interface GhostTask {
  id: string;
  rawPrompt: string;
  contactId: string;
  contactName: string;
  contactPhone: string;
  targetApp: 'WhatsApp' | 'WhatsApp Business' | 'Cross-App Chain';
  messageBody: string;
  scheduledTime24: string; // e.g. "05:00"
  displayTime: string;     // e.g. "05:00 AM"
  jitterMinutes: number;   // e.g. 6 -> 05:00 AM ± 6m
  effectiveTime: string;   // e.g. "05:04 AM"
  triggerType: TriggerType;
  triggerLabel: string;
  executionMode: ExecutionMode;
  contextGuardEnabled: boolean;
  toneMatched: boolean;
  conditionalRule?: string;
  chainSteps?: string[];
  enabled: boolean;
  createdAt: string;
}

export type ReceiptOutcome =
  | 'SENT'
  | 'PAUSED_CONTEXT_GUARD'
  | 'ABORTED_KILLSWITCH'
  | 'CHAIN_COMPLETED';

export interface ExecutionReceipt {
  id: string;
  taskId: string;
  contactName: string;
  targetApp: string;
  executedAt: string;
  scheduledFor: string;
  outcome: ReceiptOutcome;
  messageText: string;
  reasonDetail: string;
  durationMs: number;
  engineLayersUsed: string[];
  guardrailsBlocked: string[];
}

export interface RecordedSkill {
  id: string;
  name: string;
  targetPackage: string;
  appLabel: string;
  stepsCount: number;
  avgLatencyMs: number;
  nodePathSummary: string[];
  parameterSlots: string[];
  lastUsed: string;
}

export interface AndroidDeviceStatus {
  isNativeApk: boolean;
  deviceModel: string;
  androidVersion: string;
  accessibilityEnabled: boolean;
  exactAlarmAllowed: boolean;
  overlayAllowed: boolean;
  devicePinLocked: boolean;
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
  nativeClasses?: string[];
  permissions?: string[];
}
