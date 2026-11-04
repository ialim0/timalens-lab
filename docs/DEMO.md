# TimaLens Lab: a 3-minute demo

**Before you start**

- Start the server with `MODEL_API_KEY` set.
- Run `make serve` (or deploy). Open `/teach` on a laptop (the teacher's page) and `/` on a phone (it opens a lab, with Tima's tour on a first visit).
- The interface follows the browser's language. For an English-speaking jury, use the **EN** switch (top right) or add `?lang=en`. To show the French classroom version, tap **FR**: everything switches, including the lab's content.
- Upload `samples/lecon_loi_ohm.pdf` once the day before. Labs are reused by lesson, so re-uploading it on stage is instant even if the venue's Wi-Fi is bad. To show a live generation as well, also upload a second lesson that has not been uploaded before.

## 0:00 · The problem (15 s)

> "I taught mathematics in a village in Benin with no electricity. My students learned about circuits from a blackboard drawing. They had never closed a switch and watched a bulb light. Most schools in Africa have no physics lab. TimaLens already turns lessons into videos. Today: from *watching* a lesson to *experiencing* it."

## 0:15 · The teacher uploads a lesson (30 s)

1. Drop `lecon_loi_ohm.pdf` on the home page. Under **Options**, set *Niveau* to 4e, then click **Créer le laboratoire**.
2. Tima takes over: she reads the lesson, then **reads Muse Spark's reasoning aloud** as it designs the lab, while Muse Image draws its cover. Ask her a question out loud meanwhile ("Hey Tima, what does my lesson insist on?"). When the lab is checked, it **opens by itself**. While it works, say:

   > "Muse Spark reads the whole lesson: its notation, its examples, the mistakes it warns about. It writes the lab as structured JSON. Then our circuit engine lays out and solves every circuit. It searches the controls the student can touch to prove every challenge can be solved. Anything wrong goes back to Muse Spark in plain words. The AI configures the lab. It never computes the physics."

3. Show the **WhatsApp** and **Copier le lien** buttons and say: "One link for the whole class."

> Tip: also mention that a photo of the blackboard or a recorded lesson works too, through Muse Spark's vision and Muse Voice Transcribe.

## 0:45 · The student experiments (45 s)

1. Open the lab and tap **Commencer avec Tima**. The camera flies down onto the 3D bench and **Tima, the voice guide, speaks**: what the lab is about, how many missions it has, and "dis : Hey Tima". Allow the microphone when asked.
2. In **Missions**, start *Découvrir la loi d'Ohm*. Tima reads each step aloud.
3. **Predict first.** Answer "Si on double la tension… ?"; Tima says if it was right, and why.
4. **Measure, hands-free.** Tap the battery and slide it to 2, 4, 6 and 8 V. Each new value adds a point by itself and the U(I) line draws itself, slope ≈ 100 Ω; the step moves on when it has enough points. "They *discover* U = R × I from their own data."
5. **Drag and drop.** Drag a bulb from the tray onto the bench: a glowing beam shows where it lands, and it lights up as it closes the loop ("La lampe L2 s'allume !"). Drag it off the bench to take it away.
6. **Hands.** They are on from the start (the lab asked for the camera with the microphone): the webcam view shows the hand's skeleton. Pinch a resistor in the tray, carry it onto the bench and open your fingers; open your hand to turn the 3D bench; make a fist and ask Tima a question. "No mouse, no keyboard: the video never leaves the computer."
7. In **Missions**, start the challenge *Allume la DEL sans la griller*.
   - Drag R1 down to 10 Ω: **the LED burns out**, with sparks and smoke, and Tima explains why. "In a real lab this costs a component. Here it costs nothing, and they learn why."
   - Tap the LED, then **Réparer**. Tap R1 and bring it up to 390 Ω: confetti, and Tima: **Bravo, défi réussi !**

## 1:30 · 3D, then the video (35 s)

1. On the 3D bench: the resistor shows its real colour bands, the LED glows, and the multimeter shows the reading. Tap **2D** for the schematic: the same circuit, the same numbers. On a Meta Quest, the **VR** button puts the whole bench in front of the student, at table height.
2. Open `/lab?lab=sample-lampes-en`, which opens in 3D. Two bulbs in series glow dimly. Open the *Junction rule* challenge (*Loi des nœuds* in French): in parallel they glow fully, and A1 = A2 + A3 on the multimeters.

   > "When a lesson is about real apparatus, Muse Spark opens its lab in 3D; for diagram work, in 2D. The teacher can choose, and the student can always switch." (This sample was written by hand and set to 3D.)

3. Tap **Terminer**, choose **3D**, then **Créer la vidéo du labo**. An MP4 of the student's own lab appears, ready for WhatsApp.

   > "We don't record the screen. We record a 5 KB log of what the student did, and recompute every frame with the same physics engine. The replay is exact, and a teacher on 2G can still receive it."

> Tip: rendering takes about as long as the video lasts on a laptop. On stage, play a video you rendered beforehand with the same button, and say so.

## 2:05 · Ask Tima, out loud (30 s)

1. Say **"Hey Tima, pourquoi la DEL a besoin de la résistance ?"** (or tap the orb and ask: the question goes through Muse Voice Transcribe).
2. Say:

   > "Muse Spark answers from the teacher's lesson, with the real numbers of this student's circuit. It is Socratic: it never hands over the answer to a challenge."

3. Tima answers out loud; the whole conversation is in the **Tima** tab. Then tap **Regarde**: a scan line sweeps the bench, the orb becomes an eye, and Muse Spark's vision describes what the student built; the parts she names glow as she says them.
4. Tap **FR**, then **EN** again. The same lab, the tutor and the video captions follow the language. A generated lab is translated by Muse Spark, which may change only the words: the engine re-checks that ids, values and answers are unchanged.
5. If the network drops, the lab keeps working, and the tutor falls back on the engine's own readings.

## 2:35 · Quiz and close (25 s)

1. Answer the 3-question quiz and show the score.
2. Show the phone: "The lab loads once and stays cached; the 3D view loads only when asked for. It runs on a 50-dollar phone."
3. Close:

   > "PhET built great generic simulators. TimaLens Lab builds the lab from *your* lesson, in *your* language, and checks it with a real physics engine. Every student should be able to experience science, even when their school has no physical laboratory."

## Judging criteria, and where each one shows

- **Impact (30%):**
  - students with no lab;
  - French and English everywhere, local languages for the lab's content;
  - works on low-end phones and offline once loaded;
  - shared by link or WhatsApp;
  - paper lessons accepted as photos.
- **Use of Meta AI (25%):** Muse Spark 1.3 does five jobs:
  - designs the lab with structured output;
  - repairs it from the engine's feedback;
  - reads photos and scans with vision;
  - translates labs, with the structure verified;
  - tutors grounded in the lesson.

  Muse Voice Transcribe handles recorded lessons and spoken questions. For open weights, `PLANNER_BASE_URL` points everything at a self-hosted model.
- **Working demo (25%):** the flow above, with no mock-up steps.
- **Technical depth (20%):**
  - the modified-nodal-analysis solver with LED, bulb and burnout models;
  - the achievability search, which proves every challenge solvable and rejects challenges already solved;
  - the generate → check → repair loop;
  - one engine shared by the browser, the checker, the 3D bench and the video renderer;
  - deterministic video from a replayable event log, encoded to MP4 with WebCodecs;
  - 40 automated tests.
