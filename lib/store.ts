import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { GhConfig } from "./github";
import { useShallow } from "zustand/react/shallow";

type SettingsState = GhConfig & {
  setConfig: (patch: Partial<GhConfig>) => void;
  reset: () => void;
};

const empty: GhConfig = {
  owner: "",
  repo: "",
  branch: "main",
  dir: "uploads",
  token: "",
};

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

export const selectConfig = (s: SettingsState): GhConfig => ({
  owner: s.owner,
  repo: s.repo,
  branch: s.branch,
  dir: s.dir,
  token: s.token,
});
