import {
  formatDiscount,
  formatMoney,
  formatPeriod,
  getPlanDisplayPrice,
} from './format.js';

const ONE_TIME_VALUE = 'one_time';

/**
 * @param {string} value
 * @returns {string}
 */
function escapeAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

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
 *   standardPrice?: import('./contract.js').MoneyAmount|null,
 *   locale?: string,
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
    standardPrice = null,
    locale = 'en-US',
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

  if (viewState !== 'ready') {
    delete root.dataset.optionsKey;
  }

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
  const isSubscribe = purchaseType === 'subscription';
  const selectedPlanId = isSubscribe
    ? (selection.planId || eligibility.selectedPlanId || eligibility.plans[0]?.id)
    : undefined;
  const selectedPlan = eligibility.plans.find((plan) => plan.id === selectedPlanId) || null;
  const allowOneTime = eligibility.allowOneTime !== false;
  const disabledAttr = productValid ? '' : 'disabled';
  const optionsKey = [
    allowOneTime ? ONE_TIME_VALUE : '',
    ...eligibility.plans.map((plan) => plan.id),
  ].join('\n');
  const selectedValue = isSubscribe && selectedPlan ? selectedPlan.id : ONE_TIME_VALUE;

  if (
    root.dataset.optionsKey === optionsKey
    && root.querySelector('.subscription-selector__options')
  ) {
    const fieldset = root.querySelector('.subscription-selector__fieldset');
    if (fieldset) fieldset.disabled = !productValid;
    updateOptionSelection(root, selectedValue);
    updateDisplayedPrices(root, eligibility, standardPrice, locale);
    replaceRegion(root, '.subscription-selector__details', selectedPlan ? renderPlanDetails(selectedPlan, locale) : '');
    replaceRegion(
      root,
      '.subscription-selector__custom-options',
      renderCustomOptions(eligibility, selection, isSubscribe),
    );
    bindCustomOptions(root, onCustomOptionChange);
    return;
  }

  root.dataset.optionsKey = optionsKey;
  root.innerHTML = `
    <fieldset class="subscription-selector__fieldset" ${disabledAttr}>
      <legend class="subscription-selector__legend">Purchase options</legend>
      <div class="subscription-selector__options" role="radiogroup" aria-label="Purchase options">
        ${allowOneTime ? renderOneTimeOption(!isSubscribe, standardPrice, locale) : ''}
        <div class="subscription-selector__subscribe">
          <p class="subscription-selector__subscribe-title">Subscribe and save</p>
          ${eligibility.plans.map((plan) => renderPlanOption(
    plan,
    isSubscribe && plan.id === selectedPlan?.id,
    locale,
  )).join('')}
        </div>
      </div>
    </fieldset>
    ${selectedPlan ? renderPlanDetails(selectedPlan, locale) : ''}
    ${renderCustomOptions(eligibility, selection, isSubscribe)}
  `;

  root.querySelectorAll('input[name="subscription-choice"]').forEach((input) => {
    input.addEventListener('change', (event) => {
      const { value } = /** @type {HTMLInputElement} */ (event.target);
      if (value === ONE_TIME_VALUE) {
        onPurchaseTypeChange?.('one_time');
        return;
      }
      onPlanChange?.(value);
    });
  });

  bindCustomOptions(root, onCustomOptionChange);
}

/**
 * Keeps the option list mounted so the selected border can ease instead of snapping.
 * @param {HTMLElement} root
 * @param {string} selectedValue
 */
function updateOptionSelection(root, selectedValue) {
  root.querySelectorAll('input[name="subscription-choice"]').forEach((input) => {
    const checked = input.value === selectedValue;
    input.checked = checked;
    input.closest('.subscription-selector__option')?.classList.toggle('is-selected', checked);
  });
}

/**
 * @param {HTMLElement} root
 * @param {string} selector
 * @param {string} html
 */
function replaceRegion(root, selector, html) {
  root.querySelector(selector)?.remove();
  if (!html) return;

  const template = document.createElement('template');
  template.innerHTML = html.trim();
  const node = template.content.firstElementChild;
  if (node) root.appendChild(node);
}

/**
 * @param {HTMLElement} root
 * @param {((code: string, value: string) => void)|undefined} onCustomOptionChange
 */
function bindCustomOptions(root, onCustomOptionChange) {
  root.querySelectorAll('[data-subscription-option]').forEach((input) => {
    if (input.dataset.bound === 'true') return;
    input.dataset.bound = 'true';
    input.addEventListener('change', (event) => {
      const { target } = event;
      const control = /** @type {HTMLInputElement|HTMLSelectElement} */ (target);
      const code = control.getAttribute('data-subscription-option');
      if (code) onCustomOptionChange?.(code, control.value);
    });
  });
}

/**
 * @param {HTMLElement} root
 * @param {import('./contract.js').SubscriptionEligibility} eligibility
 * @param {import('./contract.js').MoneyAmount|null} standardPrice
 * @param {string} locale
 */
function updateDisplayedPrices(root, eligibility, standardPrice, locale) {
  const oneTime = root.querySelector('[data-subscription-price="one_time"]');
  if (oneTime) oneTime.textContent = formatMoney(standardPrice, locale);

  eligibility.plans.forEach((plan) => {
    const priceNode = root.querySelector(`[data-subscription-price="${CSS.escape(plan.id)}"]`);
    if (priceNode) priceNode.textContent = formatMoney(getPlanDisplayPrice(plan), locale);
    const savingNode = root.querySelector(`[data-subscription-saving="${CSS.escape(plan.id)}"]`);
    if (savingNode) savingNode.textContent = formatDiscount(plan.discount);
  });
}

/**
 * @param {boolean} checked
 * @param {import('./contract.js').MoneyAmount|null} standardPrice
 * @param {string} locale
 * @returns {string}
 */
function renderOneTimeOption(checked, standardPrice, locale) {
  const priceLabel = formatMoney(standardPrice, locale);

  return `
    <label class="subscription-selector__option ${checked ? 'is-selected' : ''}">
      <input
        class="subscription-selector__radio"
        type="radio"
        name="subscription-choice"
        value="${ONE_TIME_VALUE}"
        ${checked ? 'checked' : ''}
      />
      <span class="subscription-selector__option-body">
        <span class="subscription-selector__option-title">One-time purchase</span>
        <span class="subscription-selector__option-caption">Buy once</span>
      </span>
      <span class="subscription-selector__option-price" data-subscription-price="one_time">${priceLabel}</span>
    </label>
  `;
}

/**
 * @param {import('./contract.js').SubscriptionPlan} plan
 * @param {boolean} checked
 * @param {string} locale
 * @returns {string}
 */
function renderPlanOption(plan, checked, locale) {
  const price = getPlanDisplayPrice(plan);
  const saving = formatDiscount(plan.discount);
  const priceSlot = escapeAttr(plan.id);

  return `
    <label class="subscription-selector__option ${checked ? 'is-selected' : ''}">
      <input
        class="subscription-selector__radio"
        type="radio"
        name="subscription-choice"
        value="${escapeAttr(plan.id)}"
        ${checked ? 'checked' : ''}
      />
      <span class="subscription-selector__option-body">
        <span class="subscription-selector__option-title">${plan.label}</span>
        <span class="subscription-selector__option-caption">${formatPeriod(plan.period)}</span>
      </span>
      <span class="subscription-selector__option-meta">
        <span class="subscription-selector__option-price" data-subscription-price="${priceSlot}">${formatMoney(price, locale)}</span>
        ${saving ? `<span class="subscription-selector__option-saving" data-subscription-saving="${priceSlot}">${saving}</span>` : ''}
      </span>
    </label>
  `;
}

/**
 * @param {import('./contract.js').SubscriptionPlan} plan
 * @param {string} locale
 * @returns {string}
 */
function renderPlanDetails(plan, locale) {
  const details = [];
  const periodLabel = formatPeriod(plan.period);
  const regular = plan.prices?.regular;
  const initial = plan.prices?.initial;
  const displayPrice = getPlanDisplayPrice(plan);

  if (initial && regular && initial.value !== regular.value) {
    details.push(
      `First payment ${formatMoney(initial, locale)}, then ${formatMoney(regular, locale)} ${periodLabel}`,
    );
  } else if (displayPrice && periodLabel) {
    details.push(`${formatMoney(displayPrice, locale)} ${periodLabel}`);
  }

  if (plan.trial) {
    details.push(`Includes a ${plan.trial.value}-${plan.trial.unit} trial`);
  }

  if (plan.description) {
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
  if (!options.length || !isSubscribe) return '';

  return `
    <div class="subscription-selector__custom-options">
      <p class="subscription-selector__custom-options-title">Subscription options</p>
      ${options.map((option) => renderCustomOption(
    option,
    selection.customOptionValues?.[option.code] || '',
    true,
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
  delete root.dataset.optionsKey;
}
