# Day-0 spike: SAM 3.1 and Muse Spark on real drone footage

> **Clip set update (Oct 31):** clips a (sharks and rays at the shoreline), c (dolphins) and f (more sharks and rays) were later dropped from the shipped set in favour of footage closer to a beach patrol (see the README's footage credits). The measurements below were made on them and still stand; the tracking tests keep clip a's raw SAM output as a fixture.

Measured on Oct 30, 2026 with `npm run spike:sam` and `npm run spike:spark`. Chunks are 6 s at 10 fps (60 frames, 720p short side). The total spend was about $0.40.

## SAM 3.1 detection

| Clip | Prompt | Frames with hits | Objects | Mean confidence |
|---|---|---|---|---|
| b: swimmer among sharks | `shark` | 58/60 | 15 | 0.78 |
| b | `person` | 60/60 | 2 (both people) | 0.91 |
| d: single reef shark | `shark` | 38/46 | 1 | 0.73 |
| e: whale shark | `shark` | 60/60 | 1 | 0.75 |
| a: dense shark-and-ray pile at the shoreline | `shark` / `nurse shark` | **0/60** | 0 | – |
| a | `fish` | 60/60 | 12 (sharks **and** rays) | 0.76 |
| a | `stingray` | 60/60 | 9 | 0.78 |
| c: dolphins near the surf (~25–30 px each) | `shark`, `dolphin`, `fish`, `animal` | 0/60 | 0 | – |

**Findings:**
- **`shark` fails in dense scenes.** It works on clear, separated sharks (clips b, d, e). In the crowded, mixed scene (clip a) it returns nothing at all, while a generic prompt such as `fish` recovers the sharks, plus the rays.
- **There is a size floor.** Objects of about 25–30 px at 720p are not detected by any prompt (clip c). To detect a 2 m shark at ≥50 px, the drone has to patrol at about 0.04 m/px or finer.
- **Masks match their boxes exactly.** SAM's box corners are inclusive and the mask raster is exactly the box size. `decodeMaskToSVGPath` paths are in raster space, so draw them with `translate(left, top) scale(boxW/W, boxH/H)` (checked visually).
- **Frames stream progressively.** The first frame arrives after 1.7–5.3 s; a full chunk takes 3.3–28 s. The time grows with the number of objects and with concurrency: 6 requests in flight took up to 19.6 s even with nothing found.

## Muse Spark verification (3 crops + annotated frame, `reasoning: low`)

Clip a, `fish` candidates. Every label checked by eye against the crops:

| SAM object | Length (mask PCA × GSD) | Muse Spark label | Confidence | Latency |
|---|---|---|---|---|
| #0 | 2.4 m | shark, "nurse shark" | 0.96 | 4.0 s |
| #1 | 3.0 m | shark, "nurse shark" | 0.92 | 4.6 s |
| #2 | 2.7 m | shark, "nurse shark" | 0.92 | 5.0 s |
| #3 | 2.3 m | shark, "nurse shark" | 0.92 | 4.4 s |
| #4 | 1.8 m | shark, "nurse shark" | 0.92 | 5.7 s |
| #5 | 2.6 m (incl. tail) | **ray** | 0.96 | 4.0 s |
| #6 | 1.9 m (incl. tail) | **ray** | 0.97 | 3.9 s |
| #7 | 2.3 m | shark, "nurse shark" | 0.93 | 5.7 s |

That is 8 of 8 correct, and the measured lengths are plausible for adult nurse sharks (about 2.1–3 m). On clip b, sending the chunk video as well added about 2.3 s and changed no labels.

**Grounding:** Muse Spark perception grounding returned 19 `fish` boxes on one frame in 9.8 s, including animals inside the pile that SAM missed (IoU with SAM boxes ranged from 0.08 to 0.93).

## Decisions

1. **Detection is two-stage.** Each chunk runs three SAM prompts in parallel: `shark`, a generic `fish` candidate net, and `person`. `fish` tracks that overlap a `shark` track are duplicates. Every remaining track goes to Muse Spark, which accepts or rejects it, labels the species, and keeps rays, turtles and the like from raising alerts.
2. **Verifier input:** crops plus the annotated frame at low reasoning effort (4–6 s). The chunk video is optional, used only for richer behaviour text.
3. **Recall booster ("Spark spots, SAM tracks"):** Muse Spark grounding on keyframes seeds SAM box prompts for animals the concept prompts miss. Built after the core pipeline works.
4. **Live mode is near-real-time and honest about it:** the delay is about 6 s chunk + p95 SAM + 1 s, roughly 25–30 s, and the UI shows it. Replay mode (recorded sessions) is the smooth default.
5. **Demo cases:**
   - True alert: clip b (sharks around swimmers).
   - Rejection: rays in clips a and f.
   - Harmless large shark: clip e.
   - Below the detection floor: clip c (shows why patrol altitude matters).

## Day 1: the live pipeline, end to end

Measured on Oct 31, 2026 with `npm run pipeline`.

**One request at a time per key.** Meta Model API processes one request per key at a time:

| Requests sent at once | Completion times |
|---|---|
| 3 SAM requests (light 60-frame chunk) | 4.7 s, 8.2 s, 12.3 s |
| 6 Muse Spark calls (tiny) | 0.9 s to 4.0 s, staggered |

Sending more requests at once only queues them, so the pipeline sends them in order.

**Batched verification.** All animals newly confirmed in a chunk go to Muse Spark in one call: an overview frame with numbered boxes plus a crop of each.

| Clip | Spark calls | Result | Calls needed per animal |
|---|---|---|---|
| a | 4 | 17 sharks and 6 rays | 23 |

Real sharks scored 0.80–0.96. One partly visible ray was labelled "shark" at 0.62, so verdicts below **0.75** now go to the operator as *uncertain* rather than raising an alert.

**Real-time lag** on clip b (16 s of video, 15+ sharks, two swimmers):

| Prompts | Lag after each chunk | Cost |
|---|---|---|
| shark + fish + person, unbatched verification | 19 → 82 → 94 → 110 s | $0.31 |
| Live policy: shark + person, batched | 14 → 18 → 33 → 61 s | $0.13 |

Busy scenes can't be analysed in true real time on this API tier. Live mode shows its delay, and Replay is the smooth demo.

**Track churn is real.** Most new track IDs start at the frame edge: sharks circling into a 4.7 m-wide view. Re-identifying an individual after it leaves the frame isn't possible from boxes alone, so the UI counts sharks *currently visible* rather than a running total.
