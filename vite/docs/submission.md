# Submission draft

**Name:** SharkWatch

**One line:** A drone shark patrol that sees with SAM 3.1, verifies and dispatches with Muse Spark, and tells lifeguards exactly where, how big and how close to swimmers.

**Track / theme:** Indie · Push the Frontier ("give a machine a new capability").

## What it does

SharkWatch watches drone footage of a beach, detects and tracks every animal, and confirms which ones are sharks. For each shark it measures length, GPS position, speed, and distance to the nearest person and to shore. It scores the risk with readable reasons and alerts the right (simulated) authorities: lifeguards, beach management and coastal security. Alerts go to in-app consoles and to Telegram, are tracked until acknowledged, escalate if ignored, and end with an all-clear. Each alert is also standard CAP 1.2.

## Impact

- **The problem.** Shark encounters close beaches and hurt people, and spotting from towers or drones still relies on a person watching every frame. SharkWatch turns the footage into a decision: is it a shark, how big, how close to people, who must act, and what to do.
- **A real case.** The main demo clip is the Orange County Sheriff's helicopter footage from May 2017, when about fifteen white sharks off Capistrano Beach led deputies to warn swimmers by loudspeaker. On that footage SharkWatch confirms a shark of about 3 m less than 30 m from the beach and warns lifeguards, with the message drafted by Muse Spark. Muse Spark's species guess (white shark) is shown, but it's low-confidence, so the warning rests on size and distance alone.
- **False alarms cost trust.** Muse Spark checks every candidate before anything is sent. On a crowded shoreline clip it told sharks from rays 8/8 times (22/23 when batched), and anything under 0.75 confidence goes to a human. A person has to be seen for at least 8 frames before a shark counts as "near swimmers", so a glint can't escalate an alert.
- **Proportionate, and careful with species.** A dangerous species near swimmers clears the water, and a confidently identified docile one is capped at a lifeguard warning. Species calls from above vary between runs, so they move the score only as far as Muse Spark is sure, and never lower it on a guess. The reasons are listed in every alert.
- **Responsible by default.** People are pixelated in the feed and in every evidence photo sent to consoles and phones, every alert is marked as an exercise, and nothing contacts a real agency.

## Use of Meta AI tooling

- **SAM 3.1, beyond one prompt.** Three concept prompts per chunk (`shark`, generic `fish`, `person`) are merged per track, plus cross-chunk tracking on SAM's masks. We measured that the `shark` prompt alone returns nothing on a dense shark-and-ray pile, while the generic net recovers the sharks. Masks drive length (principal axis × ground scale), position and privacy pixelation.
- **Muse Spark as verifier.** One batched call per chunk: an overview frame with numbered boxes plus a crop per candidate, returning schema-guaranteed JSON (label, species, confidence, behaviour, and *how many animals are inside the box*). That count catches SAM merging two sharks into one outline. Verdicts below 0.75 go to a human.
- **Muse Spark as dispatch agent.** Tool calls (`dispatch_alert`, `set_beach_action`) produce one message per agency. The server enforces the policy: only required recipients, length limits, a beach action never weaker than policy, templates for gaps or timeouts. We found and fixed a real failure mode, where "say it's an exercise" made the model reply in text and skip the tools.
- **Measured API behaviour.** Requests are processed one per key at a time, so the server batches verification and queues every Meta request by urgency (alert drafting, then verification, then SAM). Before the queue, Live alerts timed out behind SAM chunks and fell back to templates; now Muse Spark drafts them (measured: 7.6 s wait, 4.9 s to draft).

## Technical depth

- Frame-exact alignment between the 10 fps analysis copy and the 30 fps playback, checked by PSNR on every clip. A naive dual-resample was off by one frame on 29.97 fps sources.
- Simulated drone telemetry placed on the real OpenStreetMap coastline: shoreline, swim zones, ground footprint, pixel → GPS.
- Real-time Replay of recorded analysis. Each verdict records the last frame Muse Spark saw, so the replay confirms a shark about 2 s after it appears without ever showing a verdict before its evidence. Live mode shows this API tier's real delay.
- A measured patrol-altitude limit: on real aerial survey footage of Palm Beach's blacktip migration, sharks are 6–10 px and SAM finds none, even at 4× digital zoom. A patrol drone has to fly low enough for a shark to cover about 30 px.
- Mask outlines simplified about 10× (Ramer–Douglas–Peucker, area within 3%).
- Risk engine, alert service, CAP 1.2 output and Telegram channel, all unit-tested. 90+ tests run without any API calls; CI runs a fresh clone on Windows, macOS and Linux.

## Results

See [docs/results.md](results.md): per-clip sharks confirmed, animals ruled out, merged outlines flagged, lengths, closest approach and alert level, plus latency and cost measurements.

## Try it

```bash
git clone https://github.com/<owner>/<repo>.git
cd <repo>
npm install
npm run dev     # http://localhost:5173, Replay works with no keys
```

- Live mode needs a Meta Model API key.
- Telegram alerts need a bot token.
- The authority consoles are at `/console?role=lifeguards` (also `beach_management`, `coastal_security`).

## Honest limits

- **Simulated context.** Except for Capistrano (real footage, location and telemetry), the clips are stock or Creative Commons footage placed on US beaches with simulated telemetry. All authorities are simulated.
- **Footage with people.** The only free clip we found with sharks and swimmers together is a staged scene; it's kept as a demo.
- **Size accuracy.** Ground scale comes from reference objects or assumed altitude (about ±20%).
- **Detection floor.** SAM misses animals smaller than about 30 px at 720p.
- **Live delay.** On this API tier Live mode runs 15–60 s behind on busy scenes.
- **Track counts.** Tracks are counted per appearance; animals that leave and re-enter the frame get new tracks.
