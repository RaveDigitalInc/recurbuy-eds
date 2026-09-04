/**
* Renders a list of attributes into a container.
 * @param {HTMLElement} container - Render container
 * @param {Array} attributes - Array of attributes [{ label/code, value, selected_options }]
 * @param {'pdp'|'cart'} format - Data format
 * @param {Object} [options] - Additional parameters (e.g. { sku: '...' })
 */
export function renderCustomAttributes(container, attributes = [], format = 'pdp', options = {}) {
  container.className = `custom-attrs custom-attrs--${format}`;
  container.innerHTML = '';

  const list = document.createElement('dl');
  list.className = 'custom-attrs__list';

  if (options.sku) {
    const skuRow = document.createElement('div');
    skuRow.className = 'custom-attrs__row custom-attrs__row--sku';
    skuRow.innerHTML = `
      <dt class="custom-attrs__label">SKU:</dt>
      <dd class="custom-attrs__value">${options.sku}</dd>
    `;
    list.appendChild(skuRow);
  }

  if (Array.isArray(attributes) && attributes.length > 0) {
    attributes.forEach((attr) => {
      const row = document.createElement('div');
      row.className = 'custom-attrs__row';

      if (format === 'pdp') {
        const label = attr.label || attr.code || '';
        const value = attr.value || '';
        if (value) {
          row.innerHTML = `
            <dt class="custom-attrs__label">${label}:</dt>
            <dd class="custom-attrs__value">${value}</dd>
          `;
          list.appendChild(row);
        }
      }

      if (format === 'cart') {
        const code = attr.code || attr.label || '';
        let displayValue = '';

        if (attr.value) {
          displayValue = attr.value;
        } else if (attr.selected_options?.length) {
          displayValue = attr.selected_options.map((o) => o.label).join(', ');
        }

        if (displayValue) {
          row.innerHTML = `
            <dt class="custom-attrs__label">${code}:</dt>
            <dd class="custom-attrs__value">${displayValue}</dd>
          `;
          list.appendChild(row);
        }
      }
    });
  }

  if (list.children.length > 0) {
    container.appendChild(list);
  } else {
    const empty = document.createElement('div');
    empty.className = 'custom-attrs__empty';
    container.appendChild(empty);
  }
}
