"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Watch Next", icon: PlayIcon },
  { href: "/upcoming", label: "Upcoming", icon: CalendarIcon },
  { href: "/shows", label: "My Shows", icon: GridIcon },
  { href: "/search", label: "Discover", icon: SearchIcon },
  { href: "/stats", label: "Profile", icon: UserIcon },
] as const;

export default function Nav() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <>
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-line bg-ink/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-6 px-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-accent">
              <TvIcon className="h-4 w-4 text-ink" />
            </span>
            <span className="text-lg font-extrabold tracking-tight">
              TV<span className="text-accent">Time</span>
            </span>
          </Link>

          {/* Desktop tabs */}
          <nav className="hidden items-center gap-1 md:flex">
            {TABS.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  isActive(t.href)
                    ? "bg-raised text-accent"
                    : "text-muted hover:bg-surface hover:text-fg"
                }`}
              >
                {t.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto">
            <Link
              href="/settings"
              aria-label="Settings"
              className={`grid h-9 w-9 place-items-center rounded-md transition-colors ${
                isActive("/settings")
                  ? "bg-raised text-accent"
                  : "text-muted hover:bg-surface hover:text-fg"
              }`}
            >
              <GearIcon className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Mobile bottom tabs */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur md:hidden">
        <div className="mx-auto flex max-w-5xl items-stretch justify-around">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${
                  isActive(t.href) ? "text-accent" : "text-muted"
                }`}
              >
                <Icon className="h-5 w-5" />
                {t.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}

function TvIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M4 6h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Zm3.6-4.2a1 1 0 0 1 1.4.2L12 5.1l3-3.1a1 1 0 1 1 1.4 1.4L13.9 6h-3.8L7.4 3.2a1 1 0 0 1 .2-1.4Z" />
    </svg>
  );
}
function PlayIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M8 5.5a1 1 0 0 1 1.5-.87l10 6.5a1 1 0 0 1 0 1.74l-10 6.5A1 1 0 0 1 8 18.5v-13Z" />
    </svg>
  );
}
function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M7 2a1 1 0 0 1 1 1v1h8V3a1 1 0 1 1 2 0v1h1a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1V3a1 1 0 0 1 1-1Zm14 8H3v9h18v-9Z" />
    </svg>
  );
}
function GridIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z" />
    </svg>
  );
}
function SearchIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M10 2a8 8 0 1 0 4.9 14.3l4.4 4.4a1 1 0 0 0 1.4-1.4l-4.4-4.4A8 8 0 0 0 10 2Zm-6 8a6 6 0 1 1 12 0 6 6 0 0 1-12 0Z" />
    </svg>
  );
}
function UserIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 12c4.4 0 8 2.7 8 6v1a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-1c0-3.3 3.6-6 8-6Z" />
    </svg>
  );
}
function GearIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M11 2h2a1 1 0 0 1 1 .9l.2 1.7c.6.2 1.2.5 1.7 1l1.6-.7a1 1 0 0 1 1.3.4l1 1.8a1 1 0 0 1-.3 1.3l-1.4 1c.1.4.1.7.1 1.1s0 .7-.1 1.1l1.4 1a1 1 0 0 1 .3 1.3l-1 1.8a1 1 0 0 1-1.3.4l-1.6-.7a7 7 0 0 1-1.7 1l-.2 1.7a1 1 0 0 1-1 .9h-2a1 1 0 0 1-1-.9l-.2-1.7a7 7 0 0 1-1.7-1l-1.6.7a1 1 0 0 1-1.3-.4l-1-1.8a1 1 0 0 1 .3-1.3l1.4-1A7.3 7.3 0 0 1 5 12c0-.4 0-.7.1-1.1l-1.4-1a1 1 0 0 1-.3-1.3l1-1.8a1 1 0 0 1 1.3-.4l1.6.7c.5-.4 1.1-.7 1.7-1L9.2 4H10a1 1 0 0 1 1-.9V2Zm1 6.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" />
    </svg>
  );
}
