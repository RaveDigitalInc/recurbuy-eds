import { renderCustomAttributes } from './custom-attributes.js';
import {
  formatCartAttributeLabel,
  getVisibleCartLineAttributes,
} from '../subscriptions/cart-line-custom-attributes.js';

/**
 * Renders catalog product attributes and cart-line custom attributes into a
 * CartSummaryList / MiniCart / checkout ProductAttributes slot.
 * Repaints when the drop-in slot context changes so a later cart refresh
 * (after GraphQL returns `custom_attributes`) updates the row in place.
 *
 * @param {HTMLElement & { appendChild: Function, onChange?: Function, item?: object }} ctx
 * @param {object|null|undefined} item Drop-in cart line item
 * @param {{ format?: 'pdp'|'cart', sku?: string|boolean }} [options]
 */
export function appendCartProductAttributesSlot(ctx, item, options = {}) {
  if (!ctx) return;

  const { format = 'cart', sku: showSku = false } = options;
  const host = document.createElement('div');
  host.className = 'cart-line-attributes';
  ctx.appendChild(host);

  const paint = (nextItem) => {
    host.replaceChildren();
    if (!nextItem) return;

    const sku = showSku ? (nextItem.sku || (typeof showSku === 'string' ? showSku : '')) : '';

    const productWrapper = document.createElement('div');
    renderCustomAttributes(
      productWrapper,
      nextItem.productAttributes ?? [],
      format,
      sku ? { sku } : undefined,
    );
    host.appendChild(productWrapper);

    const lineAttributes = getVisibleCartLineAttributes(nextItem).map((attribute) => ({
      code: formatCartAttributeLabel(attribute.code),
      value: attribute.value,
    }));
    if (!lineAttributes.length) return;

    const lineWrapper = document.createElement('div');
    renderCustomAttributes(lineWrapper, lineAttributes, 'cart');
    lineWrapper.classList.add('custom-attrs--cart-line');
    host.appendChild(lineWrapper);
  };

  paint(item || ctx.item);

  if (typeof ctx.onChange === 'function') {
    ctx.onChange((nextCtx) => {
      if (!nextCtx?.item) return;
      paint(nextCtx.item);
    });
  }
}
