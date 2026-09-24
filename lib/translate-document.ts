import type { Editor, JSONContent } from "@tiptap/core";
import {
  DOMParser as SchemaParser,
  DOMSerializer,
  type Node as ProseMirrorNode,
} from "@tiptap/pm/model";
import { Transform } from "@tiptap/pm/transform";

/**
 * Translates a TipTap document and returns the copy, with every piece of
 * formatting where it was.
 *
 * WHY BLOCK BY BLOCK
 *
 * The translator the site uses (the free Google endpoint behind
 * /api/translate) takes text, not documents. Sending it the whole post as one
 * string of HTML would ask it to keep block structure, attributes and embed
 * URLs intact across a machine translation, which is asking for them to come
 * back reworded.
 *
 * So only words are sent. Every paragraph and heading goes as its own string,
 * holding nothing but its inline markup — bold, italics, links, line breaks —
 * and everything else is copied rather than translated: the heading levels,
 * the lists and quotes around the paragraphs, alignment, images, video
 * embeds, dividers. Measured on 23 September, the endpoint returns inline tags
 * exactly as sent, `href` and `&amp;` included:
 *
 *   <b>Important: <i>adu apă</i></b> și un prosop.
 *   <b>Important: <i>bring water</i></b> and a towel.
 *
 * Code blocks are skipped: code is not prose, and a translator "fixing" it is
 * how it stops working.
 *
 * The copy is built on the Romanian editor's schema and handed over as JSON,
 * not HTML, so no attribute depends on surviving a round trip through markup.
 * (One would not: an embed's portrait shape is kept in the editor, not in the
 * HTML it writes — see lib/tiptap-iframe.ts.)
 */
export async function translateDocument(
  editor: Editor,
  translate: (blocks: string[]) => Promise<string[]>
): Promise<JSONContent> {
  const { doc, schema } = editor.state;
  const serializer = DOMSerializer.fromSchema(schema);
  const parser = SchemaParser.fromSchema(schema);

  const blocks: { node: ProseMirrorNode; pos: number }[] = [];
  doc.descendants((node, pos) => {
    // Lists and quotes hold paragraphs: go inside them.
    if (!node.isTextblock) return true;
    if (!node.type.spec.code && node.textContent.trim()) blocks.push({ node, pos });
    // A paragraph's children are words and marks, already covered by its HTML.
    return false;
  });

  if (blocks.length === 0) return doc.toJSON();

  const sources = blocks.map(({ node }) => {
    const holder = document.createElement("div");
    holder.appendChild(serializer.serializeFragment(node.content));
    return holder.innerHTML;
  });

  const translated = await translate(sources);
  if (translated.length !== blocks.length) {
    throw new Error(`Asked for ${blocks.length} translations, got ${translated.length}`);
  }

  // Each block's content is replaced in place. Last to first, so the
  // positions recorded above stay true for the blocks not yet reached.
  const tr = new Transform(doc);
  for (let i = blocks.length - 1; i >= 0; i--) {
    const { node, pos } = blocks[i];
    /*
     * Parsed into an inert document, never through `innerHTML` on an element
     * of this page: a detached <div> still loads an <img>, and runs its
     * `onerror`, the moment the markup is assigned. The HTML has been through
     * a third party, and the parser below only keeps what the schema knows,
     * but it should never get the chance to do anything first.
     */
    const body = new window.DOMParser().parseFromString(translated[i], "text/html").body;
    // Parsed as the content of a node of the same type and attributes, so an
    // H2 stays an H2 and a centred paragraph stays centred.
    const replacement = parser.parse(body, { topNode: node.type.create(node.attrs) });
    tr.replaceWith(pos + 1, pos + 1 + node.content.size, replacement.content);
  }

  return tr.doc.toJSON();
}
