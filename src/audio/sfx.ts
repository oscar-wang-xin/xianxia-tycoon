/** 轻量 WebAudio 程序化音效（无外部音频文件） */
class Sfx {
  enabled = true;
  private ctx: AudioContext | null = null;

  private ensure(): AudioContext | null {
    if (!this.enabled) return null;
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || (window as any).webkitAudioContext;
        if (!AC) return null;
        this.ctx = new AC();
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    } catch {
      return null;
    }
  }

  private tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.15, delay = 0): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  private noise(dur: number, vol = 0.2): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    src.connect(gain).connect(ctx.destination);
    src.start();
  }

  dice(): void {
    this.noise(0.18, 0.22);
    this.tone(220, 0.1, 'triangle', 0.1, 0.05);
    this.tone(180, 0.12, 'triangle', 0.08, 0.16);
  }

  coin(): void {
    this.tone(880, 0.1, 'sine', 0.14);
    this.tone(1320, 0.16, 'sine', 0.12, 0.07);
  }

  pay(): void {
    this.tone(320, 0.14, 'sawtooth', 0.07);
    this.tone(210, 0.2, 'sine', 0.1, 0.05);
  }

  build(): void {
    this.tone(523, 0.1, 'triangle', 0.12);
    this.tone(659, 0.1, 'triangle', 0.12, 0.09);
    this.tone(784, 0.18, 'triangle', 0.12, 0.18);
  }

  turn(): void {
    this.tone(600, 0.07, 'sine', 0.08);
  }

  click(): void {
    this.tone(660, 0.045, 'triangle', 0.06);
  }

  event(): void {
    this.tone(740, 0.1, 'sine', 0.1);
    this.tone(988, 0.14, 'sine', 0.1, 0.08);
  }

  teleport(): void {
    this.tone(300, 0.3, 'sine', 0.1);
    this.tone(900, 0.3, 'sine', 0.08, 0.05);
    this.noise(0.14, 0.1);
  }

  jail(): void {
    this.tone(150, 0.4, 'square', 0.07);
  }

  fortune(): void {
    [660, 880, 1174].forEach((f, i) => this.tone(f, 0.16, 'sine', 0.11, i * 0.07));
  }

  curse(): void {
    this.tone(196, 0.24, 'sawtooth', 0.08);
    this.tone(139, 0.3, 'sine', 0.1, 0.06);
  }

  step(): void {
    this.tone(520, 0.05, 'triangle', 0.05);
  }

  bankrupt(): void {
    this.tone(220, 0.5, 'sawtooth', 0.08);
  }

  win(): void {
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.13, i * 0.12));
  }

  money(amount: number): void {
    if (amount >= 0) this.coin();
    else this.pay();
  }
}

export const sfx = new Sfx();
