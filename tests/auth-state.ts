/**
 * Where the signed-in admin session is cached between the `setup` project and
 * the `admin` project.
 *
 * Lives in its own file with no imports on purpose. playwright.config.ts needs
 * this path, and auth.setup.ts needs it too — but the config cannot import from
 * auth.setup.ts, because that module calls `test()` at load time and Playwright
 * rejects that while it is still reading the config ("Playwright Test did not
 * expect test() to be called here").
 */
export const ADMIN_STATE = ".playwright/admin-state.json";
