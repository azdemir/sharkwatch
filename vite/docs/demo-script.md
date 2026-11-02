# Demo video script (about 2 min 30 s)

**Setup:**
- Run `npm run dev`.
- Open two browser windows side by side:
  - the operator console at http://localhost:5173/,
  - the lifeguard console at http://localhost:5173/console?role=lifeguards.
- If Telegram is set up, open **Alerts on Telegram** under Beach status, scan the QR code with your phone and send `/start` first, so alerts also arrive on the phone.
- Record at 1080p. Every patrol below is a **Replay** of a recorded run (no key needed). Mention once that Live mode runs the same pipeline on the real API.

---

### 1. The problem (0:00–0:15)
**Show:** the operator console in standby on *Great white off Capistrano Beach*.

**Say:** "This is real footage. In May 2017 the Orange County Sheriff's helicopter tracked about fifteen great whites off Capistrano Beach while deputies warned swimmers by loudspeaker. Someone had to watch every frame and decide who to call. SharkWatch does that watching and that calling, with Meta's models."

### 2. Detect and verify (0:15–0:40)
**Do:** press **Start patrol** (Replay).

**Show:** a dashed yellow trace appears on the shark while Muse Spark checks it, then turns solid orange with its length once it's confirmed. The floating kelp next to it is never marked. On the patrol timeline, the shark's lane gets a diamond where it was confirmed. The log reads "T1 confirmed: shark, species unclear".

**Say:**
- "SAM 3.1 finds and tracks the animal: a mask per frame."
- "Muse Spark then confirms it's a shark. Its guess is a white shark, but it says it can't be sure from above, so the risk score doesn't lean on the species."

### 3. Measure (0:40–1:00)
**Do:** click the shark in Contacts (or its lane on the timeline).

**Show:** the length range (about 3 m), the distance to shore (under 30 m), and the map at Capistrano Beach and Doheny State Beach.

**Say:** "Each shark gets a size from its mask, a GPS position and a distance to shore. Here the position comes from the helicopter camera's own readout: this shark was right behind the surf line."

### 4. Alert (1:00–1:30)
**Show:** the moment the shark is confirmed, Beach status switches to **Purple flag** with "alert going out now" while Muse Spark writes the messages. About three seconds later the alert lands, with the sighted → confirmed → sent times, Lifeguard Dispatch delivered, and the message written by Muse Spark. A purple flag lands on the timeline. Cut to the lifeguard console or phone: the alert arrives with the evidence photo.

**Say:**
- "The risk engine scores every confirmed shark: species, size, distance to people and to shore. A three-metre shark this close to the beach is a warning to lifeguards, whatever species it turns out to be."
- "A Muse Spark agent writes the message for each agency through tool calls. Our server checks every call and falls back to templates if anything's missing."

**Do:** in the lifeguard console, type "Tower 3" and press **Acknowledge**.

**Show:** the operator side updates to "✓ Tower 3".

### 5. Sharks near people (1:30–2:00)
**Do:** switch to *Swimmer floating among sharks* (listed under "Demo only": a staged scene) and start it.

**Show:** the people pixelated inside their outlines, distance lines from each shark to the swimmers, nurse sharks confirmed 0.6–4 m from the float.

**Say:** "When people are in the water, every shark gets its distance to the nearest swimmer, and people stay pixelated. Muse Spark calls these likely nurse sharks. That's not certain enough to lower the risk, so sharks this close to people get a lifeguard warning on distance alone; a confidently identified dangerous species here would clear the water."

### 6. Close it out (2:00–2:20)
**Do:** press **All clear**, then open **CAP XML**.

**Say:** "The operator stands it down; every agency gets the all-clear. Each alert is also standard CAP 1.2, the format US emergency systems exchange, marked as an exercise."

### 7. Wrap (2:20–2:30)
**Show:** the README or the results table.

**Say:** "SAM 3.1 to see, Muse Spark to verify and to dispatch. Open source, runs with one command, and every number you saw came from a real run."

---

**Keep honest:**
- The Capistrano footage, its location and telemetry are real (a public-domain Sheriff's video). The other clips are stock or Creative Commons footage placed on US beaches with simulated telemetry. All authorities are simulated.
- Footage credits are in the README.
- Replay shows recorded analysis at real-time speed: verdicts about 2 s after a shark appears, using only footage up to that point. Live mode on this API tier runs 10–20 s behind, more on busy scenes.
