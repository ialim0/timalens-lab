# TimaLens Lab: a 3-minute demo

**Before you start**

- Start the server with `MODEL_API_KEY` set.
- Open `http://localhost:8080` on a laptop, and the sample lab on a phone.
- The interface follows the browser's language. For an English-speaking jury, use the **EN** switch (top right) or add `?lang=en`. To show the French classroom version, tap **FR**: everything switches, including the lab's content.
- Upload `samples/lecon_loi_ohm.pdf` once the day before. Labs are reused by lesson, so re-uploading it on stage is instant even if the venue's Wi-Fi is bad. To show a live generation as well, also upload a second lesson that has not been uploaded before.

## 0:00 · The problem (15 s)

> "I taught mathematics in a village in Benin with no electricity. My students learned about circuits from a blackboard drawing. They had never closed a switch and watched a bulb light. Most schools in Africa have no physics lab. TimaLens already turns lessons into videos. Today: from *watching* a lesson to *experiencing* it."

## 0:15 · The teacher uploads a lesson (30 s)

1. Drop `lecon_loi_ohm.pdf` on the home page. Set *Niveau* to 4e and click **Créer le laboratoire**.
2. While the stages tick, say:

   > "Muse Spark reads the whole lesson: its notation, its examples, the mistakes it warns about. It writes the lab as structured JSON. Then our circuit engine lays out and solves every circuit. It searches the controls the student can touch to prove every challenge can be solved. Anything wrong goes back to Muse Spark in plain words. The AI configures the lab. It never computes the physics."

3. Show the **WhatsApp** and **Copier le lien** buttons and say: "One link for the whole class."

> Tip: also mention that a photo of the blackboard or a recorded lesson works too, through Muse Spark's vision and Muse Voice Transcribe.

## 0:45 · The student experiments (45 s)

1. Open the lab. In **Guide**, start *Découvrir la loi d'Ohm*.
2. **Predict first.** Answer "Si on double la tension… ?"; the lab shows the reasoning.
3. **Measure.** Tap the battery and set it to 2, 4, 6 and 8 V, tapping **Enregistrer la mesure** each time. Charges flow faster as I rises.
4. Open **Mesures**: the U(I) graph is a straight line through the origin, with slope ≈ 100 Ω. "They *discover* U = R × I from their own data."
5. In **Défis**, start *Allume la DEL sans la griller*.
   - Drag R1 down to 10 Ω: **the LED burns out**. "In a real lab this costs a component. Here it costs nothing, and they learn why."
   - Tap the LED, then **Réparer**. Tap R1 and bring it up to 390 Ω: **Bravo, défi réussi !**

## 1:30 · 3D, then the video (35 s)

1. Tap **3D**. The same circuit is now on a lab bench: the resistor shows its real colour bands, the LED glows, and the multimeter shows the reading.
2. Open `lab.html?lab=sample-lampes-en`, which opens in 3D. Two bulbs in series glow dimly. Open the *Junction rule* challenge (*Loi des nœuds* in French): in parallel they glow fully, and A1 = A2 + A3 on the multimeters.

   > "When a lesson is about real apparatus, Muse Spark opens its lab in 3D; for diagram work, in 2D. The teacher can choose, and the student can always switch." (This sample was written by hand and set to 3D.)

3. Tap **Terminer**, choose **3D**, then **Créer la vidéo du labo**. An MP4 of the student's own lab appears, ready for WhatsApp.

   > "We don't record the screen. We record a 5 KB log of what the student did, and recompute every frame with the same physics engine. The replay is exact, and a teacher on 2G can still receive it."

> Tip: rendering takes about as long as the video lasts on a laptop. On stage, play a video you rendered beforehand with the same button, and say so.

## 2:05 · The tutor, in the student's language (30 s)

1. In **Tuteur**, ask out loud with the 🎤 button, or type: "Pourquoi la DEL a besoin de la résistance ?"
2. Say:

   > "Muse Spark answers from the teacher's lesson, with the real numbers of this student's circuit. It is Socratic: it never hands over the answer to a challenge."

3. Tick **Read aloud** (**Lire à voix haute** in French).
4. Tap **FR**, then **EN** again. The same lab, the tutor and the video captions follow the language. A generated lab is translated by Muse Spark, which may change only the words: the engine re-checks that ids, values and answers are unchanged.
5. If the network drops, the lab keeps working, and the tutor falls back on the engine's own readings.

## 2:35 · Quiz and close (25 s)

1. Answer the 3-question quiz and show the score.
2. Show the phone: "The lab is 45 KB of code; the 3D view loads only when asked for. It runs on a 50-dollar phone."
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
