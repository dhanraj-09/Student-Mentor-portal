/**
 * Injects a synthetic camera and microphone into a page.
 *
 * Playwright's Chromium build ignores --use-fake-device-for-media-capture on
 * this machine, and there is only one physical webcam, so two browsers cannot
 * both capture. Overriding getUserMedia with a canvas/oscillator stream keeps
 * the whole application path intact (real encoded frames, real WebRTC, real
 * E2EE) while giving each browser its own source.
 */
export const fakeMediaScript = (seed) => `
(() => {
  const SEED = ${JSON.stringify(seed)};

  function makeVideoTrack() {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const context = canvas.getContext('2d');
    let frame = 0;
    const draw = () => {
      frame += 1;
      context.fillStyle = SEED === 'a' ? '#123456' : '#563412';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = '#f0f0f0';
      const x = (frame * 4) % canvas.width;
      context.fillRect(x, 180, 120, 120);
      context.font = '32px sans-serif';
      context.fillText(SEED + ' ' + frame, 20, 60);
      requestAnimationFrame(draw);
    };
    draw();
    return canvas.captureStream(30).getVideoTracks()[0];
  }

  function makeAudioTrack() {
    const audioContext = new AudioContext();
    const oscillator = audioContext.createOscillator();
    oscillator.frequency.value = SEED === 'a' ? 440 : 660;
    const destination = audioContext.createMediaStreamDestination();
    oscillator.connect(destination);
    oscillator.start();
    return destination.stream.getAudioTracks()[0];
  }

  const originalEnumerate = navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);

  navigator.mediaDevices.getUserMedia = async (constraints = {}) => {
    const stream = new MediaStream();
    if (constraints.video) stream.addTrack(makeVideoTrack());
    if (constraints.audio) stream.addTrack(makeAudioTrack());
    if (stream.getTracks().length === 0) {
      throw new DOMException('no media requested', 'NotFoundError');
    }
    return stream;
  };

  navigator.mediaDevices.enumerateDevices = async () => {
    try {
      const real = await originalEnumerate();
      if (real.length > 0) return real;
    } catch {
      // fall through to the synthetic list
    }
    return [
      { deviceId: 'virtual-cam', kind: 'videoinput', label: 'Virtual camera', groupId: 'v' },
      { deviceId: 'virtual-mic', kind: 'audioinput', label: 'Virtual microphone', groupId: 'v' },
    ];
  };
})();
`;
