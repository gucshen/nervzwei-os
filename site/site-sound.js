/* 站点提示音 —— 与终端同一套合成器，参数一致
   全部用 Web Audio 现场合成，不加载音频文件，避免资源缺失与延迟。 */
(function () {
  'use strict';

  var ctx = null;
  var master = null;
  var noiseBuffers = typeof WeakMap === 'function' ? new WeakMap() : null;
  var VOLUME = 0.55;
  var enabled = true;

  function ac() {
    if (!enabled) return null;
    var C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    if (!ctx) {
      ctx = new C();
      master = ctx.createGain();
      master.gain.value = VOLUME;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
    return ctx;
  }

  function synth(c, type, at, pan) {
    var output = c.createGain();
    var stereo = c.createStereoPanner ? c.createStereoPanner() : null;
    if (stereo) {
      stereo.pan.value = Math.max(-0.65, Math.min(0.65, pan || 0));
      output.connect(stereo);
      stereo.connect(master);
    } else {
      output.connect(master);
    }
    var sources = [];
    var remaining = 0;

    function connect(source, node, gain, delay, duration, attack) {
      attack = attack === undefined ? 0.006 : attack;
      var env = c.createGain();
      var start = at + delay;
      env.gain.setValueAtTime(0, start);
      env.gain.linearRampToValueAtTime(gain, start + Math.min(attack, duration * 0.3));
      env.gain.exponentialRampToValueAtTime(0.00001, start + duration);
      env.gain.linearRampToValueAtTime(0, start + duration + 0.012);
      node.connect(env);
      env.connect(output);
      sources.push(source);
      remaining++;
      source.onended = function () {
        try { source.disconnect(); } catch (e) {}
        try { node.disconnect(); } catch (e) {}
        try { env.disconnect(); } catch (e) {}
        if (--remaining === 0) {
          try { output.disconnect(); } catch (e) {}
          if (stereo) { try { stereo.disconnect(); } catch (e) {} }
        }
      };
      source.start(start);
      source.stop(start + duration + 0.015);
    }

    function tone(f, to, gain, duration, delay, attack) {
      var osc = c.createOscillator();
      osc.frequency.setValueAtTime(f, at + (delay || 0));
      osc.frequency.exponentialRampToValueAtTime(to, at + (delay || 0) + duration);
      connect(osc, osc, gain, delay || 0, duration, attack);
    }

    function air(f, to, gain, duration, delay, attack) {
      var buffer = noiseBuffers && noiseBuffers.get(c);
      if (!buffer) {
        buffer = c.createBuffer(1, Math.floor(c.sampleRate * 2), c.sampleRate);
        var data = buffer.getChannelData(0);
        var seed = 773;
        for (var i = 0; i < data.length; i++) {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          data[i] = seed / 2147483648 - 1;
        }
        if (noiseBuffers) noiseBuffers.set(c, buffer);
      }
      var src = c.createBufferSource();
      var filter = c.createBiquadFilter();
      src.buffer = buffer;
      filter.type = 'bandpass';
      filter.Q.value = 0.8;
      filter.frequency.setValueAtTime(f, at + (delay || 0));
      filter.frequency.exponentialRampToValueAtTime(to, at + (delay || 0) + duration);
      src.connect(filter);
      connect(src, filter, gain, delay || 0, duration, attack === undefined ? 0.008 : attack);
    }

    // 薄玻璃板：快速接触激起不等模态，高阶先衰减
    function glass(fundamental, gain, decay, delay) {
      var modes = [
        [1, 1, 1], [1.47, 0.39, 0.66], [2.09, 0.21, 0.4], [2.73, 0.095, 0.25], [3.86, 0.035, 0.15]
      ];
      for (var i = 0; i < modes.length; i++) {
        var ratio = modes[i][0], amp = modes[i][1], damp = modes[i][2];
        var frequency = fundamental * ratio;
        if (frequency > Math.min(8500, c.sampleRate * 0.42)) continue;
        tone(frequency, frequency, gain * amp, decay * damp, delay || 0, 0.0012);
      }
      air(4800, 3600, gain * 0.24, 0.013, delay || 0, 0.0008);
    }

    switch (type) {
      case 'page-open':
        air(700, 1800, 0.065, 0.18, 0, 0.025);
        tone(360, 480, 0.032, 0.16, 0, 0.014);
        tone(960, 960, 0.009, 0.075, 0.06, 0.01);
        break;
      case 'page-close':
        air(1300, 600, 0.05, 0.13, 0, 0.014);
        tone(420, 280, 0.027, 0.13, 0, 0.01);
        break;
      case 'ui-tick':
        air(1500, 1200, 0.042, 0.036, 0, 0.003);
        tone(820, 820, 0.022, 0.052, 0, 0.003);
        break;
      case 'text-reveal':
        air(2100, 1300, 0.033, 0.064, 0, 0.005);
        tone(1050, 1050, 0.012, 0.06, 0, 0.005);
        break;
      case 'tick':
        glass(1680, 0.064, 0.24);
        break;
      case 'column':
        glass(1280, 0.065, 0.32);
        glass(2050, 0.016, 0.18, 0.045);
        break;
      case 'open':
        glass(1150, 0.071, 0.58);
        glass(2180, 0.025, 0.36, 0.16);
        air(3100, 4400, 0.014, 0.25, 0.035, 0.025);
        break;
      case 'confirm':
        tone(640, 640, 0.039, 0.095, 0, 0.008);
        tone(960, 960, 0.026, 0.15, 0.095, 0.009);
        break;
      case 'back':
        glass(1120, 0.066, 0.22);
        tone(560, 560, 0.012, 0.1, 0.025, 0.002);
        break;
      case 'scan':
        air(1800, 3400, 0.025, 0.8, 0, 0.12);
        for (var s = 0; s < 4; s++) tone(760, 760, 0.025, 0.064, s * 0.19 + 0.15, 0.007);
        break;
      default:
        air(1500, 1200, 0.042, 0.036, 0, 0.003);
        tone(820, 820, 0.022, 0.052, 0, 0.003);
    }
  }

  var lastAt = 0;

  function play(name, pan) {
    if (!enabled) return;
    var c = ac();
    if (!c) return;
    var now = c.currentTime;
    // 同类提示音最小间隔，避免连点叠成噪音
    if (now - lastAt < 0.028) return;
    lastAt = now;
    try { synth(c, name, now + 0.002, pan || 0); } catch (e) {}
  }

  window.SiteSound = {
    play: play,
    get enabled() { return enabled; },
    set enabled(v) { enabled = !!v; },
    volume: function (v) {
      VOLUME = Math.max(0, Math.min(1, v));
      if (master) { try { master.gain.value = VOLUME; } catch (e) {} }
    }
  };
})();
