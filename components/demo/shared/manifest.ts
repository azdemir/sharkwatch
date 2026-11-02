// Per-clip manifest written by scripts/prepare-clip.ts and completed by hand with scene data.

export interface GeoPointJson {
  lat: number;
  lon: number;
}

/**
 * One analysis chunk. Chunk files are rebuilt locally from playback.mp4 and uploaded per Meta
 * account (see src/server/meta/files.ts), so neither the files nor their Meta ids are committed.
 */
export interface ClipChunk {
  index: number;
  /** Global analysis frame of the chunk's first frame. */
  startFrame: number;
  frameCount: number;
  /** Path relative to the clip directory. */
  path: string;
}

/** [x, y] in analysis pixels at t = 0; may lie outside the frame. */
export type PixelPointJson = [number, number];

export interface ClipScene {
  /** Beach the simulated patrol flies over (labelled as simulated in the UI). */
  beachName: string;
  /** Ground point under the image centre at t = 0 (approximate until placed on the map). */
  center: GeoPointJson;
  /** Compass bearing the top of the image faces. */
  headingDeg: number;
  /** Metres per analysis pixel, from a reference object or an assumed altitude. */
  gsd: number;
  gsdSource: string;
  /** True when the footage pans or drifts, so ground speed cannot be trusted. */
  cameraMoves: boolean;
  shorelinePx: PixelPointJson[];
  swimZonesPx: PixelPointJson[][];
  /** Extra coastlines drawn on the chart only, such as nearby islands; not used for any distance. */
  chartCoastPx?: PixelPointJson[][];
  /** The footage carries its own camera HUD with real telemetry, so the app adds no simulated one. */
  burnedInHud?: boolean;
  notes?: string;
}

export interface ClipManifest {
  id: string;
  title: string;
  /** A staged scene kept to demonstrate a feature, not a realistic patrol view; listed separately. */
  demo?: boolean;
  source: {
    file: string;
    url?: string;
    author?: string;
    license?: string;
    /** Changes made to the source (trim, crop), which attribution licences ask to be stated. */
    edits?: string;
  };
  /** Analysis frame rate (frames sent to SAM). */
  fps: number;
  playbackFps: number;
  width: number;
  height: number;
  frameCount: number;
  durationS: number;
  chunkFrames: number;
  strideFrames: number;
  chunks: ClipChunk[];
  scene?: ClipScene;
}
