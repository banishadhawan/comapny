import Big from 'big.js';

// Configure big.js for high precision calculations
Big.DP = 20; // 20 decimal places
Big.RM = 1;  // Round half up

export const UNITS = {
  g: { name: 'grams', symbol: 'g', dimension: 'WEIGHT', scale: new Big('1') },
  kg: { name: 'kilograms', symbol: 'kg', dimension: 'WEIGHT', scale: new Big('1000') },
  mL: { name: 'milliliters', symbol: 'mL', dimension: 'VOLUME', scale: new Big('1') },
  L: { name: 'liters', symbol: 'L', dimension: 'VOLUME', scale: new Big('1000') },
  items: { name: 'items', symbol: 'items', dimension: 'COUNT', scale: new Big('1') },
};

/**
 * Returns a list of unit symbols compatible with the given unit (same dimension).
 */
export function getCompatibleUnits(unit) {
  const meta = UNITS[unit];
  if (!meta) return [];
  return Object.keys(UNITS).filter(u => UNITS[u].dimension === meta.dimension);
}

/**
 * Converts a quantity from one unit to another within the same dimension.
 * Formula: Q_to = Q_from * (Scale_from / Scale_to)
 */
export function convertQuantity(qty, fromUnit, toUnit) {
  const fromMeta = UNITS[fromUnit];
  const toMeta = UNITS[toUnit];
  
  if (!fromMeta || !toMeta) {
    throw new Error(`Invalid unit: ${fromUnit} or ${toUnit}`);
  }
  if (fromMeta.dimension !== toMeta.dimension) {
    throw new Error(`Incompatible units: Cannot convert ${fromUnit} (${fromMeta.dimension}) to ${toUnit} (${toMeta.dimension})`);
  }
  
  const bigQty = new Big(qty);
  return bigQty.times(fromMeta.scale).div(toMeta.scale);
}

/**
 * Converts a unit price from one unit to another within the same dimension.
 * Price is inversely proportional to unit size.
 * Formula: P_to = P_from * (Scale_to / Scale_from)
 */
export function convertPrice(price, fromUnit, toUnit) {
  const fromMeta = UNITS[fromUnit];
  const toMeta = UNITS[toUnit];
  
  if (!fromMeta || !toMeta) {
    throw new Error(`Invalid unit: ${fromUnit} or ${toUnit}`);
  }
  if (fromMeta.dimension !== toMeta.dimension) {
    throw new Error(`Incompatible units: Cannot convert price of ${fromUnit} to ${toUnit}`);
  }
  
  const bigPrice = new Big(price);
  return bigPrice.times(toMeta.scale).div(fromMeta.scale);
}

/**
 * Safely parses a number/string to a Big, or returns zero if invalid.
 */
export function toBig(val) {
  try {
    return new Big(val || 0);
  } catch (e) {
    return new Big(0);
  }
}
