'use strict';

const { contextBridge, ipcRenderer } = require('electron');

let receiptListener = null;
let taskStateListener = null;
let stopListener = null;

function replaceListener(channel, current, callback) {
  if (current) ipcRenderer.removeListener(channel, current);
  if (typeof callback !== 'function') return null;
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return listener;
}

contextBridge.exposeInMainWorld(
  'GhostDesktopBridge',
  Object.freeze({
    info: Object.freeze({
      isDesktop: true,
      platform: process.platform,
    }),
    getStatus: () => ipcRenderer.invoke('ghost:get-status'),
    setAutoLaunch: (enabled) =>
      ipcRenderer.invoke('ghost:set-auto-launch', Boolean(enabled)),
    scheduleTask: (task) => ipcRenderer.invoke('ghost:schedule-task', task),
    syncTasks: (tasks) => ipcRenderer.invoke('ghost:sync-tasks', tasks),
    pauseTask: (taskId) => ipcRenderer.invoke('ghost:pause-task', taskId),
    cancelTask: (taskId) => ipcRenderer.invoke('ghost:cancel-task', taskId),
    executeTaskNow: (task) => ipcRenderer.invoke('ghost:execute-now', task),
    getReceipts: () => ipcRenderer.invoke('ghost:get-receipts'),
    clearData: () => ipcRenderer.invoke('ghost:clear-data'),
    emergencyStop: () => ipcRenderer.invoke('ghost:emergency-stop'),
    showWindow: () => ipcRenderer.invoke('ghost:show-window'),
    onReceipt: (callback) => {
      receiptListener = replaceListener(
        'ghost:receipt',
        receiptListener,
        callback
      );
    },
    onTaskState: (callback) => {
      taskStateListener = replaceListener(
        'ghost:task-state',
        taskStateListener,
        callback
      );
    },
    onDispatchStopped: (callback) => {
      stopListener = replaceListener(
        'ghost:dispatch-stopped',
        stopListener,
        callback
      );
    },
    clearListeners: () => {
      if (receiptListener) ipcRenderer.removeListener('ghost:receipt', receiptListener);
      if (taskStateListener)
        ipcRenderer.removeListener('ghost:task-state', taskStateListener);
      if (stopListener)
        ipcRenderer.removeListener('ghost:dispatch-stopped', stopListener);
      receiptListener = null;
      taskStateListener = null;
      stopListener = null;
    },
  })
);
