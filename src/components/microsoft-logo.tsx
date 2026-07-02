export function MicrosoftLogo({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 23 23" aria-label="Microsoft" role="img">
      <rect x="0" y="0" width="11" height="11" fill="#f25022" />
      <rect x="12" y="0" width="11" height="11" fill="#7fba00" />
      <rect x="0" y="12" width="11" height="11" fill="#00a1f1" />
      <rect x="12" y="12" width="11" height="11" fill="#ffb900" />
    </svg>
  );
}
