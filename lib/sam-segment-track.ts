// Shark position track for the hero SAM video, derived from that video itself.
// Each frame gives the segment's centre/top (cx, top) and its right/bottom
// edge (right, bottom), in video coordinates 0-1000, at 0.5 s intervals.
// Positions were read from the yellow Meta SAM video frame by frame (dark
// shark body against bright water), two glare frames at 4.0 s / 4.5 s
// corrected by eye, and the whole path smoothed with a 5-frame moving
// average so the tag does not jitter. No outside model was used, and the
// site makes no model or API call at runtime.
export const SAM_SEGMENT_TRACK = {
  videoWidth: 1080,
  videoHeight: 720,
  frames: [
    { t: 0.0, cx: 340, top: 457, right: 446, bottom: 586 },
    { t: 0.5, cx: 344, top: 446, right: 452, bottom: 584 },
    { t: 1.0, cx: 348, top: 436, right: 457, bottom: 584 },
    { t: 1.5, cx: 354, top: 425, right: 468, bottom: 582 },
    { t: 2.0, cx: 358, top: 423, right: 477, bottom: 581 },
    { t: 2.5, cx: 363, top: 408, right: 488, bottom: 587 },
    { t: 3.0, cx: 363, top: 400, right: 498, bottom: 577 },
    { t: 3.5, cx: 364, top: 395, right: 511, bottom: 568 },
    { t: 4.0, cx: 366, top: 385, right: 525, bottom: 581 },
    { t: 4.5, cx: 369, top: 381, right: 550, bottom: 595 },
    { t: 5.0, cx: 369, top: 382, right: 569, bottom: 599 },
    { t: 5.5, cx: 387, top: 376, right: 592, bottom: 619 },
    { t: 6.0, cx: 395, top: 366, right: 615, bottom: 631 },
    { t: 6.5, cx: 404, top: 357, right: 638, bottom: 627 },
    { t: 7.0, cx: 419, top: 343, right: 648, bottom: 618 },
    { t: 7.5, cx: 424, top: 336, right: 659, bottom: 617 },
    { t: 8.0, cx: 420, top: 333, right: 659, bottom: 615 },
    { t: 8.5, cx: 419, top: 341, right: 649, bottom: 616 },
    { t: 9.0, cx: 419, top: 343, right: 644, bottom: 615 },
    { t: 9.5, cx: 406, top: 346, right: 635, bottom: 616 },
  ],
} as const;
