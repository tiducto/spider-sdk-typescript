export interface PersistedOp {
  readonly id: string;
  readonly path: string;
}

export const DEPARTURES: PersistedOp = { id: '70a644fe3c6b2cbf5b2d70cef8230c1428bea6357ae1766772162d86469563d0', path: 'departures' };
export const PLAN: PersistedOp = { id: '2651d04c04415f5ee9130c032feb88371e873be6cb4c05ae0e5615c9bfee60eb', path: 'plan' };
export const TRIP: PersistedOp = { id: 'e8959a8d47a8e8437ee3ec740cd9c3e28bd401efdd236dde0502559daea53920', path: 'trip' };
