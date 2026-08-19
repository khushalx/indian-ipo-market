function scaled(value: number, places = 2): bigint {
  const factor = 10 ** places;
  return BigInt(Math.round(value * factor));
}

export function calculateGMP(upperPriceBand: number | undefined, gmp: number) {
  if (upperPriceBand == null || upperPriceBand <= 0) {
    return { estimatedListingPrice: undefined, gmpPercent: undefined };
  }
  const upper = scaled(upperPriceBand);
  const premium = scaled(gmp);
  const estimatedListingPrice = Number(upper + premium) / 100;
  const gmpPercent = Number((premium * BigInt(10_000)) / upper) / 100;
  return { estimatedListingPrice, gmpPercent };
}

export function percentageReturn(base: number | undefined, value: number | undefined): number | undefined {
  if (base == null || value == null || base <= 0) return undefined;
  const baseScaled = scaled(base);
  const valueScaled = scaled(value);
  return Number(((valueScaled - baseScaled) * BigInt(10_000)) / baseScaled) / 100;
}
