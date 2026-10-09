/** AnnaRelay mark: a plate handed along an arc (the relay), paper on ink like the reference's mark. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden>
      <rect width="40" height="40" rx="11" fill="#F2EFE9" />
      <path d="M9 25.5a11 11 0 0 1 22 0" fill="none" stroke="#0A0A0A" strokeWidth="3.2" strokeLinecap="round" />
      <path d="M27.5 21.2 31 25.6l-5.1.6" fill="none" stroke="#0A0A0A" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="8" y="28.5" width="24" height="3.2" rx="1.6" fill="#0099FF" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className ?? ""}`}>
      <Logo className="size-7" />
      <span className="text-[17px] font-semibold tracking-tight text-white">AnnaRelay</span>
    </span>
  );
}
