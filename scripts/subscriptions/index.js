/**
 * Compatibility shim — prefer package entrypoints under storefront-eds.
 * Kept so older relative imports keep working during the package migration.
 */
export * from '../../packages/recurbuy-storefront/src/index.js';
