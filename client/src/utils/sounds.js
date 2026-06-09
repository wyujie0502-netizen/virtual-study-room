// ==================== 高品质白噪音引擎 ====================
// 使用多层合成 + 调制，生成逼真的环境音效（无需外部音频文件）

const SOUND_CONFIG = {
  rain: { name: '雨声', icon: '🌧️', desc: '淅沥雨声，助眠专注' },
  forest: { name: '森林', icon: '🌲', desc: '鸟鸣林风，自然环绕' },
  cafe: { name: '咖啡厅', icon: '☕', desc: '低语氛围，沉浸工作' },
};

class WhiteNoisePlayer {
  constructor() {
    this.audioContext = null;
    this.currentType = null;
    this.isPlaying = false;
    this.volume = 0.5;
    this.nodes = [];        // 所有活动节点
    this.gainNode = null;
    this.modGain = null;    // 调制用的增益节点
    this._stopCallbacks = []; // 停止时需要调用的回调
  }

  init() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
    return this.audioContext;
  }

  // 安全创建节点并追踪
  _track(node) {
    this.nodes.push(node);
    return node;
  }

  // 安全停止并断开
  _safeStop(node) {
    try { node.stop(); } catch (e) { /* 已停止 */ }
    try { node.disconnect(); } catch (e) { /* ignore */ }
  }

  // ==================== 雨声引擎 ====================
  _buildRain() {
    const ctx = this.audioContext;
    const dest = this.gainNode;

    // 底层：粉红噪音（雨的"底色"）
    const pinkNoise = this._createFilteredNoise(ctx, 'pink', 3);
    const pinkFilter = this._track(ctx.createBiquadFilter());
    pinkFilter.type = 'lowpass';
    pinkFilter.frequency.value = 2000;
    pinkFilter.Q.value = 0.5;
    const pinkGain = this._track(ctx.createGain());
    pinkGain.gain.value = 0.35;
    pinkNoise.connect(pinkFilter);
    pinkFilter.connect(pinkGain);
    pinkGain.connect(dest);

    // 中层：高频白噪音（淅沥感）
    const highNoise = this._createFilteredNoise(ctx, 'white', 3);
    const highFilter = this._track(ctx.createBiquadFilter());
    highFilter.type = 'bandpass';
    highFilter.frequency.value = 3500;
    highFilter.Q.value = 1.5;
    const highGain = this._track(ctx.createGain());
    highGain.gain.value = 0.20;
    highNoise.connect(highFilter);
    highFilter.connect(highGain);
    highGain.connect(dest);

    // 雨滴效果：用随机短促脉冲模拟
    this._addRaindrops(ctx, dest, 0.12);

    // 慢速音量波动（模拟雨势变化）
    this._addVolumeModulation(ctx, pinkGain, 0.08, 0.12);
  }

  // ==================== 森林引擎 ====================
  _buildForest() {
    const ctx = this.audioContext;
    const dest = this.gainNode;

    // 底层：深粉红噪音（风吹树叶）
    const windNoise = this._createFilteredNoise(ctx, 'pink', 3);
    const windFilter = this._track(ctx.createBiquadFilter());
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 800;
    const windGain = this._track(ctx.createGain());
    windGain.gain.value = 0.25;
    windNoise.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(dest);

    // 中层：高亮噪音（树叶沙沙）
    const leafNoise = this._createFilteredNoise(ctx, 'pink', 3);
    const leafFilter = this._track(ctx.createBiquadFilter());
    leafFilter.type = 'bandpass';
    leafFilter.frequency.value = 2500;
    leafFilter.Q.value = 2;
    const leafGain = this._track(ctx.createGain());
    leafGain.gain.value = 0.15;
    leafNoise.connect(leafFilter);
    leafFilter.connect(leafGain);
    leafGain.connect(dest);

    // 鸟鸣：随机短促正弦波
    this._addBirdChirps(ctx, dest, 0.08);

    // 缓慢的风势变化
    this._addVolumeModulation(ctx, windGain, 0.15, 0.25);
  }

  // ==================== 咖啡厅引擎 ====================
  _buildCafe() {
    const ctx = this.audioContext;
    const dest = this.gainNode;

    // 底层：极低频噪音（人群低语）
    const murmurNoise = this._createFilteredNoise(ctx, 'brown', 3);
    const murmurFilter = this._track(ctx.createBiquadFilter());
    murmurFilter.type = 'lowpass';
    murmurFilter.frequency.value = 500;
    const murmurGain = this._track(ctx.createGain());
    murmurGain.gain.value = 0.30;
    murmurNoise.connect(murmurFilter);
    murmurFilter.connect(murmurGain);
    murmurGain.connect(dest);

    // 中层：中频噪音（交谈感）
    const talkNoise = this._createFilteredNoise(ctx, 'pink', 3);
    const talkFilter = this._track(ctx.createBiquadFilter());
    talkFilter.type = 'bandpass';
    talkFilter.frequency.value = 600;
    talkFilter.Q.value = 1;
    const talkGain = this._track(ctx.createGain());
    talkGain.gain.value = 0.18;
    talkNoise.connect(talkFilter);
    talkFilter.connect(talkGain);
    talkGain.connect(dest);

    // 杯碟碰撞声
    this._addClinkSounds(ctx, dest, 0.06);

    // 人群声变化
    this._addVolumeModulation(ctx, talkGain, 0.10, 0.20);
  }

  // ==================== 音效辅助 ====================

  // 创建指定类型的循环噪音（多层叠加避免周期性）
  _createFilteredNoise(ctx, type, layerCount = 3) {
    // 用多个 buffer source 叠加避免明显重复
    const merger = this._track(ctx.createGain());
    merger.gain.value = 1 / layerCount;

    for (let i = 0; i < layerCount; i++) {
      const bufferSize = ctx.sampleRate * (1.5 + Math.random() * 1.5); // 不同长度
      const buffer = ctx.createBuffer(1, Math.floor(bufferSize), ctx.sampleRate);
      const data = buffer.getChannelData(0);
      this._fillNoise(data, type);
      const source = this._track(ctx.createBufferSource());
      source.buffer = buffer;
      source.loop = true;
      source.connect(merger);
      source.start(0);
    }

    return merger;
  }

  _fillNoise(data, type) {
    if (type === 'white') {
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    } else if (type === 'pink') {
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < data.length; i++) {
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
    } else if (type === 'brown') {
      let last = 0;
      for (let i = 0; i < data.length; i++) {
        const white = Math.random() * 2 - 1;
        data[i] = (last + 0.02 * white) / 1.02;
        last = data[i];
        data[i] *= 3.5;
      }
    }
  }

  // 雨滴效果：随机短脉冲
  _addRaindrops(ctx, dest, gain) {
    const scheduleDrops = () => {
      if (!this.isPlaying || this.currentType !== 'rain') return;

      const now = ctx.currentTime;
      // 每秒随机 3-8 滴
      const dropsPerSecond = 3 + Math.random() * 5;
      const interval = 1 / dropsPerSecond;

      for (let t = now; t < now + 1.5; t += interval * (0.6 + Math.random() * 0.8)) {
        const osc = this._track(ctx.createOscillator());
        const env = this._track(ctx.createGain());
        const filter = this._track(ctx.createBiquadFilter());

        // 雨滴频率：中高频随机
        osc.type = 'sine';
        osc.frequency.value = 800 + Math.random() * 3000;

        filter.type = 'bandpass';
        filter.frequency.value = 2000 + Math.random() * 4000;
        filter.Q.value = 3;

        // 短促包络
        const duration = 0.02 + Math.random() * 0.06;
        env.gain.setValueAtTime(0, t);
        env.gain.linearRampToValueAtTime(gain * (0.5 + Math.random() * 0.5), t + duration * 0.1);
        env.gain.exponentialRampToValueAtTime(0.001, t + duration);

        osc.connect(filter);
        filter.connect(env);
        env.connect(dest);
        osc.start(t);
        osc.stop(t + duration + 0.01);
      }

      // 继续调度
      this._raindropTimer = setTimeout(scheduleDrops, 1200);
    };
    scheduleDrops();
    this._stopCallbacks.push(() => clearTimeout(this._raindropTimer));
  }

  // 鸟鸣效果
  _addBirdChirps(ctx, dest, gain) {
    const scheduleChirps = () => {
      if (!this.isPlaying || this.currentType !== 'forest') return;

      const now = ctx.currentTime;
      // 每 2-8 秒一次鸟鸣
      const waitTime = 2 + Math.random() * 6;

      // 可能同时 1-3 声鸟叫
      const chirps = 1 + Math.floor(Math.random() * 3);
      for (let c = 0; c < chirps; c++) {
        const t = now + Math.random() * 0.3;
        this._createChirp(ctx, dest, t, gain * (0.7 + Math.random() * 0.3));
      }

      this._birdTimer = setTimeout(scheduleChirps, waitTime * 1000);
    };
    scheduleChirps();
    this._stopCallbacks.push(() => clearTimeout(this._birdTimer));
  }

  _createChirp(ctx, dest, startTime, gain) {
    const osc = this._track(ctx.createOscillator());
    const env = this._track(ctx.createGain());

    // 鸟鸣频段：快速上滑或下滑
    const baseFreq = 2000 + Math.random() * 3000;
    osc.type = Math.random() > 0.5 ? 'sine' : 'triangle';
    osc.frequency.setValueAtTime(baseFreq, startTime);
    osc.frequency.linearRampToValueAtTime(
      baseFreq * (0.7 + Math.random() * 0.6),
      startTime + 0.08
    );
    osc.frequency.linearRampToValueAtTime(
      baseFreq * (0.8 + Math.random() * 0.4),
      startTime + 0.15
    );

    const duration = 0.08 + Math.random() * 0.15;
    env.gain.setValueAtTime(0, startTime);
    env.gain.linearRampToValueAtTime(gain, startTime + duration * 0.2);
    env.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    osc.connect(env);
    env.connect(dest);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.01);
  }

  // 杯碟碰撞效果
  _addClinkSounds(ctx, dest, gain) {
    const scheduleClinks = () => {
      if (!this.isPlaying || this.currentType !== 'cafe') return;

      const now = ctx.currentTime;
      // 每 3-10 秒一次
      const waitTime = 3 + Math.random() * 7;

      const t = now + Math.random() * 0.5;
      const osc = this._track(ctx.createOscillator());
      const env = this._track(ctx.createGain());

      // 杯碟高频
      osc.type = 'sine';
      osc.frequency.setValueAtTime(3000 + Math.random() * 5000, t);
      osc.frequency.exponentialRampToValueAtTime(500 + Math.random() * 500, t + 0.3);

      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(gain, t + 0.005);
      env.gain.exponentialRampToValueAtTime(0.001, t + 0.3);

      osc.connect(env);
      env.connect(dest);
      osc.start(t);
      osc.stop(t + 0.35);

      this._clinkTimer = setTimeout(scheduleClinks, waitTime * 1000);
    };
    scheduleClinks();
    this._stopCallbacks.push(() => clearTimeout(this._clinkTimer));
  }

  // 慢速音量调制
  _addVolumeModulation(ctx, targetGain, depth, speed) {
    const modOsc = this._track(ctx.createOscillator());
    const modGain = this._track(ctx.createGain());
    // 使用低频正弦波调制目标增益
    modOsc.frequency.value = speed; // 非常慢
    modGain.gain.value = depth;
    modOsc.connect(modGain);
    // 将调制信号加到目标增益上（通过中间节点）
    // 简化：直接用另一个 gain 节点放在前面
    const preGain = this._track(ctx.createGain());
    preGain.gain.value = 1.0;

    // 重新连接：targetGain 前面加一个调制节点
    // 这比较复杂，简化为对 preGain 做调制
    const lfo = this._track(ctx.createOscillator());
    const lfoGain = this._track(ctx.createGain());
    lfo.frequency.value = speed;
    lfoGain.gain.value = depth;

    // LFO → lfoGain → preGain.gain (audio param)
    lfo.connect(lfoGain);
    lfoGain.connect(preGain.gain);
    lfo.start(0);

    // 把 preGain 插入到 targetGain 的输入前
    try {
      targetGain.disconnect();
      targetGain.connect(preGain);
      preGain.connect(dest);
    } catch (e) { /* 连接已在 play 中建立 */ }
  }

  // ==================== 主控接口 ====================

  play(type) {
    this.init();
    this.stop();

    this.currentType = type;
    this.gainNode = this._track(this.audioContext.createGain());
    this.gainNode.gain.value = this.volume;

    switch (type) {
      case 'rain': this._buildRain(); break;
      case 'forest': this._buildForest(); break;
      case 'cafe': this._buildCafe(); break;
    }

    this.gainNode.connect(this.audioContext.destination);
    this.isPlaying = true;
  }

  stop() {
    // 清理定时器回调
    this._stopCallbacks.forEach(fn => {
      try { fn(); } catch (e) { /* ignore */ }
    });
    this._stopCallbacks = [];

    // 停止并清理所有音频节点
    for (const node of this.nodes) {
      this._safeStop(node);
    }
    this.nodes = [];

    if (this.gainNode) {
      try { this.gainNode.disconnect(); } catch (e) { /* ignore */ }
      this.gainNode = null;
    }

    this.isPlaying = false;
    this.currentType = null;
  }

  setVolume(vol) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.gainNode) {
      this.gainNode.gain.value = this.volume;
    }
  }

  destroy() {
    this.stop();
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}

const whiteNoisePlayer = new WhiteNoisePlayer();

export { whiteNoisePlayer, SOUND_CONFIG };
