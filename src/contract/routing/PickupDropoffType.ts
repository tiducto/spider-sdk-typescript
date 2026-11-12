/** Whether and how a rider boards (`pickupType`) or alights (`dropoffType`) at a stop, from the GTFS `pickup_type` / `drop_off_type`: `SCHEDULED` regularly (0, or the field left empty), `NONE` not at all (1), `CALL_AGENCY` only after phoning the agency (2), `COORDINATE_WITH_DRIVER` only by arranging it with the driver, a stop on request (3). */
export type PickupDropoffType =
  | 'CALL_AGENCY'
  | 'COORDINATE_WITH_DRIVER'
  | 'NONE'
  | 'SCHEDULED'
  | (string & {});
