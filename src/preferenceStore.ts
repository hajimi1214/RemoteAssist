export type PreferenceStorageState = "idle" | "saved" | "memory";
export type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;
type StorageSource = PreferenceStorage | null | undefined | (() => PreferenceStorage | null | undefined);

/** Preferences only: do not put credentials, session tokens or device secrets here. */
export function createPreferenceStore(storage: StorageSource = () => globalThis.localStorage) {
  // Values set in this process remain usable even when persistent storage is denied.
  const values = new Map<string, string>();
  const pending = new Set<string>();
  const listeners = new Set<() => void>();
  let written = false;

  const source = () => typeof storage === "function" ? storage() : storage;
  const getPreferenceStorageState = (): PreferenceStorageState => pending.size ? "memory" : written ? "saved" : "idle";

  const readPreference = (key: string): string | null => {
    if (values.has(key)) return values.get(key)!;
    try { return source()?.getItem(key) ?? null; } catch { return null; }
  };

  const writePreference = (key: string, value: string): boolean => {
    values.set(key, value);
    written = true;
    let saved = false;
    try {
      const persistent = source();
      if (persistent) { persistent.setItem(key, value); saved = true; }
    } catch { /* Keep this value in memory and report the unpersisted key. */ }
    if (saved) pending.delete(key); else pending.add(key);
    // A successful write to a different key must not hide an earlier failure.
    for (const listener of [...listeners]) {
      try { listener(); } catch { /* A subscriber cannot change the write outcome. */ }
    }
    return saved;
  };

  const subscribePreferenceStorage = (callback: () => void): (() => void) => {
    listeners.add(callback);
    return () => { listeners.delete(callback); };
  };

  return { readPreference, writePreference, subscribePreferenceStorage, getPreferenceStorageState };
}

const preferences = createPreferenceStore();
export const readPreference = preferences.readPreference;
export const writePreference = preferences.writePreference;
export const subscribePreferenceStorage = preferences.subscribePreferenceStorage;
export const getPreferenceStorageState = preferences.getPreferenceStorageState;
