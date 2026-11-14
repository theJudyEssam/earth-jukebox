// Gazetteer for voice navigation and spoken descriptions.
// radius (km) says how far "over X" stretches; distance is the camera distance to use when flying there
// (Earth radius = 1). `note` hints at the data that will play there in phase 2.

const C = 2.6, R = 1.9, L = 1.45, O = 2.9; // continent, region, local, ocean zooms

export const PLACES = [
  // Continents
  { id: 'africa', name: 'Africa', lat: 3, lon: 20, kind: 'continent', radius: 3600, distance: C, blurb: 'The second-largest continent, from the Mediterranean coast through the Sahara and the Congo rainforest to the Cape.' },
  { id: 'europe', name: 'Europe', lat: 52, lon: 15, kind: 'continent', radius: 1900, distance: C, blurb: 'A small, densely populated continent warming faster than the global average.' },
  { id: 'asia', name: 'Asia', lat: 45, lon: 90, kind: 'continent', radius: 4500, distance: C, blurb: 'The largest continent, home to more than half the world\'s people, the Himalayas and the Siberian forests.' },
  { id: 'north-america', name: 'North America', lat: 45, lon: -100, kind: 'continent', radius: 3500, distance: C, blurb: 'From the Arctic islands of Canada to the tropics of Central America.' },
  { id: 'south-america', name: 'South America', lat: -15, lon: -60, kind: 'continent', radius: 3300, distance: C, blurb: 'Home to the Amazon rainforest and the Andes, the longest mountain range on land.' },
  { id: 'australia', name: 'Australia', aliases: ['oceania'], lat: -25, lon: 134, kind: 'continent', radius: 2200, distance: C, blurb: 'The driest inhabited continent, ringed by coral reefs.' },
  { id: 'antarctica', name: 'Antarctica', aliases: ['south pole', 'the south pole'], lat: -82, lon: 0, kind: 'continent', radius: 2600, distance: C, blurb: 'A continent of ice up to four kilometres thick, holding most of the fresh water on Earth.' },

  // Oceans and seas
  { id: 'pacific', name: 'the Pacific Ocean', aliases: ['pacific', 'pacific ocean'], lat: 0, lon: -160, kind: 'ocean', radius: 7000, distance: O, blurb: 'The largest and deepest ocean, covering about a third of the planet. El Niño begins here.' },
  { id: 'atlantic', name: 'the Atlantic Ocean', aliases: ['atlantic', 'atlantic ocean'], lat: 15, lon: -40, kind: 'ocean', radius: 4500, distance: O, blurb: 'Its currents, like the Gulf Stream, carry tropical heat toward Europe.' },
  { id: 'indian', name: 'the Indian Ocean', aliases: ['indian ocean'], lat: -20, lon: 78, kind: 'ocean', radius: 4200, distance: O, blurb: 'The warmest ocean, which drives the South Asian monsoon.' },
  { id: 'arctic', name: 'the Arctic', aliases: ['arctic', 'arctic ocean', 'north pole', 'the north pole'], lat: 84, lon: 0, kind: 'ocean', radius: 2200, distance: C, blurb: 'Sea ice here has shrunk sharply since satellite records began in 1979.', note: 'arctic sea ice' },
  { id: 'southern-ocean', name: 'the Southern Ocean', aliases: ['southern ocean'], lat: -60, lon: 60, kind: 'ocean', radius: 3500, distance: O, blurb: 'The ocean that circles Antarctica and absorbs a large share of the heat and carbon we add to the air.' },
  { id: 'mediterranean', name: 'the Mediterranean Sea', aliases: ['mediterranean', 'mediterranean sea'], lat: 36, lon: 16, kind: 'sea', radius: 1300, distance: R, blurb: 'An almost enclosed sea between Europe and Africa, now seeing frequent marine heatwaves.' },
  { id: 'caribbean', name: 'the Caribbean Sea', aliases: ['caribbean', 'caribbean sea'], lat: 15, lon: -75, kind: 'sea', radius: 1200, distance: R, blurb: 'Warm waters that feed Atlantic hurricanes.' },
  { id: 'gulf-of-mexico', name: 'the Gulf of Mexico', aliases: ['gulf of mexico', 'gulf of america'], lat: 25, lon: -90, kind: 'sea', radius: 800, distance: R, blurb: 'A warm gulf where hurricanes often strengthen before landfall.' },
  { id: 'bay-of-bengal', name: 'the Bay of Bengal', aliases: ['bay of bengal'], lat: 15, lon: 88, kind: 'sea', radius: 800, distance: R, blurb: 'Where many of the strongest tropical cyclones of the Indian Ocean form.' },

  // Regions and landscapes
  { id: 'amazon', name: 'the Amazon rainforest', aliases: ['amazon', 'the amazon', 'amazon rainforest', 'amazon rain forest', 'brazil'], lat: -4, lon: -62, kind: 'forest', radius: 1600, distance: R, blurb: 'The largest tropical rainforest on Earth. It breathes out much of its own rain.', note: 'forest height' },
  { id: 'sahara', name: 'the Sahara', aliases: ['sahara', 'sahara desert'], lat: 23, lon: 12, kind: 'desert', radius: 1800, distance: R, blurb: 'The largest hot desert. Its dust crosses the Atlantic and helps fertilise the Amazon.', note: 'dust aerosols' },
  { id: 'congo', name: 'the Congo Basin', aliases: ['congo', 'congo basin', 'congo rainforest'], lat: -1, lon: 22, kind: 'forest', radius: 900, distance: R, blurb: 'The second-largest rainforest and one of the world\'s lightning hotspots.', note: 'lightning' },
  { id: 'greenland', name: 'Greenland', lat: 72, lon: -40, kind: 'ice', radius: 1200, distance: R, blurb: 'Its ice sheet loses hundreds of billions of tonnes of ice each year, raising sea level.' },
  { id: 'himalayas', name: 'the Himalayas', aliases: ['himalayas', 'himalaya', 'everest', 'mount everest', 'tibet'], lat: 29, lon: 85, kind: 'mountains', radius: 900, distance: R, blurb: 'The highest mountains on Earth. Their glaciers feed rivers for nearly two billion people.' },
  { id: 'siberia', name: 'Siberia', lat: 62, lon: 100, kind: 'forest', radius: 2200, distance: C, blurb: 'Vast boreal forest and permafrost that is thawing as the Arctic warms.' },
  { id: 'andes', name: 'the Andes', aliases: ['andes', 'andes mountains'], lat: -20, lon: -68, kind: 'mountains', radius: 900, distance: R, blurb: 'The longest mountain range on land, running the length of South America.' },
  { id: 'atacama', name: 'the Atacama Desert', aliases: ['atacama', 'atacama desert'], lat: -24, lon: -69.5, kind: 'desert', radius: 400, distance: L, blurb: 'One of the driest places on Earth.' },
  { id: 'gobi', name: 'the Gobi Desert', aliases: ['gobi', 'gobi desert', 'mongolia'], lat: 43, lon: 105, kind: 'desert', radius: 800, distance: R, blurb: 'A cold desert whose dust storms reach across East Asia.' },
  { id: 'great-barrier-reef', name: 'the Great Barrier Reef', aliases: ['great barrier reef', 'barrier reef', 'coral reef'], lat: -18, lon: 147, kind: 'reef', radius: 700, distance: L, blurb: 'The largest coral reef system, repeatedly bleached by marine heatwaves.' },
  { id: 'borneo', name: 'Borneo', lat: 0.5, lon: 114, kind: 'forest', radius: 600, distance: L, blurb: 'An island of ancient rainforest and peatland, under pressure from fires and clearing.' },
  { id: 'madagascar', name: 'Madagascar', lat: -19, lon: 47, kind: 'island', radius: 600, distance: L, blurb: 'An island where most plants and animals are found nowhere else.' },
  { id: 'iceland', name: 'Iceland', lat: 65, lon: -18, kind: 'island', radius: 300, distance: L, blurb: 'A volcanic island on the Mid-Atlantic Ridge, with shrinking glaciers.' },
  { id: 'hawaii', name: 'Hawaii', aliases: ['hawaii', 'mauna loa'], lat: 20, lon: -157, kind: 'island', radius: 400, distance: L, blurb: 'Home of Mauna Loa, where the longest record of carbon dioxide in the air has been kept since 1958.', note: 'carbon dioxide' },
  { id: 'alaska', name: 'Alaska', lat: 64, lon: -152, kind: 'region', radius: 1000, distance: R, blurb: 'Arctic tundra and glaciers, warming about twice as fast as the global average.' },
  { id: 'california', name: 'California', lat: 37, lon: -120, kind: 'region', radius: 600, distance: L, blurb: 'Drenched by atmospheric rivers in winter and scorched by wildfires in summer.', note: 'atmospheric rivers' },
  { id: 'patagonia', name: 'Patagonia', lat: -48, lon: -70, kind: 'region', radius: 800, distance: R, blurb: 'Windswept steppe and the Southern Patagonian Ice Field.' },
  { id: 'nile', name: 'the Nile', aliases: ['nile', 'nile river', 'nile delta', 'egypt'], lat: 27, lon: 31, kind: 'river', radius: 700, distance: R, blurb: 'The Nile is a green ribbon of life through the desert, and its delta is threatened by rising seas.' },
  { id: 'india', name: 'India', lat: 22, lon: 79, kind: 'country', radius: 1300, distance: R, blurb: 'Its monsoon rains water the crops of more than a billion people.' },
  { id: 'great-plains', name: 'the Great Plains', aliases: ['great plains', 'tornado alley'], lat: 39, lon: -100, kind: 'region', radius: 800, distance: R, blurb: 'Grassland and farmland under some of the most violent thunderstorms on Earth.', note: 'lightning' },
  { id: 'lake-maracaibo', name: 'Lake Maracaibo', aliases: ['maracaibo', 'lake maracaibo', 'venezuela'], lat: 9.8, lon: -71.6, kind: 'lake', radius: 250, distance: L, blurb: 'The lightning capital of the world, with storms on most nights of the year.', note: 'lightning' },

  // Cities
  { id: 'new-york', name: 'New York', aliases: ['new york city', 'nyc'], lat: 40.7, lon: -74, kind: 'city', radius: 200, distance: L, blurb: 'A coastal megacity facing higher seas and storm surges.' },
  { id: 'washington', name: 'Washington, D.C.', aliases: ['washington', 'washington dc', 'dc', 'nasa', 'nasa headquarters', 'goddard'], lat: 38.9, lon: -77, kind: 'city', radius: 200, distance: L, blurb: 'Home of NASA Headquarters and the Earth Information Center.' },
  { id: 'london', name: 'London', lat: 51.5, lon: -0.1, kind: 'city', radius: 200, distance: L, blurb: 'A city on the tidal Thames, protected by the Thames Barrier.' },
  { id: 'cairo', name: 'Cairo', lat: 30, lon: 31.2, kind: 'city', radius: 200, distance: L, blurb: 'Africa\'s largest city, at the head of the Nile Delta.' },
  { id: 'lagos', name: 'Lagos', lat: 6.5, lon: 3.4, kind: 'city', radius: 200, distance: L, blurb: 'One of the fastest-growing cities on Earth, on a low-lying coast.' },
  { id: 'mumbai', name: 'Mumbai', lat: 19, lon: 72.8, kind: 'city', radius: 200, distance: L, blurb: 'A coastal megacity that floods in heavy monsoon rain.' },
  { id: 'beijing', name: 'Beijing', lat: 39.9, lon: 116.4, kind: 'city', radius: 200, distance: L, blurb: 'A capital that has cut its air pollution sharply since 2013.', note: 'air quality' },
  { id: 'tokyo', name: 'Tokyo', lat: 35.7, lon: 139.7, kind: 'city', radius: 200, distance: L, blurb: 'The largest metropolitan area on Earth.' },
  { id: 'sydney', name: 'Sydney', lat: -33.9, lon: 151.2, kind: 'city', radius: 200, distance: L, blurb: 'A harbour city on Australia\'s east coast.' },
  { id: 'rio', name: 'Rio de Janeiro', aliases: ['rio', 'rio de janeiro'], lat: -22.9, lon: -43.2, kind: 'city', radius: 200, distance: L, blurb: 'A city between mountains and the Atlantic.' },
  { id: 'mexico-city', name: 'Mexico City', lat: 19.4, lon: -99.1, kind: 'city', radius: 200, distance: L, blurb: 'A high-altitude megacity that is slowly sinking as groundwater is pumped out.' },
];

/** A short guided tour, in order. Each stop gets a line about the data you'll hear there in phase 2. */
export const TOUR = [
  { id: 'hawaii', say: 'This is where humanity first measured the steady rise of carbon dioxide.' },
  { id: 'amazon', say: 'Later you will hear forest height as pitch: tall trees sing high.' },
  { id: 'sahara', say: 'Dust from here becomes a rushing texture as it blows west over the ocean.' },
  { id: 'congo', say: 'Lightning will play here as percussion, one hit per flash.' },
  { id: 'himalayas', say: 'The roof of the world, and the water tower of Asia.' },
  { id: 'greenland', say: 'Melting ice will become a slowly falling tone.' },
  { id: 'great-barrier-reef', say: 'Ocean heat will tighten the harmony here.' },
  { id: 'california', say: 'Atmospheric rivers will swell in like waves when we add the storm data.' },
];

export function findPlaceById(id) { return PLACES.find((p) => p.id === id); }
