const defaultState = structuredClone(window.GODSPLAN_DATA);
let state = loadLocalState();
let editingRoutineId = state.selectedRoutineId || state.routines[0]?.id;
let workoutDraft = {};
let workoutSession = { started: false, routineId: state.selectedRoutineId || state.routines[0]?.id, currentExercise: 0 };
let timer = null;
let timerRemaining = 0;

const titles = {
  dashboard: "Tu plan de entrenamiento",
  routines: "Rutinas",
  workout: "Entrenar",
  history: "Historial",
  backup: "Datos y backup"
};

const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));
const storageKey = "godsplanGymData";
const exerciseGifBase = "https://cdn.jsdelivr.net/gh/JahelCuadrado/ExerciseGymGifsDB@v1.1.0";
let exerciseGifIndexPromise = null;
const exerciseMediaOverrides = {
  "press inclinado con mancuernas": "pectorals/dumbbell-incline-bench-press",
  "press inclinado": "pectorals/dumbbell-incline-bench-press",
  "press convergente en maquina": "pectorals/lever-incline-chest-press-v-2",
  "press maquina": "pectorals/lever-chest-press",
  "pec deck": "pectorals/lever-seated-fly",
  "extension con barra recta/v": "triceps/cable-pushdown",
  "extension por encima de la cabeza con cuerda": "triceps/cable-overhead-triceps-extension-rope-attachment",
  "jalon al pecho": "lats/cable-bar-lateral-pulldown",
  "jalon": "lats/cable-bar-lateral-pulldown",
  "remo sentado": "upper-back/cable-low-seated-row",
  "remo unilateral en polea": "upper-back/cable-seated-one-arm-alternate-row",
  "predicador": "biceps/barbell-preacher-curl",
  "martillo": "biceps/dumbbell-alternate-seated-hammer-curl",
  "bayesian curl": "biceps/cable-one-arm-curl",
  "curl inclinado": "biceps/dumbbell-incline-curl",
  "curl polea baja": "biceps/cable-curl",
  "press militar maquina": "delts/lever-shoulder-press",
  "elevaciones laterales polea": "delts/cable-one-arm-lateral-raise",
  "elevaciones laterales maquina": "delts/lever-lateral-raise",
  "elevaciones laterales": "delts/dumbbell-lateral-raise",
  "pec deck inverso": "delts/cable-seated-rear-lateral-raise",
  "face pull": "delts/cable-standing-rear-delt-row-with-rope",
  "jalon cuerda": "triceps/cable-pushdown-with-rope-attachment",
  "extension unilateral": "triceps/cable-standing-one-arm-triceps-extension",
  "extension cuerda": "triceps/cable-pushdown-with-rope-attachment",
  "prensa": "glutes/sled-45-leg-press",
  "hack squat": "glutes/sled-hack-squat",
  "extension de cuadriceps": "quads/lever-leg-extension",
  "femoral sentado": "hamstrings/lever-seated-leg-curl",
  "femoral tumbado": "hamstrings/lever-lying-leg-curl",
  "gemelos": "calves/sled-calf-press-on-leg-press",
  "crunch maquina": "abs/lever-seated-crunch",
  "crunch polea": "abs/cable-kneeling-crunch"
};

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function loadLocalState() {
  try {
    const saved = JSON.parse(localStorage.getItem("godsplanGymData") || "null");
    if (saved && Array.isArray(saved.routines) && Array.isArray(saved.sessions)) return saved;
  } catch (error) {
    console.warn("No se pudieron cargar los datos locales.", error);
  }
  const initialState = structuredClone(window.GODSPLAN_DATA);
  const todayIds = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const todayId = todayIds[new Date().getDay()];
  if (initialState.routines?.some((routine) => routine.id === todayId)) {
    initialState.selectedRoutineId = todayId;
  }
  return initialState;
}

function persistLocalState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

async function api(action, payload = {}) {
  if (action === "saveRoutine") {
    const routine = payload.routine;
    const index = state.routines.findIndex((item) => item.id === routine.id);
    if (index >= 0) state.routines[index] = routine;
    else state.routines.push(routine);
    state.selectedRoutineId = routine.id;
  } else if (action === "deleteRoutine") {
    if (state.routines.length <= 1) throw new Error("Debe quedar al menos una rutina.");
    state.routines = state.routines.filter((routine) => routine.id !== payload.id);
    state.selectedRoutineId = state.routines[0]?.id || "";
  } else if (action === "selectRoutine") {
    if (!state.routines.some((routine) => routine.id === payload.id)) throw new Error("Rutina no encontrada.");
    state.selectedRoutineId = payload.id;
  } else if (action === "saveSession") {
    const session = payload.session;
    const exercises = (session.exercises || []).map((exercise) => ({
      name: exercise.name,
      sets: (exercise.sets || []).filter((set) => set.done || Number(set.reps) > 0 || Number(set.weight) > 0)
    })).filter((exercise) => exercise.sets.length);
    if (!exercises.length) throw new Error("No hay series para guardar.");
    const volume = exercises.reduce((total, exercise) => total + exercise.sets.reduce((sum, set) => sum + (Number(set.reps) || 0) * (Number(set.weight) || 0), 0), 0);
    state.sessions = [{
      id: uid("session"),
      date: new Date().toISOString(),
      routineId: session.routineId || "",
      routineName: session.routineName || "Sesion",
      volume,
      exercises
    }, ...(state.sessions || [])];
  } else if (action === "clearHistory") {
    state.sessions = [];
  } else if (action === "import") {
    if (!payload.data || !Array.isArray(payload.data.routines) || !Array.isArray(payload.data.sessions)) {
      throw new Error("Backup no valido.");
    }
    state = payload.data;
  } else if (action === "reset") {
    state = structuredClone(defaultState);
  }

  persistLocalState();
  return state;
}

function getRoutine(id = state.selectedRoutineId) {
  return state.routines.find((routine) => routine.id === id) || state.routines[0];
}

function getWorkoutRoutine() {
  return getRoutine(workoutSession.routineId || state.selectedRoutineId);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

function movementType(name, group = "") {
  const text = `${name} ${group}`.toLowerCase();
  if (text.includes("prensa") || text.includes("hack") || text.includes("sentadilla")) return "legs";
  if (text.includes("cuadriceps")) return "legs";
  if (text.includes("femoral")) return "hamstring";
  if (text.includes("gemelo")) return "calf";
  if (text.includes("crunch") || text.includes("abdomen")) return "core";
  if (text.includes("remo")) return "row";
  if (text.includes("jalon") || text.includes("dominada")) return "pulldown";
  if (text.includes("curl") || text.includes("predicador") || text.includes("martillo")) return "curl";
  if (text.includes("triceps") || text.includes("extension") || text.includes("cuerda")) return "triceps";
  if (text.includes("hombro") || text.includes("militar") || text.includes("lateral") || text.includes("face") || text.includes("inverso")) return "shoulder";
  if (text.includes("press")) return "press";
  if (text.includes("pec deck")) return "fly";
  return "generic";
}

function exerciseTips(name, group = "") {
  const type = movementType(name, group);
  const tips = {
    press: ["Escapulas atras y abajo.", "Baja controlado y empuja sin rebotar.", "No bloquees agresivo los codos."],
    fly: ["Pecho alto y hombros bajos.", "Abre hasta notar estiramiento sin dolor.", "Cierra apretando el pecho."],
    row: ["Tira con codos, no con manos.", "Pecho firme y espalda neutra.", "Pausa breve al juntar escapulas."],
    pulldown: ["Pecho arriba antes de tirar.", "Lleva los codos hacia abajo.", "Evita balancearte."],
    curl: ["Codos quietos.", "Sube sin impulso.", "Baja lento hasta extender casi completo."],
    triceps: ["Hombros estables.", "Extiende el codo completo.", "Controla la vuelta sin soltar tension."],
    shoulder: ["Cuello relajado.", "Sube con control.", "No uses impulso lumbar."],
    legs: ["Pies firmes.", "Rodillas alineadas con los pies.", "No busques fallo si no hay seguridad."],
    hamstring: ["Cadera estable.", "Controla la fase de bajada.", "Aprieta femoral al final."],
    calf: ["Rango completo.", "Pausa arriba.", "Baja lento hasta estirar."],
    core: ["Costillas abajo.", "Flexiona el tronco, no tires del cuello.", "Exhala al contraer."],
    generic: ["Tecnica limpia.", "Rango controlado.", "Sube peso solo si cumples reps."]
  };
  return tips[type] || tips.generic;
}

function exerciseDrawing(type) {
  const common = `class="exercise-animation exercise-animation-${type}" viewBox="0 0 160 120" role="img" aria-hidden="true"`;
  const head = `<circle class="skin" cx="80" cy="24" r="9"/>`;
  const torso = `<path class="body-line" d="M80 34 L80 66"/>`;
  const legs = `<path class="body-line" d="M80 66 L63 100"/><path class="body-line" d="M80 66 L97 100"/>`;
  const floor = `<path class="machine-line muted-line" d="M24 104 H136"/>`;
  const body = `${head}${torso}<path class="body-line" d="M60 48 L100 48"/>${legs}`;
  const drawings = {
    press: `<svg ${common}>
      <path class="machine-line muted-line" d="M24 82 H136 M34 82 V42 M126 82 V42"/>
      <g class="person reclined"><circle class="skin" cx="70" cy="57" r="8"/><path class="body-line" d="M77 61 L104 74"/><path class="body-line" d="M103 74 L125 74"/><path class="body-line" d="M94 70 L80 94"/><path class="body-line" d="M103 74 L97 98"/></g>
      <g class="moving press-move"><path class="body-line" d="M72 48 L102 32"/><path class="body-line" d="M84 54 L118 36"/><path class="weight-line" d="M54 42 L136 24"/><circle class="plate" cx="48" cy="43" r="6"/><circle class="plate" cx="142" cy="23" r="6"/></g>
    </svg>`,
    fly: `<svg ${common}>
      <path class="machine-line muted-line" d="M34 98 H126 M80 98 V42"/>
      <g>${head}${torso}${legs}</g>
      <g class="moving fly-move left"><path class="body-line" d="M76 47 C56 36 42 34 29 42"/><circle class="plate" cx="27" cy="42" r="5"/></g>
      <g class="moving fly-move right"><path class="body-line" d="M84 47 C104 36 118 34 131 42"/><circle class="plate" cx="133" cy="42" r="5"/></g>
    </svg>`,
    row: `<svg ${common}>
      ${floor}<path class="machine-line muted-line" d="M24 42 H58 M102 42 H136"/>
      <g class="person row-body"><circle class="skin" cx="83" cy="31" r="9"/><path class="body-line" d="M80 42 L72 72"/><path class="body-line" d="M72 72 L58 98"/><path class="body-line" d="M72 72 L93 98"/></g>
      <g class="moving row-move"><path class="body-line" d="M76 51 L45 42"/><path class="body-line" d="M84 51 L115 42"/><path class="weight-line" d="M28 42 H132"/><path class="machine-line" d="M32 34 L24 42 L32 50 M128 34 L136 42 L128 50"/></g>
    </svg>`,
    pulldown: `<svg ${common}>
      <path class="machine-line muted-line" d="M32 16 H128 M40 16 V104 M120 16 V104 M54 104 H106"/>
      <g>${head}${torso}${legs}</g>
      <g class="moving pulldown-move"><path class="weight-line" d="M42 30 H118"/><path class="body-line" d="M58 31 L70 54"/><path class="body-line" d="M102 31 L90 54"/></g>
    </svg>`,
    curl: `<svg ${common}>
      ${floor}<g>${head}${torso}${legs}</g>
      <g class="moving curl-move"><path class="body-line" d="M61 48 C54 63 59 75 75 73"/><path class="body-line" d="M99 48 C106 63 101 75 85 73"/><path class="weight-line" d="M58 73 H102"/><circle class="plate" cx="52" cy="73" r="5"/><circle class="plate" cx="108" cy="73" r="5"/></g>
    </svg>`,
    triceps: `<svg ${common}>
      <path class="machine-line muted-line" d="M42 14 H118 M80 14 V30"/>
      <g>${head}${torso}${legs}</g>
      <g class="moving triceps-move"><path class="body-line" d="M68 44 L56 28"/><path class="body-line" d="M92 44 L104 28"/><path class="weight-line" d="M54 28 H106"/></g>
    </svg>`,
    shoulder: `<svg ${common}>
      ${floor}<g>${head}${torso}${legs}</g>
      <g class="moving shoulder-move"><path class="body-line" d="M60 48 L36 42"/><path class="body-line" d="M100 48 L124 42"/><circle class="plate" cx="31" cy="41" r="6"/><circle class="plate" cx="129" cy="41" r="6"/></g>
    </svg>`,
    legs: `<svg ${common}>
      <path class="machine-line muted-line" d="M34 102 H132 M106 24 V102 M38 54 H114"/>
      <g class="legpress-body"><circle class="skin" cx="54" cy="40" r="8"/><path class="body-line" d="M61 45 L82 62"/><path class="body-line" d="M82 62 L66 86"/></g>
      <g class="moving legs-move"><path class="body-line" d="M82 62 L111 52"/><path class="body-line" d="M86 70 L116 64"/><path class="weight-line" d="M112 42 V78"/><circle class="plate" cx="122" cy="46" r="7"/><circle class="plate" cx="122" cy="72" r="7"/></g>
    </svg>`,
    hamstring: `<svg ${common}>
      <path class="machine-line muted-line" d="M32 82 H128 M48 62 H95"/>
      <g class="person reclined"><circle class="skin" cx="50" cy="55" r="8"/><path class="body-line" d="M58 59 L92 68"/><path class="body-line" d="M92 68 L112 68"/></g>
      <g class="moving hamstring-move"><path class="body-line" d="M93 69 C104 78 112 86 121 96"/><circle class="plate" cx="124" cy="98" r="6"/></g>
    </svg>`,
    calf: `<svg ${common}>
      <path class="machine-line muted-line" d="M42 104 H118 M60 82 H100"/>
      <g class="moving calf-move">${head}${torso}<path class="body-line" d="M80 66 L68 101"/><path class="body-line" d="M80 66 L92 101"/><path class="weight-line" d="M58 40 H102"/></g>
    </svg>`,
    core: `<svg ${common}>
      <path class="machine-line muted-line" d="M30 94 H130"/>
      <g class="moving core-move"><circle class="skin" cx="58" cy="52" r="8"/><path class="body-line" d="M65 58 C79 66 91 75 104 88"/><path class="body-line" d="M83 76 L62 94"/><path class="body-line" d="M90 80 L78 98"/><path class="body-line" d="M62 58 L46 48"/></g>
    </svg>`,
    generic: `<svg ${common}>${floor}<g>${body}</g><g class="moving generic-move"><path class="weight-line" d="M44 72 H116"/><circle class="plate" cx="38" cy="72" r="6"/><circle class="plate" cx="122" cy="72" r="6"/></g></svg>`
  };
  return drawings[type] || drawings.generic;
}

function mediaSearchTerms(name, group = "") {
  const text = normalizeExerciseName(`${name} ${group}`);
  const aliases = [
    ["press inclinado mancuernas", "incline dumbbell press"],
    ["press inclinado", "incline bench press"],
    ["press convergente maquina", "machine chest press"],
    ["press maquina", "machine chest press"],
    ["pec deck inverso", "reverse pec deck"],
    ["pec deck", "pec deck"],
    ["jalon al pecho", "lat pulldown"],
    ["jalon", "lat pulldown"],
    ["remo sentado", "seated cable row"],
    ["remo unilateral polea", "one arm cable row"],
    ["predicador", "preacher curl"],
    ["martillo", "hammer curl"],
    ["bayesian curl", "bayesian curl"],
    ["curl inclinado", "incline dumbbell curl"],
    ["curl polea baja", "cable curl"],
    ["extension por encima cabeza cuerda", "overhead cable triceps extension"],
    ["extension barra recta", "cable triceps pushdown"],
    ["jalon cuerda", "rope triceps pushdown"],
    ["extension unilateral", "one arm cable triceps extension"],
    ["press militar maquina", "machine shoulder press"],
    ["elevaciones laterales polea", "cable lateral raise"],
    ["elevaciones laterales maquina", "machine lateral raise"],
    ["elevaciones laterales", "lateral raise"],
    ["face pull", "face pull"],
    ["prensa", "leg press"],
    ["hack squat", "hack squat"],
    ["extension cuadriceps", "leg extension"],
    ["femoral sentado", "seated leg curl"],
    ["femoral tumbado", "lying leg curl"],
    ["gemelos", "calf raise"],
    ["crunch maquina", "machine crunch"],
    ["crunch polea", "cable crunch"]
  ];
  const matched = aliases.find(([needle]) => text.includes(needle));
  return [matched?.[1], name, group].filter(Boolean).map(normalizeExerciseName);
}

function exerciseKnownAs(name, group = "") {
  const text = normalizeExerciseName(`${name} ${group}`);
  const names = [
    ["press inclinado mancuernas", "banco inclinado con mancuernas"],
    ["press inclinado", "press de pecho en banco inclinado"],
    ["press convergente maquina", "maquina de press de pecho sentado"],
    ["press maquina", "maquina de press de pecho"],
    ["pec deck inverso", "maquina de aperturas inversas para hombro posterior"],
    ["pec deck", "maquina de aperturas de pecho"],
    ["jalon al pecho", "polea al pecho"],
    ["jalon", "polea al pecho"],
    ["remo sentado", "remo en polea sentado"],
    ["remo unilateral polea", "remo a una mano en polea"],
    ["predicador", "curl en banco predicador"],
    ["martillo", "curl martillo con mancuernas"],
    ["bayesian curl", "curl en polea desde atras"],
    ["curl inclinado", "curl con mancuernas en banco inclinado"],
    ["curl polea baja", "curl de biceps en polea baja"],
    ["extension por encima cabeza cuerda", "extension de triceps por encima de la cabeza en polea"],
    ["extension barra recta", "pushdown de triceps en polea"],
    ["jalon cuerda", "triceps con cuerda en polea"],
    ["extension unilateral", "extension de triceps a una mano en polea"],
    ["press militar maquina", "maquina de press de hombro"],
    ["elevaciones laterales polea", "elevacion lateral con polea"],
    ["elevaciones laterales maquina", "maquina de elevaciones laterales"],
    ["face pull", "tiron a la cara con cuerda en polea"],
    ["prensa", "prensa de piernas"],
    ["hack squat", "sentadilla en maquina hack"],
    ["extension cuadriceps", "maquina de extension de piernas"],
    ["femoral sentado", "maquina de curl femoral sentado"],
    ["femoral tumbado", "maquina de curl femoral tumbado"],
    ["gemelos", "elevacion de gemelos"],
    ["crunch maquina", "maquina de abdominales"],
    ["crunch polea", "abdominal en polea alta"]
  ];
  return names.find(([needle]) => text.includes(needle))?.[1] || "";
}

async function exerciseGifIndex() {
  if (!exerciseGifIndexPromise) {
    exerciseGifIndexPromise = fetch(`${exerciseGifBase}/api/es/exercises.json`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("No se pudo cargar el indice de GIFs")))
      .then((data) => data.exercises || data || []);
  }
  return exerciseGifIndexPromise;
}

function scoreExerciseMedia(exercise, terms) {
  const haystack = normalizeExerciseName(`${exercise.name || ""} ${exercise.id || ""} ${exercise.slug || ""} ${exercise.muscle || ""} ${exercise.equipment || ""}`);
  return terms.reduce((score, term) => {
    if (!term) return score;
    if (haystack.includes(term)) return score + 100;
    return score + term.split(" ").filter((word) => word.length > 2 && haystack.includes(word)).length * 12;
  }, 0);
}

async function findExerciseMedia(target) {
  const override = exerciseMediaOverrides[normalizeExerciseName(target.name)];
  if (override) {
    return {
      name: target.name,
      id: override,
      gifUrl: `${exerciseGifBase}/${override}.gif`
    };
  }

  const exercises = await exerciseGifIndex();
  const terms = mediaSearchTerms(target.name, target.group);
  return exercises
    .map((exercise) => ({ exercise, score: scoreExerciseMedia(exercise, terms) }))
    .filter((item) => item.score >= 100 && item.exercise.gifUrl)
    .sort((a, b) => b.score - a.score)[0]?.exercise || null;
}

function exerciseMediaHtml(target) {
  return `
    <img class="exercise-gif" id="exerciseGif" alt="${escapeHtml(target.name || "Ejercicio")}" hidden>
    <div class="exercise-media-placeholder" id="exerciseMediaPlaceholder">Buscando GIF del ejercicio...</div>
    <span class="exercise-media-caption" id="exerciseMediaCaption"></span>
  `;
}

async function loadExerciseMedia(target) {
  const image = $("#exerciseGif");
  const placeholder = $("#exerciseMediaPlaceholder");
  const caption = $("#exerciseMediaCaption");
  if (!image || !placeholder) return;
  try {
    const media = await findExerciseMedia(target);
    if (!media?.gifUrl) {
      placeholder.textContent = "No encontre un GIF claro para este ejercicio.";
      if (caption) caption.textContent = "Cuando me digas que ejercicios cambias, lo ajusto con el movimiento correcto.";
      return;
    }
    image.onload = () => {
      image.hidden = false;
      placeholder.hidden = true;
      if (caption) caption.textContent = `Referencia visual: ${media.name || target.name}`;
    };
    image.onerror = () => {
      image.hidden = true;
      placeholder.hidden = false;
      placeholder.textContent = "No se pudo cargar el GIF.";
      if (caption) caption.textContent = "Revisa conexion o dime el ejercicio exacto para cambiarlo.";
    };
    image.src = media.gifUrl;
    image.title = media.name || target.name || "";
  } catch (error) {
    placeholder.hidden = false;
    placeholder.textContent = "Sin internet no puedo cargar el GIF.";
    if (caption) caption.textContent = "";
  }
}

function switchView(view) {
  $$(".view").forEach((node) => node.classList.remove("active"));
  $(`#${view}View`).classList.add("active");
  $$(".nav-item").forEach((node) => node.classList.toggle("active", node.dataset.view === view));
  $("#pageTitle").textContent = titles[view];
  renderDynamic();
}

function renderDynamic() {
  renderDashboard();
  renderRoutineList();
  renderRoutineEditor();
  renderWorkout();
  renderHistory();
}

function recordsFromSessions() {
  const records = {};
  for (const session of state.sessions || []) {
    for (const exercise of session.exercises || []) {
      for (const set of exercise.sets || []) {
        const name = exercise.name || "";
        const weight = Number(set.weight) || 0;
        const reps = Number(set.reps) || 0;
        if (!name) continue;
        if (!records[name] || weight > records[name].weight || (weight === records[name].weight && reps > records[name].reps)) {
          records[name] = { name, weight, reps };
        }
      }
    }
  }
  return Object.values(records).sort((a, b) => b.weight - a.weight);
}

function renderDashboard() {
  const totalVolume = (state.sessions || []).reduce((sum, session) => sum + (Number(session.volume) || 0), 0);
  const lastSession = state.sessions?.[0];
  const activeRoutine = getRoutine();
  if ($("#todayLabel")) $("#todayLabel").textContent = new Date().toLocaleDateString("es-ES");
  $("#dashboardSessionCount").textContent = state.sessions.length;
  $("#dashboardRoutineCount").textContent = state.routines.length;
  $("#dashboardSessionStat").textContent = state.sessions.length;
  $("#dashboardVolume").textContent = `${Math.round(totalVolume).toLocaleString("es-ES")} kg`;
  $("#dashboardLastSession").textContent = lastSession ? new Date(lastSession.date).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" }) : "Sin datos";

  $("#dashboardWeekGrid").innerHTML = state.routines.map((routine) => `
    <article class="week-card" style="border-color: ${escapeHtml(routine.color)}">
      <span>${escapeHtml(routine.day || "Dia")}</span>
      <strong>${escapeHtml(routine.name)}</strong>
      <small>${escapeHtml(routine.cardio || routine.goal || "")}</small>
    </article>
  `).join("");

  const records = recordsFromSessions().slice(0, 5);
  $("#dashboardRecords").innerHTML = records.length
    ? records.map((record) => `
      <article class="record-item">
        <strong>${escapeHtml(record.name)}</strong>
        <span class="meta">${Number(record.weight).toLocaleString("es-ES")} kg x ${Number(record.reps)} reps</span>
      </article>
    `).join("")
    : `<p class="empty">Tus marcas apareceran cuando guardes sesiones.</p>`;

  if ($("#dashboardActiveRoutine")) {
    $("#dashboardActiveRoutine").innerHTML = activeRoutine
      ? `<article class="next-card" style="border-color: ${escapeHtml(activeRoutine.color)}">
          <strong>${escapeHtml(activeRoutine.name)}</strong>
          <p class="meta">${escapeHtml(activeRoutine.goal || "")} - ${activeRoutine.exercises.length} ejercicios - ${Number(activeRoutine.rest || 90)}s descanso</p>
        </article>`
      : `<p class="empty">Crea una rutina para empezar.</p>`;
  }

  if ($("#notesGrid")) {
    $("#notesGrid").innerHTML = Object.entries(state.notes || {}).map(([title, items]) => `
      <article class="note-block">
        <strong>${escapeHtml(title.charAt(0).toUpperCase() + title.slice(1))}</strong>
        ${(items || []).map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
      </article>
    `).join("");
  }
}

function renderRoutineList() {
  $("#routineList").innerHTML = state.routines.map((routine) => `
    <button class="routine-card ${routine.id === editingRoutineId ? "active" : ""}" data-id="${escapeHtml(routine.id)}" type="button" style="border-color:${escapeHtml(routine.color)}">
      <strong>${escapeHtml(routine.day || "")} - ${escapeHtml(routine.name)}</strong>
      <span class="meta">${escapeHtml(routine.goal || "")}</span>
      <span class="meta">${routine.exercises.length ? `${routine.exercises.length} ejercicios` : "Descanso"} - ${escapeHtml(routine.cardio || "")}</span>
    </button>
  `).join("");

  $$(".routine-card").forEach((card) => {
    card.addEventListener("click", async () => {
      editingRoutineId = card.dataset.id;
      await api("selectRoutine", { id: editingRoutineId });
      renderDynamic();
    });
  });
}

function renderRoutineEditor() {
  const routine = getRoutine(editingRoutineId);
  if (!routine) return;

  $("#routineEditorTitle").textContent = `${routine.day || ""} - ${routine.name}`;
  $("#routineId").value = routine.id;
  $("#routineDay").value = routine.day || "";
  $("#routineName").value = routine.name || "";
  $("#routineGoal").value = routine.goal || "";
  $("#routineCardio").value = routine.cardio || "";
  $("#routineColor").value = routine.color || "#e0b15b";
  $("#routineRest").value = routine.rest || 90;

  const list = $("#exerciseEditorList");
  list.innerHTML = "";
  routine.exercises.forEach(addExerciseRow);
}

function addExerciseRow(exercise = { id: uid("exercise"), group: "", name: "", sets: 3, reps: "10" }) {
  const template = $("#exerciseTemplate").content.cloneNode(true);
  const row = $(".exercise-row", template);
  row.dataset.id = exercise.id || uid("exercise");
  $(".exercise-group", row).value = exercise.group || "";
  $(".exercise-name", row).value = exercise.name || "";
  $(".exercise-sets", row).value = exercise.sets || 3;
  $(".exercise-reps", row).value = exercise.reps || "10";
  $(".remove-exercise", row).addEventListener("click", () => row.remove());
  $("#exerciseEditorList").appendChild(template);
}

async function saveRoutine(event) {
  event.preventDefault();
  const existing = getRoutine(editingRoutineId);
  const routine = {
    ...existing,
    id: $("#routineId").value || uid("routine"),
    day: $("#routineDay").value.trim() || "Dia",
    name: $("#routineName").value.trim() || "Rutina",
    goal: $("#routineGoal").value.trim(),
    cardio: $("#routineCardio").value.trim(),
    color: $("#routineColor").value,
    rest: Number($("#routineRest").value) || 90,
    exercises: $$(".exercise-row").map((row) => ({
      id: row.dataset.id || uid("exercise"),
      group: $(".exercise-group", row).value.trim(),
      name: $(".exercise-name", row).value.trim(),
      sets: Number($(".exercise-sets", row).value),
      reps: $(".exercise-reps", row).value.trim()
    })).filter((exercise) => exercise.name)
  };
  try {
    await api("saveRoutine", { routine });
    editingRoutineId = routine.id;
    renderDynamic();
  } catch (error) {
    showError(error.message);
  }
}

function createRoutine() {
  editingRoutineId = uid("routine");
  state.routines.push({
    id: editingRoutineId,
    day: "Nuevo dia",
    name: "Nueva rutina",
    goal: "",
    color: "#e0b15b",
    rest: 90,
    cardio: "",
    exercises: [{ id: uid("exercise"), group: "", name: "Ejercicio", sets: 3, reps: "10" }]
  });
  renderDynamic();
}

async function deleteRoutine() {
  try {
    await api("deleteRoutine", { id: editingRoutineId });
    editingRoutineId = state.selectedRoutineId;
    renderDynamic();
  } catch (error) {
    showError(error.message);
  }
}

function renderWorkout() {
  renderWorkoutDays();
  renderQuickStartWorkout();
  if (workoutSession.started) {
    $("#workoutPicker").hidden = true;
    $("#workoutSession").hidden = false;
    renderExerciseScreen();
    return;
  }

  $("#workoutPicker").hidden = false;
  $("#workoutSession").hidden = true;
}

function renderQuickStartWorkout() {
  const routine = getWorkoutRoutine();
  const targetLabel = routine?.exercises?.length ? `${routine.exercises.length} ejercicios` : "Descanso activo";
  $("#quickStartWorkout").innerHTML = `
    <article class="quick-start-card" style="border-color:${escapeHtml(routine?.color || "#e0b15b")}">
      <span class="eyebrow">Entreno seleccionado</span>
      <h2>${escapeHtml(routine?.day || "")} - ${escapeHtml(routine?.name || "Rutina")}</h2>
      <p>${escapeHtml(targetLabel)}${routine?.cardio ? ` - ${escapeHtml(routine.cardio)}` : ""}</p>
      <button class="primary-action wide" id="startWorkoutBtn" type="button">Comenzar ahora</button>
    </article>
  `;
  $("#startWorkoutBtn").addEventListener("click", startWorkoutFlow);
}

function renderWorkoutDays() {
  $("#workoutDaySelector").innerHTML = state.routines.map((routine) => `
    <button class="day-card ${routine.id === workoutSession.routineId ? "active" : ""}" data-id="${escapeHtml(routine.id)}" type="button" style="border-color:${escapeHtml(routine.color)}">
      <span>${escapeHtml(routine.day || "")}</span>
      <strong>${escapeHtml(routine.name || "")}</strong>
      <small>${routine.exercises.length ? `${routine.exercises.length} ejercicios` : "Descanso activo"} - ${escapeHtml(routine.cardio || routine.goal || "")}</small>
    </button>
  `).join("");

  $$(".day-card").forEach((card) => {
    card.addEventListener("click", async () => {
      workoutSession = { started: false, routineId: card.dataset.id, currentExercise: 0 };
      editingRoutineId = card.dataset.id;
      try {
        await api("selectRoutine", { id: card.dataset.id });
        renderDynamic();
      } catch (error) {
        showError(error.message);
      }
    });
  });
}

function ensureWorkoutDraft(routine) {
  if (!workoutDraft[routine.id]) {
    workoutDraft[routine.id] = routine.exercises.map((exercise) => ({
      name: exercise.name,
      sets: Array.from({ length: exercise.sets }, () => ({
        reps: defaultRepsForExercise(exercise),
        weight: previousWeightForExercise(exercise.name),
        done: false
      }))
    }));
  }
  return workoutDraft[routine.id];
}

function startWorkoutFlow() {
  const routine = getWorkoutRoutine();
  if (!routine?.exercises.length) {
    showError("Este dia no tiene ejercicios para registrar.");
    return;
  }
  ensureWorkoutDraft(routine);
  workoutSession = { started: true, routineId: routine.id, currentExercise: 0 };
  renderWorkout();
}

function leaveWorkoutFlow() {
  workoutSession.started = false;
  renderWorkout();
}

function parseRepTarget(reps) {
  const numbers = String(reps || "").match(/\d+/g)?.map(Number) || [];
  if (!numbers.length) return { min: 0, max: 0 };
  return { min: numbers[0], max: numbers[numbers.length - 1] };
}

function defaultRepsForExercise(exercise) {
  const target = parseRepTarget(exercise.reps);
  return target.max || target.min || "";
}

function normalizeExerciseName(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function previousWeightForExercise(exerciseName) {
  const wanted = normalizeExerciseName(exerciseName);
  for (const session of state.sessions || []) {
    const previous = (session.exercises || []).find((exercise) => normalizeExerciseName(exercise.name) === wanted);
    const set = previous?.sets?.find((item) => Number(item.weight) > 0);
    if (set) return Number(set.weight);
  }
  return "";
}

function progressionRule(target) {
  const type = movementType(target.name, target.group);
  const reps = String(target.reps || "");
  if (type === "press" && reps.includes("6-8")) {
    return { label: "Press 6-8", requiredReps: 8, requiredSets: Number(target.sets || 4) };
  }
  if (type === "pulldown" && reps.includes("8-10")) {
    return { label: "Jalon 8-10", requiredReps: 10, requiredSets: Number(target.sets || 4) };
  }
  const repTarget = parseRepTarget(target.reps);
  if (repTarget.max > 0 && ["fly", "curl", "triceps", "shoulder", "calf", "core", "hamstring"].includes(type)) {
    return { label: "Aislamiento", requiredReps: repTarget.max, requiredSets: Number(target.sets || 0) };
  }
  if (repTarget.max > 0) {
    return { label: "Rango objetivo", requiredReps: repTarget.max, requiredSets: Number(target.sets || 0) };
  }
  return null;
}

function suggestedIncrement(exerciseName, group) {
  const type = movementType(exerciseName, group);
  if (type === "legs") return 5;
  if (["calf", "core", "shoulder", "curl", "triceps", "fly"].includes(type)) return 1.25;
  return 2.5;
}

function progressSuggestion(target, draftExercise) {
  const rule = progressionRule(target);
  const completed = draftExercise.sets.filter((set) => set.done);
  if (!completed.length) return "Marca las series hechas para calcular la progresion.";
  if (!rule) return "Guarda la sesion y revisa tu tecnica antes de subir peso.";
  if (completed.length < rule.requiredSets) {
    return "Completa todas las series objetivo antes de decidir si subes peso.";
  }

  const targetSets = completed.slice(0, rule.requiredSets);
  const allAtTop = targetSets.every((set) => Number(set.reps) >= rule.requiredReps);
  const lowestWeight = Math.min(...completed.map((set) => Number(set.weight) || 0));
  if (allAtTop && lowestWeight > 0) {
    const nextWeight = lowestWeight + suggestedIncrement(target.name, target.group);
    return `Condicion cumplida (${rule.label}): sube peso. Prueba ${nextWeight.toLocaleString("es-ES")} kg la proxima vez.`;
  }
  return `Manten el peso hasta lograr ${rule.requiredReps} reps en las ${rule.requiredSets} series con buena tecnica.`;
}

function renderExerciseScreen() {
  const routine = getWorkoutRoutine();
  const draft = ensureWorkoutDraft(routine);
  const total = draft.length;
  workoutSession.currentExercise = Math.max(0, Math.min(workoutSession.currentExercise, total - 1));
  const exerciseIndex = workoutSession.currentExercise;
  const draftExercise = draft[exerciseIndex];
  const target = routine.exercises[exerciseIndex] || { group: "", name: draftExercise.name, sets: draftExercise.sets.length, reps: "" };
  const previousWeight = previousWeightForExercise(target.name);
  const knownAs = exerciseKnownAs(target.name, target.group);

  $("#workoutExerciseScreen").innerHTML = `
    <article class="exercise-focus">
      <div class="exercise-progress">
        <span>Ejercicio ${exerciseIndex + 1} de ${total}</span>
        <strong>${escapeHtml(routine.day || "")} - ${escapeHtml(routine.name || "")}</strong>
      </div>
      <div class="exercise-model">${exerciseMediaHtml(target)}</div>
      <div class="exercise-title-block">
        <span>${escapeHtml(target.group || "Ejercicio")}</span>
        <h2>${escapeHtml(target.name || draftExercise.name)}</h2>
        ${knownAs ? `<p class="exercise-known-as">Buscalo como: ${escapeHtml(knownAs)}</p>` : ""}
        <p class="meta">Objetivo: ${escapeHtml(target.sets)} x ${escapeHtml(target.reps)} - ${escapeHtml(routine.cardio || "")}</p>
        ${previousWeight ? `<p class="meta">Peso anterior cargado: ${Number(previousWeight).toLocaleString("es-ES")} kg. Puedes modificarlo.</p>` : ""}
      </div>
      <div class="tip-list">
        ${exerciseTips(target.name, target.group).map((tip) => `<span>${escapeHtml(tip)}</span>`).join("")}
      </div>
      <div class="mobile-sets">
        ${draftExercise.sets.map((set, setIndex) => `
          <div class="mobile-set-row ${set.done ? "done" : ""}" data-exercise="${exerciseIndex}" data-set="${setIndex}">
            <button class="set-check" type="button" aria-label="Marcar serie ${setIndex + 1}">${set.done ? "OK" : ""}</button>
            <span class="set-number">S${setIndex + 1}</span>
            <label>Reps<input class="workout-reps" type="number" inputmode="numeric" min="0" max="100" value="${escapeHtml(set.reps)}"></label>
            <label>Peso<input class="workout-weight" type="number" inputmode="decimal" min="0" max="500" step="0.5" value="${escapeHtml(set.weight)}"></label>
          </div>
        `).join("")}
      </div>
      <div class="progress-advice">${escapeHtml(progressSuggestion(target, draftExercise))}</div>
      <div class="exercise-actions">
        <button class="secondary-action" id="prevExerciseBtn" type="button" ${exerciseIndex === 0 ? "disabled" : ""}>Anterior</button>
        ${
          exerciseIndex === total - 1
            ? `<button class="primary-action" id="finishWorkoutBtn" type="button">Guardar sesion</button>`
            : `<button class="primary-action" id="nextExerciseBtn" type="button">Siguiente</button>`
        }
      </div>
    </article>
  `;

  $$(".mobile-set-row").forEach((row) => {
    row.addEventListener("input", syncWorkout);
    $(".set-check", row).addEventListener("click", () => {
      const set = draft[Number(row.dataset.exercise)].sets[Number(row.dataset.set)];
      set.done = !set.done;
      renderExerciseScreen();
    });
  });

  $("#prevExerciseBtn")?.addEventListener("click", () => {
    workoutSession.currentExercise -= 1;
    renderExerciseScreen();
  });
  $("#nextExerciseBtn")?.addEventListener("click", () => {
    workoutSession.currentExercise += 1;
    renderExerciseScreen();
  });
  $("#finishWorkoutBtn")?.addEventListener("click", finishWorkout);
  loadExerciseMedia(target);
}

function syncWorkout(event) {
  const row = event.currentTarget;
  const routine = getWorkoutRoutine();
  const set = workoutDraft[routine.id][Number(row.dataset.exercise)].sets[Number(row.dataset.set)];
  set.reps = $(".workout-reps", row).value;
  set.weight = $(".workout-weight", row).value;
  if ($(".workout-done", row)) {
    set.done = $(".workout-done", row).value === "true";
  }
}

async function finishWorkout() {
  const routine = getWorkoutRoutine();
  const draft = workoutDraft[routine.id];
  if (!draft?.length) return;

  const exercises = draft.map((exercise) => ({
    name: exercise.name,
    sets: exercise.sets.filter((set) => set.done || Number(set.reps) > 0 || Number(set.weight) > 0)
  })).filter((exercise) => exercise.sets.length);

  if (!exercises.length) return;

  try {
    await api("saveSession", {
      session: {
        routineId: routine.id,
        routineName: `${routine.day || ""} - ${routine.name}`,
        exercises
      }
    });
    workoutDraft[routine.id] = null;
    workoutSession.started = false;
    switchView("history");
  } catch (error) {
    showError(error.message);
  }
}

function renderHistory() {
  $("#historyList").innerHTML = state.sessions.length
    ? state.sessions.map((session) => `
      <article class="history-item">
        <strong>${escapeHtml(session.routineName)}</strong>
        <span class="meta">${new Date(session.date).toLocaleDateString("es-ES")} - ${Math.round(session.volume).toLocaleString("es-ES")} kg</span>
        <p class="meta">${session.exercises.map((exercise) => `${escapeHtml(exercise.name)}: ${exercise.sets.length} series`).join(" - ")}</p>
      </article>
    `).join("")
    : `<p class="empty">Aun no hay sesiones guardadas.</p>`;
}

function startTimer() {
  timerRemaining = getWorkoutRoutine()?.rest || 90;
  clearInterval(timer);
  updateTimer();
  timer = setInterval(() => {
    timerRemaining -= 1;
    updateTimer();
    if (timerRemaining <= 0) clearInterval(timer);
  }, 1000);
}

function updateTimer() {
  const safe = Math.max(timerRemaining, 0);
  $("#timerDisplay").textContent = `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

function exportData() {
  $("#exportOutput").value = JSON.stringify(state, null, 2);
}

function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 2000000) {
    showError("El backup es demasiado grande.");
    return;
  }
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const imported = JSON.parse(reader.result);
      await api("import", { data: imported });
      editingRoutineId = state.selectedRoutineId;
      renderDynamic();
    } catch (error) {
      showError("El backup no es valido.");
    }
  };
  reader.readAsText(file);
}

function showError(message) {
  $("#exportOutput").value = message;
  switchView("backup");
}

function bindEvents() {
  $$(".nav-item").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
  $$("[data-view-link]").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.viewLink)));
  $("#routineForm").addEventListener("submit", saveRoutine);
  $("#newRoutineBtn").addEventListener("click", createRoutine);
  $("#addExerciseBtn").addEventListener("click", () => addExerciseRow());
  $("#deleteRoutineBtn").addEventListener("click", deleteRoutine);
  $("#backToDaysBtn").addEventListener("click", leaveWorkoutFlow);
  $("#timerBtn").addEventListener("click", startTimer);
  $("#clearHistoryBtn").addEventListener("click", async () => {
    try {
      await api("clearHistory");
      renderDynamic();
    } catch (error) {
      showError(error.message);
    }
  });
  $("#exportBtn").addEventListener("click", exportData);
  $("#importInput").addEventListener("change", importData);
  $("#resetBtn").addEventListener("click", async () => {
    try {
      await api("reset");
      editingRoutineId = state.selectedRoutineId;
      renderDynamic();
    } catch (error) {
      showError(error.message);
    }
  });
}

bindEvents();
renderDynamic();
