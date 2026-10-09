/**
 * Multi-vendor cart API extension host.
 *
 * Blocks keep importing `@dropins/storefront-cart/api.js`. The storefront import map
 * points that specifier at `extend/cart-api.js`, which runs middlewares then Adobe.
 * Other vendors register here instead of replacing block imports.
 *
 * @typedef {{
 *   id: string,
 *   addProductsToCart?: (
 *     items: Array<Record<string, unknown>>,
 *     next: (items: Array<Record<string, unknown>>) => Promise<unknown>,
 *   ) => Promise<unknown>,
 *   updateProductsFromCart?: (
 *     items: Array<Record<string, unknown>>,
 *     next: (items: Array<Record<string, unknown>>) => Promise<unknown>,
 *   ) => Promise<unknown>,
 * }} CartApiMiddleware
 */

/** @type {CartApiMiddleware[]} */
const middlewares = [];

/**
 * @param {CartApiMiddleware} middleware
 */
export function registerCartApiMiddleware(middleware) {
  if (!middleware?.id) {
    throw new Error('Cart API middleware requires a stable string id.');
  }
  const existing = middlewares.findIndex((entry) => entry.id === middleware.id);
  if (existing >= 0) {
    middlewares.splice(existing, 1, middleware);
    return;
  }
  middlewares.push(middleware);
}

/**
 * @returns {CartApiMiddleware[]}
 */
export function getCartApiMiddlewares() {
  return middlewares.slice();
}

/**
 * Compose `next`-style wrappers. First registered middleware is the outermost.
 *
 * @param {Array<Function|undefined>} wrappers
 * @param {Function} terminal
 * @returns {Function}
 */
export function composeCartApiHandlers(wrappers, terminal) {
  return wrappers
    .filter(Boolean)
    .reduceRight(
      (next, wrapper) => (items) => wrapper(items, next),
      terminal,
    );
}
