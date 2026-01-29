// Paddle API integration for fetching marketplace products

const PADDLE_API_KEY = import.meta.env.PADDLE_API_KEY;
const PADDLE_API_URL = 'https://api.paddle.com';

interface PaddleProduct {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  status: string;
  custom_data: { sku?: string } | null;
}

interface PaddlePrice {
  id: string;
  product_id: string;
  description: string | null;
  name: string | null;
  unit_price: {
    amount: string;
    currency_code: string;
  };
  billing_cycle: { interval: string; frequency: number } | null;
}

export interface MarketplaceProduct {
  id: string;
  name: string;
  description: string;
  image: string;
  price: number;
  priceId: string;
  sku: string | null;
}

async function fetchAllProducts(): Promise<PaddleProduct[]> {
  const products: PaddleProduct[] = [];
  let url: string | null = `${PADDLE_API_URL}/products?status=active&per_page=200`;

  while (url) {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${PADDLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('Failed to fetch products:', await response.text());
      break;
    }

    const data = await response.json();
    products.push(...data.data);
    url = data.meta.pagination.has_more ? data.meta.pagination.next : null;
  }

  return products;
}

async function fetchAllPrices(): Promise<PaddlePrice[]> {
  const prices: PaddlePrice[] = [];
  let url: string | null = `${PADDLE_API_URL}/prices?status=active&per_page=200`;

  while (url) {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${PADDLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('Failed to fetch prices:', await response.text());
      break;
    }

    const data = await response.json();
    prices.push(...data.data);
    url = data.meta.pagination.has_more ? data.meta.pagination.next : null;
  }

  return prices;
}

export async function getMarketplaceProducts(): Promise<MarketplaceProduct[]> {
  const [products, prices] = await Promise.all([
    fetchAllProducts(),
    fetchAllPrices(),
  ]);

  // Create a map of product_id -> MSRP price (non-subscription, non-promo)
  const priceMap = new Map<string, PaddlePrice>();
  
  for (const price of prices) {
    // Skip subscription prices (they have billing_cycle)
    if (price.billing_cycle) continue;
    
    // Prefer MSRP prices over promo prices
    const existing = priceMap.get(price.product_id);
    if (!existing || price.description === 'Collection MSRP') {
      priceMap.set(price.product_id, price);
    }
  }

  // Filter and transform products for marketplace
  const marketplaceProducts: MarketplaceProduct[] = [];

  for (const product of products) {
    // Skip subscription products (like Musio Pro which has tax_category: 'saas')
    if (product.name === 'Musio Pro' || product.name === 'Musio') continue;
    
    // Skip products without images
    if (!product.image_url) continue;
    
    const price = priceMap.get(product.id);
    if (!price) continue;

    marketplaceProducts.push({
      id: product.id,
      name: product.name,
      description: product.description || '',
      image: product.image_url,
      price: parseInt(price.unit_price.amount) / 100, // Convert cents to dollars
      priceId: price.id,
      sku: product.custom_data?.sku || null,
    });
  }

  // Sort by name
  marketplaceProducts.sort((a, b) => a.name.localeCompare(b.name));

  return marketplaceProducts;
}
