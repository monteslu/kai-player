class p {
  WIDTH = 300;
  HEIGHT = 216;
  DISPLAY_WIDTH = 288;
  DISPLAY_HEIGHT = 192;
  DISPLAY_BOUNDS = [6, 12, 294, 204];
  TILE_WIDTH = 6;
  TILE_HEIGHT = 12;
  hOffset = 0;
  vOffset = 0;
  keyColor = null;
  bgColor = null;
  borderColor = null;
  clut = new Array(16).fill([0, 0, 0]);
  pixels = new Uint8ClampedArray(this.WIDTH * this.HEIGHT).fill(0);
  buffer = new Uint8ClampedArray(this.WIDTH * this.HEIGHT).fill(0);
  imageData = new ImageData(this.WIDTH, this.HEIGHT);
  backgroundRGBA = [0, 0, 0, 0];
  contentBounds = [0, 0, 0, 0];
  constructor() {
    this.init();
  }
  init() {
    this.hOffset = 0, this.vOffset = 0, this.keyColor = null, this.bgColor = null, this.borderColor = null, this.clut = new Array(16).fill([0, 0, 0]), this.pixels = new Uint8ClampedArray(this.WIDTH * this.HEIGHT).fill(0), this.buffer = new Uint8ClampedArray(this.WIDTH * this.HEIGHT).fill(0), this.imageData = new ImageData(this.WIDTH, this.HEIGHT), this.backgroundRGBA = [0, 0, 0, 0], this.contentBounds = [0, 0, 0, 0];
  }
  setCLUTEntry(t, s, o, i) {
    this.clut[t] = [s * 17, o * 17, i * 17];
  }
  renderFrame({ forceKey: t = !1 } = {}) {
    const [s, o, i, e] = [0, 0, this.WIDTH, this.HEIGHT];
    let [n, l, h, a] = [this.WIDTH, this.HEIGHT, 0, 0], _ = !1;
    for (let c = o; c < e; c++)
      for (let D = s; D < i; D++) {
        let C;
        if (this.borderColor !== null && (D < this.DISPLAY_BOUNDS[0] || c < this.DISPLAY_BOUNDS[1] || D >= this.DISPLAY_BOUNDS[2] || c >= this.DISPLAY_BOUNDS[3]))
          C = this.borderColor;
        else {
          const E = D + this.hOffset, O = c + this.vOffset, d = E + O * this.WIDTH;
          C = this.pixels[d];
        }
        const [L, A, H] = this.clut[C], u = C === this.keyColor || t && (C === this.bgColor || this.bgColor == null), T = 4 * (D + c * this.WIDTH);
        this.imageData.data[T] = L, this.imageData.data[T + 1] = A, this.imageData.data[T + 2] = H, this.imageData.data[T + 3] = u ? 0 : 255, u || (_ = !0, n > D && (n = D), l > c && (l = c), h < D && (h = D), a < c && (a = c));
      }
    this.contentBounds = _ || !t ? [n, l, h + 1, a + 1] : [0, 0, 0, 0], this.backgroundRGBA = this.bgColor === null ? [0, 0, 0, t ? 0 : 1] : [...this.clut[this.bgColor], this.bgColor === this.keyColor || t ? 0 : 1];
  }
}
class S {
  color;
  repeat;
  constructor(t) {
    this.color = t[4] & 15, this.repeat = t[5] & 15;
  }
  execute(t) {
    t.pixels.fill(this.color), t.bgColor = this.color, t.borderColor = null, t.hOffset = 0, t.vOffset = 0;
  }
}
class g {
  color;
  constructor(t) {
    this.color = t[4] & 15;
  }
  execute(t) {
    t.borderColor = this.color;
  }
}
class f {
  // some players check bytes[doff+1] & 0x20 and ignores if it is set (?)
  colors;
  row;
  column;
  pixels;
  constructor(t) {
    this.colors = [t[4] & 15, t[5] & 15], this.row = t[6] & 31, this.column = t[7] & 63, this.pixels = t.slice(8, 20);
  }
  /* blit a tile */
  execute(t) {
    const s = this.column * t.TILE_WIDTH, o = this.row * t.TILE_HEIGHT;
    if (s + 6 > t.WIDTH || o + 12 > t.HEIGHT) {
      console.log(`TileBlock out of bounds (${this.row},${this.column})`);
      return;
    }
    for (let i = 0; i < 12; i++) {
      const e = this.pixels[i];
      for (let n = 0; n < 6; n++) {
        const l = this.colors[e >> 5 - n & 1], h = s + n + (o + i) * t.WIDTH;
        this.op(t, h, l);
      }
    }
  }
  op(t, s, o) {
    t.pixels[s] = o;
  }
}
class R extends f {
  op(t, s, o) {
    t.pixels[s] = t.pixels[s] ^ o;
  }
}
class I {
  color;
  hCmd;
  hOffset;
  vCmd;
  vOffset;
  constructor(t) {
    this.color = t[4] & 15;
    const s = t[5] & 63;
    this.hCmd = (s & 48) >> 4, this.hOffset = s & 7;
    const o = t[6] & 63;
    this.vCmd = (o & 48) >> 4, this.vOffset = o & 15;
  }
  execute(t) {
    t.hOffset = Math.min(this.hOffset, 5), t.vOffset = Math.min(this.vOffset, 11);
    let s = 0;
    this.hCmd === 2 ? s = t.TILE_WIDTH : this.hCmd === 1 && (s = -t.TILE_WIDTH);
    let o = 0;
    if (this.vCmd === 2 ? o = t.TILE_HEIGHT : this.vCmd === 1 && (o = -t.TILE_HEIGHT), s === 0 && o === 0)
      return;
    let i, e;
    for (let l = 0; l < t.WIDTH; l++)
      for (let h = 0; h < t.HEIGHT; h++)
        i = l + s, e = h + o, t.buffer[l + h * t.WIDTH] = this.getPixel(t, i, e);
    const n = t.pixels;
    t.pixels = t.buffer, t.buffer = n;
  }
  getPixel(t, s, o) {
    return s > 0 && s < t.WIDTH && o > 0 && o < t.HEIGHT ? t.pixels[s + o * t.WIDTH] : this.color;
  }
}
class m extends I {
  getPixel(t, s, o) {
    return s = (s + t.WIDTH) % t.WIDTH, o = (o + t.HEIGHT) % t.HEIGHT, t.pixels[s + o * t.WIDTH];
  }
}
class P {
  index;
  constructor(t) {
    this.index = t[4] & 15;
  }
  execute(t) {
    t.keyColor = this.index;
  }
}
class G {
  colors;
  constructor(t) {
    this.colors = Array(8);
    for (let s = 0; s < 8; s++) {
      const o = 4 + 2 * s;
      let i = (t[o] & 63) << 6;
      i += t[o + 1] & 63;
      const e = [
        i >> 8,
        // red
        (i & 240) >> 4,
        // green
        i & 15
        // blue
      ];
      this.colors[s] = e;
    }
  }
  execute(t) {
    for (let s = 0; s < 8; s++)
      t.setCLUTEntry(
        s + this.clutOffset,
        this.colors[s][0],
        this.colors[s][1],
        this.colors[s][2]
      );
  }
  get clutOffset() {
    return 0;
  }
}
class B extends G {
  get clutOffset() {
    return 8;
  }
}
class W {
  COMMAND_MASK = 63;
  CDG_COMMAND = 9;
  BY_TYPE = {
    1: S,
    2: g,
    6: f,
    20: I,
    24: m,
    28: P,
    30: G,
    31: B,
    38: R
  };
  bytes;
  numPackets;
  pc;
  constructor(t) {
    this.bytes = new Uint8Array(t), this.numPackets = t.byteLength / 24, this.pc = -1;
  }
  // determine packet we should be at, based on spec
  // of 4 packets per sector @ 75 sectors per second
  parseThrough(t) {
    const s = Math.floor(300 * t), o = [];
    for (this.pc > s && (this.pc = -1, o.isRestarting = !0); this.pc < s && this.pc < this.numPackets; ) {
      this.pc++;
      const i = this.pc * 24, e = this.parse(this.bytes.slice(i, i + 24));
      e && o.push(e);
    }
    return o;
  }
  parse(t) {
    if ((t[0] & this.COMMAND_MASK) === this.CDG_COMMAND) {
      const s = t[1] & this.COMMAND_MASK, o = this.BY_TYPE[s];
      return typeof o < "u" ? new o(t) : (console.log(`Unknown CDG instruction (instruction = ${s})`), !1);
    }
    return !1;
  }
}
class b {
  /** @internal */
  ctx;
  /** @internal */
  parser;
  /** @internal */
  forceKey;
  /** Instantiates a new renderer with the given CD+G file data. The data must be an `ArrayBuffer`, which can be had via the `Response` of a `fetch()`. */
  constructor(t) {
    if (!(t instanceof ArrayBuffer)) throw new Error("buffer must be an ArrayBuffer");
    this.ctx = new p(), this.parser = new W(t);
  }
  /** Renders the frame at the given time index. */
  render(t, s = {}) {
    if (isNaN(t) || t < 0) throw new Error(`Invalid time: ${t}`);
    const o = this.parser.parseThrough(t), i = !!o.length || !!o.isRestarting || s.forceKey !== this.forceKey;
    this.forceKey = s.forceKey, o.isRestarting && this.ctx.init();
    for (const e of o)
      e.execute(this.ctx);
    return i && this.ctx.renderFrame(s), {
      imageData: this.ctx.imageData,
      isChanged: i,
      backgroundRGBA: this.ctx.backgroundRGBA,
      contentBounds: this.ctx.contentBounds
    };
  }
}
export {
  b as default
};
