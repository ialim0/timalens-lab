// The lab's interface in French and English (the lab's own content comes in its language).
const STRINGS = {
  fr: {
    tools: "Outils", select: "Choisir", wire: "Fil", erase: "Gomme", reset: "Recommencer", electrons: "Électrons", conventional: "Sens conventionnel",
    guide: "Missions", challenges: "Défis", measures: "Mesures", tutor: "Tima", quiz: "Quiz", lesson: "Le cours",
    objectives: "Objectifs", formulas: "Formules", start: "Commencer", next: "Suivant", done: "Terminé", check: "Vérifier",
    predict: "Prédis d'abord", your_answer: "Ta réponse", correct: "Exact !", not_quite: "Pas tout à fait.", why: "Pourquoi",
    goal_met: "Objectif atteint", goal_pending: "Pas encore", hint: "Indice", success: "Bravo, défi réussi !", locked: "verrouillé",
    record: "Enregistrer la mesure", clear: "Effacer", export: "Exporter (CSV)", measure_on: "Mesurer sur", slope: "Pente", points_needed: "points notés par Tima",
    ask_placeholder: "Écris à Tima…", intro_start: "Commencer avec Tima", intro_quiet: "Explorer sans le son", tima_listening: "Je t'écoute…", tima_didnt_hear: "Je n'ai pas bien entendu.", tima_mute: "Son", tima_look: "Regarde", tima_looking: "Je regarde ton banc…", tima_yes: "Oui ?", tima_mic_blocked: "Autorise le micro pour me parler (icône à gauche de l'adresse).", tima_no_network: "« Hey Tima » a besoin d'Internet. Touche-moi pour poser ta question.", look_question: "Regarde mon banc : qu'est-ce que tu vois, et qu'est-ce que je devrais essayer maintenant ?", send: "Envoyer", mic: "Parler", listening: "J'écoute…", speak: "Lire à voix haute",
    tutor_offline: "Je n'arrive pas à joindre Muse Spark pour l'instant, mais voici ce que dit le circuit.", thinking: "Tima réfléchit…",
    explain_this: "Explique-moi ce que je vois", short: "Court-circuit !", burnt: "a grillé", repair: "Réparer", burnt_advice: "a grillé : trop de courant. Réduis-le, puis répare.",
    voltage: "Tension", current: "Intensité", power: "Puissance", brightness: "Éclat", value: "Valeur", closed: "fermé", open: "ouvert", flip: "Retourner", remove: "Retirer",
    score: "Score", takeaway: "À retenir", sample: "Exemple", generated: "Muse Spark", about: "À propos du cours",
    place_hint: "Glisse une pièce sur le banc.",
    build_in_2d: "Glisse une pièce sur le banc · glisse le vide pour tourner",
    finish: "Terminer", finish_title: "Ton labo est terminé !", keep_going: "Continuer le labo",
    make_video: "Créer la vidéo du labo", making_video: "Création de la vidéo…", download_video: "Télécharger la vidéo", share: "Partager",
    video_view: "Vue de la vidéo", save_session: "Sauvegarder mon labo", saved: "Labo sauvegardé. Le lien pour le revoir :", copy: "Copier le lien", copied: "Copié ✓",
    download_log: "Télécharger le fichier du labo (.json)", save_failed: "Pas de connexion : télécharge le fichier, il pourra être envoyé plus tard.",
    report: "Rapport de laboratoire", predictions_label: "Prédictions justes", questions_label: "Questions au tuteur", duration_label: "Durée",
    experiment_label: "Expérience", challenge_label: "Défi", measure_label: "Mesure", readings_label: "Les appareils indiquent",
    video_kicker: "Laboratoire virtuel réalisé avec TimaLens Lab", video_engine: "Chaque valeur est calculée par le moteur de circuits · tuteur Muse Spark",
    video_failed: "La vidéo n'a pas pu être créée sur cet appareil :", replay_title: "Revoir un labo", open_file: "Ouvrir un fichier de labo",
    content_in: "Le contenu de ce labo est en {lang}.", translate: "Traduire en français", translating: "Muse Spark traduit le labo…", translate_failed: "La traduction n'a pas pu être faite :",
    lang_names: { fr: "français", en: "anglais" },
    intro_devices: "Tima va te demander la caméra, le micro, et de filmer cet onglet : tes mains et ta voix pilotent le labo, et à la fin tu télécharges la vidéo de ta session. Rien ne quitte ton ordinateur.",
    rec_title: "Ta session est filmée : touche pour terminer", rec_stopping: "Je prépare la vidéo de ta session…", rec_video: "La vidéo de ta session",
    rec_download: "Télécharger la vidéo", rec_note: "Filmée dans ton navigateur : rien n'a quitté ton ordinateur.",
    vr_none: "Aucun casque de réalité virtuelle n'est branché.",
    labs: "Laboratoires", teach: "Professeur ? Crée un labo depuis ton cours", tour: "Visite guidée", tour_next: "Suivant", tour_skip: "Passer",
    hands: "Mains", hands_failed: "La caméra ou le suivi des mains n'a pas pu démarrer :",
    g_point: "Index · viser, rester = cliquer", g_pinch: "Pincer · attraper", g_open: "Main ouverte · tourner", g_fist: "Poing · parler à Tima",
  },
  en: {
    tools: "Tools", select: "Select", wire: "Wire", erase: "Eraser", reset: "Start over", electrons: "Electrons", conventional: "Conventional current",
    guide: "Missions", challenges: "Challenges", measures: "Measurements", tutor: "Tima", quiz: "Quiz", lesson: "The lesson",
    objectives: "Objectives", formulas: "Formulas", start: "Start", next: "Next", done: "Done", check: "Check",
    predict: "Predict first", your_answer: "Your answer", correct: "Right!", not_quite: "Not quite.", why: "Why",
    goal_met: "Goal met", goal_pending: "Not yet", hint: "Hint", success: "Well done, challenge complete!", locked: "locked",
    record: "Record measurement", clear: "Clear", export: "Export (CSV)", measure_on: "Measure on", slope: "Slope", points_needed: "points recorded by Tima",
    ask_placeholder: "Message Tima…", intro_start: "Start with Tima", intro_quiet: "Explore without sound", tima_listening: "I'm listening…", tima_didnt_hear: "I didn't catch that.", tima_mute: "Sound", tima_look: "Look", tima_looking: "Looking at your bench…", tima_yes: "Yes?", tima_mic_blocked: "Allow the microphone to talk to me (icon left of the address bar).", tima_no_network: "“Hey Tima” needs the Internet. Tap me to ask instead.", look_question: "Look at my bench: what do you see, and what should I try now?", send: "Send", mic: "Speak", listening: "Listening…", speak: "Read aloud",
    tutor_offline: "I can't reach Muse Spark right now, but here is what the circuit says.", thinking: "Tima is thinking…",
    explain_this: "Explain what I see", short: "Short circuit!", burnt: "burnt out", repair: "Repair", burnt_advice: "burnt out: too much current. Lower it, then repair.",
    voltage: "Voltage", current: "Current", power: "Power", brightness: "Brightness", value: "Value", closed: "closed", open: "open", flip: "Flip", remove: "Remove",
    score: "Score", takeaway: "Key idea", sample: "Sample", generated: "Muse Spark", about: "About this lesson",
    place_hint: "Drag a part onto the bench.",
    build_in_2d: "Drag a part onto the bench · drag empty space to turn",
    finish: "Finish", finish_title: "Your lab is done!", keep_going: "Keep going",
    make_video: "Make the lab's video", making_video: "Making the video…", download_video: "Download the video", share: "Share",
    video_view: "Video view", save_session: "Save my lab", saved: "Lab saved. The link to watch it again:", copy: "Copy link", copied: "Copied ✓",
    download_log: "Download the lab file (.json)", save_failed: "No connection: download the file, it can be sent later.",
    report: "Lab report", predictions_label: "Right predictions", questions_label: "Questions to the tutor", duration_label: "Time",
    experiment_label: "Experiment", challenge_label: "Challenge", measure_label: "Measurement", readings_label: "The meters read",
    video_kicker: "A virtual lab made with TimaLens Lab", video_engine: "Every value is computed by the circuit engine · Muse Spark tutor",
    video_failed: "The video could not be made on this device:", replay_title: "Watch a lab again", open_file: "Open a lab file",
    content_in: "This lab's content is in {lang}.", translate: "Translate into English", translating: "Muse Spark is translating the lab…", translate_failed: "The translation could not be made:",
    lang_names: { fr: "French", en: "English" },
    intro_devices: "Tima will ask for your camera, your microphone, and to film this tab: your hands and voice drive the lab, and at the end you download the video of your session. Nothing leaves your computer.",
    rec_title: "Your session is being filmed: tap to finish", rec_stopping: "Getting the video of your session ready…", rec_video: "The video of your session",
    rec_download: "Download the video", rec_note: "Filmed in your browser: nothing left your computer.",
    vr_none: "No virtual reality headset is connected.",
    labs: "Labs", teach: "Teacher? Make a lab from your lesson", tour: "Guided tour", tour_next: "Next", tour_skip: "Skip",
    hands: "Hands", hands_failed: "The camera or hand tracking could not start:",
    g_point: "Point · aim, hold still = click", g_pinch: "Pinch · grab", g_open: "Open hand · turn", g_fist: "Fist · talk to Tima",
  },
};

export function strings(language) {
  return STRINGS[(language ?? "en").slice(0, 2)] ?? STRINGS.en;
}

// ---------------------------------------------------------------- the interface's language
// The interface follows the visitor (French or English), whatever the lab's own language:
// ?lang= in the address, then the visitor's last choice, then the browser's language.
const KEY = "timalens-lang";
export const UI_LANGUAGES = ["fr", "en"];
export function uiLanguage() {
  const asked = new URLSearchParams(location.search).get("lang");
  if (UI_LANGUAGES.includes(asked)) return asked;
  try { const saved = localStorage.getItem(KEY); if (UI_LANGUAGES.includes(saved)) return saved; } catch { /* private window */ }
  return (navigator.language ?? "fr").toLowerCase().startsWith("en") ? "en" : "fr";
}
export function setUiLanguage(language) {
  try { localStorage.setItem(KEY, language); } catch { /* the address keeps it */ }
  const url = new URL(location.href);
  url.searchParams.set("lang", language);
  location.replace(url);
}
/** A FR | EN switch in `el`; every page shows one in its header. */
export function mountLanguageSwitch(el, current = uiLanguage()) {
  el.classList.add("seg", "lang");
  el.setAttribute("role", "group");
  el.setAttribute("aria-label", current === "fr" ? "Langue" : "Language");
  el.innerHTML = UI_LANGUAGES.map((l) => `<button type="button" data-lang="${l}" aria-pressed="${l === current}" lang="${l}">${l.toUpperCase()}</button>`).join("");
  el.onclick = (e) => { const b = e.target.closest("[data-lang]"); if (b && b.dataset.lang !== current) setUiLanguage(b.dataset.lang); };
}
/** Fill every [data-i18n] element of the page from a dictionary (and [data-i18n-placeholder]). */
export function translatePage(dict) {
  for (const el of document.querySelectorAll("[data-i18n]")) { const v = dict[el.dataset.i18n]; if (v !== undefined) el.innerHTML = v; }
  for (const el of document.querySelectorAll("[data-i18n-placeholder]")) { const v = dict[el.dataset.i18nPlaceholder]; if (v !== undefined) el.placeholder = v; }
}

// ---------------------------------------------------------------- the teacher's page
// Few words: a headline, one line under it, and labels the teacher can scan.
export const TEACHER = {
  fr: {
    page_title: "TimaLens Lab · Transformez un cours en laboratoire",
    hero: "D'une leçon qu'on regarde<br>à une expérience qu'on <em>vit</em>.",
    hero_text: "Ton cours d'électricité devient un labo interactif.",
    drop: "Dépose ton cours", drop_hint: "PDF, Word, diapos, photo ou audio", change_file: "Touche pour changer",
    or_paste: "Coller du texte", options: "Options",
    paste_placeholder: "La loi d'Ohm : la tension U aux bornes d'un conducteur ohmique…",
    language: "Langue", same_as_lesson: "Celle du cours", other_languages: "Langues africaines",
    level: "Niveau", level_placeholder: "4e, 3e, seconde…",
    view: "Vue", view_auto: "Auto",
    create: "Créer le laboratoire",
    stage_reading: "Lecture du cours…", stage_designing: "Muse Spark conçoit le labo…", stage_checking: "Vérification des circuits…", stage_ready: "Prêt",
    how1: "Téléverse", how1_text: "Même une photo du tableau.",
    how2: "Muse Spark conçoit", how2_text: "Circuits, défis, quiz, tuteur.",
    how3: "Les élèves expérimentent", how3_text: "En 2D ou 3D, sur tout téléphone.",
    labs: "Laboratoires", sample: "Exemple", generated: "Muse Spark",
    footer: "Propulsé par Meta Muse Spark · Open source",
    need_lesson: "Ajoute un fichier, ou colle quelques paragraphes du cours.",
    server_error: "Le serveur n'a pas pu lire ce cours.", interrupted: "Création interrompue. Réessaie.",
    unsupported: "Ce cours ne parle pas de circuits électriques :", failed: "La création a échoué :",
    ready: "Ton labo est prêt", open_lab: "Ouvrir le labo", copy: "Copier", copied: "Copié ✓", another: "Nouveau labo",
    share_text: "Mon laboratoire TimaLens :",
    unreachable: "L'API de Meta est injoignable depuis ce réseau : la création échouera. Essaie un autre réseau (partage de connexion) ou la version en ligne.",
  },
  en: {
    page_title: "TimaLens Lab · Turn a lesson into a lab",
    hero: "From watching a lesson<br>to <em>experiencing</em> it.",
    hero_text: "Your electricity lesson, as a hands-on lab.",
    drop: "Drop your lesson", drop_hint: "PDF, Word, slides, photo or audio", change_file: "Tap to change",
    or_paste: "Paste text", options: "Options",
    paste_placeholder: "Ohm's law: the voltage V across a resistor…",
    language: "Language", same_as_lesson: "Lesson's language", other_languages: "African languages",
    level: "Level", level_placeholder: "Grade 8, Year 9…",
    view: "View", view_auto: "Auto",
    create: "Create the lab",
    stage_reading: "Reading the lesson…", stage_designing: "Muse Spark is designing…", stage_checking: "Checking every circuit…", stage_ready: "Ready",
    how1: "Upload", how1_text: "Even a photo of the board.",
    how2: "Muse Spark designs", how2_text: "Circuits, challenges, quiz, tutor.",
    how3: "Students experiment", how3_text: "In 2D or 3D, on any phone.",
    labs: "Labs", sample: "Sample", generated: "Muse Spark",
    footer: "Powered by Meta Muse Spark · Open source",
    need_lesson: "Add a file, or paste a few paragraphs of the lesson.",
    server_error: "The server could not read this lesson.", interrupted: "Interrupted. Please try again.",
    unsupported: "This lesson is not about electric circuits:", failed: "Making the lab failed:",
    ready: "Your lab is ready", open_lab: "Open the lab", copy: "Copy", copied: "Copied ✓", another: "New lab",
    share_text: "My TimaLens lab:",
    unreachable: "Meta's API can't be reached from this network, so making a lab will fail. Try another network (a phone hotspot) or the online version.",
  },
};

// ---------------------------------------------------------------- Tima, while a lab is made
// What she says about each step of the generation (the server sends facts, not sentences), and
// what she says when Muse Spark is quiet for a while. Every line describes what is really happening.
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const AUDIO = new Set(["mp3", "wav", "m4a", "ogg", "webm", "mp4", "mov", "aac", "flac"]);
const PHOTO = new Set(["jpg", "jpeg", "png", "webp"]);

export const MAKING = {
  fr: {
    reading: (e) => (AUDIO.has(e.source) ? "J'écoute l'enregistrement de ton cours…" : PHOTO.has(e.source) ? "Je lis la photo de ton cours…" : "Je lis ton cours…"),
    read: (e) => `${e.title ? `J'ai lu « ${e.title} »` : "J'ai lu ton cours"} : ${e.words} mots. Muse Spark va en faire un labo. Pendant ce temps, pose-moi tes questions.`,
    designing: (e) => (e.attempt > 1 ? `Muse Spark corrige son labo, essai ${e.attempt}.` : "Muse Spark imagine les circuits, les expériences et les défis."),
    thinking: (e) => `Muse Spark réfléchit : ${e.text}`,
    designed: (e) => `Premier jet : « ${e.title} », avec ${plural(e.circuits, "circuit", "circuits")}, ${plural(e.activities, "expérience", "expériences")} et ${plural(e.challenges, "défi", "défis")}${e.view ? `, en ${String(e.view).toUpperCase()}` : ""}.`,
    checking: () => "Je vérifie chaque circuit avec le moteur physique.",
    problems: (e) => `Le moteur a trouvé ${plural(e.count, "problème", "problèmes")}. Muse Spark corrige.`,
    checked: () => "Tout est vérifié : chaque défi est faisable.",
    cover: () => "Muse Image a dessiné la couverture de ton labo.",
    reused: () => "Ce cours a déjà son labo : je le reprends.",
    ready: () => "Ton labo est prêt. Je l'ouvre !",
    unsupported: () => "Ce cours ne parle pas de circuits électriques : je ne peux pas encore en faire un labo.",
    failed: (e) => `Je n'ai pas pu terminer le labo. ${e.detail ?? ""}`,
    idle: [
      "Muse Spark travaille encore : il relit les exemples et les erreurs que ton cours signale.",
      "Chaque défi doit être faisable avec les réglages que l'élève peut toucher : c'est ce qui prend du temps.",
      "Presque fini. Demande-moi comment tes élèves vont utiliser ce labo.",
    ],
    ask: "Pose-moi une question sur ton cours…", send: "Envoyer", you: "Toi", opening: "Ouverture du labo dans", stay: "Rester ici",
  },
  en: {
    reading: (e) => (AUDIO.has(e.source) ? "Listening to the recording of your lesson…" : PHOTO.has(e.source) ? "Reading the photo of your lesson…" : "Reading your lesson…"),
    read: (e) => `${e.title ? `I've read “${e.title}”` : "I've read your lesson"}: ${e.words} words. Muse Spark will turn it into a lab. Meanwhile, ask me anything.`,
    designing: (e) => (e.attempt > 1 ? `Muse Spark is fixing its lab, attempt ${e.attempt}.` : "Muse Spark is imagining the circuits, experiments and challenges."),
    thinking: (e) => `Muse Spark is thinking: ${e.text}`,
    designed: (e) => `First draft: “${e.title}”, with ${plural(e.circuits, "circuit", "circuits")}, ${plural(e.activities, "experiment", "experiments")} and ${plural(e.challenges, "challenge", "challenges")}${e.view ? `, in ${String(e.view).toUpperCase()}` : ""}.`,
    checking: () => "I'm checking every circuit with the physics engine.",
    problems: (e) => `The engine found ${plural(e.count, "problem", "problems")}. Muse Spark is fixing them.`,
    checked: () => "Everything checks out: every challenge can be met.",
    cover: () => "Muse Image has drawn your lab's cover.",
    reused: () => "This lesson already has its lab: I'm reopening it.",
    ready: () => "Your lab is ready. Opening it!",
    unsupported: () => "This lesson isn't about electric circuits, so I can't make a lab from it yet.",
    failed: (e) => `I couldn't finish the lab. ${e.detail ?? ""}`,
    idle: [
      "Muse Spark is still at work: it's going over your lesson's examples and the mistakes it warns about.",
      "Every challenge must be solvable with the controls a student can touch: that's what takes time.",
      "Almost there. Ask me how your students will use this lab.",
    ],
    ask: "Ask me about your lesson…", send: "Send", you: "You", opening: "Opening the lab in", stay: "Stay here",
  },
};
