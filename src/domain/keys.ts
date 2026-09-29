// Pure Redis key derivation, shared by the workflow (sandboxed) and the Redis store.

/** Canonical Redis key for a city's full (all suppliers) result set. */
export const hotelKey = (city: string): string => `hotels:${city.trim().toLowerCase()}`;

/** Request-scoped key for a partial result, so it never overwrites the canonical set. */
export const partialHotelKey = (city: string, workflowId: string): string => `${hotelKey(city)}:partial:${workflowId}`;
