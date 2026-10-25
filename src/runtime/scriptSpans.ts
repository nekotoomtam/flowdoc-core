export interface ScriptSpan {text:string;start:number;end:number;}

/** Itemize the supported left-to-right Thai/Latin profile before the native
 * shaper guesses a script. Common/Inherited graphemes stay with the preceding
 * strong script (leading ones join the first). Never divide a grapheme.
 * Other scripts and bidi controls retain the previous whole-string behavior;
 * this is deliberately not a general Unicode bidi/itemization implementation.
 */
export function scriptSpans(text:string):ScriptSpan[]{
 const whole=[{text,start:0,end:text.length}];
 if(!text.isWellFormed()||/\p{Bidi_Control}/u.test(text)||
    [...text].some(ch=>!/[\p{Script_Extensions=Thai}\p{Script_Extensions=Latin}\p{Script=Common}\p{Script=Inherited}]/u.test(ch)))return whole;
 const spans:ScriptSpan[]=[];
 let start=0,script:'Thai'|'Latin'|undefined;
 for(const g of new Intl.Segmenter('und',{granularity:'grapheme'}).segment(text)){
  // Use the first strong scalar, keeping even unusual base/mark combinations
  // intact. Inherited marks do not determine or reset script context.
  const strong=[...g.segment].find(ch=>/[\p{Script=Thai}\p{Script=Latin}]/u.test(ch));
  const next=strong?(/\p{Script=Thai}/u.test(strong)?'Thai':'Latin'):undefined;
  if(next&&script&&next!==script){spans.push({text:text.slice(start,g.index),start,end:g.index});start=g.index;}
  if(next)script=next;
 }
 spans.push({text:text.slice(start),start,end:text.length});
 return spans;
}
