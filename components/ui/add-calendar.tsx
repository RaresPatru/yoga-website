"use client";

import { CalendarPlus } from "lucide-react";
import { Button } from "./button";
import { generateICS } from "@/lib/utils";

interface AddCalendarProps {
  event: {
    title: string;
    description: string;
    date: string;
    time: string;
    location: string;
  };
}

export function AddCalendar({ event }: AddCalendarProps) {
  const handleDownload = () => {
    const ics = generateICS(event);
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${event.title.replace(/\s+/g, "_")}.ics`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Button variant="secondary" size="sm" onClick={handleDownload}>
      <CalendarPlus className="mr-2 h-4 w-4" />
      Adaugă în Calendar
    </Button>
  );
}
