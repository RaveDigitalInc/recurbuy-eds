import {
  formatDiscount,
  formatMoney,
  formatPeriod,
  getPlanDisplayPrice,
} from './format.js';

/**
 * @typedef {import('./contract.js').SubscriptionEligibility} SubscriptionEligibility
 * @typedef {import('./contract.js').SubscriptionSelection} SubscriptionSelection
 * @typedef {import('./contract.js').SubscriptionError} SubscriptionError
 * @typedef {import('./contract.js').PurchaseType} PurchaseType
 */

/**
 * @typedef {'loading'|'unavailable'|'ready'|'error'|'hidden'} SelectorViewState
 */

/**
 * @param {HTMLElement} root
 * @param {{
 *   viewState: SelectorViewState,
 *   eligibility?: SubscriptionEligibility|null,
 *   selection?: SubscriptionSelection,
 *   error?: SubscriptionError|null,
 *   productValid?: boolean,
 *   onPurchaseTypeChange?: (purchaseType: PurchaseType) => void,
 *   onPlanChange?: (planId: string) => void,
 *   onCustomOptionChange?: (code: string, value: string) => void,
 * }} state
 */
export function renderSubscriptionSelector(root, state) {
  if (!root) return;

  const {
    viewState,
    eligibility = null,
    selection = { purchaseType: 'one_time' },
    error = null,
    productValid = true,
    onPurchaseTypeChange,
    onPlanChange,
    onCustomOptionChange,
  } = state;

  root.className = 'subscription-selector';
  root.dataset.state = viewState;

  if (viewState === 'hidden') {
    root.hidden = true;
    root.innerHTML = '';
    return;
  }

  root.hidden = false;

  if (viewState === 'loading') {
    root.innerHTML = `
      <div class="subscription-selector__loading" role="status" aria-live="polite">
        Loading subscription options…
      </div>
    `;
    return;
  }

  if (viewState === 'error') {
    root.innerHTML = `
      <div class="subscription-selector__error" role="alert">
        <p class="subscription-selector__error-title">Subscription options unavailable</p>
        <p class="subscription-selector__error-message">
          ${error?.message || 'Unable to load subscription plans. You can still buy this product once.'}
        </p>
      </div>
    `;
    return;
  }

  if (viewState === 'unavailable' || !eligibility?.eligible) {
    root.innerHTML = `
      <div class="subscription-selector__unavailable" role="status">
        <p class="subscription-selector__unavailable-title">Subscription unavailable</p>
        <p class="subscription-selector__unavailable-message">
          ${eligibility?.ineligibilityReason || 'This product configuration is not eligible for subscription.'}
        </p>
      </div>
    `;
    return;
  }

  const purchaseType = selection.purchaseType || eligibility.defaultPurchaseType || 'one_time';
  const selectedPlanId = selection.planId
    || eligibility.selectedPlanId
    || eligibility.plans[0]?.id;
  const selectedPlan = eligibility.plans.find((plan) => plan.id === selectedPlanId)
    || eligibility.plans[0];
  const allowOneTime = eligibility.allowOneTime !== false;
  const isSubscribe = purchaseType === 'subscription';
  const disabledAttr = productValid ? '' : 'disabled';

  root.innerHTML = `
    <fieldset class="subscription-selector__fieldset" ${disabledAttr}>
      <legend class="subscription-selector__legend">Purchase options</legend>
      <div class="subscription-selector__options" role="radiogroup" aria-label="Purchase options">
        ${allowOneTime ? `
          <label class="subscription-selector__option ${!isSubscribe ? 'is-selected' : ''}">
            <input
              class="subscription-selector__radio"
              type="radio"
              name="subscription-purchase-type"
              value="one_time"
              ${!isSubscribe ? 'checked' : ''}
            />
            <span class="subscription-selector__option-body">
              <span class="subscription-selector__option-title">One-time purchase</span>
              <span class="subscription-selector__option-caption">Buy once at the regular price</span>
            </span>
          </label>
        ` : ''}
        <label class="subscription-selector__option ${isSubscribe ? 'is-selected' : ''}">
          <input
            class="subscription-selector__radio"
            type="radio"
            name="subscription-purchase-type"
            value="subscription"
            ${isSubscribe ? 'checked' : ''}
          />
          <span class="subscription-selector__option-body">
            <span class="subscription-selector__option-title">Subscribe &amp; save</span>
            <span class="subscription-selector__option-caption">
              Recurring delivery with subscription pricing
            </span>
          </span>
        </label>
      </div>
    </fieldset>
    <div class="subscription-selector__plans ${isSubscribe ? '' : 'is-hidden'}">
      <p class="subscription-selector__plans-title">Delivery frequency</p>
      <div class="subscription-selector__plan-list" role="list">
        ${eligibility.plans.map((plan) => renderPlanOption(
    plan,
    plan.id === selectedPlan?.id,
    isSubscribe,
  )).join('')}
      </div>
      ${selectedPlan ? renderPlanDetails(selectedPlan) : ''}
      ${renderCustomOptions(eligibility, selection, isSubscribe)}
    </div>
  `;

  root.querySelectorAll('input[name="subscription-purchase-type"]').forEach((input) => {
    input.addEventListener('change', (event) => {
      const { value } = /** @type {HTMLInputElement} */ (event.target);
      onPurchaseTypeChange?.(/** @type {PurchaseType} */ (value));
    });
  });

  root.querySelectorAll('input[name="subscription-plan"]').forEach((input) => {
    input.addEventListener('change', (event) => {
      const { value } = /** @type {HTMLInputElement} */ (event.target);
      onPlanChange?.(value);
    });
  });

  root.querySelectorAll('[data-subscription-option]').forEach((input) => {
    input.addEventListener('change', (event) => {
      const { target } = event;
      const control = /** @type {HTMLInputElement|HTMLSelectElement} */ (target);
      const code = control.getAttribute('data-subscription-option');
      if (code) onCustomOptionChange?.(code, control.value);
    });
  });
}

/**
 * @param {import('./contract.js').SubscriptionPlan} plan
 * @param {boolean} checked
 * @param {boolean} isSubscribe
 * @returns {string}
 */
function renderPlanOption(plan, checked, isSubscribe) {
  const price = getPlanDisplayPrice(plan);
  const saving = formatDiscount(plan.discount);

  return `
    <label class="subscription-selector__plan ${checked ? 'is-selected' : ''}" role="listitem">
      <input
        class="subscription-selector__plan-radio"
        type="radio"
        name="subscription-plan"
        value="${plan.id}"
        ${checked ? 'checked' : ''}
        ${isSubscribe ? '' : 'disabled'}
      />
      <span class="subscription-selector__plan-body">
        <span class="subscription-selector__plan-label">${plan.label}</span>
        <span class="subscription-selector__plan-meta">
          ${formatMoney(price)} · ${formatPeriod(plan.period)}
          ${saving ? ` · ${saving}` : ''}
        </span>
        ${plan.description ? `
          <span class="subscription-selector__plan-description">${plan.description}</span>
        ` : ''}
      </span>
    </label>
  `;
}

/**
 * @param {import('./contract.js').SubscriptionPlan} plan
 * @returns {string}
 */
function renderPlanDetails(plan) {
  const details = [];

  if (plan.trial) {
    details.push(`Includes a ${plan.trial.value}-${plan.trial.unit} trial`);
  }

  if (plan.prices?.initial && plan.prices?.regular
    && plan.prices.initial.value !== plan.prices.regular.value) {
    details.push(
      `First payment ${formatMoney(plan.prices.initial)}, then ${formatMoney(plan.prices.regular)} ${formatPeriod(plan.period)}`,
    );
  }

  if (!details.length && plan.description) {
    details.push(plan.description);
  }

  if (!details.length) return '';

  return `
    <div class="subscription-selector__details">
      <p class="subscription-selector__details-title">Subscription details</p>
      <ul class="subscription-selector__details-list">
        ${details.map((item) => `<li>${item}</li>`).join('')}
      </ul>
    </div>
  `;
}

/**
 * @param {SubscriptionEligibility} eligibility
 * @param {SubscriptionSelection} selection
 * @param {boolean} isSubscribe
 * @returns {string}
 */
function renderCustomOptions(eligibility, selection, isSubscribe) {
  const options = eligibility.customOptions || [];
  if (!options.length) return '';

  return `
    <div class="subscription-selector__custom-options ${isSubscribe ? '' : 'is-hidden'}">
      <p class="subscription-selector__custom-options-title">Subscription options</p>
      ${options.map((option) => renderCustomOption(
    option,
    selection.customOptionValues?.[option.code] || '',
    isSubscribe,
  )).join('')}
    </div>
  `;
}

/**
 * @param {import('./contract.js').SubscriptionCustomOption} option
 * @param {string} value
 * @param {boolean} isSubscribe
 * @returns {string}
 */
function renderCustomOption(option, value, isSubscribe) {
  const requiredMark = option.required ? ' *' : '';

  if (option.type === 'select') {
    return `
      <label class="subscription-selector__custom-option">
        <span class="subscription-selector__custom-option-label">${option.label}${requiredMark}</span>
        <select
          class="subscription-selector__custom-option-control"
          data-subscription-option="${option.code}"
          ${isSubscribe ? '' : 'disabled'}
          ${option.required ? 'required' : ''}
        >
          <option value="">Select…</option>
          ${(option.options || []).map((entry) => `
            <option value="${entry.value}" ${entry.value === value ? 'selected' : ''}>
              ${entry.label}
            </option>
          `).join('')}
        </select>
      </label>
    `;
  }

  const inputType = option.type === 'date' ? 'date' : 'text';
  return `
    <label class="subscription-selector__custom-option">
      <span class="subscription-selector__custom-option-label">${option.label}${requiredMark}</span>
      <input
        class="subscription-selector__custom-option-control"
        type="${inputType}"
        data-subscription-option="${option.code}"
        value="${value}"
        ${isSubscribe ? '' : 'disabled'}
        ${option.required ? 'required' : ''}
      />
    </label>
  `;
}

/**
 * @param {HTMLElement} root
 */
export function clearSubscriptionSelector(root) {
  if (!root) return;
  root.hidden = true;
  root.innerHTML = '';
  root.className = 'subscription-selector';
  delete root.dataset.state;
}
