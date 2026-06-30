// Plain (server-importable) blog data + pure helpers.
// Kept separate from BlogSection.tsx ('use client') so server components —
// the /journal routes, sitemap — can read the data without pulling in client code.

/** A targeted region drawn over an image, tying a visible component to the text. */
export interface ImageMarker {
  label: string;
  color: string;
  /** Box position as percentages of the image box. */
  top: number;
  left: number;
  width: number;
  height: number;
}

export type BlogBlock =
  | { type: 'p'; text: string }
  | { type: 'h2'; text: string }
  | { type: 'quote'; text: string; cite?: string }
  | { type: 'list'; items: string[] }
  | { type: 'figure'; src: string; alt: string; caption: string; markers?: ImageMarker[] }
  | { type: 'note'; label: string; text: string };

export interface ThermalStat {
  value: string;
  unit?: string;
  label: string;
  /** 0–1 position on the cool→hot scale; drives the marker colour. */
  heat: number;
}

export interface BlogPost {
  id: string;
  dispatch: string;
  eyebrow: string;
  date: string;
  readMins: number;
  title: string;
  subtitle: string;
  brief: string;
  hero: { src: string; alt: string; markers?: ImageMarker[] };
  /** Peak reading called out on the gauge overlay. */
  gauge: { peak: string; caption: string };
  stats: ThermalStat[];
  author: string;
  body: BlogBlock[];
}

// Component-tag palette — shared with the segmentation section for cohesion.
const C_LOUVRE = '#0E7490'; // teal
const C_RENDER = '#B45309'; // amber
const C_GREEN = '#15803D'; // green
const C_STONE = '#6D28D9'; // violet

export const BLOG_POSTS: BlogPost[] = [
  {
    id: 'heat-dome-2026',
    dispatch: 'Dispatch 01',
    eyebrow: 'Climate · Materials',
    date: 'June 2026',
    readMins: 8,
    title: 'The 2026 European Heat Dome',
    subtitle: 'Why our concrete cities are failing, how architecture must fight back, and how AI can predict and optimize the best ways to stay cool.',
    brief:
      'A stagnant heat dome pushed late-June temperatures 14–18°C above normal and left more than 1,300 people dead. Most European homes were built to trap warmth, not shed it. We look at the materials, components, and design moves that pull heat back out of the building, and how AI can help retrofit what already stands.',
    hero: {
      src: '/blog/heat-dome-facade.png',
      alt: 'Modern European apartment facade with timber brise-soleil shutters, pale lime render and planted balconies under a hot midday sky',
      markers: [
        { label: 'Timber brise-soleil', color: C_LOUVRE, top: 17, left: 40, width: 15, height: 62 },
        { label: 'High-albedo render', color: C_RENDER, top: 14, left: 13, width: 7, height: 34 },
        { label: 'Planted balcony', color: C_GREEN, top: 24, left: 55, width: 13, height: 20 },
        { label: 'Stone base · thermal mass', color: C_STONE, top: 84, left: 20, width: 47, height: 13 },
      ],
    },
    gauge: { peak: '44°C', caption: 'Iberian peak · 21 June' },
    stats: [
      { value: '44', unit: '°C', label: 'Peak, Iberia', heat: 1 },
      { value: '+18', unit: '°C', label: 'Above seasonal normal', heat: 0.82 },
      { value: '1,300', label: 'Excess deaths (WHO)', heat: 0.95 },
      { value: '20', unit: '%', label: 'Homes with AC', heat: 0.18 },
    ],
    author: 'The Visquery Editorial Desk',
    body: [
      {
        type: 'p',
        text:
          'In the last week of June 2026 a sprawling high-pressure system, a heat dome feeding on hot Saharan air, settled over Europe and refused to move. Temperatures ran 14 to 18°C above normal for the season. Spain and Portugal pushed toward 44°C; one French town crossed 44°C as well, and France recorded its hottest nationally-averaged June day on record. By the end of the month the World Health Organization linked more than 1,300 excess deaths to the heat, roughly a thousand of them in France alone.',
      },
      {
        type: 'p',
        text:
          'Heat is a quiet killer. It does not flatten a building the way a storm does; it just makes the inside of an ordinary apartment reach 33°C at midnight and stay there. And here is the uncomfortable structural truth: only about one in five European homes has air conditioning, and the building stock was overwhelmingly designed to retain heat for cold winters, not to release it during weeks of extreme summer. The continent is, quite literally, built for the wrong climate.',
      },
      {
        type: 'quote',
        text:
          'Much of Europe’s housing and infrastructure was simply not designed for prolonged periods of extreme heat.',
        cite: 'World Weather Attribution / WHO, June 2026',
      },
      {
        type: 'h2',
        text: 'The building envelope is the first line of defence',
      },
      {
        type: 'p',
        text:
          'Before anyone reaches for a compressor and a refrigerant, the cheapest cooling happens at the skin of the building: the envelope. A wall, a roof, and a window either invite the sun in or turn it away. The physics is unglamorous but decisive: roughly half of the unwanted heat in a sun-exposed room arrives as solar radiation through glazing and dark surfaces. Stop it at the surface and you never have to fight it indoors.',
      },
      {
        type: 'figure',
        src: '/blog/heat-dome-materials.png',
        alt: 'Close study of cooling building materials: pale lime render, timber brise-soleil louvres, a perforated stone screen and a green planted facade',
        caption:
          'Four passive moves on one corner: timber brise-soleil, high-albedo lime render, a perforated stone screen, and a green facade. Cooling that needs no power. Tap a tag to see what it does.',
        markers: [
          { label: 'Brise-soleil louvres', color: C_LOUVRE, top: 1, left: 32, width: 28, height: 38 },
          { label: 'Lime render · high albedo', color: C_RENDER, top: 44, left: 30, width: 27, height: 46 },
          { label: 'Perforated stone screen', color: C_STONE, top: 3, left: 58, width: 17, height: 84 },
          { label: 'Green facade', color: C_GREEN, top: 5, left: 74, width: 22, height: 74 },
        ],
      },
      {
        type: 'h2',
        text: 'Materials and components that pull heat back out',
      },
      {
        type: 'list',
        items: [
          'High-albedo (cool) surfaces: pale lime render, lime-wash, and reflective coatings bounce solar radiation instead of soaking it up. A white roof can run 20–30°C cooler than a dark membrane at noon.',
          'Thermal mass with night flushing: exposed stone, brick, and rammed earth absorb daytime heat slowly, then release it to the cool night air when windows open. Mass only helps if the nights are used to purge it.',
          'External shading: brise-soleil, deep reveals, louvred shutters, and perforated screens (mashrabiya, jali, claustra) stop sun before it hits glass. External shading beats internal blinds by a wide margin, because once light is through the glass the heat is already inside.',
          'Ventilated and rain-screen facades: an air gap behind cladding lets a chimney of moving air carry heat away before it conducts inward.',
          'Green facades and roofs: planting shades the surface and cools by evapotranspiration, shaving several degrees off the wall behind it.',
          'Cool, light-coloured paving and reduced glazing ratios on west and south faces, with small ratios giving a large effect on afternoon peak load.',
        ],
      },
      {
        type: 'p',
        text:
          'None of this is futuristic. The Mediterranean has cooled buildings this way for centuries: thick lime-washed walls, shuttered windows, narrow shaded streets, courtyards that breathe at night. The tragedy of the modern European apartment block is that it abandoned that vocabulary in favour of thin walls, large unshaded glass, and dark roofs, and then assumed the climate would stay mild.',
      },
      {
        type: 'h2',
        text: 'Where AI comes in: retrofit at the scale of a city',
      },
      {
        type: 'p',
        text:
          'New, well-designed buildings are the easy case. The hard problem is the millions of existing buildings that will still be standing, and overheating, in 2050. You cannot demolish a continent. You have to retrofit it, and to retrofit intelligently you first have to know what is actually out there: which facades face west, which roofs are dark, which windows are unshaded, which walls are solid masonry that could carry an external shading system.',
      },
      {
        type: 'note',
        label: 'How Visquery fits',
        text:
          'This is exactly the kind of visual filtering Visquery is built for. Point it at a streetscape and it classifies the architectural style, isolates individual components such as cornices, shutters, balconies, glazing, and roof type, then reads the likely materials. At city scale that becomes a heat-risk inventory: find every south-facing unshaded glass facade, every dark mansard roof, every solid stone wall that could host a brise-soleil or a green screen. Architects and planners stop guessing and start targeting the retrofits that actually move the indoor temperature.',
      },
      {
        type: 'list',
        items: [
          'Detect and tag heat-vulnerable components at scale, such as unshaded glazing, dark roofs, and thin lightweight cladding, directly from imagery.',
          'Match each building to precedents that already solved its problem, so a 1960s block can borrow the shading logic of a building that works.',
          'Prioritise: rank facades by orientation and material so limited retrofit budgets hit the worst offenders first.',
          'Specify: surface the exact components and materials, like louvre depth, render albedo, and screen porosity, that fit the existing structure.',
        ],
      },
      {
        type: 'h2',
        text: 'A point of view',
      },
      {
        type: 'p',
        text:
          'Air conditioning will spread across Europe, and it has to, for the vulnerable, the elderly, the sick. But if the only answer is more compressors, we cool one room by heating the street and the planet, and the next heat dome arrives a little worse. The smarter, more durable response is to make the building itself do the work it used to do: reflect, shade, breathe, and store coolness through the night. That is not nostalgia. It is the cheapest kilowatt of cooling we have, and it is hiding in plain sight on facades we already own.',
      },
      {
        type: 'p',
        text:
          'For architects, researchers, and city planners the call to action is concrete: treat heat as a design input, not an afterthought. Reintroduce the old passive vocabulary with modern materials, and use tools that can read the existing city fast enough to retrofit it before the next dome settles in. The components that will save lives in the heatwaves to come are, for the most part, already drawn: we just have to find them, and put them back.',
      },
      {
        type: 'note',
        label: 'Sources',
        text:
          'WHO / France 24 and Euronews (28 June 2026); TIME (23 June 2026); Yale Climate Connections; AccuWeather; Al Jazeera; World Weather Attribution; 2026 European heatwaves, Wikipedia.',
      },
    ],
  },
];

export function getPostBySlug(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((p) => p.id === slug);
}

// Cool→hot scale: slate → amber → vermilion. Drives gauge + stat markers,
// encoding the actual temperature story rather than decorating it.
export function heatColor(t: number): string {
  const clamp = Math.max(0, Math.min(1, t));
  if (clamp < 0.5) {
    // slate #334155 → amber #B45309
    const k = clamp / 0.5;
    const r = Math.round(0x33 + (0xB4 - 0x33) * k);
    const g = Math.round(0x41 + (0x53 - 0x41) * k);
    const b = Math.round(0x55 + (0x09 - 0x55) * k);
    return `rgb(${r},${g},${b})`;
  }
  // amber #B45309 → vermilion #DC2626
  const k = (clamp - 0.5) / 0.5;
  const r = Math.round(0xB4 + (0xDC - 0xB4) * k);
  const g = Math.round(0x53 + (0x26 - 0x53) * k);
  const b = Math.round(0x09 + (0x26 - 0x09) * k);
  return `rgb(${r},${g},${b})`;
}
