export interface PersistedOp {
  readonly id: string;
  readonly path: string;
}

export const DEPARTURES: PersistedOp = { id: '70a644fe3c6b2cbf5b2d70cef8230c1428bea6357ae1766772162d86469563d0', path: 'departures' };
export const PLAN: PersistedOp = { id: 'dad4f190af803a8cb50ec99c5852544297e94db8edc0d94220c8f79d98f065a7', path: 'plan' };
export const TRIP: PersistedOp = { id: 'e8959a8d47a8e8437ee3ec740cd9c3e28bd401efdd236dde0502559daea53920', path: 'trip' };
