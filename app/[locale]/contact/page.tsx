"use client";

import { useState } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, Send } from "lucide-react";

export default function ContactPage() {
  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "" });
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    const res = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    if (!res.ok) {
      setError("A apărut o eroare. Încearcă din nou.");
      setSubmitting(false);
      return;
    }

    setSent(true);
    setSubmitting(false);
  };

  if (sent) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <GlassCard className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
            <Check className="h-8 w-8 text-success" />
          </div>
          <h1 className="font-serif text-3xl text-charcoal">Mesaj trimis!</h1>
          <p className="mt-4 text-charcoal-light">
            Îți mulțumim pentru mesaj. Te vom contacta în curând.
          </p>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="font-serif text-4xl text-charcoal">Contact</h1>
      <p className="mt-2 text-charcoal-light">
        Ai o întrebare sau vrei să colaborezi? Scrie-ne un mesaj.
      </p>

      <GlassCard hover={false} className="mt-8">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <Input
              label="Nume"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
            <Input
              label="Email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </div>
          <Input
            label="Subiect"
            value={form.subject}
            onChange={(e) => setForm({ ...form, subject: e.target.value })}
          />
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-charcoal-light">Mesaj</label>
            <textarea
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              rows={5}
              required
              className="w-full rounded-xl border border-sage/30 bg-white/60 px-4 py-3 text-charcoal placeholder:text-charcoal-light/50 backdrop-blur-sm focus:border-rose/50 focus:outline-none focus:ring-2 focus:ring-rose/20"
            />
          </div>
          {error && <p className="text-sm text-error">{error}</p>}
          <Button type="submit" disabled={submitting}>
            <Send className="mr-2 h-4 w-4" />
            {submitting ? "Se trimite..." : "Trimite mesaj"}
          </Button>
        </form>
      </GlassCard>
    </div>
  );
}
