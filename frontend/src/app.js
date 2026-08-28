import * as PIXI from 'pixi.js';
import '@pixi/unsafe-eval';

window.PIXI = PIXI;

const stateEl = document.querySelector('#state');
const params = new URLSearchParams(location.search);
const modelPath = params.get('model');

const PARAM_ALIASES = {
  head_x: ['ParamAngleX2', 'ParamAngleX'],
  head_y: ['ParamAngleY2', 'ParamAngleY'],
  head_z: ['ParamAngleZ2', 'ParamAngleZ'],
  body_x: ['ParamBodyAngleX'], body_y: ['ParamBodyAngleY'], body_z: ['ParamBodyAngleZ'],
  eye_l_open: ['ParamEyeLOpen'], eye_r_open: ['ParamEyeROpen'],
  eye_l_smile: ['ParamEyeLSmile'], eye_r_smile: ['ParamEyeRSmile'],
  eye_x: ['ParamEyeBallX'], eye_y: ['ParamEyeBallY'],
  brow_l_y: ['Param10', 'ParamBrowLY'], brow_r_y: ['Param5', 'ParamBrowRY'],
  brow_l_angle: ['ParamBrowLAngle'], brow_r_angle: ['ParamBrowRAngle'],
  mouth_open: ['ParamMouthOpenY'], mouth_form: ['ParamMouthForm'],
  mouth_pucker: ['ParamMouthFunnel', 'ParamMouthPuckerWiden'],
  cheek: ['ParamCheek', 'Param83'], breath: ['ParamBreath'],
  tears_l: ['Param13'], tears_r: ['Param33'], dark: ['Param84'], daze: ['Param85'],
};

const EMOTIONS = {
  neutral: { params: { eye_l_open: 1, eye_r_open: 1, mouth_form: 0, cheek: 0 }, idleAmp: 1, idleSpeed: 1, flutter: .08 },
  happy: { params: { eye_l_open: .72, eye_r_open: .72, eye_l_smile: .75, eye_r_smile: .75, mouth_form: .8, cheek: .25 }, idleAmp: 1.3, idleSpeed: 1.2, flutter: .15 },
  sad: { params: { eye_l_open: .55, eye_r_open: .55, eye_y: -.25, brow_l_y: -.35, brow_r_y: -.35, brow_l_angle: -.3, brow_r_angle: .3, mouth_form: -.55, head_y: -4 }, idleAmp: .55, idleSpeed: .65, flutter: .05 },
  excited: { params: { eye_l_open: 1.25, eye_r_open: 1.25, eye_l_smile: .45, eye_r_smile: .45, brow_l_y: .6, brow_r_y: .6, mouth_form: .95, cheek: .35 }, idleAmp: 1.75, idleSpeed: 1.45, flutter: .18 },
  shy: { params: { eye_l_open: .55, eye_r_open: .55, eye_l_smile: .35, eye_r_smile: .35, eye_x: -.3, eye_y: -.18, mouth_form: .2, cheek: .85, head_z: -8, head_y: -3 }, idleAmp: .7, idleSpeed: .8, flutter: .1 },
  angry: { params: { eye_l_open: .75, eye_r_open: .75, brow_l_y: -.8, brow_r_y: -.8, brow_l_angle: -.55, brow_r_angle: .55, mouth_form: -.7, dark: .35 }, idleAmp: 1.2, idleSpeed: 1.15, flutter: .12 },
  surprised: { params: { eye_l_open: 1.45, eye_r_open: 1.45, brow_l_y: .8, brow_r_y: .8, mouth_open: .55, mouth_form: .1, head_y: 3 }, idleAmp: 1.4, idleSpeed: 1.3, flutter: .16 },
  thinking: { params: { eye_l_open: .72, eye_r_open: .72, eye_x: -.2, eye_y: .2, brow_l_y: .1, brow_r_y: -.05, mouth_form: .05, head_z: -7 }, idleAmp: .7, idleSpeed: .8, flutter: .08 },
  empathy: { params: { eye_l_open: .82, eye_r_open: .82, eye_l_smile: .25, eye_r_smile: .25, brow_l_y: -.2, brow_r_y: -.2, mouth_form: .35, head_z: 4 }, idleAmp: .85, idleSpeed: .9, flutter: .07 },
  love: { params: { eye_l_open: .7, eye_r_open: .7, eye_l_smile: .85, eye_r_smile: .85, mouth_form: .8, cheek: 1, head_z: 4 }, idleAmp: 1.2, idleSpeed: 1.05, flutter: .12 },
  confused: { params: { eye_l_open: .75, eye_r_open: 1.05, eye_x: .25, brow_l_y: -.25, brow_r_y: .45, mouth_form: -.2, head_z: -7 }, idleAmp: .9, idleSpeed: .9, flutter: .1 },
};

const ACTION_LIBRARY = {
  nod: { duration: 1.35, keyframes: [
    { t: 0, head_y: 0, body_y: 0, head_z: 0, body_x: 0 },
    { t: .14, head_y: 4, body_y: 1.4, head_z: 1.5, body_x: .6 },
    { t: .4, head_y: -20, body_y: -3.8, head_z: -2.5, body_x: -.9 },
    { t: .68, head_y: 8.5, body_y: 4.8, head_z: 2, body_x: .7 },
    { t: .96, head_y: -8.5, body_y: -1.4, head_z: -.9, body_x: -.3 },
    { t: 1.16, head_y: 1.8, body_y: .7, head_z: .35, body_x: .12 },
    { t: 1.35, head_y: 0, body_y: 0, head_z: 0, body_x: 0 },
  ] },
  shake_head: { duration: 1.2, keyframes: [
    { t: 0, head_x: 0, body_x: 0, head_z: 0 }, { t: .12, head_x: 3, body_x: .6, head_z: 1 },
    { t: .34, head_x: -14, body_x: -2, head_z: -3 }, { t: .58, head_x: 13, body_x: 1.8, head_z: 2.5 },
    { t: .82, head_x: -9, body_x: -1, head_z: -1.5 }, { t: 1.02, head_x: 4, body_x: .4, head_z: .8 },
    { t: 1.2, head_x: 0, body_x: 0, head_z: 0 },
  ] },
  tilt_head: { duration: 1.5, keyframes: [
    { t: 0, head_z: 0, body_x: 0, body_y: 0 }, { t: .7, head_z: 16, body_x: 1.2, body_y: .8 },
    { t: 1.2, head_z: 5, body_x: .5, body_y: .2 }, { t: 1.5, head_z: 0, body_x: 0, body_y: 0 },
  ] },
  lean_forward: { duration: 2, keyframes: [
    { t: 0, body_y: 0, head_y: 0, head_z: 0 }, { t: .2, body_y: -1.5, head_y: 1, head_z: -1 },
    { t: .78, body_y: 18, head_y: -4, head_z: 2 }, { t: 1.18, body_y: 22, head_y: -5.5, head_z: 2.5 },
    { t: 1.52, body_y: 11, head_y: -2, head_z: 1 }, { t: 1.78, body_y: 4, head_y: -.6, head_z: .2 },
    { t: 2, body_y: 0, head_y: 0, head_z: 0 },
  ] },
  lean_back: { duration: 1.25, keyframes: [
    { t: 0, body_y: 0, head_y: 0, head_z: 0 }, { t: .14, body_y: 1, head_y: -.8, head_z: .6 },
    { t: .48, body_y: -4.5, head_y: 3.5, head_z: -1.6 }, { t: .78, body_y: -6.2, head_y: 4.6, head_z: -2 },
    { t: 1, body_y: -2.8, head_y: 1.8, head_z: -.7 }, { t: 1.25, body_y: 0, head_y: 0, head_z: 0 },
  ] },
  blink_surprised: { duration: .88, keyframes: [
    { t: 0, head_y: 0, body_y: 0, eye_l_open: 0, eye_r_open: 0, brow_l_y: 0, brow_r_y: 0, mouth_open: 0 },
    { t: .16, head_y: 2.5, body_y: 2, eye_l_open: .08, eye_r_open: .08, brow_l_y: .12, brow_r_y: .12, mouth_open: .02 },
    { t: .36, head_y: -5.5, body_y: -6, eye_l_open: .42, eye_r_open: .42, brow_l_y: .82, brow_r_y: .82, mouth_open: .22 },
    { t: .58, head_y: 1.8, body_y: 1.4, eye_l_open: .2, eye_r_open: .2, brow_l_y: .38, brow_r_y: .38, mouth_open: .08 },
    { t: .88, head_y: 0, body_y: 0, eye_l_open: 0, eye_r_open: 0, brow_l_y: 0, brow_r_y: 0, mouth_open: 0 },
  ] },
  sigh: { duration: 2, keyframes: [
    { t: 0, head_y: 0, head_x: 0, eye_l_open: 0, eye_r_open: 0, mouth_open: 0, body_y: 0 },
    { t: .3, head_y: -4, head_x: 5, eye_l_open: -.2, eye_r_open: -.2, mouth_open: .25, body_y: -1 },
    { t: 1, head_y: -6, head_x: -5, eye_l_open: -.3, eye_r_open: -.3, mouth_open: .5, body_y: -2.2 },
    { t: 1.5, head_y: -4, head_x: 5, eye_l_open: -.15, eye_r_open: -.15, mouth_open: .1, body_y: -.9 },
    { t: 2, head_y: 0, head_x: 0, eye_l_open: 0, eye_r_open: 0, mouth_open: 0, body_y: 0 },
  ] },
  pout: { duration: 1.7, keyframes: [
    { t: 0, mouth_pucker: 0, mouth_form: 0, cheek: 0, head_z: 0, body_x: 0 },
    { t: .3, mouth_pucker: .45, mouth_form: -.24, cheek: .22, head_z: -2.2, body_x: -.25 },
    { t: .78, mouth_pucker: 1.38, mouth_form: -.7, cheek: 1.18, head_z: -8.5, body_x: -.9 },
    { t: 1.16, mouth_pucker: 1.18, mouth_form: -.62, cheek: 1, head_z: -5, body_x: -.45 },
    { t: 1.42, mouth_pucker: .55, mouth_form: -.26, cheek: .32, head_z: -2, body_x: -.12 },
    { t: 1.7, mouth_pucker: 0, mouth_form: 0, cheek: 0, head_z: 0, body_x: 0 },
  ] },
  excited_bounce: { duration: 2, keyframes: [
    { t: 0, head_y: 0, body_y: 0, eye_l_smile: .18, eye_r_smile: .18, mouth_form: .18, mouth_open: .04, cheek: .12 },
    { t: .3, head_y: 5, body_y: 3, eye_l_smile: .45, eye_r_smile: .45, mouth_form: .42, mouth_open: .14, cheek: .28 },
    { t: .8, head_y: -2, body_y: -5, eye_l_smile: .68, eye_r_smile: .68, mouth_form: .72, mouth_open: .28, cheek: .48 },
    { t: 1, head_y: 3, body_y: 2, eye_l_smile: .56, eye_r_smile: .56, mouth_form: .56, mouth_open: .18, cheek: .36 },
    { t: 1.5, head_y: -1, body_y: 1, eye_l_smile: .34, eye_r_smile: .34, mouth_form: .36, mouth_open: .1, cheek: .2 },
    { t: 2, head_y: 0, body_y: 0, eye_l_smile: 0, eye_r_smile: 0, mouth_form: 0, mouth_open: 0, cheek: 0 },
  ] },
  listening: { duration: -1, keyframes: [
    { t: 0, head_z: 0, head_y: 0 }, { t: .4, head_z: 6, head_y: 2 },
  ] },
  look_around: { duration: 3.2, keyframes: [
    { t: 0, head_x: 0, eye_x: 0, body_x: 0 }, { t: .7, head_x: -8, eye_x: -.55, body_x: -.8 },
    { t: 1.7, head_x: 9, eye_x: .65, body_x: .9 }, { t: 2.5, head_x: 3, eye_x: .25, body_x: .25 },
    { t: 3.2, head_x: 0, eye_x: 0, body_x: 0 },
  ] },
  soft_sway: { duration: 2.8, keyframes: [
    { t: 0, head_z: 0, body_x: 0, body_z: 0 }, { t: .8, head_z: -4, body_x: -2.6, body_z: -.8 },
    { t: 1.7, head_z: 4.5, body_x: 2.8, body_z: .9 }, { t: 2.8, head_z: 0, body_x: 0, body_z: 0 },
  ] },
  look_down_up: { duration: 2.5, keyframes: [
    { t: 0, head_y: 0, eye_y: 0, body_y: 0 }, { t: .8, head_y: -7, eye_y: -.35, body_y: -1.5 },
    { t: 1.55, head_y: 5, eye_y: .22, body_y: 1 }, { t: 2.5, head_y: 0, eye_y: 0, body_y: 0 },
  ] },
};

let app;
let model;
let core;
let emotionName = 'neutral';
let actionName = 'none';
let actionTime = 0;
let elapsed = 0;
let blinkTime = 2.2;
let naturalModelWidth = 1;
let naturalModelHeight = 1;
let layoutReferenceWidth = 0;
let layoutReferenceHeight = 0;
let adjustMode = false;
let modelOffsetX = 0;
let modelOffsetY = 0;
let modelScaleMultiplier = 1;
let autonomousIdleEnabled = true;
let autonomousActionName = 'none';
let autonomousActionTime = 0;
let nextAutonomousActionAt = 5 + Math.random() * 5;
let lastGestureCenter = null;
let lastGestureDistance = 0;
const indexCache = new Map();
const activePointers = new Map();
const currentEmotionValues = {};
const TRANSFORM_STORAGE_KEY = 'live2d-stage-transform-v1';

function setStatus(text) {
  stateEl.textContent = text;
  stateEl.hidden = !text;
  window.AndroidStage?.onStageStatus?.(text || '模型已就绪');
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Cubism Core 尚未导入'));
    document.head.appendChild(script);
  });
}

async function loadCubismCore() {
  try {
    setStatus('正在加载本地 Cubism Core…');
    await loadScript('https://appassets.androidplatform.net/runtime/live2dcubismcore.min.js');
  } catch {
    setStatus('正在联网加载 Live2D 官方 Core…');
    await loadScript('https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js');
  }
}

function findIndex(alias) {
  if (indexCache.has(alias)) return indexCache.get(alias);
  const aliases = PARAM_ALIASES[alias] || [alias];
  for (const id of aliases) {
    try {
      const index = core.getParameterIndex(id);
      if (index >= 0) {
        indexCache.set(alias, index);
        return index;
      }
    } catch { /* try the next alias */ }
  }
  indexCache.set(alias, -1);
  return -1;
}

function write(alias, value) {
  const index = findIndex(alias);
  if (index >= 0 && Number.isFinite(value)) core.setParameterValueByIndex(index, value);
}

function loadSavedTransform() {
  try {
    const saved = JSON.parse(localStorage.getItem(TRANSFORM_STORAGE_KEY) || '{}');
    modelOffsetX = Number.isFinite(saved.x) ? saved.x : 0;
    modelOffsetY = Number.isFinite(saved.y) ? saved.y : 0;
    modelScaleMultiplier = Number.isFinite(saved.scale)
      ? Math.min(3, Math.max(.35, saved.scale)) : 1;
  } catch {
    modelOffsetX = 0;
    modelOffsetY = 0;
    modelScaleMultiplier = 1;
  }
}

function saveTransform() {
  localStorage.setItem(TRANSFORM_STORAGE_KEY, JSON.stringify({
    x: modelOffsetX,
    y: modelOffsetY,
    scale: modelScaleMultiplier,
  }));
}

function fitModel() {
  if (!model || !app) return;
  const currentWidth = app.screen.width;
  const currentHeight = app.screen.height;
  const widthChanged = layoutReferenceWidth > 0
    && Math.abs(currentWidth - layoutReferenceWidth) > Math.max(36, layoutReferenceWidth * .16);
  if (!layoutReferenceWidth || widthChanged) {
    layoutReferenceWidth = currentWidth;
    layoutReferenceHeight = currentHeight;
  } else if (currentHeight > layoutReferenceHeight) {
    layoutReferenceHeight = currentHeight;
  }

  // 输入法只会缩短当前 WebView 高度；使用稳定参考高度，避免角色随键盘跳位。
  const width = layoutReferenceWidth;
  const height = layoutReferenceHeight;
  const scale = Math.min(width / naturalModelWidth, height / naturalModelHeight)
    * 1.62 * modelScaleMultiplier;
  model.scale.set(scale);
  model.anchor.set(.5, .5);
  model.x = width * (.5 + modelOffsetX);
  model.y = height * (.55 + modelOffsetY);
}

function gestureMetrics() {
  const points = [...activePointers.values()];
  if (!points.length) return { center: null, distance: 0 };
  if (points.length === 1) return { center: points[0], distance: 0 };
  const first = points[0];
  const second = points[1];
  return {
    center: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 },
    distance: Math.hypot(second.x - first.x, second.y - first.y),
  };
}

function resetGestureBaseline() {
  const metrics = gestureMetrics();
  lastGestureCenter = metrics.center;
  lastGestureDistance = metrics.distance;
}

function installAdjustmentGestures() {
  const canvas = app.view;

  canvas.addEventListener('pointerdown', (event) => {
    if (!adjustMode) return;
    event.preventDefault();
    canvas.setPointerCapture?.(event.pointerId);
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    resetGestureBaseline();
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!adjustMode || !activePointers.has(event.pointerId)) return;
    event.preventDefault();
    const previousCenter = lastGestureCenter;
    const previousDistance = lastGestureDistance;
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const metrics = gestureMetrics();

    if (previousCenter && metrics.center) {
      modelOffsetX += (metrics.center.x - previousCenter.x) / Math.max(1, layoutReferenceWidth);
      modelOffsetY += (metrics.center.y - previousCenter.y) / Math.max(1, layoutReferenceHeight);
    }
    if (activePointers.size >= 2 && previousDistance > 0 && metrics.distance > 0) {
      modelScaleMultiplier = Math.min(3, Math.max(.35,
        modelScaleMultiplier * (metrics.distance / previousDistance)));
    }
    lastGestureCenter = metrics.center;
    lastGestureDistance = metrics.distance;
    fitModel();
  }, { passive: false });

  const finishPointer = (event) => {
    if (!activePointers.has(event.pointerId)) return;
    activePointers.delete(event.pointerId);
    resetGestureBaseline();
    saveTransform();
  };
  canvas.addEventListener('pointerup', finishPointer);
  canvas.addEventListener('pointercancel', finishPointer);
  canvas.addEventListener('lostpointercapture', finishPointer);
}

function interpolateAction(name, time) {
  const action = ACTION_LIBRARY[name];
  if (!action) return {};
  const frames = action.keyframes;
  if (!frames.length) return {};
  const sampleTime = action.duration < 0 ? Math.min(time, frames[frames.length - 1].t)
    : Math.min(time, action.duration);
  let previous = frames[0];
  let next = frames[frames.length - 1];
  for (let i = 0; i < frames.length - 1; i += 1) {
    if (sampleTime >= frames[i].t && sampleTime <= frames[i + 1].t) {
      previous = frames[i];
      next = frames[i + 1];
      break;
    }
  }
  const duration = next.t - previous.t;
  let progress = duration > 0 ? (sampleTime - previous.t) / duration : 1;
  progress = Math.max(0, Math.min(1, progress));
  progress = progress * progress * (3 - 2 * progress);
  const values = {};
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
  keys.delete('t');
  for (const key of keys) {
    const from = previous[key] ?? 0;
    const to = next[key] ?? 0;
    values[key] = from + (to - from) * progress;
  }
  return values;
}

function addValues(target, source) {
  for (const [key, value] of Object.entries(source)) {
    target[key] = (target[key] || 0) + value;
  }
}

function updateEmotion(dt) {
  const target = (EMOTIONS[emotionName] || EMOTIONS.neutral).params;
  const keys = new Set([...Object.keys(currentEmotionValues), ...Object.keys(target)]);
  const blend = 1 - Math.exp(-dt / .28);
  for (const key of keys) {
    const next = target[key] ?? 0;
    const current = currentEmotionValues[key] ?? 0;
    const value = current + (next - current) * blend;
    if (Math.abs(value) < .0005 && Math.abs(next) < .0005) delete currentEmotionValues[key];
    else currentEmotionValues[key] = value;
  }
  return { ...currentEmotionValues };
}

function idleOffsets(profile) {
  const t = elapsed * profile.idleSpeed;
  const amp = profile.idleAmp;
  return {
    head_x: (Math.sin(t * .55) * 2.15 + Math.sin(t * .21 + 1.2) * .85) * amp,
    head_y: (Math.sin(t * .43 + .7) * 1.25 + Math.sin(t * .19) * .55) * amp,
    head_z: (Math.sin(t * .31 + 2.1) * 1.15 + Math.sin(t * .13) * .45) * amp,
    body_x: (Math.sin(t * .36) * 1.5 + Math.sin(t * .17 + 1.4) * .65) * amp,
    body_y: Math.sin(t * .28 + .5) * .55 * amp,
    body_z: Math.sin(t * .23 + 2.4) * .45 * amp,
    eye_x: (Math.sin(t * .38 + 3.1) * .11 + Math.sin(t * .81) * .035) * amp,
    eye_y: Math.sin(t * .29 + 4.2) * .055 * amp,
    breath: .5 + Math.sin(t * 1.7) * .45,
  };
}

function maybeStartAutonomousAction() {
  if (!autonomousIdleEnabled || actionName !== 'none' || autonomousActionName !== 'none') return;
  if (elapsed < nextAutonomousActionAt) return;
  const choices = ['look_around', 'soft_sway', 'look_down_up', 'soft_sway', 'look_around'];
  autonomousActionName = choices[Math.floor(Math.random() * choices.length)];
  autonomousActionTime = 0;
}

function finishActionIfNeeded(name, time) {
  const action = ACTION_LIBRARY[name];
  return Boolean(action && action.duration > 0 && time >= action.duration);
}

function tick(delta) {
  if (!core) return;
  const dt = delta / 60;
  elapsed += dt;
  actionTime += dt;
  autonomousActionTime += dt;
  blinkTime -= dt;

  const profile = EMOTIONS[emotionName] || EMOTIONS.neutral;
  const values = updateEmotion(dt);
  addValues(values, idleOffsets(profile));

  maybeStartAutonomousAction();
  if (autonomousActionName !== 'none') {
    addValues(values, interpolateAction(autonomousActionName, autonomousActionTime));
    if (finishActionIfNeeded(autonomousActionName, autonomousActionTime)) {
      autonomousActionName = 'none';
      nextAutonomousActionAt = elapsed + 7 + Math.random() * 9;
    }
  }
  if (actionName !== 'none') {
    addValues(values, interpolateAction(actionName, actionTime));
    if (finishActionIfNeeded(actionName, actionTime)) {
      actionName = 'none';
      nextAutonomousActionAt = elapsed + 5 + Math.random() * 7;
    }
  }

  const flutter = profile.flutter || 0;
  if (flutter > 0) {
    const shimmer = (Math.sin(elapsed * .77) * .65 + Math.sin(elapsed * 1.91 + 1.3) * .35) * flutter;
    if (Math.abs(currentEmotionValues.cheek || 0) > .01) values.cheek += shimmer * .08;
    if (Math.abs(currentEmotionValues.eye_l_smile || 0) > .01) values.eye_l_smile += shimmer * .05;
    if (Math.abs(currentEmotionValues.eye_r_smile || 0) > .01) values.eye_r_smile += shimmer * .05;
  }

  if (blinkTime <= 0) {
    const phase = Math.max(0, 1 - Math.abs(blinkTime + .1) / .1);
    values.eye_l_open = Math.min(values.eye_l_open ?? 1, 1 - phase);
    values.eye_r_open = Math.min(values.eye_r_open ?? 1, 1 - phase);
    if (blinkTime < -.2) blinkTime = 2.2 + Math.random() * 3.2;
  }

  for (const [key, value] of Object.entries(values)) write(key, value);
}

async function start() {
  if (!modelPath) throw new Error('请先在App中导入Live2D模型ZIP');
  await loadCubismCore();
  if (!window.Live2DCubismCore) throw new Error('Cubism Core 加载失败，请检查网络或手动导入Core');

  const { Live2DModel } = await import('pixi-live2d-display/cubism4');
  app = new PIXI.Application({ resizeTo: window, backgroundAlpha: 0, antialias: true, resolution: Math.min(devicePixelRatio || 1, 2), autoDensity: true });
  document.querySelector('#stage').appendChild(app.view);
  model = await Live2DModel.from(modelPath, { autoInteract: false, autoFocus: false });
  core = model.internalModel.coreModel;
  app.stage.addChild(model);
  naturalModelWidth = Math.max(1, model.width);
  naturalModelHeight = Math.max(1, model.height);
  loadSavedTransform();
  fitModel();
  addEventListener('resize', fitModel);
  installAdjustmentGestures();
  app.ticker.add(tick);
  setStatus('');
}

window.live2dStage = {
  applyResponse(emotion = 'neutral', action = 'none') {
    emotionName = EMOTIONS[emotion] ? emotion : 'neutral';
    actionName = ACTION_LIBRARY[action] ? action : 'none';
    actionTime = 0;
    autonomousActionName = 'none';
    nextAutonomousActionAt = elapsed + 5 + Math.random() * 7;
  },
  testEmotion(name) { this.applyResponse(name, 'none'); },
  testAction(name) { this.applyResponse(emotionName, name); },
  testExpression(name) {
    if (!model || !name) return false;
    Promise.resolve(model.expression(name)).catch(console.error);
    return true;
  },
  clearExpression() {
    const manager = model?.internalModel?.motionManager?.expressionManager;
    manager?.resetExpression?.();
  },
  testMotion(group, index) {
    if (!model || !group || !Number.isFinite(Number(index))) return false;
    Promise.resolve(model.motion(group, Number(index), 3)).catch(console.error);
    return true;
  },
  setAutonomousIdle(enabled) {
    autonomousIdleEnabled = Boolean(enabled);
    autonomousActionName = 'none';
    nextAutonomousActionAt = elapsed + 3 + Math.random() * 5;
    return autonomousIdleEnabled;
  },
  resetPerformance() {
    emotionName = 'neutral';
    actionName = 'none';
    autonomousActionName = 'none';
    actionTime = 0;
    this.clearExpression();
  },
  setAdjustMode(enabled) {
    adjustMode = Boolean(enabled);
    activePointers.clear();
    resetGestureBaseline();
    if (app?.view) app.view.style.touchAction = adjustMode ? 'none' : 'auto';
    if (!adjustMode) saveTransform();
    return adjustMode;
  },
  resetTransform() {
    modelOffsetX = 0;
    modelOffsetY = 0;
    modelScaleMultiplier = 1;
    fitModel();
    saveTransform();
  },
};

start().catch((error) => {
  console.error(error);
  setStatus(error?.message || String(error));
});
