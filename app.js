const steps = ['camera', 'speaker', 'mic'];
const stepButtons = [...document.querySelectorAll('[data-step]')];
const panels = [...document.querySelectorAll('[data-view]')];
const selectInputs = [...document.querySelectorAll('[data-device]')];
const modal = document.querySelector('#welcomeModal');
const statusLine = document.querySelector('#checkStatus');
const confirmButton = document.querySelector('#confirmCheck');
const confirmLabel = document.querySelector('#confirmLabel');
const advanceButton = document.querySelector('#advanceStep');
const advanceLabel = document.querySelector('#advanceLabel');
const backButton = document.querySelector('#backStep');
const speakerStatus = document.querySelector('[data-speaker-status]');
const toast = document.querySelector('.toast');
const confirmedSteps = new Set();
let activeStep = steps[0];
let locale = 'en';
let statusKey = '';
let testReady = false;
let deviceList = [];
let toastTimer;

function renderDevices() {
  const words = copy[locale];
  for (const select of selectInputs) {
    const step = select.dataset.device;
    const selected = select.value;
    const available = deviceList.filter((device) => device.kind === mediaTest.kinds[step] && device.deviceId && device.deviceId !== 'default');
    const canSelect = step !== 'speaker' || mediaTest.canSelectOutput;
    const options = canSelect ? available : [];
    select.replaceChildren(new Option(words.defaultDevice, ''), ...options.map((device, index) =>
      new Option(device.label || words.genericDevice + ' ' + (index + 1), device.deviceId)));
    select.value = options.some((device) => device.deviceId === selected) ? selected : '';
    select.disabled = !options.length;
  }
}

async function refreshDevices() {
  deviceList = await mediaTest.devices();
  renderDevices();
}

function renderFlow() {
  for (const button of stepButtons) {
    const step = button.dataset.step;
    const current = step === activeStep;
    const confirmed = confirmedSteps.has(step);
    button.classList.toggle('confirmed', confirmed);
    if (current) button.setAttribute('aria-current', 'step');
    else button.removeAttribute('aria-current');
    const stateKey = confirmed ? 'checked' : current ? 'current' : 'pending';
    button.querySelector('[data-step-status]').textContent = copy[locale][stateKey];
    button.querySelector('.step-number').textContent = confirmed ? '✓' : steps.indexOf(step) + 1;
  }
  panels.forEach((panel) => { panel.hidden = panel.dataset.view !== activeStep; });
  backButton.hidden = activeStep === 'camera';
  document.querySelector('#mirrorControl').hidden = activeStep !== 'camera';
  const checked = confirmedSteps.has(activeStep);
  const isLastStep = activeStep === 'mic';
  let primaryAction = 'nextStep';
  if (isLastStep) primaryAction = checked ? 'enterClassroom' : 'enterWithoutCheck';
  if (testReady && !checked) primaryAction = activeStep + 'Confirm';
  confirmLabel.textContent = copy[locale][primaryAction];
  advanceLabel.textContent = copy[locale][isLastStep ? 'enterWithoutCheck' : 'skip'];
  advanceButton.hidden = !testReady || checked;
  statusLine.textContent = copy[locale][statusKey] || '';
  speakerStatus.textContent = copy[locale][statusKey === 'playing' ? 'playing' : 'soundSample'];
  document.querySelector('[data-view="speaker"] .speaker-preview').classList.toggle('playing', statusKey === 'playing');
  document.querySelectorAll('[data-test]').forEach((button) => {
    button.disabled = button.dataset.test === activeStep && ['loading', 'playing'].includes(statusKey);
  });
}

function setLanguage(language) {
  locale = language;
  const words = copy[locale];
  document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
  document.title = words.titleTag;
  document.querySelectorAll('[data-copy]').forEach((node) => { node.textContent = words[node.dataset.copy]; });
  document.querySelectorAll('[data-language]').forEach((button) => {
    const selected = button.dataset.language === locale;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', selected ? 'true' : 'false');
  });
  modal.querySelector('.modal-close').setAttribute('aria-label', words.close);
  document.querySelector('#micLevel').setAttribute('aria-label', words.liveLevel);
  toast.textContent = words.readyToast;
  renderDevices();
  renderFlow();
}

function focusStep() {
  document.querySelector('[data-view]:not([hidden]) h2').focus({ preventScroll: true });
}

function showStep(step) {
  if (step === activeStep) return;
  mediaTest.stop();
  activeStep = step;
  testReady = false;
  statusKey = confirmedSteps.has(step) ? 'confirmed' : '';
  renderFlow();
  focusStep();
}

function updateTest(key, ready) {
  statusKey = key;
  testReady = ready;
  if (ready) refreshDevices();
  renderFlow();
}

function startTest() {
  const selected = document.querySelector('[data-device="' + activeStep + '"]');
  confirmedSteps.delete(activeStep);
  mediaTest.run({ step: activeStep, deviceId: selected.value, update: updateTest });
}

function resetTest() {
  mediaTest.stop();
  confirmedSteps.delete(activeStep);
  updateTest('', false);
}

function advance() {
  const next = steps[steps.indexOf(activeStep) + 1];
  if (next) return showStep(next);
  mediaTest.stop();
  updateTest(confirmedSteps.has(activeStep) ? 'confirmed' : '', false);
  toast.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { toast.hidden = true; }, 2800);
}

stepButtons.forEach((button) => button.addEventListener('click', () => showStep(button.dataset.step)));
selectInputs.forEach((select) => select.addEventListener('change', resetTest));
document.querySelectorAll('[data-test]').forEach((button) => button.addEventListener('click', startTest));
document.querySelectorAll('[data-language]').forEach((button) => button.addEventListener('click', () => setLanguage(button.dataset.language)));
document.querySelectorAll('[data-close-modal]').forEach((button) => button.addEventListener('click', () => modal.close()));
document.querySelector('#showGuide').addEventListener('click', () => modal.showModal());
document.querySelector('#mirrorToggle').addEventListener('change', (event) => {
  document.querySelector('video').classList.toggle('mirrored', event.target.checked);
});
modal.addEventListener('close', focusStep);
modal.addEventListener('click', (event) => {
  if (event.target === modal) modal.close();
});
backButton.addEventListener('click', () => showStep(steps[steps.indexOf(activeStep) - 1]));
advanceButton.addEventListener('click', advance);
confirmButton.addEventListener('click', () => {
  if (testReady) confirmedSteps.add(activeStep);
  advance();
});
window.addEventListener('pagehide', () => {
  mediaTest.stop();
  testReady = false;
  statusKey = '';
  renderFlow();
});

setLanguage('en');
document.querySelector('[data-output-hint]').hidden = mediaTest.canSelectOutput;
refreshDevices();
modal.showModal();
