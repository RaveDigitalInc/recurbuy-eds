import { getHeaders } from '@dropins/tools/lib/aem/configs.js';
import { initializers } from '@dropins/tools/initializer.js';
import { config, initialize, setFetchGraphQlHeaders } from '@dropins/storefront-cart/api.js';
import { createCartModelCustomAttributesTransformer } from '@recurbuy/storefront-eds/extend/initializer.js';
import { initializeDropin } from './index.js';
import { fetchPlaceholders } from '../commerce.js';

await initializeDropin(async () => {
  setFetchGraphQlHeaders((prev) => ({ ...prev, ...getHeaders('cart') }));

  const labels = await fetchPlaceholders('placeholders/cart.json');

  const langDefinitions = {
    default: {
      ...labels,
    },
  };

  return initializers.mountImmediately(initialize, {
    langDefinitions,
    models: {
      CartModel: {
        transformer: createCartModelCustomAttributesTransformer(config),
      },
    },
  });
})();
