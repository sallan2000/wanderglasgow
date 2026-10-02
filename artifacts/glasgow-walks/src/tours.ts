export type Theme = 'Art' | 'Music' | 'History' | 'Sport';
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
    distanceKm: 3.4, minutes: 48, start: 'Glasgow School of Art',
    stops: [
      { name: 'Glasgow School of Art', place: 'Renfrew Street', lat: 55.8653, lon: -4.2631, story: 'Charles Rennie Mackintosh’s masterpiece is a landmark of modern design. Its working studio and striking hilltop silhouette helped shape Glasgow’s own visual language.' },
      { name: 'The Lighthouse', place: 'Mitchell Lane', lat: 55.8608, lon: -4.2532, story: 'A former newspaper building by Mackintosh, now a centre for architecture and design. Climb to the Mackintosh Tower for a fine view across the city.' },
      { name: 'Gallery of Modern Art', place: 'Royal Exchange Square', lat: 55.8609, lon: -4.2516, story: 'GoMA occupies a handsome neoclassical mansion in the middle of the city. Its changing exhibitions put international contemporary art in a very Glasgow setting.' },
      { name: 'Barras Art and Design', place: 'Gallowgate', lat: 55.8517, lon: -4.2397, story: 'A lively East End market with a long tradition of independent makers, vintage finds and street-level creativity.' },
    ],
  },
  {
    id: 'kelvingrove-culture',
    theme: 'Art',
    title: 'West End wonders',
    subtitle: 'A museum, a mural and a quiet stretch beside the Kelvin.',
    distanceKm: 3.1, minutes: 43, start: 'Kelvingrove Art Gallery and Museum',
    stops: [
      { name: 'Kelvingrove Art Gallery and Museum', place: 'Argyle Street', lat: 55.8686, lon: -4.2905, story: 'A Glasgow favourite since 1901, with everything from Salvador Dalí to natural history beneath its ornate red sandstone roof.' },
      { name: 'University of Glasgow Cloisters', place: 'University Avenue', lat: 55.8721, lon: -4.2885, story: 'The vaulted arches beneath the Gilbert Scott building are among the city’s most memorable spaces. Look up: every stone seems to have a story.' },
      { name: 'Ashton Lane', place: 'Hillhead', lat: 55.8744, lon: -4.2948, story: 'A cobbled lane tucked behind Byres Road, known for its little lights, old tenements and lively independent bars.' },
    ],
  },
  {
    id: 'sound-of-the-city',
    theme: 'Music',
    title: 'The sound of the city',
    subtitle: 'From the Barrowlands glow to the venues that made a scene.',
    distanceKm: 3.8, minutes: 52, start: 'Barrowland Ballroom',
    stops: [
      { name: 'Barrowland Ballroom', place: 'Gallowgate', lat: 55.8508, lon: -4.2365, story: 'The neon arch has welcomed generations of gig-goers. Opened in 1934, the Barrowland remains one of the UK’s most treasured live music rooms.' },
      { name: 'St Luke’s', place: 'Gallowgate', lat: 55.8519, lon: -4.2324, story: 'A beautifully restored former church turned music and arts venue, right in the heart of the East End.' },
      { name: 'The Britannia Panopticon', place: 'Trongate', lat: 55.8551, lon: -4.2475, story: 'The world’s oldest surviving music hall. Stan Laurel made his stage debut here in 1906.' },
      { name: 'King Tut’s Wah Wah Hut', place: 'St Vincent Street', lat: 55.8626, lon: -4.2582, story: 'A tiny room with a huge reputation: Oasis were famously signed after playing here in 1993.' },
    ],
  },
  {
    id: 'west-end-sessions',
    theme: 'Music',
    title: 'West End after hours',
    subtitle: 'A mellow ramble through record shops, old halls and gig-night streets.',
    distanceKm: 2.7, minutes: 38, start: 'Òran Mór',
    stops: [
      { name: 'Òran Mór', place: 'Byres Road', lat: 55.8771, lon: -4.2939, story: 'A former church with a painted ceiling and a second life as a celebrated venue for music, theatre and the short lunchtime play.' },
      { name: 'The Hug and Pint', place: 'Great Western Road', lat: 55.8747, lon: -4.2690, story: 'An intimate independent venue where Glasgow’s adventurous live music scene keeps finding new voices.' },
      { name: 'The Doublet', place: 'Park Road', lat: 55.8718, lon: -4.2735, story: 'A snug neighbourhood institution: a good place to pause and imagine the West End between gigs.' },
    ],
  },
  {
    id: 'medieval-glasgow',
    theme: 'History',
    title: 'Old Glasgow, layer by layer',
    subtitle: 'Follow the oldest streets from the cathedral down to the river.',
    distanceKm: 2.9, minutes: 41, start: 'Glasgow Cathedral',
    stops: [
      { name: 'Glasgow Cathedral', place: 'Castle Street', lat: 55.8629, lon: -4.2344, story: 'The city’s medieval heart, and one of Scotland’s finest surviving Gothic buildings. St Mungo’s tomb lies in the lower church.' },
      { name: 'The Necropolis', place: 'Castle Street', lat: 55.8622, lon: -4.2298, story: 'A Victorian garden cemetery on a hill above the cathedral, with elaborate monuments and a remarkable panorama.' },
      { name: 'Provand’s Lordship', place: 'Castle Street', lat: 55.8636, lon: -4.2338, story: 'Built around 1471, this is Glasgow’s oldest surviving house. The adjoining St Nicholas Garden is a peaceful pocket of medieval-inspired planting.' },
      { name: 'Trongate', place: 'City Centre', lat: 55.8557, lon: -4.2480, story: 'One of Glasgow’s oldest streets, once the way in from the east and still lined with layers of civic and mercantile history.' },
    ],
  },
  {
    id: 'merchant-city',
    theme: 'History',
    title: 'Merchants, makers & monuments',
    subtitle: 'A city-centre walk through Glasgow’s mercantile past.',
    distanceKm: 2.5, minutes: 35, start: 'George Square',
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
    distanceKm: 3.6, minutes: 49, start: 'Celtic Park',
    stops: [
      { name: 'Celtic Park', place: 'Kerrydale Street', lat: 55.8497, lon: -4.2055, story: 'One of Europe’s largest club grounds. The stadium was founded in 1888 to raise money for the poor in Glasgow’s East End.' },
      { name: 'Barrowfield', place: 'London Road', lat: 55.8477, lon: -4.2175, story: 'A historic East End football ground and training home, rooted in a neighbourhood where football is part of daily life.' },
      { name: 'Emirates Arena', place: 'London Road', lat: 55.8428, lon: -4.2058, story: 'A striking indoor arena and velodrome, built for the 2014 Commonwealth Games and home to Scotland’s national cycling centre.' },
    ],
  },
  {
    id: 'commonwealth-mile',
    theme: 'Sport',
    title: 'Commonwealth stories',
    subtitle: 'The lasting legacy of Glasgow 2014, found on foot.',
    distanceKm: 3.2, minutes: 45, start: 'Glasgow Green',
    stops: [
      { name: 'Glasgow Green', place: 'Saltmarket', lat: 55.8497, lon: -4.2330, story: 'The city’s oldest public park hosted the 2014 Commonwealth Games opening ceremony. The People’s Palace tells Glasgow’s social story.' },
      { name: 'Sir Chris Hoy Velodrome', place: 'London Road', lat: 55.8428, lon: -4.2059, story: 'Named for the six-time Olympic cycling champion, the velodrome helped put Glasgow on the international sporting map.' },
      { name: 'Celtic Park', place: 'Kerrydale Street', lat: 55.8497, lon: -4.2055, story: 'The Games made use of Glasgow’s existing sporting landmarks. This one has been part of East End life for well over a century.' },
    ],
  },
];