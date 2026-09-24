export interface PersistedOp {
  readonly id: string;
  readonly path: string;
}

export const DEPARTURES: PersistedOp = { id: '70a644fe3c6b2cbf5b2d70cef8230c1428bea6357ae1766772162d86469563d0', path: 'departures' };
export const PLAN: PersistedOp = { id: '06004d101213f2d6abbbde9e7ed3fd239af47352168d5fd47ece8c46cab67618', path: 'plan' };
export const PLAN_STREAM: PersistedOp = { id: '7f82dbee066bcb53a1ddfe83254abb396c408c5ce95a151ac743c656789aef4b', path: 'plan-stream' };
export const TRIP: PersistedOp = { id: 'e8959a8d47a8e8437ee3ec740cd9c3e28bd401efdd236dde0502559daea53920', path: 'trip' };
