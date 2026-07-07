import { NextResponse } from "next/server";
import * as repo from "@/lib/repo";

export const dynamic = "force-dynamic";

function icsEscape(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function icsStamp(iso: string): string {
  return iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/**
 * iCalendar feed of upcoming episodes — subscribe from Google Calendar /
 * Apple Calendar to get "new episode" events on every device.
 */
export async function GET() {
  const items = repo.upcoming(180);
  const now = icsStamp(new Date().toISOString());

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TV Time//Personal Tracker//EN",
    "CALSCALE:GREGORIAN",
    "X-WR-CALNAME:TV Time — Upcoming Episodes",
  ];

  for (const { show, episode } of items) {
    if (!episode.airstamp) continue;
    const start = icsStamp(episode.airstamp);
    const durationMin = episode.runtime ?? show.runtime ?? 40;
    const code = `S${String(episode.season).padStart(2, "0")}E${String(episode.number).padStart(2, "0")}`;
    lines.push(
      "BEGIN:VEVENT",
      `UID:tvtime-episode-${episode.id}@local`,
      `DTSTAMP:${now}`,
      `DTSTART:${start}`,
      `DURATION:PT${durationMin}M`,
      `SUMMARY:${icsEscape(`${show.name} ${code} — ${episode.name}`)}`,
      `DESCRIPTION:${icsEscape(episode.summary ?? "")}`,
      "END:VEVENT"
    );
  }

  lines.push("END:VCALENDAR");
  return new NextResponse(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="tvtime.ics"',
    },
  });
}
