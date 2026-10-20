export const MAX_EXPANDED_IDENTITIES=100_000;
export class ExpansionLimitError extends Error {}
// One counter per document, shared by sections, format instances and Areas.
export class ExpansionBudget {
 private count=0;
 constructor(private readonly maximum=MAX_EXPANDED_IDENTITIES){}
 take():void {if(++this.count>this.maximum)throw new ExpansionLimitError(`Expanded document exceeds ${this.maximum} node/inline identities`);}
}
