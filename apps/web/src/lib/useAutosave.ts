'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import type { Draft } from './draft';

export type SaveState = 'saved' | 'saving' | 'error' | 'conflict';

/** Autosave débouncé (800 ms) avec verrou optimiste ; ne bloque jamais l'édition. */
export function useAutosave(path: string, access: string, draft: Draft | null, initialVersion: number) {
  const [state, setState] = useState<SaveState>('saved');
  const version = useRef(initialVersion); const first = useRef(true); const latest = useRef(draft);
  useEffect(() => { version.current = initialVersion; }, [initialVersion]);
  latest.current = draft;
  useEffect(() => {
    if (!draft) return;
    if (first.current) { first.current = false; return; }
    setState('saving');
    const t = setTimeout(async () => {
      try {
        const r = await api<{ version: number }>(path, { method: 'PUT', body: JSON.stringify({ version: version.current, state: latest.current }) }, access);
        version.current = r.version; setState('saved');
      } catch (e: any) { setState(/obsol/i.test(e.message) ? 'conflict' : 'error'); }
    }, 800);
    return () => clearTimeout(t);
  }, [draft, path, access]);
  return state;
}
