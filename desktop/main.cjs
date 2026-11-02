'use strict';

const {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeImage,
  Notification,
  shell,
  Tray,
} = require('electron');
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const {
  computeNextTrigger,
  createWhatsAppUrl,
  hashAutomationMessage,
  isValidTask,
  parseAutomationOutput,
  recipientHandoffDelay,
  resolveMessageVariables,
  taskRecipients,
} = require('./automation.cjs');

const MAX_TIMER_DELAY = 24 * 60 * 60 * 1000;
const MISSED_TASK_GRACE = 5 * 60 * 1000;
const RECEIPT_CHECKPOINT_INTERVAL = 25;

let mainWindow = null;
let tray = null;
let isQuitting = false;
let stateFile = '';
let state = { tasks: [], receipts: [] };
let dispatchGeneration = 0;
let dispatchQueue = Promise.resolve();
const taskTimers = new Map();
const automationChildren = new Set();

function desktopIconPath() {
  return path.join(__dirname, 'assets', 'desktop-icon.ico');
}

function desktopAutomationScriptPath() {
  const bundledPath = path.join(__dirname, 'windows', 'send-whatsapp.ps1');
  if (!app.isPackaged) return bundledPath;
  return bundledPath.replace(
    `${path.sep}app.asar${path.sep}`,
    `${path.sep}app.asar.unpacked${path.sep}`
  );
}

function emptyState() {
  return { tasks: [], receipts: [] };
}

function loadState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    state = {
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks.filter(isValidTask) : [],
      receipts: Array.isArray(parsed.receipts) ? parsed.receipts.slice(0, 500) : [],
    };
  } catch {
    state = emptyState();
  }
}

function saveState() {
  try {
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    const temporary = `${stateFile}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(state, null, 2), 'utf8');
    fs.renameSync(temporary, stateFile);
  } catch (error) {
    console.error('Could not persist Ghost desktop state:', error);
  }
}

function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function showWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createTray() {
  const icon = nativeImage.createFromPath(desktopIconPath());
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip('Ghost — WhatsApp Scheduler');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Ghost', click: showWindow },
      { type: 'separator' },
      {
        label: 'Stop current dispatch',
        click: () => emergencyStop(),
      },
      { type: 'separator' },
      {
        label: 'Quit Ghost',
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ])
  );
  tray.on('double-click', showWindow);
}

function createMainWindow() {
  const icon = nativeImage.createFromPath(desktopIconPath());
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 940,
    minHeight: 680,
    show: false,
    backgroundColor: '#252a30',
    title: 'Ghost — WhatsApp Scheduler',
    autoHideMenuBar: true,
    icon: icon.isEmpty() ? undefined : icon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: !app.isPackaged,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const current = mainWindow?.webContents.getURL() || '';
    if (url !== current) event.preventDefault();
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
      if (Notification.isSupported()) {
        new Notification({
          title: 'Ghost is still running',
          body: 'Scheduled messages remain active in the system tray.',
          silent: true,
        }).show();
      }
    }
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const developmentUrl = process.env.GHOST_DESKTOP_DEV_URL;
  if (!app.isPackaged && developmentUrl) {
    void mainWindow.loadURL(developmentUrl);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

function clearTaskTimer(taskId) {
  const timer = taskTimers.get(taskId);
  if (timer) clearTimeout(timer);
  taskTimers.delete(taskId);
}

function scheduleTaskTimer(task) {
  clearTaskTimer(task.id);
  if (!task.enabled || !isValidTask(task)) return;

  const remaining = task.triggerAtMillis - Date.now();
  if (remaining <= -MISSED_TASK_GRACE) {
    handleMissedTask(task);
    return;
  }

  const delay = Math.max(0, Math.min(remaining, MAX_TIMER_DELAY));
  const timer = setTimeout(() => {
    taskTimers.delete(task.id);
    if (task.triggerAtMillis - Date.now() > 1000) {
      scheduleTaskTimer(task);
      return;
    }
    queueDispatch(task, false);
  }, delay);
  taskTimers.set(task.id, timer);
}

function scheduleAllTasks() {
  for (const timer of taskTimers.values()) clearTimeout(timer);
  taskTimers.clear();
  state.tasks.forEach(scheduleTaskTimer);
}

function emitTaskState(task) {
  sendToRenderer('ghost:task-state', {
    id: task.id,
    enabled: Boolean(task.enabled),
    scheduledDate: task.scheduledDate,
    triggerAtMillis: task.triggerAtMillis,
    lastSentAt: task.lastSentAt,
  });
}

function advanceOrFinishTask(task, dispatchSucceeded) {
  const index = state.tasks.findIndex((candidate) => candidate.id === task.id);
  if (index < 0) return;

  const lastSentAt = dispatchSucceeded
    ? new Date().toISOString()
    : state.tasks[index].lastSentAt;
  if (task.repeatMode === 'once') {
    state.tasks[index] = {
      ...state.tasks[index],
      enabled: false,
      lastSentAt,
    };
  } else {
    const next = computeNextTrigger(task, Date.now());
    state.tasks[index] = {
      ...state.tasks[index],
      enabled: true,
      lastSentAt,
      scheduledDate: next?.scheduledDate || task.scheduledDate,
      triggerAtMillis: next?.triggerAtMillis || task.triggerAtMillis,
    };
  }

  saveState();
  emitTaskState(state.tasks[index]);
  scheduleTaskTimer(state.tasks[index]);
}

function handleMissedTask(task) {
  const index = state.tasks.findIndex((candidate) => candidate.id === task.id);
  if (index < 0) return;

  if (task.repeatMode === 'once') {
    state.tasks[index] = { ...state.tasks[index], enabled: false };
  } else {
    const next = computeNextTrigger(task, Date.now());
    if (next) {
      state.tasks[index] = {
        ...state.tasks[index],
        scheduledDate: next.scheduledDate,
        triggerAtMillis: next.triggerAtMillis,
      };
    }
  }
  saveState();
  emitTaskState(state.tasks[index]);
  scheduleTaskTimer(state.tasks[index]);
}

function makeReceipt(task, recipient, status, detail) {
  const now = new Date();
  return {
    id: `desktop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    taskId: task.id,
    contactName: recipient.contactName || task.contactName || 'Contact',
    contactPhone: recipient.contactPhone || '',
    messageBody: recipient.messageBody || task.messageBody || '',
    whatsappPackage: task.whatsappPackage,
    sentAt: `${String(now.getHours()).padStart(2, '0')}:${String(
      now.getMinutes()
    ).padStart(2, '0')}`,
    status,
    detail,
  };
}

function storeReceipt(receipt, persist = true) {
  state.receipts = [receipt, ...state.receipts].slice(0, 500);
  if (persist) saveState();
  sendToRenderer('ghost:receipt', receipt);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function executeAutomation(args) {
  return new Promise((resolve) => {
    const child = execFile(
      'powershell.exe',
      args,
      {
        windowsHide: true,
        timeout: 24000,
        maxBuffer: 1024 * 1024,
      },
      (error, stdout, stderr) => {
        automationChildren.delete(child);
        resolve({ error, stdout, stderr });
      }
    );
    automationChildren.add(child);
  });
}

function stopAutomationChildren() {
  for (const child of automationChildren) {
    if (!child.killed) child.kill();
  }
}

async function pressSendInWhatsAppWindow(expectedMessage, targetKind, generation) {
  if (process.platform !== 'win32') {
    return {
      ok: false,
      method: 'unsupported-platform',
      detail: 'Windows UI Automation is available only on Windows.',
    };
  }

  const scriptPath = desktopAutomationScriptPath();
  const args = [
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    scriptPath,
    '-GhostProcessId',
    String(process.pid),
    '-ExpectedMessageHash',
    hashAutomationMessage(expectedMessage),
    '-TargetKind',
    targetKind,
    '-TimeoutSeconds',
    '18',
  ];

  const { error, stdout, stderr } = await executeAutomation(args);
  const result = parseAutomationOutput(
    stdout,
    String(stderr || '').trim() || 'Could not invoke the WhatsApp Send control.'
  );

  if (generation !== dispatchGeneration && !result.ok) {
    return {
      ok: false,
      method: 'stopped',
      detail: 'Dispatch was stopped before the Send action completed.',
    };
  }

  if (error || !result.ok) {
    console.warn('WhatsApp Send automation did not complete:', result.detail);
  }
  return result;
}

async function openAndSend(task, recipient, generation) {
  if (generation !== dispatchGeneration) {
    return {
      ok: false,
      method: 'stopped',
      detail: 'Dispatch was stopped before WhatsApp opened.',
    };
  }
  const resolvedMessage = resolveMessageVariables(
    recipient.messageBody || task.messageBody,
    recipient.contactName || task.contactName,
    new Date()
  );
  const url = createWhatsAppUrl(
    task.whatsappPackage,
    recipient.contactPhone,
    resolvedMessage
  );
  let targetKind = task.whatsappPackage === 'com.whatsapp' ? 'Desktop' : 'Web';

  try {
    await shell.openExternal(url, { activate: true });
  } catch {
    if (task.whatsappPackage !== 'com.whatsapp') {
      return {
        ok: false,
        method: 'open-failed',
        detail: 'Could not open the WhatsApp Business Web compose route.',
      };
    }
    const fallback = `https://web.whatsapp.com/send?phone=${encodeURIComponent(
      String(recipient.contactPhone || '').replace(/\D/g, '')
    )}&text=${encodeURIComponent(resolvedMessage)}`;
    targetKind = 'Web';
    try {
      await shell.openExternal(fallback, { activate: true });
    } catch {
      return {
        ok: false,
        method: 'open-failed',
        detail: 'Could not open WhatsApp Desktop or WhatsApp Web.',
      };
    }
  }

  if (generation !== dispatchGeneration) {
    return {
      ok: false,
      method: 'stopped',
      detail: 'Dispatch was stopped before Send was invoked.',
    };
  }
  return pressSendInWhatsAppWindow(resolvedMessage, targetKind, generation);
}

function queueDispatch(task, manual) {
  dispatchQueue = dispatchQueue
    .then(() => performDispatch(task, manual))
    .catch((error) => console.error('Desktop dispatch failed:', error));
  return dispatchQueue;
}

async function performDispatch(task, manual) {
  if (!isValidTask(task)) return false;
  const generation = dispatchGeneration;
  const recipients = taskRecipients(task);
  let successful = 0;
  let lastFailureDetail = '';

  for (let index = 0; index < recipients.length; index += 1) {
    if (generation !== dispatchGeneration) break;
    const recipient = recipients[index];
    const sendResult = await openAndSend(task, recipient, generation);
    const receiptStatus = sendResult.ok
      ? 'SENT'
      : sendResult.method === 'stopped'
        ? 'STOPPED'
        : 'FAILED';
    const receipt = makeReceipt(
      task,
      recipient,
      receiptStatus,
      `${sendResult.method}: ${sendResult.detail}`
    );
    const isLastRecipient = index + 1 === recipients.length;
    const shouldCheckpoint =
      !sendResult.ok ||
      isLastRecipient ||
      (index + 1) % RECEIPT_CHECKPOINT_INTERVAL === 0;
    storeReceipt(receipt, shouldCheckpoint);
    if (sendResult.ok) successful += 1;
    else lastFailureDetail = `${sendResult.method}: ${sendResult.detail}`;
    if (!isLastRecipient && generation === dispatchGeneration) {
      await delay(recipientHandoffDelay(sendResult));
    }
  }

  if (!manual && generation === dispatchGeneration) {
    advanceOrFinishTask(task, successful === recipients.length);
  }

  if (Notification.isSupported()) {
    new Notification({
      title: successful === recipients.length ? 'Ghost dispatch complete' : 'Ghost needs attention',
      body:
        successful === recipients.length
          ? `${successful} message${successful === 1 ? '' : 's'} sent through WhatsApp.`
          : (lastFailureDetail || `${successful} of ${recipients.length} messages sent.`).slice(0, 220),
    }).show();
  }
  return successful === recipients.length;
}

function emergencyStop() {
  dispatchGeneration += 1;
  stopAutomationChildren();
  saveState();
  sendToRenderer('ghost:dispatch-stopped', { stoppedAt: Date.now() });
}

function upsertTask(task) {
  if (!isValidTask(task)) throw new Error('Invalid desktop schedule payload.');
  const index = state.tasks.findIndex((candidate) => candidate.id === task.id);
  if (index >= 0) state.tasks[index] = task;
  else state.tasks.unshift(task);
  saveState();
  scheduleTaskTimer(task);
}

function registerIpcHandlers() {
  ipcMain.handle('ghost:get-status', () => ({
    platform: process.platform,
    version: app.getVersion(),
    automationAvailable: process.platform === 'win32',
    backgroundScheduler: true,
    autoLaunchEnabled: app.getLoginItemSettings().openAtLogin,
  }));

  ipcMain.handle('ghost:set-auto-launch', (_event, enabled) => {
    if (process.platform === 'win32' && app.isPackaged) {
      app.setLoginItemSettings({ openAtLogin: Boolean(enabled) });
    }
    return app.getLoginItemSettings().openAtLogin;
  });

  ipcMain.handle('ghost:schedule-task', (_event, task) => {
    upsertTask(task);
    return { ok: true };
  });

  ipcMain.handle('ghost:sync-tasks', (_event, tasks) => {
    const valid = Array.isArray(tasks) ? tasks.filter(isValidTask) : [];
    const rendererIds = new Set(valid.map((task) => task.id));
    state.tasks = [
      ...valid,
      ...state.tasks.filter((task) => !rendererIds.has(task.id) && task.enabled),
    ];
    saveState();
    scheduleAllTasks();
    return state.tasks.map((task) => ({
      id: task.id,
      enabled: task.enabled,
      scheduledDate: task.scheduledDate,
      triggerAtMillis: task.triggerAtMillis,
      lastSentAt: task.lastSentAt,
    }));
  });

  ipcMain.handle('ghost:pause-task', (_event, taskId) => {
    const index = state.tasks.findIndex((task) => task.id === taskId);
    if (index >= 0) {
      state.tasks[index] = { ...state.tasks[index], enabled: false };
      clearTaskTimer(taskId);
      saveState();
    }
    return { ok: true };
  });

  ipcMain.handle('ghost:cancel-task', (_event, taskId) => {
    state.tasks = state.tasks.filter((task) => task.id !== taskId);
    clearTaskTimer(taskId);
    saveState();
    return { ok: true };
  });

  ipcMain.handle('ghost:execute-now', (_event, task) => {
    if (!isValidTask(task)) return { ok: false };
    queueDispatch(task, true);
    return { ok: true };
  });

  ipcMain.handle('ghost:get-receipts', () => state.receipts);
  ipcMain.handle('ghost:clear-data', () => {
    for (const timer of taskTimers.values()) clearTimeout(timer);
    taskTimers.clear();
    state = emptyState();
    saveState();
    return { ok: true };
  });
  ipcMain.handle('ghost:emergency-stop', () => {
    emergencyStop();
    return { ok: true };
  });
  ipcMain.handle('ghost:show-window', () => {
    showWindow();
    return { ok: true };
  });
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', showWindow);
  app.whenReady().then(() => {
    app.setName('Ghost');
    if (process.platform === 'win32') app.setAppUserModelId('ai.ghost.desktop');
    stateFile = path.join(app.getPath('userData'), 'desktop-scheduler.json');
    loadState();
    registerIpcHandlers();
    createMainWindow();
    createTray();
    scheduleAllTasks();
  });
}

app.on('before-quit', () => {
  isQuitting = true;
  stopAutomationChildren();
  saveState();
});

app.on('window-all-closed', () => {
  // Keep the Windows tray scheduler alive until the user chooses Quit.
  if (process.platform === 'darwin') app.quit();
});

app.on('activate', showWindow);
