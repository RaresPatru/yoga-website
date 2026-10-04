/**
 * "flow4ward Admin": the panel's name, in its top bar and in every tab title.
 *
 * In a module of its own, without "use client", because the server layout
 * (app/admin/layout.tsx) calls it as well as the client components. A Server
 * Component may render a client component but may not call a function
 * exported from one.
 */
export function adminLabel(siteName: string): string {
  return `${siteName} Admin`;
}
