import type { Faq } from "@/lib/site-content";
import { FaqAccordion } from "@/components/faq-accordion";

/**
 * The FAQ accordion.
 *
 * Built on native <details>/<summary>, which buys a lot for no code: keyboard
 * support, correct screen-reader semantics, and — the part that matters here
 * — the answers exist in the HTML even when collapsed. A JavaScript accordion
 * that renders nothing until opened hides its content from search engines,
 * and "what should I bring to a yoga workshop" is exactly the kind of
 * long-tail question that brings in people who have never heard of her.
 *
 * Opening and closing are animated in app/globals.css ("THE FAQ"), and by
 * FaqAccordion in a browser that cannot animate a <details> with CSS alone.
 *
 * THE FRAME
 *
 * A rounded box with a hairline between questions, and nothing clipping or
 * blurring it. A blurred element is drawn on a layer of its own, where its
 * clipping and its rounded corners do not always agree, which is how a frame
 * comes to draw wrong in one browser and not another; and blurring the flat
 * cream page behind it showed nothing.
 */
export function FaqList({ faqs }: { faqs: Faq[] }) {
  if (!faqs.length) return null;

  /*
   * schema.org's description of a list of questions and answers. Google no
   * longer turns it into expandable results — it limited them to government
   * and health sites in 2023 and stopped showing them on 7 May 2026
   * (RESEARCH_FINDINGS.md) — so this is no longer about search results. It
   * stays because it is an accurate, standard description of what is on the
   * page, in a few hundred bytes, for anything that reads schema.org.
   */
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
      <FaqAccordion>
        {faqs.map((faq) => (
          <details key={faq.id} className="faq-item">
            <summary className="faq-question">
              {faq.question}
              {/* Turns into a × while open. Decorative: <details> announces
                  its own state. */}
              <span aria-hidden="true" className="faq-icon">
                +
              </span>
            </summary>
            {/* Her line breaks kept: she types answers in a plain box. */}
            <div className="faq-answer">{faq.answer}</div>
          </details>
        ))}
      </FaqAccordion>
    </>
  );
}
