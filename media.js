const mediaTest = (() => {
  const video = document.querySelector('video');
  const audio = document.querySelector('audio');
  const meter = document.querySelector('#micLevel');
  const kinds = { camera: 'videoinput', speaker: 'audiooutput', mic: 'audioinput' };
  const canSelectOutput = typeof audio.setSinkId === 'function';
  let version = 0;
  let stream;
  let context;
  let animation;
  let audioUrl;

  function stop() {
    version += 1;
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    video.srcObject = null;
    video.hidden = true;
    audio.pause();
    audio.onended = null;
    audio.onerror = null;
    cancelAnimationFrame(animation);
    meter.value = 0;
    if (context) {
      context.close().catch(() => {});
      context = null;
    }
  }

  function errorKey(error) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') return 'accessDenied';
    if (error.name === 'NotFoundError' || error.name === 'OverconstrainedError') return 'noDevice';
    return 'testError';
  }

  async function devices() {
    try {
      return (await navigator.mediaDevices?.enumerateDevices()) ?? [];
    } catch {
      return [];
    }
  }

  function createTestSound() {
    const sampleRate = 16000;
    const tones = [523.25, 659.25, 783.99];
    const toneLength = 0.28;
    const noteSpacing = 0.43;
    const fade = 0.025;
    const gain = 0.16;
    const headerSize = 44;
    const bitsPerSample = 16;
    const sampleBytes = bitsPerSample / 8;
    const samples = Math.ceil(sampleRate * tones.length * noteSpacing);
    const dataLength = samples * sampleBytes;
    const buffer = new DataView(new ArrayBuffer(headerSize + dataLength));
    const writeTag = (offset, tag) => [...tag].forEach((letter, index) => buffer.setUint8(offset + index, letter.charCodeAt(0)));
    writeTag(0, 'RIFF');
    buffer.setUint32(4, buffer.byteLength - 8, true);
    writeTag(8, 'WAVE');
    writeTag(12, 'fmt ');
    buffer.setUint32(16, 16, true); // PCM 格式描述长度
    buffer.setUint16(20, 1, true); // PCM
    buffer.setUint16(22, 1, true); // 单声道
    buffer.setUint32(24, sampleRate, true);
    buffer.setUint32(28, sampleRate * sampleBytes, true);
    buffer.setUint16(32, sampleBytes, true);
    buffer.setUint16(34, bitsPerSample, true);
    writeTag(36, 'data');
    buffer.setUint32(40, dataLength, true);
    for (let index = 0; index < samples; index += 1) {
      const time = index / sampleRate;
      const note = Math.floor(time / noteSpacing);
      const phase = time % noteSpacing;
      const envelope = Math.max(0, Math.min(1, phase / fade, (toneLength - phase) / fade));
      const sample = Math.sin(2 * Math.PI * tones[note] * phase) * envelope * gain;
      buffer.setInt16(headerSize + index * sampleBytes, sample * 32767, true);
    }
    return URL.createObjectURL(new Blob([buffer.buffer], { type: 'audio/wav' }));
  }

  async function playTest({ deviceId, checkVersion, emit }) {
    audioUrl ??= createTestSound();
    if (audio.src !== audioUrl) audio.src = audioUrl;
    if (canSelectOutput && audio.sinkId !== deviceId) await audio.setSinkId(deviceId);
    if (checkVersion !== version) return;
    audio.currentTime = 0;
    audio.onended = () => emit('speakerReady', true);
    audio.onerror = () => emit('testError');
    await audio.play();
    emit('playing');
  }

  function monitorMicrophone(input, emit) {
    const analyser = context.createAnalyser();
    const inputSignalThreshold = 0.015;
    const meterGain = 5;
    let detected = false;
    context.createMediaStreamSource(input).connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    function measure() {
      analyser.getFloatTimeDomainData(samples);
      const rms = Math.sqrt(samples.reduce((sum, value) => sum + value ** 2, 0) / samples.length);
      meter.value = Math.min(1, rms * meterGain);
      if (!detected && rms >= inputSignalThreshold) {
        detected = true;
        emit('micReady', true);
      }
      animation = requestAnimationFrame(measure);
    }
    emit('micReady');
    measure();
  }

  async function startInput({ step, deviceId, checkVersion, emit }) {
    const media = navigator.mediaDevices;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!media?.getUserMedia || (step === 'mic' && !AudioContextClass)) return emit('unsupported');
    if (step === 'mic') {
      context = new AudioContextClass();
      await context.resume();
      if (checkVersion !== version) return;
    }
    const constraint = deviceId ? { deviceId: { exact: deviceId } } : true;
    const input = await media.getUserMedia(step === 'camera' ? { video: constraint } : { audio: constraint });
    if (checkVersion !== version) {
      input.getTracks().forEach((track) => track.stop());
      return;
    }
    stream = input;
    for (const track of input.getTracks()) {
      track.addEventListener('ended', () => {
        if (checkVersion !== version) return;
        stop();
        emit('noDevice', false, true);
      });
    }
    if (step === 'mic') return monitorMicrophone(input, emit);
    video.hidden = false;
    video.srcObject = input;
    await video.play();
    emit('cameraReady', true);
  }

  async function run({ step, deviceId, update }) {
    stop();
    const checkVersion = version;
    const emit = (key, ready = false, force = false) => {
      if (force || checkVersion === version) update(key, ready);
    };
    const options = { step, deviceId, checkVersion, emit };
    emit('loading');
    try {
      if (step === 'speaker') await playTest(options);
      else await startInput(options);
    } catch (error) {
      if (checkVersion !== version) return;
      stop();
      update(errorKey(error), false);
    }
  }

  return { run, stop, devices, kinds, canSelectOutput };
})();
