export type PercussionName = "body" | "bass" | "dust" | "metal";

export type CapturedAudio = {
  left: Float32Array;
  right: Float32Array;
  sampleRate: number;
  duration: number;
};

type DroneVoice = {
  carrier: OscillatorNode;
  modulator: OscillatorNode;
  modGain: GainNode;
  filter: BiquadFilterNode;
  gain: GainNode;
  pan: StereoPannerNode;
  pitch: number;
};

type HeldPercussion = {
  nodes: AudioScheduledSourceNode[];
  gain: GainNode;
  filter: BiquadFilterNode;
};

const midiToHz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

export class HiDroneEngine {
  private context: AudioContext | null = null;
  private input: GainNode | null = null;
  private masterFilter: BiquadFilterNode | null = null;
  private drive: WaveShaperNode | null = null;
  private dry: GainNode | null = null;
  private wet: GainNode | null = null;
  private delayA: DelayNode | null = null;
  private delayB: DelayNode | null = null;
  private feedbackA: GainNode | null = null;
  private feedbackB: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private output: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private voices = new Map<number, DroneVoice>();
  private heldPercussion = new Map<PercussionName, HeldPercussion>();
  private recorder: ScriptProcessorNode | null = null;
  private recorderSink: GainNode | null = null;
  private recordingLeft: Float32Array[] = [];
  private recordingRight: Float32Array[] = [];
  private recordingFrames = 0;
  private tension = 0.34;
  private movement = 0.38;
  private space = 0.46;
  private damage = 0.22;
  private density = 0.45;

  async start() {
    if (this.context) {
      if (this.context.state === "suspended") await this.context.resume();
      return;
    }

    const AudioContextConstructor = window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) throw new Error("Web Audio is not supported in this browser.");

    const context = new AudioContextConstructor({ latencyHint: "interactive" });
    const input = context.createGain();
    const masterFilter = context.createBiquadFilter();
    const drive = context.createWaveShaper();
    const dry = context.createGain();
    const wet = context.createGain();
    const delayA = context.createDelay(2.5);
    const delayB = context.createDelay(2.5);
    const feedbackA = context.createGain();
    const feedbackB = context.createGain();
    const reverb = context.createConvolver();
    const compressor = context.createDynamicsCompressor();
    const output = context.createGain();

    masterFilter.type = "lowpass";
    masterFilter.frequency.value = 6200;
    masterFilter.Q.value = 0.8;
    compressor.threshold.value = -16;
    compressor.knee.value = 14;
    compressor.ratio.value = 9;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.32;
    output.gain.value = 0.72;

    input.connect(masterFilter).connect(drive);
    drive.connect(dry).connect(compressor);
    drive.connect(delayA);
    drive.connect(delayB);
    delayA.connect(feedbackA).connect(delayB);
    delayB.connect(feedbackB).connect(delayA);
    delayA.connect(wet);
    delayB.connect(wet);
    wet.connect(reverb).connect(compressor);
    compressor.connect(output).connect(context.destination);

    this.context = context;
    this.input = input;
    this.masterFilter = masterFilter;
    this.drive = drive;
    this.dry = dry;
    this.wet = wet;
    this.delayA = delayA;
    this.delayB = delayB;
    this.feedbackA = feedbackA;
    this.feedbackB = feedbackB;
    this.reverb = reverb;
    this.output = output;
    this.noiseBuffer = this.makeNoiseBuffer(3);
    reverb.buffer = this.makeImpulse(3.8, 2.7);
    this.setGlobals({
      tension: this.tension,
      movement: this.movement,
      space: this.space,
      damage: this.damage,
      density: this.density,
    });
  }

  async suspend() {
    if (this.context?.state === "running") await this.context.suspend();
  }

  async resume() {
    if (this.context?.state === "suspended") await this.context.resume();
  }

  isReady() {
    return Boolean(this.context);
  }

  private makeNoiseBuffer(seconds: number) {
    const context = this.context!;
    const buffer = context.createBuffer(2, context.sampleRate * seconds, context.sampleRate);
    for (let channel = 0; channel < 2; channel += 1) {
      const data = buffer.getChannelData(channel);
      let previous = 0;
      for (let i = 0; i < data.length; i += 1) {
        const white = Math.random() * 2 - 1;
        previous = previous * 0.965 + white * 0.035;
        data[i] = white * 0.55 + previous * 0.8;
      }
    }
    return buffer;
  }

  private makeImpulse(seconds: number, decay: number) {
    const context = this.context!;
    const length = context.sampleRate * seconds;
    const impulse = context.createBuffer(2, length, context.sampleRate);
    for (let channel = 0; channel < 2; channel += 1) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < length; i += 1) {
        const envelope = Math.pow(1 - i / length, decay);
        data[i] = (Math.random() * 2 - 1) * envelope;
      }
    }
    return impulse;
  }

  private distortionCurve(amount: number) {
    const curve = new Float32Array(4096);
    const k = 1 + amount * 75;
    for (let i = 0; i < curve.length; i += 1) {
      const x = i * 2 / (curve.length - 1) - 1;
      curve[i] = Math.tanh(x * k) / Math.tanh(k);
    }
    return curve;
  }

  setGlobals(values: {
    tension: number;
    movement: number;
    space: number;
    damage: number;
    density: number;
  }) {
    Object.assign(this, values);
    if (!this.context) return;
    const now = this.context.currentTime;
    this.drive!.curve = this.distortionCurve(values.damage);
    this.drive!.oversample = "4x";
    this.masterFilter!.frequency.setTargetAtTime(2300 + (1 - values.damage) * 6800, now, 0.08);
    this.masterFilter!.Q.setTargetAtTime(0.7 + values.tension * 5, now, 0.08);
    this.delayA!.delayTime.setTargetAtTime(0.13 + values.movement * 0.74, now, 0.12);
    this.delayB!.delayTime.setTargetAtTime(0.21 + values.movement * 1.06, now, 0.12);
    const feedback = Math.min(0.79, 0.12 + values.space * 0.43 + values.tension * 0.18);
    this.feedbackA!.gain.setTargetAtTime(feedback, now, 0.12);
    this.feedbackB!.gain.setTargetAtTime(Math.min(0.8, feedback + 0.035), now, 0.12);
    this.wet!.gain.setTargetAtTime(values.space * 0.7, now, 0.08);
    this.dry!.gain.setTargetAtTime(0.94 - values.space * 0.26, now, 0.08);

    this.voices.forEach((voice, index) => {
      voice.modGain.gain.setTargetAtTime(2 + values.tension * (22 + index * 2), now, 0.1);
      voice.filter.Q.setTargetAtTime(1.1 + values.tension * 7, now, 0.1);
    });
  }

  startVoice(index: number, pitch: number, level = 0.62) {
    if (!this.context || !this.input || this.voices.has(index)) return;
    const context = this.context;
    const now = context.currentTime;
    const frequency = midiToHz(pitch);
    const carrier = context.createOscillator();
    const modulator = context.createOscillator();
    const modGain = context.createGain();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    const pan = context.createStereoPanner();

    carrier.type = index % 3 === 0 ? "sawtooth" : index % 2 === 0 ? "triangle" : "sine";
    carrier.frequency.value = frequency;
    carrier.detune.value = (index % 2 ? 1 : -1) * (4 + index * 0.7);
    modulator.type = index % 2 ? "triangle" : "sine";
    modulator.frequency.value = frequency * (index % 2 ? 0.501 : 0.249);
    modGain.gain.value = 3 + this.tension * (24 + index * 2);
    filter.type = "lowpass";
    filter.frequency.value = Math.min(9000, frequency * (5.5 + this.tension * 8));
    filter.Q.value = 1.1 + this.tension * 7;
    gain.gain.value = 0.0001;
    pan.pan.value = ((index % 4) - 1.5) / 2.1;

    modulator.connect(modGain).connect(carrier.frequency);
    carrier.connect(filter).connect(gain).connect(pan).connect(this.input);
    carrier.start();
    modulator.start();
    gain.gain.exponentialRampToValueAtTime(0.018 + level * 0.032, now + 0.7 + index * 0.06);
    this.voices.set(index, { carrier, modulator, modGain, filter, gain, pan, pitch });
  }

  updateVoice(index: number, pitch: number, level = 0.62) {
    const voice = this.voices.get(index);
    if (!voice || !this.context) return;
    const now = this.context.currentTime;
    const frequency = midiToHz(pitch);
    voice.pitch = pitch;
    voice.carrier.frequency.setTargetAtTime(frequency, now, 0.08);
    voice.modulator.frequency.setTargetAtTime(frequency * (index % 2 ? 0.501 : 0.249), now, 0.12);
    voice.gain.gain.setTargetAtTime(0.018 + level * 0.032, now, 0.08);
  }

  stopVoice(index: number) {
    const voice = this.voices.get(index);
    if (!voice || !this.context) return;
    const now = this.context.currentTime;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setTargetAtTime(0.0001, now, 0.24);
    window.setTimeout(() => {
      try { voice.carrier.stop(); } catch {}
      try { voice.modulator.stop(); } catch {}
      voice.carrier.disconnect();
      voice.modulator.disconnect();
      voice.modGain.disconnect();
      voice.filter.disconnect();
      voice.gain.disconnect();
      voice.pan.disconnect();
    }, 1500);
    this.voices.delete(index);
  }

  pluckVoice(index: number, pitch: number, velocity = 0.72) {
    if (!this.context || !this.input) return;
    const context = this.context;
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const modulator = context.createOscillator();
    const modGain = context.createGain();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    const pan = context.createStereoPanner();
    const frequency = midiToHz(pitch);
    oscillator.type = index % 2 ? "triangle" : "sawtooth";
    oscillator.frequency.setValueAtTime(frequency, now);
    modulator.frequency.value = frequency * 0.5;
    modGain.gain.value = 5 + this.tension * 36;
    filter.type = "lowpass";
    filter.frequency.value = frequency * 7;
    filter.Q.value = 2 + this.tension * 6;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.025 + velocity * 0.055, now + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.7 + this.space * 3.5);
    pan.pan.value = ((index % 4) - 1.5) / 2;
    modulator.connect(modGain).connect(oscillator.frequency);
    oscillator.connect(filter).connect(gain).connect(pan).connect(this.input);
    oscillator.start(now);
    modulator.start(now);
    oscillator.stop(now + 5);
    modulator.stop(now + 5);
  }

  hitPercussion(name: PercussionName, velocity = 0.78, decay = 0.55) {
    if (!this.context || !this.input || !this.noiseBuffer) return;
    const context = this.context;
    const now = context.currentTime;
    const gain = context.createGain();
    const filter = context.createBiquadFilter();
    const pan = context.createStereoPanner();
    pan.pan.value = name === "dust" ? -0.26 : name === "metal" ? 0.3 : 0;
    filter.connect(gain).connect(pan).connect(this.input);
    gain.gain.setValueAtTime(0.0001, now);

    if (name === "body") {
      const oscillator = context.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(120 + this.tension * 90, now);
      oscillator.frequency.exponentialRampToValueAtTime(39, now + 0.12);
      filter.type = "lowpass";
      filter.frequency.value = 480;
      oscillator.connect(filter);
      gain.gain.exponentialRampToValueAtTime(0.18 * velocity, now + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25 + decay * 1.4);
      oscillator.start(now);
      oscillator.stop(now + 2.4);
    } else if (name === "bass") {
      const oscillator = context.createOscillator();
      oscillator.type = "sawtooth";
      oscillator.frequency.setValueAtTime(79 + this.tension * 22, now);
      oscillator.frequency.exponentialRampToValueAtTime(52, now + 0.3);
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(720 + this.tension * 900, now);
      filter.frequency.exponentialRampToValueAtTime(120, now + 0.5 + decay);
      filter.Q.value = 8;
      oscillator.connect(filter);
      gain.gain.exponentialRampToValueAtTime(0.09 * velocity, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42 + decay * 1.6);
      oscillator.start(now);
      oscillator.stop(now + 2.7);
    } else if (name === "dust") {
      const noise = context.createBufferSource();
      noise.buffer = this.noiseBuffer;
      filter.type = "bandpass";
      filter.frequency.value = 640 + this.tension * 1800;
      filter.Q.value = 1.2 + this.damage * 7;
      noise.connect(filter);
      gain.gain.exponentialRampToValueAtTime(0.11 * velocity, now + 0.003);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12 + decay * 1.4);
      noise.start(now, Math.random() * 1.5);
      noise.stop(now + 2);
    } else {
      filter.type = "highpass";
      filter.frequency.value = 760;
      filter.Q.value = 0.8;
      [1, 1.342, 1.918, 2.437, 3.791].forEach((ratio, index) => {
        const oscillator = context.createOscillator();
        const partial = context.createGain();
        oscillator.type = "square";
        oscillator.frequency.value = (250 + this.tension * 190) * ratio;
        partial.gain.value = 0.1 / (index + 1);
        oscillator.connect(partial).connect(filter);
        oscillator.start(now);
        oscillator.stop(now + 2.8);
      });
      gain.gain.exponentialRampToValueAtTime(0.075 * velocity, now + 0.003);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18 + decay * 2.2);
    }
  }

  holdPercussion(name: PercussionName, enabled: boolean) {
    if (!this.context || !this.input || !this.noiseBuffer) return;
    if (!enabled) {
      const held = this.heldPercussion.get(name);
      if (!held) return;
      const now = this.context.currentTime;
      held.gain.gain.setTargetAtTime(0.0001, now, 0.22);
      window.setTimeout(() => {
        held.nodes.forEach((node) => {
          try { node.stop(); } catch {}
          node.disconnect();
        });
        held.gain.disconnect();
        held.filter.disconnect();
      }, 1200);
      this.heldPercussion.delete(name);
      return;
    }
    if (this.heldPercussion.has(name)) return;

    const context = this.context;
    const now = context.currentTime;
    const gain = context.createGain();
    const filter = context.createBiquadFilter();
    const nodes: AudioScheduledSourceNode[] = [];
    gain.gain.value = 0.0001;
    filter.connect(gain).connect(this.input);
    if (name === "dust") {
      const source = context.createBufferSource();
      source.buffer = this.noiseBuffer;
      source.loop = true;
      filter.type = "bandpass";
      filter.frequency.value = 420;
      filter.Q.value = 3;
      source.connect(filter);
      source.start();
      nodes.push(source);
    } else {
      const ratios = name === "metal" ? [1, 1.414, 2.73] : [1];
      ratios.forEach((ratio) => {
        const oscillator = context.createOscillator();
        oscillator.type = name === "body" ? "sine" : name === "bass" ? "sawtooth" : "triangle";
        oscillator.frequency.value = (name === "body" ? 43 : name === "bass" ? 63 : 190) * ratio;
        oscillator.connect(filter);
        oscillator.start();
        nodes.push(oscillator);
      });
      filter.type = name === "metal" ? "bandpass" : "lowpass";
      filter.frequency.value = name === "metal" ? 1450 : 480;
      filter.Q.value = name === "metal" ? 8 : 4;
    }
    gain.gain.exponentialRampToValueAtTime(name === "body" ? 0.045 : 0.028, now + 0.7);
    this.heldPercussion.set(name, { nodes, gain, filter });
  }

  applyPatch(target: string, value: number) {
    if (!this.context) return;
    const now = this.context.currentTime;
    if (target.startsWith("pair-")) {
      const pair = Number(target.slice(5));
      [pair * 2, pair * 2 + 1].forEach((index) => {
        const voice = this.voices.get(index);
        if (!voice) return;
        const base = midiToHz(voice.pitch);
        voice.carrier.frequency.setTargetAtTime(Math.max(20, base * Math.pow(2, value / 24)), now, 0.04);
      });
    } else if (target === "filter") {
      this.masterFilter!.frequency.setTargetAtTime(1800 + (value + 1) * 3600, now, 0.04);
    } else if (target === "delay") {
      this.delayA!.delayTime.setTargetAtTime(Math.max(0.04, 0.36 + value * 0.24), now, 0.05);
    } else if (target === "drive") {
      this.drive!.curve = this.distortionCurve(Math.max(0, this.damage + value * 0.25));
    }
  }

  beginCapture() {
    if (!this.context || !this.output || this.recorder) return;
    this.recordingLeft = [];
    this.recordingRight = [];
    this.recordingFrames = 0;
    const recorder = this.context.createScriptProcessor(4096, 2, 2);
    const sink = this.context.createGain();
    sink.gain.value = 0;
    recorder.onaudioprocess = (event) => {
      const left = new Float32Array(event.inputBuffer.getChannelData(0));
      const sourceRight = event.inputBuffer.numberOfChannels > 1
        ? event.inputBuffer.getChannelData(1)
        : event.inputBuffer.getChannelData(0);
      const right = new Float32Array(sourceRight);
      this.recordingLeft.push(left);
      this.recordingRight.push(right);
      this.recordingFrames += left.length;
    };
    this.output.connect(recorder).connect(sink).connect(this.context.destination);
    this.recorder = recorder;
    this.recorderSink = sink;
  }

  finishCapture(): CapturedAudio | null {
    if (!this.context || !this.recorder) return null;
    this.recorder.disconnect();
    this.recorderSink?.disconnect();
    this.recorder.onaudioprocess = null;
    this.recorder = null;
    this.recorderSink = null;
    const left = new Float32Array(this.recordingFrames);
    const right = new Float32Array(this.recordingFrames);
    let offset = 0;
    this.recordingLeft.forEach((chunk, index) => {
      left.set(chunk, offset);
      right.set(this.recordingRight[index], offset);
      offset += chunk.length;
    });
    const capture = {
      left,
      right,
      sampleRate: this.context.sampleRate,
      duration: this.recordingFrames / this.context.sampleRate,
    };
    this.recordingLeft = [];
    this.recordingRight = [];
    this.recordingFrames = 0;
    return capture;
  }

  wavBlob(capture: CapturedAudio) {
    const frameCount = capture.left.length;
    const buffer = new ArrayBuffer(44 + frameCount * 4);
    const view = new DataView(buffer);
    const writeString = (offset: number, value: string) => {
      for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
    };
    writeString(0, "RIFF");
    view.setUint32(4, 36 + frameCount * 4, true);
    writeString(8, "WAVE");
    writeString(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 2, true);
    view.setUint32(24, capture.sampleRate, true);
    view.setUint32(28, capture.sampleRate * 4, true);
    view.setUint16(32, 4, true);
    view.setUint16(34, 16, true);
    writeString(36, "data");
    view.setUint32(40, frameCount * 4, true);
    let offset = 44;
    for (let i = 0; i < frameCount; i += 1) {
      const left = Math.max(-1, Math.min(1, capture.left[i]));
      const right = Math.max(-1, Math.min(1, capture.right[i]));
      view.setInt16(offset, left < 0 ? left * 0x8000 : left * 0x7fff, true);
      view.setInt16(offset + 2, right < 0 ? right * 0x8000 : right * 0x7fff, true);
      offset += 4;
    }
    return new Blob([view], { type: "audio/wav" });
  }

  async mp3Blob(capture: CapturedAudio) {
    const { Mp3Encoder } = await import("@breezystack/lamejs");
    const encoder = new Mp3Encoder(2, capture.sampleRate, 192);
    const blockSize = 1152;
    const chunks: Uint8Array[] = [];
    const left = new Int16Array(capture.left.length);
    const right = new Int16Array(capture.right.length);
    for (let i = 0; i < capture.left.length; i += 1) {
      left[i] = Math.max(-32768, Math.min(32767, Math.round(capture.left[i] * 32767)));
      right[i] = Math.max(-32768, Math.min(32767, Math.round(capture.right[i] * 32767)));
    }
    for (let i = 0; i < left.length; i += blockSize) {
      const encoded = encoder.encodeBuffer(left.subarray(i, i + blockSize), right.subarray(i, i + blockSize));
      if (encoded.length) chunks.push(new Uint8Array(encoded));
    }
    const final = encoder.flush();
    if (final.length) chunks.push(new Uint8Array(final));
    return new Blob(chunks as BlobPart[], { type: "audio/mpeg" });
  }
}
