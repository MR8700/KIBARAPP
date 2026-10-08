'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

type CacheEntry<T> = {
  data: T;
  timestamp: number;
};

// Cache en mémoire pour un accès synchrone instantané (0 ms)
const memoryCache = new Map<string, CacheEntry<any>>();

// Bus d'événements pour réactivité immédiate entre composants
export const stateBus = typeof window !== 'undefined' ? new EventTarget() : null;

export function emitStateChange(event: string, detail?: any) {
  if (typeof window !== 'undefined' && stateBus) {
    stateBus.dispatchEvent(new CustomEvent(event, { detail }));
  }
}

export function onStateChange(event: string, listener: (detail: any) => void) {
  if (typeof window === 'undefined' || !stateBus) return () => {};
  const handler = (e: Event) => listener((e as CustomEvent).detail);
  stateBus.addEventListener(event, handler);
  return () => stateBus.removeEventListener(event, handler);
}

/** Récupère une entrée du cache mémoire ou de sessionStorage */
export function getCached<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  const mem = memoryCache.get(key);
  if (mem) return mem.data as T;

  try {
    const raw = sessionStorage.getItem(`kibar_c_${key}`);
    if (raw) {
      const parsed: CacheEntry<T> = JSON.parse(raw);
      memoryCache.set(key, parsed);
      return parsed.data;
    }
  } catch {
    // sessionStorage indisponible ou corrompu
  }
  return null;
}

/** Enregistre des données dans le cache */
export function setCached<T>(key: string, data: T) {
  if (typeof window === 'undefined') return;
  const entry: CacheEntry<T> = { data, timestamp: Date.now() };
  memoryCache.set(key, entry);
  try {
    sessionStorage.setItem(`kibar_c_${key}`, JSON.stringify(entry));
  } catch {
    // quota dépassé
  }
}

/** Invalide une clé ou toutes les clés correspondant à un préfixe */
export function invalidateCache(prefix?: string) {
  if (typeof window === 'undefined') return;
  if (!prefix) {
    memoryCache.clear();
    return;
  }
  for (const key of memoryCache.keys()) {
    if (key.startsWith(prefix)) {
      memoryCache.delete(key);
      try {
        sessionStorage.removeItem(`kibar_c_${key}`);
      } catch {}
    }
  }
}

/**
 * Hook SWR léger (Stale-While-Revalidate) :
 * - Renvoie immédiatement la donnée en cache si disponible (0 ms de chargement)
 * - Rafraîchit en arrière-plan sans écran blanc ni clignotement « Chargement… »
 */
export function useCachedQuery<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  options: { ttlMs?: number; enabled?: boolean } = {}
) {
  const { ttlMs = 120_000, enabled = true } = options;

  // Initialisation synchrone depuis le cache
  const initial = key && enabled ? getCached<T>(key) : null;
  const [data, setData] = useState<T | null>(initial);
  const [loading, setLoading] = useState(!initial && enabled && Boolean(key));
  const [error, setError] = useState<string>('');

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const revalidate = useCallback(
    async (showLoading = false) => {
      if (!key || !enabled) return;
      if (showLoading) setLoading(true);
      setError('');

      try {
        const fresh = await fetcherRef.current();
        setCached(key, fresh);
        setData(fresh);
        return fresh;
      } catch (e: any) {
        setError(e.message || 'Erreur de chargement');
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [key, enabled]
  );

  useEffect(() => {
    if (!key || !enabled) return;

    const cached = getCached<T>(key);
    if (cached) {
      setData(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }

    // Revalidation en arrière-plan
    void revalidate();
  }, [key, enabled, revalidate]);

  const mutate = useCallback(
    (updater: T | ((prev: T | null) => T)) => {
      setData((prev) => {
        const next = typeof updater === 'function' ? (updater as any)(prev) : updater;
        if (key) setCached(key, next);
        return next;
      });
    },
    [key]
  );

  return { data, loading, error, mutate, revalidate };
}
