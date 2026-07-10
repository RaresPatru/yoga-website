import { type ClassValue, clsx } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatDate(date: string | Date, locale: string = "ro") {
  return new Intl.DateTimeFormat(locale === "ro" ? "ro-RO" : "en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(date));
}

export function formatTime(time: string) {
  return time.slice(0, 5);
}

export function generateICS(event: {
  title: string;
  description: string;
  date: string;
  time: string;
  location: string;
}) {
  const startDate = `${event.date.replace(/-/g, "")}T${event.time.replace(/:/g, "")}00`;
  const endDate = `${event.date.replace(/-/g, "")}T${
    event.time.replace(/:/g, "")
  }00`;

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Yoga Website//EN",
    "BEGIN:VEVENT",
    `DTSTART:${startDate}`,
    `DTEND:${endDate}`,
    `SUMMARY:${event.title}`,
    `DESCRIPTION:${event.description}`,
    `LOCATION:${event.location}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}
