/**
 * Рендерит список атрибутов в container.
 * @param {HTMLElement} container - куда вставить
 * @param {Array} attributes - массив атрибутов
 * @param {'pdp'|'cart'} format - формат данных
 */
export function renderCustomAttributes(container, attributes = [], format = 'pdp') {
  container.className = 'custom-attrs';
  container.innerHTML = '';

  if (!attributes.length) {
    const empty = document.createElement('div');
    empty.className = 'custom-attrs__empty';
    empty.textContent = '';
    container.appendChild(empty);
    return;
  }

  attributes.forEach((attr) => {
    const row = document.createElement('div');
    row.className = 'custom-attrs__row';

    if (format === 'pdp') {
      // PDP: { label, value }
      row.textContent = `${attr.label}: ${attr.value}`;
    }

    if (format === 'cart') {
      // Cart: { code, value, selected_options }
      if (attr.value) {
        row.textContent = `${attr.code}: ${attr.value}`;
      } else if (attr.selected_options?.length) {
        const labels = attr.selected_options.map((o) => o.label).join(', ');
        row.textContent = `${attr.code}: ${labels}`;
      }
    }

    container.appendChild(row);
  });
}