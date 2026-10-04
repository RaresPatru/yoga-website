/**
 * How a post's text looks, in one place: on the public article and in the
 * editor she writes it in, so what she sees while writing is what a reader
 * gets.
 *
 * Classes for Tailwind's typography plugin. Tailwind finds them by scanning
 * this file, so they must stay whole strings, never built from pieces.
 *
 * Headings use the serif at its normal weight, like the article's title above
 * them; the plugin's default is a heavy sans-serif weight that looked like a
 * different site. Links are the site's link colour, and quotes carry a sage
 * rule instead of the plugin's grey.
 *
 * This replaces `prose-sage`, a class the pages used for months that never
 * existed: the plugin has no "sage" theme, so it silently did nothing.
 */
export const ARTICLE_TYPOGRAPHY =
  "prose max-w-none text-charcoal-light prose-headings:font-serif prose-headings:font-normal prose-headings:text-charcoal prose-h2:text-2xl prose-h3:text-xl prose-a:text-rose-deep prose-a:underline-offset-2 hover:prose-a:text-rose-deeper prose-strong:text-charcoal prose-blockquote:border-l-sage prose-blockquote:font-serif prose-blockquote:font-normal prose-blockquote:not-italic prose-blockquote:text-charcoal prose-code:rounded prose-code:bg-sage/15 prose-code:px-1 prose-code:py-0.5 prose-code:font-normal prose-code:before:content-none prose-code:after:content-none prose-img:rounded-xl prose-hr:border-sage/30 prose-li:marker:text-sage-deep break-words";

/**
 * Shorter texts inside designed pages (the home page's introduction, the About
 * story, an event's description): the same colours and links, without the
 * article's heading sizes.
 */
export const TEXT_TYPOGRAPHY =
  "prose max-w-none text-charcoal-light prose-headings:font-serif prose-headings:font-normal prose-headings:text-charcoal prose-a:text-rose-deep prose-a:underline-offset-2 hover:prose-a:text-rose-deeper prose-strong:text-charcoal prose-li:marker:text-sage-deep break-words";
