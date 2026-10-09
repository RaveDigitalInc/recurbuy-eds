/**
 * Checkout success subscription profiles (Magento Onepage Success getProfiles).
 *
 * @typedef {Object} StorefrontCheckoutSuccessProfile
 * @property {number} profileId
 * @property {string} incrementId
 * @property {string} [viewUrl]
 */

/**
 * @typedef {Object} StorefrontCheckoutSuccessProfiles
 * @property {boolean} canViewProfiles
 * @property {StorefrontCheckoutSuccessProfile[]} profiles
 */

/**
 * @returns {StorefrontCheckoutSuccessProfiles}
 */
export function createEmptyStorefrontCheckoutSuccessProfiles() {
  return {
    canViewProfiles: false,
    profiles: [],
  };
}

/**
 * Maps GET checkout/success JSON to a stable EDS shape.
 *
 * @param {unknown} payload
 * @returns {StorefrontCheckoutSuccessProfiles}
 */
export function mapStorefrontCheckoutSuccessPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return createEmptyStorefrontCheckoutSuccessProfiles();
  }

  const row = /** @type {Record<string, unknown>} */ (payload);
  const canViewProfiles = row.can_view_profiles === true;
  const profiles = mapProfileRows(row.profiles);

  return {
    canViewProfiles,
    profiles,
  };
}

/**
 * @param {unknown} rawProfiles
 * @returns {StorefrontCheckoutSuccessProfile[]}
 */
function mapProfileRows(rawProfiles) {
  if (!Array.isArray(rawProfiles)) {
    return [];
  }

  /** @type {StorefrontCheckoutSuccessProfile[]} */
  const profiles = [];

  rawProfiles.forEach((entry) => {
    if (!entry || typeof entry !== 'object') {
      return;
    }

    const row = /** @type {Record<string, unknown>} */ (entry);
    const profileId = readPositiveInt(row.profile_id);
    if (profileId === null) {
      return;
    }

    const incrementId = typeof row.increment_id === 'string' ? row.increment_id.trim() : '';
    const profile = {
      profileId,
      incrementId,
    };

    const viewUrl = typeof row.view_url === 'string' ? row.view_url.trim() : '';
    if (viewUrl) {
      profile.viewUrl = viewUrl;
    }

    profiles.push(profile);
  });

  return profiles;
}

/**
 * @param {unknown} value
 * @returns {number|null}
 */
function readPositiveInt(value) {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    const parsed = parseInt(value.trim(), 10);
    return parsed > 0 ? parsed : null;
  }

  return null;
}
