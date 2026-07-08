'use strict';

const BANDS = [
	{ max: 4, name: 'delta · sleep' },
	{ max: 8, name: 'theta · meditation' },
	{ max: 13, name: 'alpha · relaxed' },
	{ max: 30, name: 'beta · focus' },
	{ max: 100, name: 'gamma · peak focus' },
];

/**
 * @typedef {object} Preset
 * @property {string} id
 * @property {string} name
 * @property {string} tag
 * @property {string} mode
 * @property {number} carrier
 * @property {number} beat
 * @property {string} noise
 * @property {number} noiseLevel
 */

/** @type {Preset[]} */
const PRESETS = [
	{ id: 'focus', name: 'Deep Focus', tag: 'beta 15Hz', mode: 'binaural', carrier: 200, beat: 15, noise: 'pink', noiseLevel: 22 },
	{ id: 'gamma', name: 'Gamma 40', tag: 'isochronic', mode: 'isochronic', carrier: 220, beat: 40, noise: 'off', noiseLevel: 0 },
	{ id: 'flow', name: 'Flow', tag: 'alpha 10Hz', mode: 'binaural', carrier: 180, beat: 10, noise: 'pink', noiseLevel: 18 },
	{ id: 'meditate', name: 'Meditate', tag: 'theta 6Hz', mode: 'binaural', carrier: 150, beat: 6, noise: 'brown', noiseLevel: 20 },
	{ id: 'sleep', name: 'Sleep', tag: 'delta 2.5Hz', mode: 'binaural', carrier: 110, beat: 2.5, noise: 'brown', noiseLevel: 30 },
];

const state = {
	mode: 'binaural',
	carrier: 200,
	beat: 15,
	volume: 60,
	noiseType: 'pink',
	noiseLevel: 22,
	playing: false,
};

// ---- Audio engine ------------------------------------------------------

class Engine {
	constructor() {
		/** @type {AudioContext | null} */
		this.ctx = null;
		/** @type {GainNode | null} */
		this.master = null;
		/** @type {GainNode | null} */
		this.beatGain = null;
		/** @type {GainNode | null} */
		this.noiseGain = null;
		/** @type {AudioScheduledSourceNode[]} */
		this.voices = [];
		/** @type {AudioBufferSourceNode | null} */
		this.noiseSource = null;
		/** @type {{ mode: 'binaural', left: OscillatorNode, right: OscillatorNode } | { mode: 'isochronic', carrier: OscillatorNode, lfo: OscillatorNode } | null} */
		this.tone = null;
	}

	ensureContext() {
		if (this.ctx === null) {
			const Ctx = window.AudioContext || /** @type {typeof AudioContext} */ (/** @type {any} */ (window).webkitAudioContext);
			this.ctx = new Ctx();
			this.master = this.ctx.createGain();
			this.master.gain.value = 0;
			this.master.connect(this.ctx.destination);

			this.beatGain = this.ctx.createGain();
			this.beatGain.gain.value = 0.9;
			this.beatGain.connect(this.master);

			this.noiseGain = this.ctx.createGain();
			this.noiseGain.gain.value = 0;
			this.noiseGain.connect(this.master);
		}
		return this.ctx;
	}

	/**
	 * @returns {{ ctx: AudioContext, master: GainNode, beatGain: GainNode, noiseGain: GainNode }}
	 */
	requireGraph() {
		const { ctx, master, beatGain, noiseGain } = this;
		if (ctx === null || master === null || beatGain === null || noiseGain === null) {
			throw new Error('audio graph not initialised');
		}
		return { ctx, master, beatGain, noiseGain };
	}

	/**
	 * @param {string} type
	 * @returns {AudioBuffer}
	 */
	makeNoiseBuffer(type) {
		const { ctx } = this.requireGraph();
		const seconds = 4;
		const len = ctx.sampleRate * seconds;
		const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
		const data = buffer.getChannelData(0);
		if (type === 'brown') {
			let last = 0;
			for (let i = 0; i < len; i++) {
				const white = Math.random() * 2 - 1;
				last = (last + 0.02 * white) / 1.02;
				data[i] = last * 3.5;
			}
			return buffer;
		}
		// pink noise — Paul Kellet's economical filter
		let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
		for (let i = 0; i < len; i++) {
			const white = Math.random() * 2 - 1;
			b0 = 0.99886 * b0 + white * 0.0555179;
			b1 = 0.99332 * b1 + white * 0.0750759;
			b2 = 0.96900 * b2 + white * 0.1538520;
			b3 = 0.86650 * b3 + white * 0.3104856;
			b4 = 0.55000 * b4 + white * 0.5329522;
			b5 = -0.7616 * b5 - white * 0.0168980;
			data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
			b6 = white * 0.115926;
		}
		return buffer;
	}

	buildVoices() {
		const { ctx, beatGain } = this.requireGraph();
		const now = ctx.currentTime;
		if (state.mode === 'binaural') {
			const merger = ctx.createChannelMerger(2);
			const left = ctx.createOscillator();
			const right = ctx.createOscillator();
			left.type = 'sine';
			right.type = 'sine';
			left.frequency.value = state.carrier - state.beat / 2;
			right.frequency.value = state.carrier + state.beat / 2;
			left.connect(merger, 0, 0);
			right.connect(merger, 0, 1);
			merger.connect(beatGain);
			left.start(now);
			right.start(now);
			this.voices = [left, right];
			this.tone = { mode: 'binaural', left, right };
			return;
		}
		// isochronic — one carrier, amplitude gated at the beat rate
		const carrier = ctx.createOscillator();
		carrier.type = 'sine';
		carrier.frequency.value = state.carrier;

		const gate = ctx.createGain();
		gate.gain.value = 0.5;

		const lfo = ctx.createOscillator();
		lfo.type = 'sine';
		lfo.frequency.value = state.beat;

		const shaper = ctx.createWaveShaper();
		shaper.curve = this.pulseCurve();

		const depth = ctx.createGain();
		depth.gain.value = 0.5;

		lfo.connect(shaper);
		shaper.connect(depth);
		depth.connect(gate.gain);

		carrier.connect(gate);
		gate.connect(beatGain);
		carrier.start(now);
		lfo.start(now);
		this.voices = [carrier, lfo];
		this.tone = { mode: 'isochronic', carrier, lfo };
	}

	pulseCurve() {
		// sharpen a sine into a rounded pulse so the on/off is crisp but click-free
		const n = 1024;
		const curve = new Float32Array(n);
		for (let i = 0; i < n; i++) {
			const x = (i / (n - 1)) * 2 - 1;
			curve[i] = Math.tanh(x * 3);
		}
		return curve;
	}

	startNoise() {
		if (state.noiseType === 'off') return;
		const { ctx, noiseGain } = this.requireGraph();
		this.noiseSource = ctx.createBufferSource();
		this.noiseSource.buffer = this.makeNoiseBuffer(state.noiseType);
		this.noiseSource.loop = true;
		this.noiseSource.connect(noiseGain);
		this.noiseSource.start();
	}

	async play() {
		this.ensureContext();
		const { ctx, master, noiseGain } = this.requireGraph();
		if (ctx.state === 'suspended') await ctx.resume();
		this.buildVoices();
		this.startNoise();
		const now = ctx.currentTime;
		master.gain.cancelScheduledValues(now);
		master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now);
		master.gain.linearRampToValueAtTime(state.volume / 100, now + 0.8);
		noiseGain.gain.setTargetAtTime(state.noiseLevel / 100, now, 0.4);
	}

	/** @param {number} fade */
	stop(fade = 0.6) {
		if (this.ctx === null || this.master === null) return;
		const ctx = this.ctx;
		const master = this.master;
		const now = ctx.currentTime;
		master.gain.cancelScheduledValues(now);
		master.gain.setValueAtTime(master.gain.value, now);
		master.gain.linearRampToValueAtTime(0.0001, now + fade);
		const voices = this.voices;
		const noise = this.noiseSource;
		this.voices = [];
		this.noiseSource = null;
		this.tone = null;
		setTimeout(() => {
			voices.forEach((v) => { try { v.stop(); } catch (e) {} });
			if (noise) { try { noise.stop(); } catch (e) {} }
		}, fade * 1000 + 60);
	}

	/** @param {number} v */
	setVolume(v) {
		if (this.ctx === null || this.master === null || state.playing === false) return;
		this.master.gain.setTargetAtTime(v / 100, this.ctx.currentTime, 0.05);
	}

	/** @param {number} v */
	setNoiseLevel(v) {
		if (this.ctx === null || this.noiseGain === null || state.playing === false) return;
		this.noiseGain.gain.setTargetAtTime(v / 100, this.ctx.currentTime, 0.1);
	}

	// glide the running tone to the current carrier/beat — no rebuild, so the
	// oscillator phase stays continuous and the pitch change is click-free
	setTone() {
		if (state.playing === false || this.ctx === null || this.tone === null) return;
		if (this.tone.mode !== state.mode) { this.refetchVoices(); return; }
		const t = this.ctx.currentTime;
		const glide = 0.03;
		if (this.tone.mode === 'binaural') {
			this.tone.left.frequency.setTargetAtTime(state.carrier - state.beat / 2, t, glide);
			this.tone.right.frequency.setTargetAtTime(state.carrier + state.beat / 2, t, glide);
			return;
		}
		this.tone.carrier.frequency.setTargetAtTime(state.carrier, t, glide);
		this.tone.lfo.frequency.setTargetAtTime(state.beat, t, glide);
	}

	// live-updates that need the graph rebuilt (freq/mode/noise type)
	refetchVoices() {
		if (state.playing === false || this.ctx === null || this.noiseGain === null) return;
		const noiseGain = this.noiseGain;
		this.voices.forEach((v) => { try { v.stop(); } catch (e) {} });
		if (this.noiseSource) { try { this.noiseSource.stop(); } catch (e) {} this.noiseSource = null; }
		this.buildVoices();
		this.startNoise();
		noiseGain.gain.value = state.noiseLevel / 100;
	}
}

const engine = new Engine();

// ---- UI wiring ---------------------------------------------------------

/** @param {string} id @returns {HTMLElement} */
const el = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

/** @param {string} id @returns {HTMLInputElement} */
const inputEl = (id) => /** @type {HTMLInputElement} */ (el(id));

/** @param {string} sel @returns {NodeListOf<HTMLElement>} */
const els = (sel) => /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll(sel));

/** @param {number} beat */
function bandFor(beat) {
	return BANDS.find((b) => beat <= b.max) || BANDS[BANDS.length - 1];
}

function renderPresets() {
	const wrap = el('presets');
	wrap.innerHTML = '';
	PRESETS.forEach((p) => {
		const btn = document.createElement('button');
		btn.className = 'preset';
		btn.dataset.id = p.id;
		btn.innerHTML = `${p.name}<small>${p.tag}</small>`;
		btn.addEventListener('click', () => applyPreset(p));
		wrap.appendChild(btn);
	});
}

/** @param {Preset} p */
function applyPreset(p) {
	state.mode = p.mode;
	state.carrier = p.carrier;
	state.beat = p.beat;
	state.noiseType = p.noise;
	state.noiseLevel = p.noiseLevel;
	syncControls();
	markActivePreset(p.id);
	engine.refetchVoices();
}

/** @param {string} id */
function markActivePreset(id) {
	els('.preset').forEach((b) => {
		b.classList.toggle('active', b.dataset.id === id);
	});
}

function clearActivePreset() {
	els('.preset').forEach((b) => b.classList.remove('active'));
}

function syncControls() {
	inputEl('beat').value = String(state.beat);
	inputEl('carrier').value = String(state.carrier);
	inputEl('vol').value = String(state.volume);
	inputEl('noise').value = String(state.noiseLevel);
	inputEl('noiseType').value = state.noiseType;
	els('.mode').forEach((m) => {
		m.classList.toggle('active', m.dataset.mode === state.mode);
	});
	el('beatVal').textContent = state.beat.toFixed(1) + ' Hz';
	el('beatBand').textContent = bandFor(state.beat).name;
	el('carrierVal').textContent = state.carrier + ' Hz';
	el('volVal').textContent = state.volume + '%';
	el('noiseVal').textContent = state.noiseType === 'off' ? 'off' : state.noiseLevel + '%';
	updateHint();
	updatePulse();
}

function updateHint() {
	const h = el('hint');
	if (state.mode === 'binaural') {
		h.innerHTML = 'Two tones, one per ear — <b>use headphones</b>. Left ' +
			(state.carrier - state.beat / 2).toFixed(1) + ' Hz · Right ' +
			(state.carrier + state.beat / 2).toFixed(1) + ' Hz.';
	} else {
		h.innerHTML = 'A single tone pulsed ' + state.beat.toFixed(1) +
			'× per second — <b>works on speakers</b>, closest to the 40 Hz research stimulus.';
	}
}

function updatePulse() {
	const p = el('pulse');
	p.classList.toggle('on', state.playing);
	if (state.playing) {
		p.style.animationDuration = Math.max(0.15, 1 / state.beat).toFixed(3) + 's';
	}
}

// timer
/** @type {ReturnType<typeof setInterval> | null} */
let timerId = null;
let endAt = 0;

/** @param {number} sec */
function fmt(sec) {
	const m = Math.floor(sec / 60);
	const s = Math.floor(sec % 60);
	return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

function startTimer() {
	const len = parseInt(inputEl('timerLen').value, 10);
	const clock = el('clock');
	clock.classList.remove('idle');
	if (len === 0) {
		const t0 = performance.now();
		clock.textContent = '00:00';
		timerId = setInterval(() => {
			clock.textContent = fmt((performance.now() - t0) / 1000);
		}, 500);
		return;
	}
	endAt = performance.now() + len * 1000;
	clock.textContent = fmt(len);
	timerId = setInterval(() => {
		const left = (endAt - performance.now()) / 1000;
		if (left <= 0) {
			clock.textContent = '00:00';
			togglePlay();
			return;
		}
		clock.textContent = fmt(left);
	}, 500);
}

function stopTimer() {
	if (timerId) clearInterval(timerId);
	timerId = null;
	const clock = el('clock');
	clock.classList.add('idle');
	clock.textContent = '--:--';
}

async function togglePlay() {
	if (state.playing === false) {
		await engine.play();
		state.playing = true;
		setPlayIcon(true);
		startTimer();
	} else {
		engine.stop();
		state.playing = false;
		setPlayIcon(false);
		stopTimer();
	}
	updatePulse();
}

/** @param {boolean} playing */
function setPlayIcon(playing) {
	const icon = el('playIcon');
	icon.innerHTML = playing
		? '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>'
		: '<path d="M8 5v14l11-7z"/>';
	el('play').setAttribute('aria-label', playing ? 'Pause' : 'Play');
}

// events
el('beat').addEventListener('input', (e) => {
	const target = /** @type {HTMLInputElement} */ (e.target);
	state.beat = parseFloat(target.value);
	el('beatVal').textContent = state.beat.toFixed(1) + ' Hz';
	el('beatBand').textContent = bandFor(state.beat).name;
	clearActivePreset();
	updateHint();
	updatePulse();
	engine.setTone();
});

el('carrier').addEventListener('input', (e) => {
	const target = /** @type {HTMLInputElement} */ (e.target);
	state.carrier = parseInt(target.value, 10);
	el('carrierVal').textContent = state.carrier + ' Hz';
	clearActivePreset();
	updateHint();
	engine.setTone();
});

el('vol').addEventListener('input', (e) => {
	const target = /** @type {HTMLInputElement} */ (e.target);
	state.volume = parseInt(target.value, 10);
	el('volVal').textContent = state.volume + '%';
	engine.setVolume(state.volume);
});

el('noise').addEventListener('input', (e) => {
	const target = /** @type {HTMLInputElement} */ (e.target);
	state.noiseLevel = parseInt(target.value, 10);
	el('noiseVal').textContent = state.noiseType === 'off' ? 'off' : state.noiseLevel + '%';
	clearActivePreset();
	engine.setNoiseLevel(state.noiseLevel);
});

el('noiseType').addEventListener('change', (e) => {
	const target = /** @type {HTMLInputElement} */ (e.target);
	state.noiseType = target.value;
	el('noiseVal').textContent = state.noiseType === 'off' ? 'off' : state.noiseLevel + '%';
	clearActivePreset();
	engine.refetchVoices();
});

els('.mode').forEach((m) => {
	m.addEventListener('click', () => {
		const mode = m.dataset.mode;
		if (mode === undefined) return;
		state.mode = mode;
		syncControls();
		clearActivePreset();
		engine.refetchVoices();
	});
});

el('play').addEventListener('click', togglePlay);

// boot
renderPresets();
applyPreset(PRESETS[0]);

// PWA — register the service worker so the app installs and runs offline
if ('serviceWorker' in navigator) {
	window.addEventListener('load', () => {
		navigator.serviceWorker.register('sw.js').catch(() => {});
	});
}
