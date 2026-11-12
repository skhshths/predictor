// Small synthesised soundscape: engine, wind, and a few UI chimes. No audio files.
export class Audio {
  constructor(volume) { this.volume = volume; this.ctx = null; }

  // Browsers only allow sound after a click or key press, so this is called from one.
  start() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.gain.value = this.volume; this.master.connect(c.destination);
    const noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const noise = () => { const s = c.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.start(); return s; };
    // Piston / prop: two detuned saws through a low-pass.
    this.eng = c.createGain(); this.eng.gain.value = 0;
    this.engLP = c.createBiquadFilter(); this.engLP.type = 'lowpass'; this.engLP.frequency.value = 300;
    this.o1 = c.createOscillator(); this.o1.type = 'sawtooth'; this.o2 = c.createOscillator(); this.o2.type = 'square';
    this.o1.connect(this.engLP); this.o2.connect(this.engLP); this.engLP.connect(this.eng); this.eng.connect(this.master);
    this.o1.start(); this.o2.start();
    // Jet: band-passed noise.
    this.jet = c.createGain(); this.jet.gain.value = 0;
    this.jetBP = c.createBiquadFilter(); this.jetBP.type = 'bandpass'; this.jetBP.frequency.value = 800; this.jetBP.Q.value = 0.7;
    noise().connect(this.jetBP); this.jetBP.connect(this.jet); this.jet.connect(this.master);
    // Wind.
    this.wind = c.createGain(); this.wind.gain.value = 0;
    this.windLP = c.createBiquadFilter(); this.windLP.type = 'lowpass'; this.windLP.frequency.value = 500;
    noise().connect(this.windLP); this.windLP.connect(this.wind); this.wind.connect(this.master);
  }
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }

  // thr 0..1, speed m/s, jet bool, on = engine audible
  update(on, thr, speed, jet) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, set = (p, v) => p.setTargetAtTime(v, t, 0.08);
    const f = 38 + thr * 78;
    set(this.o1.frequency, f); set(this.o2.frequency, f * 0.502);
    set(this.engLP.frequency, 220 + thr * 900);
    set(this.eng.gain, on && !jet ? 0.07 + thr * 0.13 : 0);
    set(this.jetBP.frequency, 500 + thr * 2600);
    set(this.jet.gain, on && jet ? 0.05 + thr * 0.3 : 0);
    set(this.wind.gain, on ? Math.min(0.3, speed / 600) : 0);
    set(this.windLP.frequency, 300 + speed * 6);
  }
  chime(notes = [880, 1320], dur = 0.12) {
    if (!this.ctx) return;
    notes.forEach((n, i) => {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain(), t = this.ctx.currentTime + i * dur * 0.8;
      o.type = 'triangle'; o.frequency.value = n; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 2.2);
      o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur * 2.5);
    });
  }
  thud() {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(), t = this.ctx.currentTime;
    o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(35, t + 0.3); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.4);
  }
}
