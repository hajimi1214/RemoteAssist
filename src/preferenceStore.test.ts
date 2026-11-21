import assert from "node:assert/strict";
import test from "node:test";
import { createPreferenceStore } from "./preferenceStore.ts";

test("preference writes persist and their current values survive consumer remounts", () => {
  const data = new Map([["theme", "light"]]);
  const store = createPreferenceStore({ getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } });
  assert.equal(store.getPreferenceStorageState(), "idle");
  assert.equal(store.readPreference("theme"), "light");
  assert.equal(store.writePreference("theme", "dark"), true);
  assert.equal(data.get("theme"), "dark");
  assert.equal(store.readPreference("theme"), "dark");
  assert.equal(store.getPreferenceStorageState(), "saved");
});

test("denied storage retains selected preferences in memory without reporting saved", () => {
  const store = createPreferenceStore(() => { throw new Error("Storage denied"); });
  assert.equal(store.readPreference("quality"), null);
  assert.equal(store.writePreference("quality", "game"), false);
  assert.equal(store.readPreference("quality"), "game");
  assert.equal(store.getPreferenceStorageState(), "memory");
  const unavailable = createPreferenceStore(() => undefined);
  assert.equal(unavailable.writePreference("touch", "touchpad"), false);
  assert.equal(unavailable.readPreference("touch"), "touchpad");
});

test("success on another key cannot hide pending writes and recovery clears each key", () => {
  const data = new Map<string, string>();
  const blocked = new Set(["theme", "quality"]);
  const store = createPreferenceStore({
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => { if (blocked.has(key)) throw new Error("Quota exceeded"); data.set(key, value); }
  });
  store.writePreference("theme", "dark");
  store.writePreference("quality", "game");
  assert.equal(store.writePreference("touch", "touchpad"), true);
  assert.equal(store.getPreferenceStorageState(), "memory");
  blocked.delete("theme");
  assert.equal(store.writePreference("theme", "dark"), true);
  assert.equal(store.getPreferenceStorageState(), "memory");
  assert.equal(store.readPreference("quality"), "game");
  blocked.delete("quality");
  assert.equal(store.writePreference("quality", "game"), true);
  assert.equal(store.getPreferenceStorageState(), "saved");
});

test("storage-state subscribers observe outcomes and can unsubscribe", () => {
  const store = createPreferenceStore(null);
  const states: string[] = [];
  const unsubscribe = store.subscribePreferenceStorage(() => states.push(store.getPreferenceStorageState()));
  store.writePreference("theme", "dark");
  assert.deepEqual(states, ["memory"]);
  unsubscribe();
  store.writePreference("quality", "game");
  assert.deepEqual(states, ["memory"]);
});
