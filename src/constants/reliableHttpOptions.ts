export const reliableHttpProviderOptionsByNetworkName = {
  local: {
    estimatedBlockTimeMs: 200,
  },
  matic: {
    estimatedBlockTimeMs: 2000,
  },
} as Record<string, { estimatedBlockTimeMs: number }>;
