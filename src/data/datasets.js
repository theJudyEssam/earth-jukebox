// The Earth Jukebox catalog: six NASA SVS visualizations (most are EIC hyperwall pieces).
// Each entry says where on Earth it shows up as an option, what media to show, and how it sounds.
//
// Media is streamed from svs.gsfc.nasa.gov. Run `python3 tools/fetch_svs.py` once to mirror it into
// data/svs/<id>/ — then the app reads the frames' pixels directly (live analysis) and works offline.
//
// `levels` are rough relative intensities (0–1) per place, used only as a fallback when the browser
// isn't allowed to read the remote frames' pixels. The UI says so when that happens.

const SVS = 'https://svs.gsfc.nasa.gov/vis/a000000/';

export const DATASETS = [
  {
    id: 'co2',
    svs: 5196,
    title: 'Carbon dioxide',
    subtitle: 'Global CO₂ flowing with the winds, Jan–Mar 2020 (GEOS model)',
    mode: 'co2',
    global: true,
    description: 'Carbon dioxide moving through the atmosphere for three months in early 2020, from NASA\'s high-resolution GEOS model. Plumes stream off North America, Europe and East Asia, and you can see the planet "breathe" each day as plants, fires and cities add and remove CO₂.',
    mapping: 'Brighter, denser CO₂ plumes raise the pitch and open up the drone. Daily changes become a slow breathing swell. Where the plumes sit, left or right on screen, sets the stereo position.',
    media: [
      { label: 'Tilted globe', type: 'video', file: 'co2_globe_tilt_1080p30.mp4', url: SVS + 'a005100/a005196/dyamondPointCloud_12-4-2023b_dyamond_co2_anim_globe_tilt_1080p30.mp4', poster: SVS + 'a005100/a005196/dyamondPointCloud_12-4-2023b_dyamond_co2_anim_globe_tilt_3x3Hyperwall.01085_print.jpg', size: '24.5 MB' },
    ],
    colorbar: SVS + 'a005100/a005196/dyamondCbar_6-27-2024a_print.jpg',
    regions: ['north-america', 'europe', 'asia', 'new-york', 'beijing', 'tokyo', 'london', 'hawaii', 'amazon', 'africa'],
    notes: {
      hawaii: 'Mauna Loa, below you, has measured CO₂ since 1958. The level has risen from about 315 to over 420 parts per million.',
      'north-america': 'Watch the plumes pour off the East Coast and ride the jet stream over the Atlantic.',
      asia: 'East Asia is the biggest single source of the plumes in this visualization.',
      europe: 'European emissions merge with plumes that arrive from North America.',
      amazon: 'The Amazon pulls CO₂ out of the air by day and breathes some back at night.',
    },
    default: 'In this northern winter, CO₂ builds up over the industrial mid-latitudes of the Northern Hemisphere.',
    levels: { 'north-america': 0.8, europe: 0.75, asia: 0.9, beijing: 0.95, 'new-york': 0.85, tokyo: 0.8, london: 0.75, amazon: 0.4, africa: 0.45, _: 0.5 },
    credit: 'NASA Scientific Visualization Studio, GEOS / DYAMOND',
  },
  {
    id: 'lightning',
    svs: 5011,
    title: 'Lightning',
    subtitle: 'Every flash seen from the ISS, 2017–2023',
    mode: 'lightning',
    description: 'Every lightning flash detected by the Lightning Imaging Sensor on the International Space Station from 2017 to 2023, shown as a rolling ten-day window. Lightning is far more common over land than over the ocean, and it marches north and south with the seasons.',
    mapping: 'Each flash becomes a drum hit, placed left or right where it appears on screen. More flashes make a busier rhythm. When storms go quiet, so does the music.',
    media: [
      { label: 'Globe, 2017–2023', type: 'video', file: 'lightning_sphere_1080p.mp4', big: true, url: SVS + 'a005000/a005011/iss_lightning_sphere_07312023.mp4', poster: SVS + 'a005000/a005011/iss_lightning_preview.jpg', size: '127 MB (streams)' },
      { label: 'Yearly map', type: 'image', file: 'lightning_yearly_map.jpg', url: SVS + 'a005000/a005011/iss_lightning_sos_yearly_debug_2023_sos_2048p60.00420_print.jpg', size: '50 KB' },
    ],
    regions: ['congo', 'lake-maracaibo', 'great-plains', 'amazon', 'himalayas', 'india', 'bay-of-bengal', 'borneo', 'africa', 'south-america', 'gulf-of-mexico', 'caribbean', 'australia'],
    landBand: 35, // also offered over any land within 35° of the equator
    notes: {
      'lake-maracaibo': 'You are over the lightning capital of the world. Storms flash here on most nights of the year.',
      congo: 'The Congo Basin is the largest lightning hotspot region on Earth.',
      'great-plains': 'Spring and summer supercells make the Great Plains crackle.',
      himalayas: 'The foothills of the Himalayas light up before and during the monsoon.',
      'bay-of-bengal': 'Pre-monsoon storms over Bangladesh are some of the most electric anywhere.',
    },
    default: 'Most lightning strikes over tropical land in the afternoon, when the ground heats the air.',
    levels: { 'lake-maracaibo': 1, congo: 0.95, 'great-plains': 0.7, himalayas: 0.7, 'bay-of-bengal': 0.75, amazon: 0.65, borneo: 0.6, india: 0.6, africa: 0.75, _: 0.35 },
    credit: 'NASA Scientific Visualization Studio, ISS LIS data from GHRC',
  },
  {
    id: 'aerosols',
    svs: 5669,
    title: 'Aerosols',
    subtitle: 'Dust, smoke, sea salt and sulfates on 19 August 2025',
    mode: 'aerosols',
    description: 'A snapshot of the particles in the air on 19 August 2025 from NASA\'s GEOS model. Blue is sea salt whipped up by winds, including Hurricane Erin. Pink is Saharan dust. Orange and red is smoke from fires in Africa and Spain. Green is sulfate from pollution and volcanoes such as Kīlauea and Etna.',
    mapping: 'The image is played like a musical score, swept slowly from left to right. Each particle type has its own instrument: sea salt is surf, dust is a sandy hiss, smoke is a low crackling rumble, and sulfates are a glassy chord. The louder each instrument, the more of that colour is in the sweep.',
    media: [
      { label: 'Global snapshot', type: 'image', file: 'aerosols_1920x1080.png', url: SVS + 'a005600/a005669/Aerosols_2025-08-19T20_00_00_1920x1080.png', size: '2.6 MB' },
    ],
    colorbar: SVS + 'a005600/a005669/Aerosols_cbar.png',
    regions: ['sahara', 'atlantic', 'caribbean', 'africa', 'mediterranean', 'europe', 'india', 'gulf-of-mexico', 'hawaii', 'congo', 'cairo', 'lagos', 'beijing', 'indian', 'southern-ocean'],
    notes: {
      sahara: 'Below you, the Sahara is the source of the pink dust streaming west over the Atlantic.',
      atlantic: 'On this day Hurricane Erin was pulling Saharan dust into its circulation.',
      caribbean: 'Saharan dust often reaches the Caribbean, hazing the sky.',
      africa: 'Orange smoke from agricultural burning covers central and southern Africa in August.',
      hawaii: 'Kīlauea was erupting, so a green sulfate plume trails downwind from it.',
      mediterranean: 'Smoke from wildfires in Spain and sulfate from Mount Etna both appear here.',
      'southern-ocean': 'The strong winds of the Southern Ocean fill the air with sea salt.',
    },
    default: 'Every colour on the map is a different kind of particle you could breathe.',
    levels: { sahara: 0.9, atlantic: 0.6, africa: 0.8, 'southern-ocean': 0.7, _: 0.45 },
    credit: 'NASA Scientific Visualization Studio, GEOS-FP',
  },
  {
    id: 'forest',
    svs: 4950,
    title: 'Forest height',
    subtitle: 'Tree canopy height measured by GEDI lidar from the ISS',
    mode: 'forest',
    description: 'GEDI, a laser on the International Space Station, measures how tall the vegetation is. Brown and dark green mean short vegetation; bright green and white mean tall forest, up to 50 metres or more. Heights are exaggerated in the 3D views.',
    mapping: 'Taller trees play higher notes. As the camera flies over the forest, the melody climbs over tall canopy and drops over fields and grassland. Bright, tall patches add a shimmer.',
    media: [
      { label: 'Global', type: 'video', file: 'gedi_global_1080p.webm', url: SVS + 'a004900/a004950/GEDI_global_w_colorbar_1080p60.webm', poster: SVS + 'a004900/a004950/GEDI_global_w_colorbar_0900_print.jpg', size: '6 MB' },
      { label: 'California coast', type: 'video', file: 'gedi_ca_1080p.webm', url: SVS + 'a004900/a004950/GEDI_CA_w_colorbar_1080p60.webm', poster: SVS + 'a004900/a004950/GEDI_CA_w_colorbar_0850_print.jpg', size: '3.7 MB', places: ['california', 'north-america'] },
      { label: 'Senegal', type: 'video', file: 'gedi_senegal_1080p.webm', url: SVS + 'a004900/a004950/GEDI_senegal_w_colorbar_1080p60.webm', poster: SVS + 'a004900/a004950/GEDI_senegal_w_colorbar.11345_print.jpg', size: '3.8 MB', places: ['sahara', 'lagos', 'africa'] },
      { label: 'Maryland (Goddard)', type: 'video', file: 'gedi_goddard_1080p.webm', url: SVS + 'a004900/a004950/GEDI_Goddard_w_colorbar_1080p60.webm', poster: SVS + 'a004900/a004950/GEDI_Goddard_w_colorbar1394_print.jpg', size: '4.8 MB', places: ['washington', 'new-york'] },
    ],
    colorbar: SVS + 'a004900/a004950/GEDI_colorbar_0to50_01_print.jpg',
    regions: ['amazon', 'congo', 'borneo', 'siberia', 'california', 'madagascar', 'alaska', 'south-america', 'africa', 'washington', 'north-america', 'sahara', 'lagos'],
    notes: {
      amazon: 'The Amazon canopy commonly reaches 30 to 40 metres, with giants taller still.',
      california: 'Coastal redwoods here are the tallest trees on Earth, over 100 metres.',
      borneo: 'Borneo\'s dipterocarp forests are among the tallest tropical forests.',
      congo: 'The Congo rainforest forms a tall, continuous canopy.',
      siberia: 'Boreal forest is shorter but covers an enormous area.',
      sahara: 'South of the Sahara, the Senegal view shows savanna trees thinning out toward the desert.',
    },
    default: 'Tall forests store the most carbon, so their height is a measure of how much carbon they hold.',
    levels: { amazon: 0.85, california: 0.95, borneo: 0.85, congo: 0.8, siberia: 0.45, sahara: 0.1, _: 0.4 },
    credit: 'NASA Scientific Visualization Studio, GEDI (University of Maryland / NASA)',
  },
  {
    id: 'airquality',
    svs: 5533,
    title: 'Air quality',
    subtitle: 'Smoke and pollution in the 2024 North American fire season',
    mode: 'airquality',
    description: 'Carbon monoxide, fine particles (PM2.5), ozone and nitrogen oxides moving across North America during the summer 2024 fire season, from NASA\'s GEOS-CF model. This piece plays on the Earth Information Center hyperwall.',
    mapping: 'A chord swept across the frame from left to right. Clean air plays a calm, open chord. As pollution thickens, the chord tightens and grows tense and rough, and a low pulse speeds up.',
    media: [
      { label: 'Early season', type: 'image', file: 'airquality_0000.png', url: SVS + 'a005500/a005533/AirQuality_Sphere_1920x1080_0000.png', size: '1.1 MB' },
      { label: 'Late season', type: 'image', file: 'airquality_3030.png', url: SVS + 'a005500/a005533/AirQuality_SphereLong_1920x1080_3030.png', size: '0.9 MB' },
      { label: 'Hyperwall movie', type: 'video', file: 'airquality_eic_preview.mp4', big: true, url: SVS + 'a005500/a005533/EIC_AirQuality_Preview_3840x1080.mp4', size: '179 MB (streams)' },
    ],
    regions: ['north-america', 'california', 'great-plains', 'new-york', 'washington', 'gulf-of-mexico', 'alaska', 'mexico-city'],
    notes: {
      california: 'Wildfire smoke from California and the Pacific Northwest drifts east across the continent.',
      'new-york': 'Canadian and western smoke can reach the East Coast, turning skies orange, as it did in 2023.',
      alaska: 'Boreal fires in Alaska and Canada send carbon monoxide high into the atmosphere.',
    },
    default: 'Smoke doesn\'t stop at borders: fires in one place shape the air that people far away breathe.',
    levels: { california: 0.85, alaska: 0.7, 'north-america': 0.65, _: 0.5 },
    credit: 'NASA Scientific Visualization Studio, GEOS-CF',
  },
  {
    id: 'river',
    svs: 4960,
    title: 'Atmospheric river',
    subtitle: 'A river of water vapour reaching the US West Coast (MERRA-2)',
    mode: 'river',
    description: 'A 3D view of an atmospheric river: a long, narrow band of water vapour carrying tropical moisture to the US West Coast, where it falls as heavy rain and snow. Blue shows the water vapour moving through the air, with clouds and precipitation around it. This version is narrated, with captions.',
    mapping: 'The amount of blue water vapour swells a deep, wave-like drone. Bright clouds and rain add raindrop ticks that get denser as the storm reaches land.',
    media: [
      { label: 'Narrated', type: 'video', file: 'atmos_rivers_narrated_HD.webm', url: SVS + 'a004900/a004960/atmos_rivers_narrated_HD.webm', poster: SVS + 'a004900/a004960/atmos_rivers_narrated_4k.00090_print.jpg', captions: SVS + 'a004900/a004960/atmos_river_narrated_4k.en_US.vtt', captionsFile: 'atmos_river_narrated.en_US.vtt', size: '69 MB (streams)', narrated: true },
    ],
    colorbar: SVS + 'a004900/a004960/atmo_rivers_cbars01_print.jpg',
    regions: ['california', 'pacific', 'hawaii', 'alaska'],
    notes: {
      california: 'Atmospheric rivers deliver up to half of California\'s yearly rain and snow in just a few storms.',
      hawaii: 'Rivers that start near Hawaii and hit California are nicknamed the Pineapple Express.',
      pacific: 'Out here, tropical moisture gathers into a narrow band. A strong one carries many times the flow of the Mississippi River, as vapour.',
    },
    default: 'Atmospheric rivers can end droughts, or cause floods and landslides.',
    levels: { california: 0.9, pacific: 0.7, hawaii: 0.75, _: 0.5 },
    credit: 'NASA Scientific Visualization Studio, MERRA-2',
  },
];

export const findDataset = (id) => DATASETS.find((d) => d.id === id);

/** Local mirror path (filled by tools/fetch_svs.py). */
export const localPath = (ds, file) => `data/svs/${ds.id}/${file}`;
