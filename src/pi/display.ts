/** Terminal-safe display helpers shared by LAB Pi renderers and prompts (from PR #23). */
// Display-only text: escape C0/C1 controls (incl. ESC), bidi/format controls
// and lone surrogates so page or argument text cannot drive the terminal or
// reorder rows. Machine details stay unchanged; only rendering is escaped.
export const displaySafe=(text:string)=>text.replace(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff\ufff9-\ufffb]|[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g,c=>'\\u{'+c.codePointAt(0)!.toString(16)+'}');
const wide=(cp:number)=>cp>=0x1100&&(cp<=0x115f||cp===0x2329||cp===0x232a||(cp>=0x2e80&&cp<=0xa4cf&&cp!==0x303f)||(cp>=0xac00&&cp<=0xd7a3)||(cp>=0xf900&&cp<=0xfaff)||(cp>=0xfe30&&cp<=0xfe4f)||(cp>=0xff00&&cp<=0xff60)||(cp>=0xffe0&&cp<=0xffe6)||(cp>=0x1f300&&cp<=0x1faff)||(cp>=0x20000&&cp<=0x3fffd));
const segmenter=new Intl.Segmenter(undefined,{granularity:'grapheme'});
// Same rule as pinned Pi TUI visibleWidth (RGI emoji = 2 columns). Constructed to avoid a TS target bump for the v flag.
const rgiEmoji=new RegExp('^\\p{RGI_Emoji}$','v');
/** Terminal columns of one grapheme: 0 for combining-only, 2 for East Asian wide or any RGI emoji (incl. flags, keycaps, ZWJ), else 1. */
export const columns=(g:string)=>{const cp=g.codePointAt(0)!;if(/^\p{M}+$/u.test(g))return 0;return wide(cp)||rgiEmoji.test(g)||/\p{Emoji_Presentation}/u.test(g)?2:1;};
/** Wrap by terminal columns at grapheme boundaries; every row is <= width columns. */
export function wrapColumns(text:string,width:number):string[]{const w=Math.max(1,Math.floor(width)||1);return text.split('\n').flatMap(line=>{const rows:string[]=[];let row='',used=0;
  const put=(g:string,n:number)=>{if(used+n>w&&used>0){rows.push(row);row='';used=0;}row+=g;used+=n;};
  for(const {segment} of segmenter.segment(line)){const safe=rgiEmoji.test(segment)?segment:displaySafe(segment); // ZWJ inside a valid emoji is not hostile
    if(safe!==segment){const parts=Array.from(safe),n=parts.reduce((t,c)=>t+columns(c),0);if(n<=w)put(safe,n);else for(const c of parts){const m=columns(c);m>w?put('?',1):put(c,m);}} // escape stays on one row when it fits
    else{const n=columns(segment);n>w?put('?',1):put(segment,n);}}
  rows.push(row);return rows;});}
/** One escaped row of at most width columns; overflow ends in '…'. Newlines become spaces. */
export function fitColumns(text:string,width:number):string{const w=Math.max(1,Math.floor(width)||1);const rows=wrapColumns(text.replace(/[\r\n]+/g,' '),w);
  if(rows.length<=1)return rows[0]??'';let row='',used=0;for(const {segment} of segmenter.segment(rows[0]!)){const n=columns(segment);if(used+n>w-1)break;row+=segment;used+=n;}return row+'…';}
/** Minimal Pi component over pre-escaped wrapping. */
export const textComponent=(text:string)=>({render:(width:number)=>wrapColumns(text,width),invalidate(){}});
