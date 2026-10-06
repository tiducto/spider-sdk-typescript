/** A location the journey passes. */
export interface PlanPassThroughViaLocationInput {
  /** 1 to 10 feed-prefixed stop or station ids; passing any one of them is enough. More, or none, is a 400 naming `via`. */
  stopLocationIds: string[];
}
