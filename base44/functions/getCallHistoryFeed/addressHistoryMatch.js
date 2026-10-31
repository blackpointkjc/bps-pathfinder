const escape = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const aliases = [
 ['street','st'],['road','rd'],['avenue','ave'],['drive','dr'],['lane','ln'],
 ['court','ct'],['boulevard','blvd'],['place','pl'],['parkway','pkwy'],
 ['circle','cir'],['terrace','ter'],['highway','hwy'],['trail','trl'],
 ['north','n'],['south','s'],['east','e'],['west','w'],
];
export function addressHistoryPattern(address) {
 const first = String(address || '').split(',')[0].replace(/\s+(?:apt|apartment|unit|suite|#)\s*.*$/i, '').trim();
 const number = first.match(/^(\d+[a-z]?)\s+(?:block\s+)?(.+)$/i);
 if (!number) return '';
 const words = number[2].replace(/[^a-z0-9\s]/gi, ' ').trim().split(/\s+/);
 const tokens = words.map(word => {
   const pair = aliases.find(group => group.includes(word.toLowerCase()));
   return pair ? '(?:' + pair.join('|') + ')\\.?' : escape(word);
 });
 // Public CAD often omits the city or appends a short locality without commas.
 // Never require the geocoder's city text to appear in a stored CAD address.
 return '^\\s*' + escape(number[1]) + '\\s+(?:block\\s+)?' + tokens.join('\\s+')
   + '(?=\\s*(?:,|$)|\\s+(?:apt|apartment|unit|suite|#|rich(?:mond)?|henrico|chesterfield|midlothian|chester|va|virginia)\\b)';
}
