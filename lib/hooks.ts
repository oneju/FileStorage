"use client";

import { useEffect, useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteObject,
  isConfigured,
  lastModified,
  listTree,
  commitObjects,
  createFolder,
  verifyAccess,
  type CommitPhase,
  type GhConfig,
  type S3Object,
  type Upload,
} from "./github";

export function useHydrated() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}

const treeKey = (cfg: GhConfig) => ["tree", cfg.owner, cfg.repo, cfg.branch, cfg.dir] as const;

export function useTree(cfg: GhConfig) {
  return useQuery({
    queryKey: treeKey(cfg),
    queryFn: () => listTree(cfg),
    enabled: isConfigured(cfg),
  });
}

/**
 * One request per object, but keyed on the blob sha with no expiry — a sha that
 * hasn't changed can't have a different last-modified. Rows fill in as they land.
 */
export function useLastModified(cfg: GhConfig, objects: S3Object[]) {
  const results = useQueries({
    queries: objects.map((o) => ({
      queryKey: ["mtime", cfg.owner, cfg.repo, o.sha] as const,
      queryFn: () => lastModified(cfg, o.path),
      enabled: isConfigured(cfg),
      staleTime: Infinity,
      gcTime: Infinity,
      retry: false,
    })),
  });
  const map = new Map<string, string | null | undefined>();
  objects.forEach((o, i) => map.set(o.sha, results[i]?.data));
  return map;
}

export function useAccess(cfg: GhConfig) {
  return useQuery({
    queryKey: ["access", cfg.owner, cfg.repo, cfg.token.slice(-4)],
    queryFn: () => verifyAccess(cfg),
    enabled: isConfigured(cfg),
    retry: false,
  });
}

export function useCommit(cfg: GhConfig) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      uploads,
      message,
      onPhase,
    }: {
      uploads: Upload[];
      message: string;
      onPhase?: (p: CommitPhase) => void;
    }) => commitObjects(cfg, uploads, message, onPhase),
    onSuccess: () => qc.invalidateQueries({ queryKey: treeKey(cfg) }),
  });
}

export function useCreateFolder(cfg: GhConfig) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (prefix: string) => createFolder(cfg, prefix),
    onSuccess: () => qc.invalidateQueries({ queryKey: treeKey(cfg) }),
  });
}

export function useDelete(cfg: GhConfig) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (obj: S3Object) => deleteObject(cfg, obj),
    onSuccess: () => qc.invalidateQueries({ queryKey: treeKey(cfg) }),
  });
}
