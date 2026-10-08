'use client';
import { useEffect, useRef } from 'react';
import { API } from './api';
import { authApi } from './session';

export type RtEvent =
  | { type: 'application.new'; recruitmentId: string; applicationId: string; reference: string; submittedAt: string }
  | { type: 'application.status'; recruitmentId: string; ids: string[]; status: string }
  | { type: 'application.deleted'; recruitmentId: string; applicationId: string };

/**
 * Connexion temps réel à l'organisation. Authentification par premier message (jamais dans l'URL).
 * Reconnexion automatique (backoff exponentiel) ; `onResync` est appelé après chaque RE-connexion
 * car des événements ont pu être manqués : on recharge alors depuis l'API.
 */
export function useRealtime(orgId: string, onEvent: (e: RtEvent) => void, onResync?: () => void) {
  const h = useRef({ onEvent, onResync }); h.current = { onEvent, onResync };
  useEffect(() => {
    if (!orgId) return;
    let ws: WebSocket | null = null, stop = false, tries = 0, opened = false; let timer: ReturnType<typeof setTimeout> | undefined;
    const connect = () => {
      ws = new WebSocket(API.replace(/^http/, 'ws') + '/ws');
      ws.onopen = () => ws?.send(JSON.stringify({ type: 'auth', token: sessionStorage.getItem('kibar.access') ?? '', orgId }));
      ws.onmessage = (m) => {
        let d: any; try { d = JSON.parse(m.data); } catch { return; }
        if (d.type === 'ready') { tries = 0; if (opened) h.current.onResync?.(); opened = true; } else h.current.onEvent(d);
      };
      ws.onclose = async (e) => {
        if (stop || e.code === 4403) return;
        if (e.code === 4401) { try { await authApi('/orgs'); } catch { return; } } // accès expiré : renouvelé via le refresh rotatif
        if (stop) return;
        timer = setTimeout(connect, Math.min(30_000, 1000 * 2 ** tries++) + Math.random() * 500);
      };
    };
    connect();
    return () => { stop = true; clearTimeout(timer); ws?.close(); };
  }, [orgId]);
}

export const freshLabel = (n: number) => (n === 1 ? '+1 nouvelle candidature' : `+${n} nouvelles candidatures`);
