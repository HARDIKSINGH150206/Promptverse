"use client";

// Browser audio for the voice features: mic capture as 16 kHz PCM (AudioWorklet) and an ordered
// playback queue for the agent's sentence-by-sentence WAV clips.

export interface Mic {
  ctx: AudioContext;
  stop: () => void;
}

/** Start the microphone. `onChunk` gets ~100 ms of Int16 PCM; `onLevel` a 0..1 peak per chunk. */
export async function startMic(onChunk: (pcm: ArrayBuffer) => void, onLevel?: (level: number) => void, ctx?: AudioContext): Promise<Mic> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
  });
  const audio = ctx ?? new AudioContext();
  if (audio.state === "suspended") await audio.resume();
  await audio.audioWorklet.addModule("/pcm-worklet.js");
  const src = audio.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(audio, "pcm16k");
  node.port.onmessage = (e: MessageEvent<{ pcm: ArrayBuffer; level: number }>) => {
    onChunk(e.data.pcm);
    onLevel?.(Math.min(1, e.data.level * 2.2));
  };
  src.connect(node); // not connected to the speakers: no feedback loop
  return {
    ctx: audio,
    stop: () => {
      node.port.onmessage = null;
      try {
        src.disconnect();
        node.disconnect();
      } catch {
        /* already disconnected */
      }
      stream.getTracks().forEach((t) => t.stop());
      if (!ctx) void audio.close();
    },
  };
}

/** Plays base64 WAV clips strictly in order; exposes a live output level for visuals. */
export class ClipPlayer {
  private queue: Promise<AudioBuffer | null>[] = [];
  private current: AudioBufferSourceNode | null = null;
  private analyser: AnalyserNode;
  private data: Uint8Array<ArrayBuffer>;
  private draining = false;
  private generation = 0;
  onIdle: (() => void) | null = null;
  onStart: (() => void) | null = null;

  constructor(private ctx: AudioContext) {
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.connect(ctx.destination);
    this.data = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount));
  }

  get playing(): boolean {
    return !!this.current || this.queue.length > 0;
  }

  /** 0..1 loudness of what's playing right now. */
  level(): number {
    if (!this.current) return 0;
    this.analyser.getByteTimeDomainData(this.data);
    let peak = 0;
    for (const v of this.data) peak = Math.max(peak, Math.abs(v - 128));
    return Math.min(1, peak / 64);
  }

  enqueue(b64: string): void {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    this.queue.push(this.ctx.decodeAudioData(bytes.buffer).catch(() => null));
    void this.drain();
  }

  /** Stop now and drop everything queued (caller barged in). */
  interrupt(): void {
    this.generation += 1;
    this.queue = [];
    try {
      this.current?.stop();
    } catch {
      /* not started */
    }
    this.current = null;
    this.draining = false;
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    const gen = this.generation;
    while (this.queue.length && gen === this.generation) {
      const buf = await this.queue.shift()!;
      if (!buf || gen !== this.generation) continue;
      if (this.ctx.state === "suspended") await this.ctx.resume();
      await new Promise<void>((resolve) => {
        const node = this.ctx.createBufferSource();
        node.buffer = buf;
        node.connect(this.analyser);
        node.onended = () => resolve();
        this.current = node;
        this.onStart?.();
        node.start();
      });
      this.current = null;
    }
    if (gen === this.generation) {
      this.draining = false;
      this.onIdle?.();
    }
  }
}
