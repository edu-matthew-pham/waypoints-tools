// Copies microphone samples (mixed to mono) to the page, unchanged, at the audio context's rate
// (the microphone's own rate where the browser allows it). MediaPipe does the resampling to 16 kHz.
// Samples are sent in chunks of 2048 (about 40 ms) rather than every 128.
const CHUNK = 2048;

class Capture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Float32Array(CHUNK);
    this.n = 0;
  }

  process(inputs) {
    const chans = inputs[0];
    if (chans && chans.length) {
      const len = chans[0].length;
      for (let i = 0; i < len; i++) {
        let sum = 0;
        for (const ch of chans) sum += ch[i];
        this.buf[this.n++] = sum / chans.length;
        if (this.n === CHUNK) {
          this.port.postMessage(this.buf, [this.buf.buffer]);
          this.buf = new Float32Array(CHUNK);
          this.n = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor("capture", Capture);
