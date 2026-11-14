// Natural-language command parser shared by voice and the typed command box.
// parse(text) → { type, ...args } or null. Keep it forgiving: speech recognisers mishear, people ramble.
import { PLACES } from '../data/places.js';
import { DATASETS } from '../data/datasets.js';

const FILLER = /^(ok(ay)?|hey|hi|hello|please|so|um+|uh+|earth|jukebox|computer|can you|could you|would you|will you|i want to|i would like to|i'd like to|i wanna|let's|lets|let me|now|just|and|then)\b\s*/;
const GOTO = /^(go to|go over to|take me to|take us to|fly to|fly me to|fly over|travel to|show me|show|visit|navigate to|head to|move to|bring me to|find|zoom to|zoom into|zoom in on|jump to|where is|where's)\b\s*/;

export function normalize(text) {
  let t = text.toLowerCase().replace(/[’']/g, "'").replace(/[^\p{L}\p{N}\s°.'-]/gu, ' ').replace(/\s+/g, ' ').trim();
  let prev;
  do { prev = t; t = t.replace(FILLER, '').trim(); } while (t !== prev);
  return t.replace(/\s*(please|thanks|thank you)$/, '').trim();
}

const is = (t, re) => re.test(t);

export function parse(input) {
  const t = normalize(input);
  if (!t) return null;

  if (is(t, /^(help|what can i (say|do|ask)|commands|list commands|options|how does this work)\b/)) return { type: 'help' };
  // ---- intro
  if (is(t, /^(skip|skip (it|this|the intro|intro|introduction)|stop (the )?intro)$/)) return { type: 'skip-intro' };
  if (is(t, /^((play|start|replay|hear|watch)( the)? )?(intro|introduction|welcome)( again)?$/)) return { type: 'intro' };

  // ---- data pop-up
  if (is(t, /^(close|close (it|this|that|the (data|pop ?up|window|panel|dialog))|exit|done|back to (the )?(globe|earth|map)|go back to (the )?(globe|earth))$/)) return { type: 'close-data' };
  if (is(t, /^((what|which) (data|datasets?|data stories|options)( is| are)? (here|available)|(show|list|read)( me)? (the )?(data|options|data options|datasets)|options|data|what can i (hear|listen to)( here)?)$/)) return { type: 'list-data' };
  const num = t.match(/^(?:open|choose|select|pick|play)?\s*(?:option|number|data|item)?\s*(\d|one|two|three|four|five|six)$/);
  if (num && /^(open|choose|select|pick|play|option|number|data|item)/.test(t)) return { type: 'open-data', index: wordNum(num[1]) - 1 };
  const openVerb = t.match(/^(open|show( me)?|play|listen to|hear|sonify|launch|start|choose|select|pick|let me hear|i want to hear)\b\s*(the )?(.*)$/);
  const dsText = openVerb ? openVerb[4] : t;
  const ds = findDatasetByName(dsText);
  if (ds && (openVerb || /\b(data|layer|story)$/.test(t) || dsText.split(' ').length <= 3)) {
    if (!(openVerb && /^show/.test(openVerb[1]) && findPlace(dsText))) return { type: 'open-data', dataset: ds };
  }

  if (is(t, /^(stop listening|stop voice|mic off|microphone off|turn off (the )?(mic|microphone|voice)|goodbye|bye)\b/)) return { type: 'voice-off' };
  if (is(t, /^(stop talking|be quiet|quiet mode|mute (your )?voice|no speech|don't talk|shut up)\b/)) return { type: 'speech', on: false };
  if (is(t, /^(talk to me|speak|start talking|voice on|unmute (your )?voice|read (it )?aloud)\b/)) return { type: 'speech', on: true };

  if (is(t, /^(where am i|where are we|describe|what('s| is) (here|this|below|under me|that)|what am i (looking at|over)|tell me about (this|here|it)|what do i see|read location|location)\b/)) return { type: 'describe' };
  if (is(t, /^(describe|explain) (the )?(data|layer|sound|mapping)|what am i hearing|what does (this|it) sound like|how does (this|it) sound\b/)) return { type: 'describe-layer' };
  if (is(t, /^(list|name|what are) (the )?(places|destinations|locations)|where can (i|we) go|(what|which) (places|destinations)|places (can|could) (i|we)\b/)) return { type: 'list-places' };

  if (is(t, /^(next|next stop|continue|keep going|go on|onward)$/)) return { type: 'tour-next' };
  if (is(t, /^(previous|previous stop|go back|back|last stop)$/)) return { type: 'tour-prev' };
  if (is(t, /^(stop|end|exit|cancel|quit) (the )?tour\b/)) return { type: 'tour-stop' };
  if (is(t, /\b(tour|guided tour|show me around|take me around|surprise me)\b/)) return { type: 'tour-start' };

  if (is(t, /^(stop (spinning|rotating|turning)|hold still|freeze)\b/)) return { type: 'spin', on: false };
  if (is(t, /^(spin|rotate|auto ?rotate|start spinning|turn the (globe|earth|world))( (the )?(globe|earth|world))?$/)) return { type: 'spin', on: true };

  if (is(t, /^(louder|volume up|turn (it )?up|increase (the )?volume|more volume)\b/)) return { type: 'volume', delta: 0.15 };
  if (is(t, /^(quieter|softer|volume down|turn (it )?down|lower (the )?volume|decrease (the )?volume|less volume)\b/)) return { type: 'volume', delta: -0.15 };

  if (is(t, /^(play|listen|start( the)? (sound|music|audio)|sonify|let me hear|make (some )?(sound|music|noise)|what does (it|this|here) sound like|sound on|play (the )?(sound|music|data|earth)|listen here|hear (it|this))\b/)) return { type: 'play' };
  if (is(t, /^(stop|pause|silence|mute|sound off|stop (the )?(sound|music|audio|playing)|enough)$/)) return { type: 'stop' };

  if (is(t, /^(zoom (all the way )?out (all the way|completely|fully)|zoom all the way out|whole (earth|world|planet)|show (me )?the whole (earth|world|planet)|reset|reset (the )?view|home|go home|start over|from space)\b/)) return { type: 'reset' };
  const z = t.match(/^(zoom in|closer|get closer|go closer|move closer|enhance|zoom out|further|farther|back up|pull back|move away|go higher|higher|lower|go lower)( (a )?(lot|little|bit|more))?( more)?$/);
  if (z) {
    const inward = /in|closer|enhance|lower/.test(z[1]);
    const big = /lot/.test(t), small = /little|bit/.test(t);
    return { type: 'zoom', factor: inward ? (big ? 0.35 : small ? 0.8 : 0.6) : (big ? 2.6 : small ? 1.25 : 1.6) };
  }

  if (is(t, /^(hide|remove|turn off|no) (the )?clouds$|^clouds off$/)) return { type: 'clouds', on: false };
  if (is(t, /^(show|add|turn on) (the )?clouds$|^clouds on$/)) return { type: 'clouds', on: true };

  const layer = t.match(/^(switch|change|use|set)( to| the)? (data |layer )?(.+?)( layer| data)?$/) || t.match(/^(next) (layer|data|dataset)$/);
  if (layer) return { type: 'layer', query: layer[1] === 'next' ? 'next' : layer[4] };

  const dir = t.match(/^(?:move|go|turn|pan|rotate|look|head|spin|fly|travel|scroll)?\s*(?:a (?:little|bit) |slightly |a lot |far |way )?(?:to the |toward(?:s)? the |towards |up |down )?(north|south|east|west|up|down|left|right)(?:wards?)?(?: (?:a (?:little|bit|lot)|more|some))?$/);
  if (dir) {
    const amount = /a lot|far|way/.test(t) ? 3 : /little|bit|slightly/.test(t) ? 0.4 : 1;
    const step = 20 * amount;
    const d = dir[1];
    const v = { north: [step, 0], up: [step, 0], south: [-step, 0], down: [-step, 0], east: [0, step], right: [0, step], west: [0, -step], left: [0, -step] }[d];
    return { type: 'nudge', dLat: v[0], dLon: v[1], direction: d };
  }

  const rest = t.replace(GOTO, '').replace(/^the /, '').trim();
  const coords = parseCoords(rest);
  if (coords) return { type: 'goto-coords', ...coords };

  const place = findPlace(rest) || findPlace(t);
  if (place) return { type: 'goto', place };
  return null;
}

const NUMS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
const wordNum = (w) => NUMS[w] || parseInt(w, 10);

const DS_NAMES = {
  co2: ['co2', 'co 2', 'c o 2', 'c02', 'carbon dioxide', 'carbon', 'greenhouse gas', 'greenhouse gases'],
  lightning: ['lightning', 'lightening', 'thunderstorms', 'thunder', 'flashes'],
  aerosols: ['aerosols', 'aerosol', 'dust', 'smoke', 'particles', 'sea salt'],
  forest: ['forest height', 'forest', 'forests', 'trees', 'tree height', 'canopy', 'gedi'],
  airquality: ['air quality', 'pollution', 'air pollution', 'smog', 'the air'],
  river: ['atmospheric river', 'atmospheric rivers', 'river data', 'water vapor', 'water vapour', 'rain', 'pineapple express'],
};
export function findDatasetByName(t) {
  const text = ` ${t.replace(/ (data|layer|story|map|sound)$/, '')} `;
  let best = null;
  for (const [id, names] of Object.entries(DS_NAMES)) for (const n of names) {
    if (text.includes(` ${n} `) && (!best || n.length > best.n.length)) best = { n, id };
  }
  return best ? DATASETS.find((d) => d.id === best.id) : null;
}

function parseCoords(t) {
  const m = t.match(/^(?:coordinates |latitude |lat )?(-?\d+(?:\.\d+)?)\s*(?:degrees?|°)?\s*(north|south|n|s)?[\s,]+(?:and |by |longitude |lon )?(-?\d+(?:\.\d+)?)\s*(?:degrees?|°)?\s*(east|west|e|w)?$/);
  if (!m) return null;
  let lat = parseFloat(m[1]), lon = parseFloat(m[3]);
  if (m[2] && m[2][0] === 's') lat = -Math.abs(lat);
  if (m[4] && m[4][0] === 'w') lon = -Math.abs(lon);
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

const NAMES = PLACES.flatMap((p) => [p.name, ...(p.aliases || [])].map((n) => ({ n: n.toLowerCase().replace(/^the /, ''), p })));

export function findPlace(t) {
  if (!t) return null;
  const text = ` ${t.replace(/^the /, '')} `;
  let best = null;
  for (const { n, p } of NAMES) {
    if (text.includes(` ${n} `) && (!best || n.length > best.n.length)) best = { n, p };
  }
  if (best) return best.p;
  // Fuzzy fallback for typos and mishearings ("sahar", "greenlands").
  let fuzzy = null, score = Infinity;
  const target = t.replace(/^the /, '');
  for (const { n, p } of NAMES) {
    const d = levenshtein(target, n) / Math.max(n.length, 4);
    if (d < score) { score = d; fuzzy = p; }
  }
  return score <= 0.28 ? fuzzy : null;
}

function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m || !n) return m || n;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

/** Shown in the help panel and read aloud by "help". One source of truth. */
export const HELP = [
  { group: 'Travel', items: [
    ['“Take me to the Amazon”', 'Fly to a place (continents, oceans, regions, cities)'],
    ['“Go to 40 north 74 west”', 'Fly to coordinates'],
    ['“Zoom in” / “Zoom out a lot”', 'Change altitude'],
    ['“Go north” / “Move left a little”', 'Shift the view'],
    ['“Take me on a tour”, then “next”', 'Guided tour of Earth stories'],
    ['“Show the whole Earth”', 'Back to the starting view'],
  ] },
  { group: 'Listen', items: [
    ['“Play” / “Stop”', 'Hear the data under the crosshair'],
    ['“Louder” / “Quieter”', 'Volume'],
    ['“Switch to latitude”', 'Change data layer'],
    ['“What am I hearing?”', 'Explain how the data becomes sound'],
  ] },
  { group: 'Data', items: [
    ['(fly anywhere)', 'Data options pop up at the top of the globe for that region'],
    ['“Open lightning” / “Open number 2”', 'Open a data story in a pop-up and hear it'],
    ['“What data is here?”', 'Read the options for this region'],
    ['“Pause” / “Play” / “Describe”', 'Control the open pop-up'],
    ['“Close”', 'Back to the globe'],
  ] },
  { group: 'Intro', items: [
    ['“Play the intro”', 'Hear the one-minute journey around Earth'],
    ['“Skip”', 'Leave the intro and go to the globe'],
  ] },
  { group: 'Ask', items: [
    ['“Where am I?”', 'Describe the spot under the crosshair'],
    ['“What places can I visit?”', 'List destinations'],
    ['“Stop talking” / “Talk to me”', 'Turn spoken replies off or on'],
    ['“Stop listening”', 'Turn the microphone off'],
  ] },
];

export const KEYS = [
  ['Arrow keys', 'Move north, south, east, west (hold Shift for bigger steps)'],
  ['+ / −', 'Zoom in / out'],
  ['V', 'Voice control on/off'],
  ['/', 'Jump to the command box'],
  ['D', 'Describe this spot'],
  ['P', 'Play / stop sound'],
  ['1 – 6', 'Open a data option shown at the top'],
  ['T, N, B', 'Start tour, next stop, back'],
  ['R', 'Reset view'],
  ['S', 'Spoken responses on/off'],
  ['H', 'Open help'],
  ['Esc', 'Stop sound, tour and listening'],
];

/**
 * Best-guess command for something we couldn't parse, so the narrator can say "Did you mean …?".
 * Looser than parse(): looks for a place or data story hiding in the words.
 */
export function suggest(input) {
  const t = normalize(input);
  if (!t) return null;
  const ds = findDatasetByName(t);
  if (ds) return `open ${ds.title.toLowerCase()}`;
  const words = t.split(' ');
  let best = null, score = Infinity;
  for (let len = 1; len <= Math.min(3, words.length); len++) {
    for (let i = 0; i + len <= words.length; i++) {
      const chunk = words.slice(i, i + len).join(' ');
      if (chunk.length < 4) continue;
      for (const { n, p } of NAMES) {
        const d = levenshtein(chunk, n) / Math.max(n.length, 4);
        if (d < score) { score = d; best = p; }
      }
    }
  }
  if (best && score <= 0.4) return `go to ${best.name.replace(/^the /, '')}`;
  if (/\b(zoom|closer|far)\b/.test(t)) return 'zoom in';
  if (/\b(where|what)\b/.test(t)) return 'where am I';
  if (/\b(sound|music|hear|listen)\b/.test(t)) return 'play';
  return null;
}
