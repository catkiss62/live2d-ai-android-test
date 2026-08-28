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
  neutral: { eye_l_open: 1, eye_r_open: 1, mouth_form: 0, cheek: 0 },
  happy: { eye_l_open: .72, eye_r_open: .72, eye_l_smile: .75, eye_r_smile: .75, mouth_form: .8, cheek: .25 },
  sad: { eye_l_open: .55, eye_r_open: .55, eye_y: -.25, brow_l_y: -.35, brow_r_y: -.35, brow_l_angle: -.3, brow_r_angle: .3, mouth_form: -.55, head_y: -4 },
  excited: { eye_l_open: 1.25, eye_r_open: 1.25, eye_l_smile: .45, eye_r_smile: .45, brow_l_y: .6, brow_r_y: .6, mouth_form: .95, cheek: .35 },
  shy: { eye_l_open: .55, eye_r_open: .55, eye_l_smile: .35, eye_r_smile: .35, eye_x: -.3, eye_y: -.18, mouth_form: .2, cheek: .85, head_z: -8, head_y: -3 },
  angry: { eye_l_open: .75, eye_r_open: .75, brow_l_y: -.8, brow_r_y: -.8, brow_l_angle: -.55, brow_r_angle: .55, mouth_form: -.7, dark: .35 },
  surprised: { eye_l_open: 1.45, eye_r_open: 1.45, brow_l_y: .8, brow_r_y: .8, mouth_open: .55, mouth_form: .1, head_y: 3 },
  thinking: { eye_l_open: .72, eye_r_open: .72, eye_x: -.2, eye_y: .2, brow_l_y: .1, brow_r_y: -.05, mouth_form: .05, head_z: -7 },
  empathy: { eye_l_open: .82, eye_r_open: .82, eye_l_smile: .25, eye_r_smile: .25, brow_l_y: -.2, brow_r_y: -.2, mouth_form: .35, head_z: 4 },
  love: { eye_l_open: .7, eye_r_open: .7, eye_l_smile: .85, eye_r_smile: .85, mouth_form: .8, cheek: 1, head_z: 4 },
  confused: { eye_l_open: .75, eye_r_open: 1.05, eye_x: .25, brow_l_y: -.25, brow_r_y: .45, mouth_form: -.2, head_z: -7 },
};

let app;
let model;
let core;
let emotionName = 'neutral';
let actionName = 'none';
let actionTime = 0;
let elapsed = 0;
let blinkTime = 2.2;
const indexCache = new Map();

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

function fitModel() {
  if (!model || !app) return;
  const width = app.renderer.width;
  const height = app.renderer.height;
  const scale = Math.min(width / model.width, height / model.height) * 1.62;
  model.scale.set(scale);
  model.anchor.set(.5, .5);
  model.x = width * .5;
  model.y = height * .55;
}

function actionOffsets(name, t) {
  const p = Math.min(t / 1.7, 1);
  const fade = Math.sin(Math.PI * p);
  switch (name) {
    case 'nod': return { head_y: Math.sin(t * 11) * 12 * fade, body_y: Math.sin(t * 11) * 2 * fade };
    case 'shake_head': return { head_x: Math.sin(t * 12) * 13 * fade, head_z: Math.sin(t * 12) * 2 * fade };
    case 'tilt_head': return { head_z: Math.sin(Math.PI * p) * 13 };
    case 'lean_forward': return { body_y: Math.sin(Math.PI * p) * 7, head_y: -Math.sin(Math.PI * p) * 4 };
    case 'lean_back': return { body_y: -Math.sin(Math.PI * p) * 5, head_y: Math.sin(Math.PI * p) * 4 };
    case 'sigh': return { head_y: -Math.sin(Math.PI * p) * 6, mouth_open: Math.sin(Math.PI * p) * .35 };
    case 'pout': return { mouth_form: -Math.sin(Math.PI * p) * .55, mouth_pucker: Math.sin(Math.PI * p), cheek: Math.sin(Math.PI * p) * .35 };
    case 'excited_bounce': return { body_y: Math.abs(Math.sin(t * 10)) * 7 * fade, head_y: -Math.abs(Math.sin(t * 10)) * 5 * fade };
    default: return {};
  }
}

function tick(delta) {
  if (!core) return;
  const dt = delta / 60;
  elapsed += dt;
  actionTime += dt;
  blinkTime -= dt;

  const values = {
    ...(EMOTIONS[emotionName] || EMOTIONS.neutral),
    head_x: Math.sin(elapsed * .55) * 1.4,
    head_y: Math.sin(elapsed * .43) * .8,
    body_x: Math.sin(elapsed * .38) * .7,
    breath: .5 + Math.sin(elapsed * 1.7) * .45,
  };
  const offsets = actionOffsets(actionName, actionTime);
  for (const [key, value] of Object.entries(offsets)) values[key] = (values[key] || 0) + value;
  if (actionTime >= 1.7) actionName = 'none';

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
  fitModel();
  addEventListener('resize', fitModel);
  app.ticker.add(tick);
  setStatus('');
}

window.live2dStage = {
  applyResponse(emotion = 'neutral', action = 'none') {
    emotionName = EMOTIONS[emotion] ? emotion : 'neutral';
    actionName = action || 'none';
    actionTime = 0;
  },
  testEmotion(name) { this.applyResponse(name, 'none'); },
  testAction(name) { this.applyResponse(emotionName, name); },
};

start().catch((error) => {
  console.error(error);
  setStatus(error?.message || String(error));
});
