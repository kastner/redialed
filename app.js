const ROUNDS = 5;
const MEMORIZE_MS = 2500;
const OCTAVE_CENTS = 1200;
const BASE_FREQ = 261.6255653005986;
const PLAYBACK_OCTAVE_OFFSET = 0;
const COUNTDOWN = ["ready", "set", "go"];
const NOTE_HIT_CENTS = 100;
const TUNING_RINGS = {
  sharp: { bullseye: 5, inner: 10, outer: 25 },
  flat: { bullseye: 6, inner: 12, outer: 30 },
};

const state = {
  round: 0,
  targets: [],
  picks: [],
  scores: [],
  targetCents: 0,
  pickCents: 0,
  phase: "intro",
  dragging: false,
  lastY: 0,
  dragEnergy: 0,
  audio: null,
  master: null,
  voices: null,
  raf: 0,
};

const el = {
  app: document.querySelector("#app"),
  back: document.querySelector("#backWave"),
  front: document.querySelector("#frontWave"),
  round: document.querySelector("#roundLabel"),
  intro: document.querySelector("#introPanel"),
  countdown: document.querySelector("#countdownPanel"),
  countdownWord: document.querySelector("#countdownWord"),
  play: document.querySelector("#playPanel"),
  result: document.querySelector("#resultPanel"),
  final: document.querySelector("#finalPanel"),
  start: document.querySelector("#startButton"),
  submit: document.querySelector("#submitButton"),
  next: document.querySelector("#nextButton"),
  again: document.querySelector("#againButton"),
  timerInt: document.querySelector("#timerInt"),
  timerDec: document.querySelector("#timerDec"),
  centsValue: document.querySelector("#centsValue"),
  roundScore: document.querySelector("#roundScore"),
  verdict: document.querySelector("#verdict"),
  verdictTitle: document.querySelector("#verdictTitle"),
  verdictText: document.querySelector("#verdictText"),
  targetCents: document.querySelector("#targetCents"),
  pickedCents: document.querySelector("#pickedCents"),
  missCents: document.querySelector("#missCents"),
  totalScore: document.querySelector("#totalScore"),
  roundList: document.querySelector("#roundList"),
};

function mod(n, m) {
  return ((n % m) + m) % m;
}

function centsToFrequency(cents, octave = 0) {
  return BASE_FREQ * 2 ** ((cents + octave * OCTAVE_CENTS) / OCTAVE_CENTS);
}

function centsError(a, b) {
  return Math.round(Math.abs(mod(a - b + 600, OCTAVE_CENTS) - 600));
}

function signedCentsError(pick, target) {
  return Math.round(mod(pick - target + 600, OCTAVE_CENTS) - 600);
}

function scoreFromError(error) {
  return Math.max(0, Math.min(10, Math.round(10 * Math.exp(-((error / 58) ** 2)) * 100) / 100));
}

function directionLabel(signedError) {
  if (signedError < 0) return "flat";
  if (signedError > 0) return "sharp";
  return "center";
}

function formatSignedCents(value) {
  if (value === 0) return "0c";
  return `${value > 0 ? "+" : ""}${value}c`;
}

function tuningRing(signedError) {
  const side = signedError < 0 ? "flat" : "sharp";
  const error = Math.abs(signedError);
  const rings = TUNING_RINGS[side];
  if (error <= rings.bullseye) return "bullseye";
  if (error <= rings.inner) return "inner";
  if (error <= rings.outer) return "outer";
  return "";
}

function resultCopy(signedError, score) {
  const error = Math.abs(signedError);
  const direction = directionLabel(signedError);
  const offset = direction === "center" ? "dead center" : `${formatSignedCents(signedError)} ${direction}`;
  const ring = tuningRing(signedError);

  if (ring === "bullseye") {
    return {
      tone: "perfect",
      title: "Bull's-eye.",
      text: `${offset}. That was not a guess, that was a tiny act of witchcraft.`,
    };
  }
  if (ring === "inner") {
    return {
      tone: "perfect",
      title: "Inner ring.",
      text: `${offset}. More than acceptable, annoyingly accurate.`,
    };
  }
  if (ring === "outer") {
    return {
      tone: "hit",
      title: "Outer ring.",
      text: `${offset}. Noticeable if you're picky, but still inside the good-note zone.`,
    };
  }
  if (error <= NOTE_HIT_CENTS) {
    return {
      tone: "hit",
      title: "Hit the note.",
      text: `${offset}. Inside the 100-cent hit window. That pitch class counts.`,
    };
  }
  if (error <= 180) {
    return {
      tone: "near",
      title: "Wrong note, close orbit.",
      text: `${offset}. You missed the pitch class, but your ear was at least in the neighborhood.`,
    };
  }
  if (score >= 1.25) {
    return {
      tone: "miss",
      title: "Missed it.",
      text: `${offset}. Recognizable effort, questionable destination.`,
    };
  }
  return {
    tone: "rough",
    title: "Tone deaf behavior.",
    text: `${offset}. The note was over there. You confidently went somewhere else.`,
  };
}

function formatCents(value) {
  return `${String(Math.round(mod(value, OCTAVE_CENTS))).padStart(3, "0")}c`;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomTarget() {
  return Math.floor(Math.random() * OCTAVE_CENTS);
}

function randomStartingPick(target) {
  let pick = 0;
  do {
    pick = Math.floor(Math.random() * OCTAVE_CENTS);
  } while (centsError(pick, target) < 150);
  return pick;
}

async function getAudio() {
  if (!state.audio) state.audio = new AudioContext();
  if (state.audio.state === "suspended") await Promise.race([state.audio.resume(), wait(250)]);
  return state.audio;
}

async function playCountdownBlip(index) {
  const c = await getAudio();
  const t = c.currentTime;
  const baseFreq = [392, 523.25, 659.25][index] || 523.25;
  const gain = c.createGain();
  const filter = c.createBiquadFilter();
  const voices = [1, 2.01];

  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(index === 2 ? 0.18 : 0.12, t + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + (index === 2 ? 0.18 : 0.12));

  filter.type = "lowpass";
  filter.frequency.setValueAtTime(index === 2 ? 2600 : 1800, t);
  filter.Q.value = 0.5;
  gain.connect(filter);
  filter.connect(c.destination);

  voices.forEach((multiple, voiceIndex) => {
    const osc = c.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(baseFreq * multiple, t);
    osc.detune.setValueAtTime(voiceIndex ? -4 : 0, t);
    osc.connect(gain);
    osc.start(t);
    osc.stop(t + 0.22);
  });
}

function stopTone(fast = false) {
  if (!state.voices) return;
  const c = state.audio;
  const t = c.currentTime;
  try {
    const end = fast ? 0.16 : 0.75;
    state.master.gain.cancelScheduledValues(t);
    state.master.gain.setTargetAtTime(0.0001, t, end / 4);
    const voices = state.voices;
    setTimeout(() => {
      voices.forEach((voice) => {
        try {
          voice.osc.stop();
        } catch {}
      });
    }, end * 1000 + 120);
  } catch {}
  state.voices = null;
  state.master = null;
}

async function playTone(cents, volume = 0.26) {
  const c = await getAudio();
  stopTone(true);
  const t = c.currentTime;
  const freq = centsToFrequency(cents, PLAYBACK_OCTAVE_OFFSET);
  const master = c.createGain();
  const lowpass = c.createBiquadFilter();
  const vibrato = c.createOscillator();
  const vibratoDepth = c.createGain();
  const voices = [];

  master.gain.setValueAtTime(0.0001, t);
  master.gain.exponentialRampToValueAtTime(volume * 0.18, t + 0.08);
  master.gain.linearRampToValueAtTime(volume, t + 0.45);

  lowpass.type = "lowpass";
  lowpass.frequency.setValueAtTime(Math.min(freq * 5.2, 3600), t);
  lowpass.Q.value = 0.42;
  master.connect(lowpass);
  lowpass.connect(c.destination);

  vibrato.type = "sine";
  vibrato.frequency.setValueAtTime(3.4, t);
  vibratoDepth.gain.setValueAtTime(freq * 0.0028, t);
  vibrato.connect(vibratoDepth);
  vibrato.start(t);
  voices.push({ osc: vibrato });

  [
    [1, 0, 0.34],
    [1, -5, 0.11],
    [1, 5, 0.11],
    [1.5, 1, 0.075],
    [2, -2, 0.07],
    [2, 6, 0.028],
    [3, 0, 0.014],
    [0.5, -3, 0.05],
  ].forEach(([multiple, detune, gainValue]) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq * multiple, t);
    osc.detune.setValueAtTime(detune, t);
    gain.gain.setValueAtTime(gainValue, t);
    vibratoDepth.connect(osc.frequency);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    voices.push({ osc, multiple });
  });

  state.master = master;
  state.voices = voices;
}

function updateTone(cents) {
  if (!state.voices || !state.audio) return;
  const t = state.audio.currentTime;
  const freq = centsToFrequency(cents, PLAYBACK_OCTAVE_OFFSET);
  state.voices.forEach((voice) => {
    if (voice.multiple) voice.osc.frequency.setTargetAtTime(freq * voice.multiple, t, 0.018);
  });
}

function setVisible(panel) {
  [el.intro, el.countdown, el.play, el.result, el.final].forEach((node) => {
    node.hidden = node !== panel;
  });
}

function setPhase(phase) {
  state.phase = phase;
  el.app.className = `screen ${phase} active`;
}

function setRoundLabel() {
  el.round.textContent = state.round ? `${state.round}/${ROUNDS}` : "Redialed";
}

async function startGame() {
  await getAudio();
  state.round = 0;
  state.targets = Array.from({ length: ROUNDS }, randomTarget);
  state.picks = [];
  state.scores = [];
  nextRound();
}

async function nextRound() {
  state.round += 1;
  setRoundLabel();
  await runCountdown();
  runListen();
}

async function runCountdown() {
  setPhase("countdown");
  setVisible(el.countdown);
  stopTone(true);
  for (const [index, word] of COUNTDOWN.entries()) {
    el.countdownWord.textContent = word;
    el.countdownWord.style.opacity = "1";
    el.countdownWord.style.transform = "translateY(0)";
    playCountdownBlip(index);
    await wait(760);
    el.countdownWord.style.opacity = "0";
    el.countdownWord.style.transform = "translateY(14px)";
    await wait(170);
  }
}

async function runListen() {
  setPhase("listening");
  setVisible(el.play);
  el.submit.disabled = true;
  el.play.classList.remove("tuning");
  state.targetCents = state.targets[state.round - 1];
  state.pickCents = state.targetCents;
  el.centsValue.textContent = "000";

  await wait(220);
  await playTone(state.targetCents, 0.28);

  const started = performance.now();
  function tick() {
    const remaining = Math.max(0, MEMORIZE_MS - (performance.now() - started));
    const seconds = remaining / 1000;
    const intPart = Math.floor(seconds);
    const decPart = Math.floor((seconds - intPart) * 100);
    el.timerInt.textContent = String(intPart);
    el.timerDec.textContent = String(decPart).padStart(2, "0");
    if (remaining > 0) requestAnimationFrame(tick);
    else transitionToTune();
  }
  tick();
}

async function transitionToTune() {
  stopTone(true);
  await wait(280);
  setPhase("tuning");
  el.play.classList.add("tuning");
  state.pickCents = randomStartingPick(state.targetCents);
  el.centsValue.textContent = String(Math.round(state.pickCents)).padStart(3, "0");
  el.submit.disabled = false;
  await playTone(state.pickCents, 0.22);
}

function submitRound() {
  if (state.phase !== "tuning") return;
  stopTone(true);
  const signedError = signedCentsError(state.pickCents, state.targetCents);
  const error = Math.abs(signedError);
  const score = scoreFromError(error);
  const verdict = resultCopy(signedError, score);
  state.picks.push(state.pickCents);
  state.scores.push(score);

  el.targetCents.textContent = formatCents(state.targetCents);
  el.pickedCents.textContent = formatCents(state.pickCents);
  el.missCents.textContent = `${formatSignedCents(signedError)} ${directionLabel(signedError)}`;
  el.missCents.className = directionLabel(signedError);
  el.roundScore.textContent = score.toFixed(2);
  el.roundScore.className = `round-score ${verdict.tone}`;
  el.verdict.className = `verdict ${verdict.tone}`;
  el.verdictTitle.textContent = verdict.title;
  el.verdictText.textContent = verdict.text;
  el.next.textContent = state.round >= ROUNDS ? "See score" : "Next round";

  setPhase("result");
  setVisible(el.result);
}

function showFinal() {
  const total = state.scores.reduce((sum, score) => sum + score, 0);
  el.totalScore.textContent = `${total.toFixed(2)}/50`;
  el.roundList.innerHTML = state.scores
    .map((score, index) => {
      const error = centsError(state.picks[index], state.targets[index]);
      return `<li><span>${index + 1}/${ROUNDS}</span><strong>${score.toFixed(2)}</strong><span>${error}c miss</span></li>`;
    })
    .join("");
  state.round = 0;
  setRoundLabel();
  setPhase("final");
  setVisible(el.final);
}

function drawWave(canvas, blurLayer) {
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!width || !height) return;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);
  ctx.globalCompositeOperation = "lighter";

  const time = performance.now() / 1000;
  const norm = mod(state.phase === "result" ? state.targetCents : state.pickCents, OCTAVE_CENTS) / OCTAVE_CENTS;
  const centerX = width / 2;
  const amp = width * (0.03 + Math.pow(norm, 0.7) * 0.35) * (1 + state.dragEnergy * 0.35);
  const strands = 24;

  for (let i = 0; i < strands; i += 1) {
    const offset = i / (strands - 1) - 0.5;
    const edge = Math.abs(offset) * 2;
    ctx.beginPath();
    ctx.lineWidth = blurLayer ? 5 : 1.05;
    for (let y = 0; y <= height; y += 2) {
      const u = y / height;
      const envelope = 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(u * Math.PI * 3.2 + time * 0.2), 1.45);
      const wave =
        Math.sin(u * Math.PI * (4 + norm * 5) + time * 0.55 + offset * 1.4) * 0.62 +
        Math.sin(u * Math.PI * (7 + norm * 4) + time * 0.3 + offset * 0.7) * 0.38;
      const x = centerX + offset * amp * 2 * envelope * wave;
      if (y === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    const hue = 270 - i * 5.5;
    ctx.strokeStyle = `hsla(${hue}, 95%, ${58 + edge * 18}%, ${blurLayer ? 0.16 : 0.08 + edge * 0.22})`;
    ctx.stroke();
  }
  ctx.globalCompositeOperation = "source-over";
}

function animate() {
  drawWave(el.back, true);
  drawWave(el.front, false);
  state.dragEnergy *= 0.94;
  state.raf = requestAnimationFrame(animate);
}

function beginDrag(event) {
  if (state.phase !== "tuning" || event.target.closest("button")) return;
  state.dragging = true;
  state.lastY = event.clientY;
  el.app.setPointerCapture(event.pointerId);
}

function moveDrag(event) {
  if (!state.dragging || state.phase !== "tuning") return;
  const dy = state.lastY - event.clientY;
  state.lastY = event.clientY;
  state.pickCents = mod(state.pickCents + dy * 1.9, OCTAVE_CENTS);
  el.centsValue.textContent = String(Math.round(state.pickCents)).padStart(3, "0");
  updateTone(state.pickCents);
  state.dragEnergy = Math.min(1, state.dragEnergy + 0.05);
}

function endDrag() {
  state.dragging = false;
}

el.start.addEventListener("click", startGame);
el.submit.addEventListener("click", submitRound);
el.next.addEventListener("click", () => {
  if (state.round >= ROUNDS) showFinal();
  else nextRound();
});
el.again.addEventListener("click", startGame);
el.app.addEventListener("pointerdown", beginDrag);
el.app.addEventListener("pointermove", moveDrag);
el.app.addEventListener("pointerup", endDrag);
el.app.addEventListener("pointercancel", endDrag);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) stopTone(true);
});

animate();
