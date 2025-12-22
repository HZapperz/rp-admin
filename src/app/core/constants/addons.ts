/**
 * Addon ID to Name mapping
 * This maps addon UUIDs to their display names for cases where
 * the booking_addons table contains IDs instead of names
 */
export const ADDON_ID_TO_NAME: Record<string, { name: string; price: number | null }> = {
  '7125ef44-4092-438b-942f-203190c34f70': { name: 'Flea Treatment', price: 20.00 },
  'c9d3900e-c041-4f11-933e-56d4390cf6ab': { name: 'De-Shedding', price: 30.00 },
  '6f0d8d13-627f-4d40-b834-742f29178794': { name: 'Skunk Works', price: 100.00 },
  'c71cc01f-e50d-4e92-9615-d05b078c286c': { name: 'Same Day Request', price: null },
  '55e7014c-f0cd-494d-a55f-c1441b1901fe': { name: 'Teeth Brushing', price: 15.00 },
  'db19cc5a-f47b-46fe-8327-b1c671f940f5': { name: 'Nail Polish', price: 10.00 },
  '78b8c2d1-cdee-47e5-be8f-ccd09727dcde': { name: 'Ear Cleaning', price: 12.00 },
  '7b0e6f98-243b-4af3-896b-0470aac518d3': { name: 'Paw Balm', price: 8.00 },
  '863f77d5-2b0a-4082-af54-32ff469716c7': { name: 'Cologne Spritz', price: 5.00 },
  'e948efce-2f9e-4092-b1a3-6bf69a22dc6b': { name: 'Bow or Bandana', price: 3.00 },
  '62f514b6-8dac-4b42-8859-5cdaf06c1243': { name: 'Show Cut', price: null }, // Size-based pricing: Small $30, Medium $40, Large $50, XL $60
};

/**
 * Helper function to get addon display name
 * If the name is a UUID (matches addon ID), return the mapped name
 * Otherwise, return the name as-is
 */
export function getAddonDisplayName(addonName: string): string {
  // Check if it's a UUID format (lowercase with hyphens)
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(addonName);

  if (isUUID && ADDON_ID_TO_NAME[addonName]) {
    return ADDON_ID_TO_NAME[addonName].name;
  }

  return addonName;
}

/**
 * Helper function to get addon price from mapping
 * If the stored price is 0 and the name is a UUID, use the mapped price
 */
export function getAddonDisplayPrice(addonName: string, storedPrice: number): number {
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(addonName);

  if (isUUID && ADDON_ID_TO_NAME[addonName] && storedPrice === 0) {
    return ADDON_ID_TO_NAME[addonName].price || 0;
  }

  return storedPrice;
}
