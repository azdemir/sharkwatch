export type DiveStage = {
  id: string;
  depthM: number;
  label: string;
  light: string;
  heading: string;
  headingEm: string;
  body: string;
  image: string;
  imageAlt: string;
  darkClass: "" | "d10" | "d30" | "d80";
  facts: { label: string; value: string }[];
};

export const DESCENT_STAGES: DiveStage[] = [
  {
    id: "surface",
    depthM: 0,
    label: "Surface · 0 m · Capistrano Beach",
    light: "Light: full",
    heading: "The",
    headingEm: "Descent",
    body: "Start where everyone swims. SharkWatch starts there too — from above, in clear water, before anything is a problem.",
    image: "/descent/hero-aerial.jpg",
    imageAlt: "Aerial photograph of a shark swimming near a sandy beach",
    darkClass: "",
    facts: [
      { label: "View — aerial drone", value: "Surface" },
      { label: "Water — clear", value: "Turquoise" },
      { label: "First sign — a shape", value: "Below" },
    ],
  },
  {
    id: "d10",
    depthM: 10,
    label: "10 m · Great White",
    light: "Light: fading",
    heading: "First,",
    headingEm: "it is seen.",
    body: "SAM 3.1 traces it in dashed amber while Muse Spark checks it. People in frame are pixelated first — identification comes before alarm.",
    image: "/descent/great-white.jpg",
    imageAlt: "Great white shark underwater",
    darkClass: "d10",
    facts: [
      { label: "Status — checking", value: "Unverified" },
      { label: "Trace — dashed", value: "Amber" },
      { label: "Clock", value: "0.0 s" },
    ],
  },
  {
    id: "d30",
    depthM: 30,
    label: "30 m · Hammerhead",
    light: "Light: narrow",
    heading: "Then,",
    headingEm: "it is named.",
    body: "Verification lands. The trace goes solid, the length appears, and the evidence photo is attached to the contact — not buried in a log.",
    image: "/descent/hammerhead.jpg",
    imageAlt: "Hammerhead shark underwater",
    darkClass: "d30",
    facts: [
      { label: "Species", value: "Hammerhead" },
      { label: "Confidence", value: "0.982" },
      { label: "Clock", value: "~2 s" },
    ],
  },
  {
    id: "d80",
    depthM: 80,
    label: "80 m · Tiger",
    light: "Light: thin",
    heading: "Then,",
    headingEm: "it is acted on.",
    body: "Beach status becomes the flag a lifeguard would fly: Purple flag, Water closed, or Sighting logged — with sighted, confirmed and sent times, in that order.",
    image: "/descent/tiger.jpg",
    imageAlt: "Tiger shark over a sandy seabed",
    darkClass: "d80",
    facts: [
      { label: "Flag", value: "Purple" },
      { label: "Sighting → alert", value: "~5 s" },
      { label: "Agencies", value: "Simulated" },
    ],
  },
];

export const DESCENT_SEQUENCE = [
  { label: "Sighted", value: "0.0 s" },
  { label: "Confirmed", value: "~2 s" },
  { label: "Alert sent", value: "~5 s" },
  { label: "Acknowledged", value: "Tower 3" },
] as const;

export const DESCENT_VIDEO = "/descent/hero-video.mp4";
export const DESCENT_POSTER = "/descent/hero-aerial.jpg";
