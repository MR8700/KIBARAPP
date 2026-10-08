/** Logo KIBAR (symbole + mot-symbole), repris de design/logo_kibar_app. */
export function LogoMark({ size = 40, className = '' }: { size?: number; className?: string }) {
  return (<svg width={size} height={size} viewBox="0 0 56 56" fill="none" role="img" aria-label="KIBAR" className={className}>
    <rect x="2" y="2" width="52" height="52" rx="14" fill="#1E40AF" />
    <path d="M18 14V42" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" />
    <path d="M36 16L23 28L37 40" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="39" cy="15" r="4" fill="#F59E0B" />
  </svg>);
}
export default function Logo({ size = 40, app = true, className = '' }: { size?: number; app?: boolean; className?: string }) {
  return (<div className={`flex items-center gap-2.5 ${className}`}>
    <LogoMark size={size} />
    <span className="font-head font-extrabold leading-none tracking-tight text-ink" style={{ fontSize: size * 0.6 }}>KIBAR</span>
    {app && <span className="rounded-md bg-[#EFF6FF] px-1.5 py-0.5 font-head text-[11px] font-bold tracking-wider text-[#1E40AF]">APP</span>}
  </div>);
}
