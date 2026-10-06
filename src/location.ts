export type Location =
  | { readonly kind: 'coordinate'; readonly latitude: number; readonly longitude: number }
  | { readonly kind: 'stop'; readonly id: string };

export const Location = {
  coordinate(latitude: number, longitude: number): Location {
    return { kind: 'coordinate', latitude, longitude };
  },
  stop(id: string): Location {
    return { kind: 'stop', id };
  },
} as const;

export type ViaLocation =
  | { readonly kind: 'passThrough'; readonly stopIds: readonly string[] }
  | { readonly kind: 'visit'; readonly location: Location; readonly minimumWaitSeconds: number };

/**
 * A point the itinerary must pass. How many a request may carry is an environment setting. Each pass-through takes
 * 1 to 10 stop ids, else the request fails as `bad_request` on `via`. A visit is to a stop and waits 0 to 3600
 * seconds: a coordinate fails as `bad_request` on `via` (`via is invalid`), and a wait outside that range on
 * `via.visit.minimumWaitTime`.
 */
export const ViaLocation = {
  passThrough(...stopIds: string[]): ViaLocation {
    return { kind: 'passThrough', stopIds };
  },
  visit(location: Location, minimumWaitSeconds = 0): ViaLocation {
    return { kind: 'visit', location, minimumWaitSeconds };
  },
} as const;
