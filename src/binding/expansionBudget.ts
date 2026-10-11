export const MAX_EXPANDED_IDENTITIES=100_000;
export class ExpansionLimitError extends Error {}
// One counter per document, shared by sections, format instances and Areas.
export class ExpansionBudget {
 private count=0;
 take():void {if(++this.count>MAX_EXPANDED_IDENTITIES)throw new ExpansionLimitError(`Expanded document exceeds ${MAX_EXPANDED_IDENTITIES} node/inline identities`);}
}
