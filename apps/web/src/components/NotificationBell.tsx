'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { authApi } from '@/lib/session';
import { fmt } from '@/lib/apps';

type N = { id: string; type: string; payload: { orgId: string; recruitmentId: string; title: string; reference: string }; readAt: string | null; createdAt: string };

/** `tick` : incrémenté par la page à chaque événement temps réel pour recharger la liste. */
export default function NotificationBell({ tick }: { tick: number }) {
  const [d, setD] = useState<{ unread: number; items: N[] } | null>(null); const [open, setOpen] = useState(false);
  const load = useCallback(() => { authApi<{ unread: number; items: N[] }>('/notifications').then(setD).catch(() => undefined); }, []);
  useEffect(() => { load(); }, [load, tick]);
  const read = (body: object) => authApi('/notifications/read', { method: 'POST', body: JSON.stringify(body) }).then(load).catch(() => undefined);

  return (<div className="relative">
    <button className="relative h-10 w-10 rounded-xl border border-line bg-white text-lg" onClick={() => setOpen(!open)} aria-label={`Notifications${d?.unread ? ` (${d.unread} non lues)` : ''}`} aria-expanded={open}>🔔
      {!!d?.unread && <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-error px-1 text-[10px] font-bold leading-[18px] text-white">{d.unread > 99 ? '99+' : d.unread}</span>}</button>
    {open && <div className="absolute right-0 z-30 mt-2 w-72 max-w-[85vw] rounded-2xl border border-line bg-white p-2 shadow-xl">
      <div className="flex items-center justify-between px-2 py-1.5"><span className="text-sm font-bold">Notifications</span>
        {!!d?.unread && <button className="text-xs text-primary" onClick={() => read({ all: true })}>Tout marquer lu</button>}</div>
      <ul className="max-h-80 divide-y divide-line overflow-y-auto">{!d?.items.length ? <li className="p-4 text-center text-xs text-muted">Aucune notification</li> : d.items.map((n) => (
        <li key={n.id}><Link href={`/app/recruitments/${n.payload.recruitmentId}/applications?org=${n.payload.orgId}`} onClick={() => !n.readAt && read({ ids: [n.id] })}
          className={`block rounded-xl px-2 py-2 text-xs ${n.readAt ? 'text-muted' : 'bg-primary/5 font-semibold'}`}>
          <span className="block">Nouvelle candidature · {n.payload.title}</span>
          <span className="font-mono text-[11px] font-normal text-muted">{n.payload.reference} · {fmt(n.createdAt)}</span></Link></li>))}</ul>
    </div>}
  </div>);
}
