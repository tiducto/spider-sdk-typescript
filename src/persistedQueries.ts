export interface PersistedOp {
  readonly id: string;
  readonly path: string;
}

export const DEPARTURES: PersistedOp = { id: '70a644fe3c6b2cbf5b2d70cef8230c1428bea6357ae1766772162d86469563d0', path: 'departures' };
export const PLAN: PersistedOp = { id: 'b4ab216e42a84241b36401b26a2bc69e7ddce21dd0ac36a2858e828e0c80f772', path: 'plan' };
export const TRIP: PersistedOp = { id: 'e8959a8d47a8e8437ee3ec740cd9c3e28bd401efdd236dde0502559daea53920', path: 'trip' };
