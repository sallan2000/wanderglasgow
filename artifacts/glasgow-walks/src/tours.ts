// Attraction categories are owner-managed; these remain the original tour categories.
export type Theme = string;
export const DEFAULT_CATEGORIES = ['Art', 'Music', 'History', 'Sport'];
export type Stop = { name: string; place: string; lat: number; lon: number; story: string };
export type Tour = {
  id: string;
  theme: Theme;
  title: string;
  subtitle: string;
  distanceKm: number;
  minutes: number;
  start: string;
  stops: Stop[];
};

export const tours: Tour[] = [
  {
    id: 'art-mile',
    theme: 'Art',
    title: 'The Art School to the river',
    subtitle: 'Mackintosh lines, civic grandeur and the city’s most loved collection.',
    distanceKm: 2.9, minutes: 39, start: 'Glasgow School of Art',
    stops: [
      { name: 'Glasgow School of Art', place: 'Renfrew Street', lat: 55.8653, lon: -4.2631, story: 'The Mackintosh building is a landmark of modern design, badly damaged by fire in 2018. This stop is an exterior viewpoint; do not expect access to the building.' },
      { name: 'The Lighthouse', place: 'Mitchell Lane', lat: 55.8596561, lon: -4.255458, story: 'A former newspaper building designed by Mackintosh, later used as a centre for architecture and design. Admire the exterior; check official access information before planning an indoor visit.' },
      { name: 'Gallery of Modern Art', place: 'Royal Exchange Square', lat: 55.8601675, lon: -4.2526408, story: 'GoMA occupies a handsome neoclassical mansion in the middle of the city. Its changing exhibitions put international contemporary art in a very Glasgow setting.' },
      { name: 'Barras Art and Design', place: 'Gallowgate', lat: 55.8545597, lon: -4.2372088, story: 'A lively East End market area with a long tradition of independent makers, vintage finds and street-level creativity.' },
    ],
  },
  {
    id: 'kelvingrove-culture',
    theme: 'Art',
    title: 'West End wonders',
    subtitle: 'An art collection, university cloisters and West End lanes.',
    distanceKm: 1.4, minutes: 19, start: 'Kelvingrove Art Gallery and Museum',
    stops: [
      { name: 'Kelvingrove Art Gallery and Museum', place: 'Argyle Street', lat: 55.8686, lon: -4.2905, story: 'A Glasgow favourite since 1901, with everything from Salvador Dalí to natural history beneath its ornate red sandstone roof.' },
      { name: 'University of Glasgow Cloisters', place: 'University Avenue', lat: 55.8716587, lon: -4.2883961, story: 'The vaulted arches beneath the Gilbert Scott building are among the city’s most memorable spaces. Look up: every stone seems to have a story.' },
      { name: 'Ashton Lane', place: 'Hillhead', lat: 55.8736982, lon: -4.2931079, story: 'A cobbled lane tucked behind Byres Road, known for its little lights, old tenements and lively independent bars.' },
    ],
  },
  {
    id: 'sound-of-the-city',
    theme: 'Music',
    title: 'The sound of the city',
    subtitle: 'From the Barrowlands glow to the venues that made a scene.',
    distanceKm: 2.7, minutes: 37, start: 'Barrowland Ballroom',
    stops: [
      { name: 'Barrowland Ballroom', place: 'Gallowgate', lat: 55.855084, lon: -4.2367353, story: 'The neon arch has welcomed generations of gig-goers. Opened in 1934, the Barrowland remains one of the UK’s most treasured live music rooms.' },
      { name: 'St Luke’s', place: 'Gallowgate', lat: 55.8546665, lon: -4.2345948, story: 'A beautifully restored former church turned music and arts venue, right in the heart of the East End.' },
      { name: 'The Britannia Panopticon', place: 'Trongate', lat: 55.8569611, lon: -4.2470152, story: 'The world’s oldest surviving music hall. Stan Laurel made his stage debut here in 1906.' },
      { name: 'King Tut’s Wah Wah Hut', place: 'St Vincent Street', lat: 55.862618, lon: -4.2649646, story: 'A tiny room with a huge reputation: Oasis were famously signed after playing here in 1993.' },
    ],
  },
  {
    id: 'west-end-sessions',
    theme: 'Music',
    title: 'West End after hours',
    subtitle: 'A mellow ramble through record shops, old halls and gig-night streets.',
    distanceKm: 1.5, minutes: 21, start: 'Òran Mór',
    stops: [
      { name: 'Òran Mór', place: 'Byres Road', lat: 55.8775552, lon: -4.2897025, story: 'A former church with a painted ceiling and a second life as a celebrated venue for music, theatre and the short lunchtime play.' },
      { name: 'The Doublet', place: 'Park Road', lat: 55.8730818, lon: -4.2793522, story: 'A snug neighbourhood institution: a good place to pause and imagine the West End between gigs.' },
      { name: 'The Hug and Pint', place: 'Great Western Road', lat: 55.8722036, lon: -4.2723707, story: 'An intimate independent venue where Glasgow’s adventurous live music scene keeps finding new voices.' },
    ],
  },
  {
    id: 'medieval-glasgow',
    theme: 'History',
    title: 'Old Glasgow, layer by layer',
    subtitle: 'Follow the oldest streets from the cathedral down to the river.',
    distanceKm: 2.8, minutes: 38, start: 'Glasgow Cathedral',
    stops: [
      { name: 'Glasgow Cathedral', place: 'Castle Street', lat: 55.8629, lon: -4.2344, story: 'The city’s medieval heart, and one of Scotland’s finest surviving Gothic buildings. St Mungo’s tomb lies in the lower church.' },
      { name: 'The Necropolis', place: 'Castle Street', lat: 55.8622, lon: -4.2298, story: 'A Victorian garden cemetery on a hill above the cathedral, with elaborate monuments and a remarkable panorama.' },
      { name: 'Provand’s Lordship', place: 'Castle Street', lat: 55.8623705, lon: -4.2369257, story: 'Built around 1471, this is Glasgow’s oldest surviving house. The adjoining St Nicholas Garden is a peaceful pocket of medieval-inspired planting.' },
      { name: 'Trongate', place: 'City Centre', lat: 55.8557, lon: -4.2480, story: 'One of Glasgow’s oldest streets, once the way in from the east and still lined with layers of civic and mercantile history.' },
    ],
  },
  {
    id: 'merchant-city',
    theme: 'History',
    title: 'Merchants, makers & monuments',
    subtitle: 'A city-centre walk through Glasgow’s mercantile past.',
    distanceKm: 1.3, minutes: 18, start: 'George Square',
    stops: [
      { name: 'George Square', place: 'City Chambers', lat: 55.8610, lon: -4.2505, story: 'Surrounded by Victorian architecture and monuments, the square has been Glasgow’s civic gathering place since the 18th century.' },
      { name: 'City Chambers', place: 'George Square', lat: 55.8608, lon: -4.2498, story: 'The grand marble staircase and Italianate façade tell the story of the wealth and confidence of Victorian Glasgow.' },
      { name: 'Merchant City', place: 'Trongate', lat: 55.8552, lon: -4.2470, story: 'Warehouses built for tobacco and textile merchants have become a district of independent shops, studios and restaurants.' },
      { name: 'Clyde Street', place: 'River Clyde', lat: 55.8565, lon: -4.2513, story: 'Look south to the Clyde, once the engine room of shipbuilding and trade that gave Glasgow its global reach.' },
    ],
  },
  {
    id: 'football-glasgow',
    theme: 'Sport',
    title: 'Football’s East End',
    subtitle: 'Stadium architecture, local pride and the city’s match-day rituals.',
    distanceKm: 1.7, minutes: 24, start: 'Celtic Park',
    stops: [
      { name: 'Celtic Park', place: 'Kerrydale Street', lat: 55.8501815, lon: -4.2068227, story: 'One of Europe’s largest club grounds. Celtic was founded in 1888 with charitable aims; the club moved to this stadium site in 1892.' },
      { name: 'Barrowfield', place: 'East End', lat: 55.851342, lon: -4.2125805, story: 'An East End neighbourhood with deep links to Glasgow football and the club’s historic training ground. This is a street-level stop, not a training-ground visit.' },
      { name: 'Emirates Arena', place: 'London Road', lat: 55.8464908, lon: -4.2085735, story: 'A striking indoor arena and velodrome, built for the 2014 Commonwealth Games and home to Scotland’s national cycling centre.' },
    ],
  },
  {
    id: 'commonwealth-mile',
    theme: 'Sport',
    title: 'Commonwealth stories',
    subtitle: 'The lasting legacy of Glasgow 2014, found on foot.',
    distanceKm: 2.4, minutes: 32, start: 'Glasgow Green',
    stops: [
      { name: 'Glasgow Green', place: 'Saltmarket', lat: 55.8497, lon: -4.2330, story: 'The city’s oldest public park is beside the Glasgow National Hockey Centre, which hosted hockey during the 2014 Commonwealth Games.' },
      { name: 'Sir Chris Hoy Velodrome', place: 'London Road', lat: 55.8473824, lon: -4.207985, story: 'Named for the six-time Olympic cycling champion, the velodrome helped put Glasgow on the international sporting map.' },
      { name: 'Celtic Park', place: 'Kerrydale Street', lat: 55.8501815, lon: -4.2068227, story: 'Celtic Park hosted the opening ceremony of the 2014 Commonwealth Games. Admire the stadium exterior and check access arrangements before visiting.' },
    ],
  },
];