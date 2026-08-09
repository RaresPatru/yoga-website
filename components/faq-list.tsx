import type { Faq } from "@/lib/site-content";

/**
 * The FAQ accordion.
 *
 * Built on native <details>/<summary> rather than React state, which buys a
 * lot for no code: keyboard support, correct screen-reader semantics, and
 * — the part that matters here — the answers exist in the HTML even when
 * collapsed. A JavaScript accordion that renders nothing until opened hides its
 * content from search engines, and "what should I bring to a yoga workshop" is
 * exactly the kind of long-tail question that brings in people who have never
 * heard of her.
 *
 * No "use client" either: there is no state to manage, so this ships zero
 * JavaScript.
 */
export function FaqList({ faqs }: { faqs: Faq[] }) {
  if (!faqs.length) return null;

  // schema.org FAQPage makes these eligible to appear as expandable questions
  // directly in Google results.
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <div className="divide-y divide-sage/20 overflow-hidden rounded-2xl border border-sage/20 bg-white/60 backdrop-blur-sm">
        {faqs.map((faq) => (
          <details key={faq.id} className="group">
            <summary className="flex cursor-pointer items-center justify-between gap-4 px-5 py-4 text-left font-medium text-charcoal marker:content-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rose-deep">
              {faq.question}
              {/* Rotates when the details element opens. Purely decorative, so
                  it is hidden from assistive tech — <details> already announces
                  its own expanded state. */}
              <span
                aria-hidden="true"
                className="shrink-0 text-xl leading-none text-rose-deep transition-transform group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <div className="px-5 pb-5 text-charcoal-light">{faq.answer}</div>
          </details>
        ))}
      </div>
    </>
  );
}
