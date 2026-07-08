'use strict';

const BANDS = [
	{ max: 4, name: 'delta · sleep' },
	{ max: 8, name: 'theta · meditation' },
	{ max: 13, name: 'alpha · relaxed' },
	{ max: 30, name: 'beta · focus' },
	{ max: 100, name: 'gamma · peak focus' },
];

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
		this.ctx = null;
		this.master = null;
		this.beatGain = null;   // holds the binaural/isochronic voices
		this.noiseGain = null;
		this.voices = [];       // active oscillator/source nodes to stop
		this.noiseSource = null;
	}

	ensureContext() {
		if (this.ctx === null) {
			this.ctx = new (window.AudioContext || window.webkitAudioContext)();
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

	makeNoiseBuffer(type) {
		const seconds = 4;
		const len = this.ctx.sampleRate * seconds;
		const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
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
		const now = this.ctx.currentTime;
		if (state.mode === 'binaural') {
			const merger = this.ctx.createChannelMerger(2);
			const left = this.ctx.createOscillator();
			const right = this.ctx.createOscillator();
			left.type = 'sine';
			right.type = 'sine';
			left.frequency.value = state.carrier - state.beat / 2;
			right.frequency.value = state.carrier + state.beat / 2;
			left.connect(merger, 0, 0);
			right.connect(merger, 0, 1);
			merger.connect(this.beatGain);
			left.start(now);
			right.start(now);
			this.voices = [left, right];
			return;
		}
		// isochronic — one carrier, amplitude gated at the beat rate
		const carrier = this.ctx.createOscillator();
		carrier.type = 'sine';
		carrier.frequency.value = state.carrier;

		const gate = this.ctx.createGain();
		gate.gain.value = 0.5;

		const lfo = this.ctx.createOscillator();
		lfo.type = 'sine';
		lfo.frequency.value = state.beat;

		const shaper = this.ctx.createWaveShaper();
		shaper.curve = this.pulseCurve();

		const depth = this.ctx.createGain();
		depth.gain.value = 0.5;

		lfo.connect(shaper);
		shaper.connect(depth);
		depth.connect(gate.gain);

		carrier.connect(gate);
		gate.connect(this.beatGain);
		carrier.start(now);
		lfo.start(now);
		this.voices = [carrier, lfo];
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
		this.noiseSource = this.ctx.createBufferSource();
		this.noiseSource.buffer = this.makeNoiseBuffer(state.noiseType);
		this.noiseSource.loop = true;
		this.noiseSource.connect(this.noiseGain);
		this.noiseSource.start();
	}

	async play() {
		this.ensureContext();
		if (this.ctx.state === 'suspended') await this.ctx.resume();
		this.buildVoices();
		this.startNoise();
		const now = this.ctx.currentTime;
		this.master.gain.cancelScheduledValues(now);
		this.master.gain.setValueAtTime(Math.max(0.0001, this.master.gain.value), now);
		this.master.gain.linearRampToValueAtTime(state.volume / 100, now + 0.8);
		this.noiseGain.gain.setTargetAtTime(state.noiseLevel / 100, now, 0.4);
	}

	stop(fade = 0.6) {
		if (this.ctx === null) return;
		const now = this.ctx.currentTime;
		this.master.gain.cancelScheduledValues(now);
		this.master.gain.setValueAtTime(this.master.gain.value, now);
		this.master.gain.linearRampToValueAtTime(0.0001, now + fade);
		const voices = this.voices;
		const noise = this.noiseSource;
		this.voices = [];
		this.noiseSource = null;
		setTimeout(() => {
			voices.forEach((v) => { try { v.stop(); } catch (e) {} });
			if (noise) { try { noise.stop(); } catch (e) {} }
		}, fade * 1000 + 60);
	}

	setVolume(v) {
		if (this.ctx === null || state.playing === false) return;
		this.master.gain.setTargetAtTime(v / 100, this.ctx.currentTime, 0.05);
	}

	setNoiseLevel(v) {
		if (this.ctx === null || state.playing === false) return;
		this.noiseGain.gain.setTargetAtTime(v / 100, this.ctx.currentTime, 0.1);
	}

	// live-updates that need the graph rebuilt (freq/mode/noise type)
	refetchVoices() {
		if (state.playing === false || this.ctx === null) return;
		this.voices.forEach((v) => { try { v.stop(); } catch (e) {} });
		if (this.noiseSource) { try { this.noiseSource.stop(); } catch (e) {} this.noiseSource = null; }
		this.buildVoices();
		this.startNoise();
		this.noiseGain.gain.value = state.noiseLevel / 100;
	}
}

const engine = new Engine();

// ---- UI wiring ---------------------------------------------------------

const el = (id) => document.getElementById(id);

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

function markActivePreset(id) {
	document.querySelectorAll('.preset').forEach((b) => {
		b.classList.toggle('active', b.dataset.id === id);
	});
}

function clearActivePreset() {
	document.querySelectorAll('.preset').forEach((b) => b.classList.remove('active'));
}

function syncControls() {
	el('beat').value = state.beat;
	el('carrier').value = state.carrier;
	el('vol').value = state.volume;
	el('noise').value = state.noiseLevel;
	el('noiseType').value = state.noiseType;
	document.querySelectorAll('.mode').forEach((m) => {
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
let timerId = null;
let endAt = 0;

function fmt(sec) {
	const m = Math.floor(sec / 60);
	const s = Math.floor(sec % 60);
	return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

function startTimer() {
	const len = parseInt(el('timerLen').value, 10);
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

function setPlayIcon(playing) {
	const icon = el('playIcon');
	icon.innerHTML = playing
		? '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>'
		: '<path d="M8 5v14l11-7z"/>';
	el('play').setAttribute('aria-label', playing ? 'Pause' : 'Play');
}

// events
el('beat').addEventListener('input', (e) => {
	state.beat = parseFloat(e.target.value);
	el('beatVal').textContent = state.beat.toFixed(1) + ' Hz';
	el('beatBand').textContent = bandFor(state.beat).name;
	clearActivePreset();
	updateHint();
	updatePulse();
	engine.refetchVoices();
});

el('carrier').addEventListener('input', (e) => {
	state.carrier = parseInt(e.target.value, 10);
	el('carrierVal').textContent = state.carrier + ' Hz';
	clearActivePreset();
	updateHint();
	engine.refetchVoices();
});

el('vol').addEventListener('input', (e) => {
	state.volume = parseInt(e.target.value, 10);
	el('volVal').textContent = state.volume + '%';
	engine.setVolume(state.volume);
});

el('noise').addEventListener('input', (e) => {
	state.noiseLevel = parseInt(e.target.value, 10);
	el('noiseVal').textContent = state.noiseType === 'off' ? 'off' : state.noiseLevel + '%';
	clearActivePreset();
	engine.setNoiseLevel(state.noiseLevel);
});

el('noiseType').addEventListener('change', (e) => {
	state.noiseType = e.target.value;
	el('noiseVal').textContent = state.noiseType === 'off' ? 'off' : state.noiseLevel + '%';
	clearActivePreset();
	engine.refetchVoices();
});

document.querySelectorAll('.mode').forEach((m) => {
	m.addEventListener('click', () => {
		state.mode = m.dataset.mode;
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
