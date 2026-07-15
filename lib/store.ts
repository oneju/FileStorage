import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";
import type { GhConfig } from "./github";

type SettingsState = GhConfig & {
  setConfig: (patch: Partial<GhConfig>) => void;
  reset: () => void;
};

const empty: GhConfig = { owner: "", repo: "", branch: "main", dir: "public/uploads", token: "" };

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...empty,
      setConfig: (patch) => set(patch),
      reset: () => set(empty),
    }),
    { name: "gh-file-drop" },
  ),
);

/**
 * zustand v5 compares snapshots by reference — the equalityFn parameter and the
 * default shallow compare both went away. A selector that builds a fresh object
 * every render makes useSyncExternalStore see a new snapshot forever, which
 * React treats as an infinite loop and throws on. useShallow memoises it.
 */
export const useConfig = () =>
  useSettings(
    useShallow(
      (s: SettingsState): GhConfig => ({
        owner: s.owner,
        repo: s.repo,
        branch: s.branch,
        dir: s.dir,
        token: s.token,
      }),
    ),
  );
