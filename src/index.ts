export { SpiderClient } from './client.ts';
export type { SpiderClientOptions, FetchLike, FeatureOptions, AutoRetryOptions } from './http.ts';
export type { SpiderResult } from './result.ts';
export type { SpiderError, SpiderErrorCode } from './errors.ts';
export { SpiderContractMismatchError } from './errors.ts';
export { Location, ViaLocation } from './location.ts';
export type { TransitMode, WheelchairBoarding, BikesAllowed, OccupancyStatus } from './enums.ts';
export { SpiderRouting } from './routing.ts';
export type {
  Route,
  RouteEdge,
  Itinerary,
  Leg,
  LatLon,
  RoutePageInfo,
  RoutingError,
  Departure,
  TripDetails,
  TripStop,
  PlanOptions,
  PlanStreamOptions,
  PlanStreamPageOptions,
  DeparturesOptions,
} from './routing.ts';
export { SpiderStops } from './stops.ts';
export type { Stop, StopFilter, GeoPoint, GeoBoundingBox } from './stops.ts';
export { SpiderRoutes } from './routes.ts';
// `Route` (the transit line) is re-exported as `TransitRoute`: the bare `Route`
// name is already the released routing plan-result type (see ./routing.ts).
export type { Route as TransitRoute, RouteFilter } from './routes.ts';
export { SpiderRealtime } from './realtime.ts';
export type {
  FeedFreshness,
  LiveVehicle,
  LiveVehicleUpdate,
  VehiclePositions,
  StopTimeUpdate,
  TripDelay,
  TripDelays,
  ServiceAlert,
  AlertActivePeriod,
  AlertInformedEntity,
  ServiceAlerts,
} from './realtime.ts';
export { pollVehicles, pollVehicleForTrip, pollDelays, pollAlerts } from './polling.ts';
export type { PollOptions } from './polling.ts';
