import { app } from 'electron';
import * as path from 'node:path';
import { SettingsStore } from './settings-store';

let store: SettingsStore | null = null;
function getStore(): SettingsStore {
  return (store ??= new SettingsStore(path.join(app.getPath('userData'), 'settings.json')));
}
export function loadSettings() {
  return getStore().get();
}
export function saveSettings(patch: unknown) {
  return getStore().save(patch);
}
export async function flushSettings(): Promise<void> {
  await store?.flush();
}
