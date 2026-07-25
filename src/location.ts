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

export const ViaLocation = {
  passThrough(...stopIds: string[]): ViaLocation {
    return { kind: 'passThrough', stopIds };
  },
  visit(location: Location, minimumWaitSeconds = 0): ViaLocation {
    return { kind: 'visit', location, minimumWaitSeconds };
  },
} as const;
