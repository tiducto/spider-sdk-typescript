export type RealtimeState =
  | 'ADDED'
  | 'CANCELED'
  | 'MODIFIED'
  | 'SCHEDULED'
  | 'UPDATED'
  | (string & {});
