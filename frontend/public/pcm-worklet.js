// Microphone -> 16 kHz mono 16-bit PCM in ~100 ms chunks (what the backend's speech endpoints expect).
// Also posts a rough input level so the UI can animate without an extra AnalyserNode.
class Pcm16k extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / 16000;
    this.acc = 0;
    this.accN = 0;
    this.buf = new Int16Array(1600);
    this.pos = 0;
    this.peak = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      const x = ch[i];
      const a = x < 0 ? -x : x;
      if (a > this.peak) this.peak = a;
      this.acc += x;
      this.accN += 1;
      if (this.accN >= this.ratio) {
        const v = this.acc / this.accN;
        this.acc = 0;
        this.accN -= this.ratio;
        const s = v < -1 ? -1 : v > 1 ? 1 : v;
        this.buf[this.pos++] = s * 0x7fff;
        if (this.pos === this.buf.length) {
          this.port.postMessage({ pcm: this.buf.buffer, level: this.peak }, [this.buf.buffer]);
          this.buf = new Int16Array(1600);
          this.pos = 0;
          this.peak = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor("pcm16k", Pcm16k);
