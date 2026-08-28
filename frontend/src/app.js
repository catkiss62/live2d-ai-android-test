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

// Different Live2D models often reuse a standard parameter ID for very different
// deformations. Keep body channels deliberately conservative, then also clamp to
// the min/max values declared by the loaded moc3 model.
const PARAM_SAFE_RANGES = {
  // 迷梦的 X2/Y2/Z2 是高精度物理输入。头部可充分使用声明范围；身体 Y
  // 仍然极小，避免某些模型把纵向参数做成压扁/拉伸。
  head_x: [-30, 30], head_y: [-30, 30], head_z: [-30, 30],
  body_x: [-10, 10], body_y: [-1.2, 1.2], body_z: [-10, 10],
  eye_l_open: [0, 1.5], eye_r_open: [0, 1.5],
  eye_l_smile: [0, 1], eye_r_smile: [0, 1],
  eye_x: [-1, 1], eye_y: [-1, 1],
  mouth_open: [0, 1], mouth_form: [-1, 1], mouth_pucker: [0, 1.2],
  cheek: [0, 1.2], breath: [0, 1], tears_l: [0, 1], tears_r: [0, 1],
  dark: [0, 1], daze: [0, 1],
};

const ACTION_POSE_GAIN = 2;
const ACTION_POSE_KEYS = new Set([
  'head_x', 'head_y', 'head_z', 'body_x', 'body_y', 'body_z', 'eye_x', 'eye_y',
]);

function amplifyActionPose(values) {
  const amplified = { ...values };
  for (const key of ACTION_POSE_KEYS) {
    if (Number.isFinite(amplified[key])) amplified[key] *= ACTION_POSE_GAIN;
  }
  return amplified;
}

const TOUCH_FOLLOW_LEVELS = {
  standard: { eyeX: .9, eyeY: .72, headX: 24, headY: 20, headZ: 18, bodyX: 4.8, bodyY: .58, bodyZ: 3.8 },
  vivid: { eyeX: 1, eyeY: .9, headX: 28, headY: 26, headZ: 24, bodyX: 6.4, bodyY: .62, bodyZ: 5 },
  extreme: { eyeX: 1, eyeY: 1, headX: 30, headY: 30, headZ: 30, bodyX: 8, bodyY: .7, bodyZ: 7 },
};

const DEFAULT_HEAD_ZONE = { left: .22, top: .02, right: .78, bottom: .36 };
const SWAY_FACE_YAW_ACTIONS = new Set([
  'wind_sway_soft', 'wind_sway_medium', 'wind_sway_showcase', 'showcase_orbit',
]);
const SWAY_FACE_YAW_GAIN = .8;
const SWAY_FACE_YAW_LIMIT = 24;
const EMOTION_FACE_GAIN = 1.65;
const EMOTION_POSE_GAIN = 1.3;
const EMOTION_FACE_KEYS = new Set([
  'eye_l_open', 'eye_r_open', 'eye_l_smile', 'eye_r_smile', 'eye_x', 'eye_y',
  'brow_l_y', 'brow_r_y', 'brow_l_angle', 'brow_r_angle',
  'mouth_open', 'mouth_form', 'mouth_pucker', 'cheek',
  'tears_l', 'tears_r', 'dark', 'daze',
]);
const EMOTION_POSE_KEYS = new Set(['head_x', 'head_y', 'head_z']);
const EMOTION_PARAMETER_BASELINES = { eye_l_open: 1, eye_r_open: 1 };

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
    { t: .78, body_y: 2.4, head_y: -4, head_z: 2 }, { t: 1.18, body_y: 2.8, head_y: -5.5, head_z: 2.5 },
    { t: 1.52, body_y: 1.8, head_y: -2, head_z: 1 }, { t: 1.78, body_y: .7, head_y: -.6, head_z: .2 },
    { t: 2, body_y: 0, head_y: 0, head_z: 0 },
  ] },
  lean_back: { duration: 1.25, keyframes: [
    { t: 0, body_y: 0, head_y: 0, head_z: 0 }, { t: .14, body_y: 1, head_y: -.8, head_z: .6 },
    { t: .48, body_y: -2, head_y: 3.5, head_z: -1.6 }, { t: .78, body_y: -2.7, head_y: 4.6, head_z: -2 },
    { t: 1, body_y: -1.4, head_y: 1.8, head_z: -.7 }, { t: 1.25, body_y: 0, head_y: 0, head_z: 0 },
  ] },
  blink_surprised: { duration: .88, keyframes: [
    { t: 0, head_y: 0, body_y: 0, eye_l_open: 0, eye_r_open: 0, brow_l_y: 0, brow_r_y: 0, mouth_open: 0 },
    { t: .16, head_y: 2.5, body_y: 2, eye_l_open: .08, eye_r_open: .08, brow_l_y: .12, brow_r_y: .12, mouth_open: .02 },
    { t: .36, head_y: -5.5, body_y: -2.5, eye_l_open: .42, eye_r_open: .42, brow_l_y: .82, brow_r_y: .82, mouth_open: .22 },
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
  small_nod: { duration: 1.05, keyframes: [
    { t: 0, head_y: 0, body_y: 0 }, { t: .28, head_y: -7, body_y: -.7 },
    { t: .53, head_y: 2.5, body_y: .25 }, { t: .78, head_y: -1.2, body_y: -.1 },
    { t: 1.05, head_y: 0, body_y: 0 },
  ] },
  head_tilt_idle: { duration: 1.9, keyframes: [
    { t: 0, head_z: 0, head_x: 0, eye_x: 0 }, { t: .55, head_z: -8, head_x: -1.5, eye_x: .2 },
    { t: 1.35, head_z: -6, head_x: -1, eye_x: .12 }, { t: 1.9, head_z: 0, head_x: 0, eye_x: 0 },
  ] },
  side_look: { duration: 2.15, keyframes: [
    { t: 0, eye_x: 0, eye_y: 0, head_x: 0, head_z: 0 },
    { t: .35, eye_x: .65, eye_y: .06, head_x: 3, head_z: -1.5 },
    { t: 1.35, eye_x: .56, eye_y: .04, head_x: 4.8, head_z: -2.2 },
    { t: 1.75, eye_x: .12, eye_y: 0, head_x: 3, head_z: -1.2 },
    { t: 2.15, eye_x: 0, eye_y: 0, head_x: 0, head_z: 0 },
  ] },
  weight_shift: { duration: 2.35, keyframes: [
    { t: 0, body_x: 0, body_z: 0, head_z: 0 }, { t: .7, body_x: -3.8, body_z: -1.8, head_z: 3.5 },
    { t: 1.6, body_x: -3.1, body_z: -1.4, head_z: 2.7 }, { t: 2.35, body_x: 0, body_z: 0, head_z: 0 },
  ] },
  gentle_lean: { duration: 1.8, keyframes: [
    { t: 0, body_y: 0, head_y: 0, eye_y: 0 }, { t: .55, body_y: 1.7, head_y: -3.5, eye_y: .16 },
    { t: 1.25, body_y: 1.35, head_y: -2.7, eye_y: .12 }, { t: 1.8, body_y: 0, head_y: 0, eye_y: 0 },
  ] },
  sigh_sink: { duration: 2.3, keyframes: [
    { t: 0, head_y: 0, body_y: 0, eye_y: 0 }, { t: .75, head_y: -6, body_y: -1.7, eye_y: -.3 },
    { t: 1.65, head_y: -4.5, body_y: -1.2, eye_y: -.2 }, { t: 2.3, head_y: 0, body_y: 0, eye_y: 0 },
  ] },
  slow_blink: { duration: .95, keyframes: [
    { t: 0, eye_l_open: 0, eye_r_open: 0, head_y: 0 }, { t: .38, eye_l_open: -1, eye_r_open: -1, head_y: -1 },
    { t: .58, eye_l_open: -1, eye_r_open: -1, head_y: -1 }, { t: .95, eye_l_open: 0, eye_r_open: 0, head_y: 0 },
  ] },
  head_pat: { duration: 1.75, keyframes: [
    { t: 0, head_y: 0, head_z: 0, body_x: 0, eye_l_open: 0, eye_r_open: 0, eye_l_smile: 0, eye_r_smile: 0, cheek: 0, mouth_form: 0 },
    { t: .28, head_y: -2.2, head_z: -2.5, body_x: -.35, eye_l_open: -.45, eye_r_open: -.45, eye_l_smile: .45, eye_r_smile: .45, cheek: .35, mouth_form: .2 },
    { t: .68, head_y: -4.5, head_z: 3.8, body_x: .55, eye_l_open: -.85, eye_r_open: -.85, eye_l_smile: .92, eye_r_smile: .92, cheek: .82, mouth_form: .48 },
    { t: 1.08, head_y: -3.6, head_z: -3.1, body_x: -.45, eye_l_open: -.72, eye_r_open: -.72, eye_l_smile: .8, eye_r_smile: .8, cheek: .68, mouth_form: .4 },
    { t: 1.42, head_y: -1.3, head_z: 1.2, body_x: .16, eye_l_open: -.3, eye_r_open: -.3, eye_l_smile: .35, eye_r_smile: .35, cheek: .25, mouth_form: .18 },
    { t: 1.75, head_y: 0, head_z: 0, body_x: 0, eye_l_open: 0, eye_r_open: 0, eye_l_smile: 0, eye_r_smile: 0, cheek: 0, mouth_form: 0 },
  ] },
  head_pat_confused: { duration: 1.8, keyframes: [
    { t: 0, head_x: 0, head_y: 0, head_z: 0, eye_x: 0, eye_l_open: 0, eye_r_open: 0, brow_l_y: 0, brow_r_y: 0, mouth_form: 0 },
    { t: .3, head_x: 1.5, head_y: 1, head_z: -2, eye_x: .12, eye_l_open: -.08, eye_r_open: .08, brow_l_y: -.12, brow_r_y: .2, mouth_form: -.08 },
    { t: .78, head_x: 3.2, head_y: -1, head_z: -7, eye_x: .28, eye_l_open: -.28, eye_r_open: .15, brow_l_y: -.35, brow_r_y: .48, mouth_form: -.25 },
    { t: 1.28, head_x: 2.3, head_y: -.5, head_z: -5.2, eye_x: .2, eye_l_open: -.2, eye_r_open: .1, brow_l_y: -.24, brow_r_y: .34, mouth_form: -.16 },
    { t: 1.8, head_x: 0, head_y: 0, head_z: 0, eye_x: 0, eye_l_open: 0, eye_r_open: 0, brow_l_y: 0, brow_r_y: 0, mouth_form: 0 },
  ] },
  // Coupled head/body oscillators: each channel has a different phase and speed,
  // so the body follows the head instead of moving like one rigid cardboard layer.
  wind_sway_soft: { duration: 6.2, sample: (time, duration) => sampleWindSway(time, duration, .68) },
  wind_sway_medium: { duration: 6.6, sample: (time, duration) => sampleWindSway(time, duration, 1) },
  wind_sway_showcase: { duration: 7.2, sample: (time, duration) => sampleWindSway(time, duration, 1.34) },
  // A hand-authored large arc based on the supplied model-showcase clip. Head leads;
  // torso and shoulders arrive later, while body_y stays tiny for this model.
  showcase_orbit: { duration: 5.2, keyframes: [
    { t: 0, head_x: 0, head_y: 0, head_z: 0, body_x: 0, body_y: 0, body_z: 0, eye_x: 0, eye_y: 0 },
    { t: .52, head_x: -12, head_y: 9, head_z: -9, body_x: -2.4, body_y: .2, body_z: -1.8, eye_x: -.38, eye_y: .28 },
    { t: 1.08, head_x: -22, head_y: 1, head_z: -15, body_x: -6.6, body_y: .55, body_z: -5.5, eye_x: -.7, eye_y: .04 },
    { t: 1.72, head_x: -8, head_y: -12, head_z: -5, body_x: -5.2, body_y: -.4, body_z: -4.2, eye_x: -.24, eye_y: -.38 },
    { t: 2.38, head_x: 16, head_y: -9, head_z: 12, body_x: 2.8, body_y: -.52, body_z: 2.4, eye_x: .5, eye_y: -.3 },
    { t: 3.02, head_x: 23, head_y: 5, head_z: 16, body_x: 6.8, body_y: .25, body_z: 5.8, eye_x: .72, eye_y: .16 },
    { t: 3.68, head_x: 7, head_y: 13, head_z: 5, body_x: 5.1, body_y: .58, body_z: 4.1, eye_x: .2, eye_y: .42 },
    { t: 4.28, head_x: -9, head_y: 5, head_z: -7, body_x: -.8, body_y: .15, body_z: -.7, eye_x: -.28, eye_y: .15 },
    { t: 4.78, head_x: 3, head_y: -2, head_z: 2, body_x: .8, body_y: -.08, body_z: .65, eye_x: .08, eye_y: -.05 },
    { t: 5.2, head_x: 0, head_y: 0, head_z: 0, body_x: 0, body_y: 0, body_z: 0, eye_x: 0, eye_y: 0 },
  ] },
};

function sampleWindSway(time, duration, gain) {
  const progress = Math.max(0, Math.min(1, time / duration));
  const envelope = Math.pow(Math.max(0, Math.sin(Math.PI * progress)), .68);
  const omega = Math.PI * 2 * .235;
  const headWave = Math.sin(omega * time) + Math.sin(omega * .46 * time + .8) * .22;
  const bodyWave = Math.sin(omega * time - .58) + Math.sin(omega * .43 * time + .25) * .18;
  return {
    head_x: (Math.sin(omega * .72 * time + 1.08) * 10
      + Math.sin(omega * .31 * time - .4) * 1.8) * gain * envelope,
    head_y: (Math.sin(omega * .53 * time - .38) * 5.8
      + Math.sin(omega * 1.08 * time + .6) * 1.2) * gain * envelope,
    head_z: headWave * 11.5 * gain * envelope,
    body_x: (Math.sin(omega * .72 * time + .52) * 4.7
      + Math.sin(omega * .29 * time) * .6) * gain * envelope,
    body_y: Math.sin(omega * .55 * time - .42) * .52 * gain * envelope,
    body_z: bodyWave * 5.2 * gain * envelope,
    eye_x: Math.sin(omega * .72 * time + 1.18) * .18 * gain * envelope,
    eye_y: Math.sin(omega * .53 * time - .28) * .1 * gain * envelope,
  };
}

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
let touchGazeActive = false;
let touchGazePointerId = null;
let touchGazeTargetX = 0;
let touchGazeTargetY = 0;
let touchGazeX = 0;
let touchGazeY = 0;
let touchHeadX = 0;
let touchHeadY = 0;
let touchHeadZ = 0;
let touchBodyX = 0;
let touchBodyY = 0;
let touchBodyZ = 0;
let touchGazeReleasedAt = -100;
let idleGazeX = 0;
let idleGazeY = 0;
let idleGazeTargetX = 0;
let idleGazeTargetY = 0;
let nextIdleGazeAt = 0;
let recentAutonomousActions = [];
let focusedInteraction = false;
let nextShowcaseActionAt = 28 + Math.random() * 32;
let lastPerformanceUpdateAt = 0;
let touchFollowLevel = 'vivid';
let headZone = { ...DEFAULT_HEAD_ZONE };
let headZoneCalibrationMode = false;
let headZoneCalibrationFirstPoint = null;
let patPointerId = null;
let patCandidate = false;
let patLastPoint = null;
let patTravel = 0;
let patStartedAt = 0;
let patTriggered = false;
let interactionActionName = 'none';
let interactionActionTime = 0;
let recentResponseActions = [];
const indexCache = new Map();
const rawIndexCache = new Map();
const activePointers = new Map();
const currentEmotionValues = {};
const desiredAppearancePresets = new Set();
const appearancePresetStates = new Map();
const appearancePresetLoads = new Map();
const TRANSFORM_STORAGE_KEY = 'live2d-stage-transform-v1';
const INTERACTION_STORAGE_KEY = 'live2d-stage-interaction-v1';

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

function findRawIndex(id) {
  if (rawIndexCache.has(id)) return rawIndexCache.get(id);
  try {
    const index = core.getParameterIndex(id);
    rawIndexCache.set(id, index >= 0 ? index : -1);
  } catch {
    rawIndexCache.set(id, -1);
  }
  return rawIndexCache.get(id);
}

function write(alias, value) {
  const index = findIndex(alias);
  if (index < 0 || !Number.isFinite(value)) return;
  let next = value;
  const safe = PARAM_SAFE_RANGES[alias];
  if (safe) next = Math.max(safe[0], Math.min(safe[1], next));
  try {
    const modelMin = core.getParameterMinimumValue(index);
    const modelMax = core.getParameterMaximumValue(index);
    if (Number.isFinite(modelMin) && Number.isFinite(modelMax)) {
      next = Math.max(modelMin, Math.min(modelMax, next));
    }
  } catch { /* older Cubism Core: semantic ranges above are still applied */ }
  core.setParameterValueByIndex(index, next);
}

function getAmplifiedEmotionParams(profile) {
  const amplified = {};
  for (const [key, value] of Object.entries(profile?.params || {})) {
    if (!Number.isFinite(value)) continue;
    const baseline = EMOTION_PARAMETER_BASELINES[key] ?? 0;
    if (EMOTION_FACE_KEYS.has(key)) {
      amplified[key] = baseline + (value - baseline) * EMOTION_FACE_GAIN;
    } else if (EMOTION_POSE_KEYS.has(key)) {
      amplified[key] = baseline + (value - baseline) * EMOTION_POSE_GAIN;
    } else {
      amplified[key] = value;
    }
  }
  return amplified;
}

async function loadAppearancePreset(name) {
  if (appearancePresetStates.has(name)) return appearancePresetStates.get(name);
  if (appearancePresetLoads.has(name)) return appearancePresetLoads.get(name);

  const loading = (async () => {
    const settings = model?.internalModel?.settings;
    const definition = settings?.expressions?.find((item) => item.Name === name);
    if (!definition?.File || typeof settings.resolveURL !== 'function') {
      throw new Error(`找不到外观预设：${name}`);
    }
    const response = await fetch(settings.resolveURL(definition.File));
    if (!response.ok) throw new Error(`外观预设读取失败：${name} (${response.status})`);
    const json = await response.json();
    const parameters = (json.Parameters || []).filter((item) => (
      typeof item.Id === 'string' && Number.isFinite(Number(item.Value))
    )).map((item) => ({
      id: item.Id,
      value: Number(item.Value),
      blend: String(item.Blend || 'Add').toLowerCase(),
    }));
    if (!parameters.length) throw new Error(`外观预设没有可用参数：${name}`);
    const state = {
      name,
      parameters,
      fadeIn: Math.max(.05, Number(json.FadeInTime) || .35),
      fadeOut: Math.max(.05, Number(json.FadeOutTime) || .3),
      weight: 0,
      target: desiredAppearancePresets.has(name) ? 1 : 0,
    };
    appearancePresetStates.set(name, state);
    return state;
  })().catch((error) => {
    console.error(error);
    desiredAppearancePresets.delete(name);
    window.AndroidStage?.onInteraction?.(`外观预设加载失败：${name}`);
    throw error;
  }).finally(() => appearancePresetLoads.delete(name));

  appearancePresetLoads.set(name, loading);
  return loading;
}

async function setAppearancePresetActive(name, active) {
  if (!name) return false;
  if (active) desiredAppearancePresets.add(name);
  else desiredAppearancePresets.delete(name);

  const existing = appearancePresetStates.get(name);
  if (existing) {
    existing.target = active ? 1 : 0;
    return active;
  }
  if (!active) return false;
  const state = await loadAppearancePreset(name);
  state.target = desiredAppearancePresets.has(name) ? 1 : 0;
  return state.target === 1;
}

async function applyAppearancePresetSet(names) {
  const next = new Set(Array.isArray(names) ? names.filter((name) => typeof name === 'string') : []);
  desiredAppearancePresets.clear();
  for (const name of next) desiredAppearancePresets.add(name);
  for (const state of appearancePresetStates.values()) {
    state.target = desiredAppearancePresets.has(state.name) ? 1 : 0;
  }
  await Promise.allSettled([...desiredAppearancePresets].map((name) => setAppearancePresetActive(name, true)));
  return [...desiredAppearancePresets];
}

function clearAllAppearancePresets(immediate = false) {
  desiredAppearancePresets.clear();
  for (const state of appearancePresetStates.values()) {
    state.target = 0;
    if (immediate) state.weight = 0;
  }
}

function updateAppearanceFades(dt) {
  for (const state of appearancePresetStates.values()) {
    const duration = state.target ? state.fadeIn : state.fadeOut;
    const step = dt / duration;
    state.weight = state.target
      ? Math.min(1, state.weight + step)
      : Math.max(0, state.weight - step);
  }
}

function applyActiveAppearancePresets() {
  if (!core) return;
  const values = new Map();
  for (const state of appearancePresetStates.values()) {
    if (state.weight <= .0001) continue;
    for (const parameter of state.parameters) {
      const index = findRawIndex(parameter.id);
      if (index < 0) continue;
      let current = values.get(index);
      if (!Number.isFinite(current)) {
        try { current = core.getParameterValueByIndex(index); } catch { continue; }
      }
      if (parameter.blend === 'multiply') {
        current *= 1 + (parameter.value - 1) * state.weight;
      } else if (parameter.blend === 'overwrite') {
        current += (parameter.value - current) * state.weight;
      } else {
        current += parameter.value * state.weight;
      }
      values.set(index, current);
    }
  }

  for (const [index, value] of values) {
    let next = value;
    try {
      next = Math.max(core.getParameterMinimumValue(index),
        Math.min(core.getParameterMaximumValue(index), next));
      core.setParameterValueByIndex(index, next);
    } catch { /* invalid parameter in a third-party preset: skip it */ }
  }
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

function loadInteractionSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(INTERACTION_STORAGE_KEY) || '{}');
    touchFollowLevel = TOUCH_FOLLOW_LEVELS[saved.followLevel] ? saved.followLevel : 'vivid';
    const zone = saved.headZone;
    if (zone && ['left', 'top', 'right', 'bottom'].every((key) => Number.isFinite(zone[key]))) {
      headZone = {
        left: Math.max(0, Math.min(1, zone.left)),
        top: Math.max(0, Math.min(1, zone.top)),
        right: Math.max(0, Math.min(1, zone.right)),
        bottom: Math.max(0, Math.min(1, zone.bottom)),
      };
    }
  } catch {
    touchFollowLevel = 'vivid';
    headZone = { ...DEFAULT_HEAD_ZONE };
  }
}

function saveInteractionSettings() {
  localStorage.setItem(INTERACTION_STORAGE_KEY, JSON.stringify({
    followLevel: touchFollowLevel,
    headZone,
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

function updateTouchGaze(event) {
  const rect = app.view.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  touchGazeTargetX = Math.max(-1, Math.min(1,
    ((event.clientX - rect.left) / rect.width) * 2 - 1));
  // Cubism eye/head Y is normally positive upward.
  touchGazeTargetY = Math.max(-1, Math.min(1,
    1 - ((event.clientY - rect.top) / rect.height) * 2));
}

function canvasPointFromEvent(event) {
  const rect = app.view.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  return {
    x: (event.clientX - rect.left) * app.screen.width / rect.width,
    y: (event.clientY - rect.top) * app.screen.height / rect.height,
  };
}

function normalizedModelPoint(event) {
  if (!model) return null;
  const point = canvasPointFromEvent(event);
  const bounds = model.getBounds();
  if (!point || !bounds.width || !bounds.height) return null;
  return {
    x: (point.x - bounds.x) / bounds.width,
    y: (point.y - bounds.y) / bounds.height,
  };
}

function isPointInHeadZone(event, margin = 0) {
  const point = normalizedModelPoint(event);
  if (!point) return false;
  return point.x >= headZone.left - margin && point.x <= headZone.right + margin
    && point.y >= headZone.top - margin && point.y <= headZone.bottom + margin;
}

function handleHeadZoneCalibration(event) {
  if (!headZoneCalibrationMode) return false;
  const point = normalizedModelPoint(event);
  if (!point) return true;
  if (!headZoneCalibrationFirstPoint) {
    headZoneCalibrationFirstPoint = point;
    setStatus('摸头区域校准：请点击头部右下角');
    return true;
  }
  const left = Math.max(0, Math.min(headZoneCalibrationFirstPoint.x, point.x));
  const top = Math.max(0, Math.min(headZoneCalibrationFirstPoint.y, point.y));
  const right = Math.min(1, Math.max(headZoneCalibrationFirstPoint.x, point.x));
  const bottom = Math.min(1, Math.max(headZoneCalibrationFirstPoint.y, point.y));
  if (right - left < .08 || bottom - top < .06) {
    headZoneCalibrationFirstPoint = null;
    setStatus('校准范围太小，请重新点击头顶左上角');
    return true;
  }
  headZone = { left, top, right, bottom };
  headZoneCalibrationMode = false;
  headZoneCalibrationFirstPoint = null;
  saveInteractionSettings();
  setStatus('摸头区域已保存');
  setTimeout(() => setStatus(''), 1600);
  return true;
}

function beginPatCandidate(event) {
  patPointerId = event.pointerId;
  patCandidate = isPointInHeadZone(event);
  patLastPoint = canvasPointFromEvent(event);
  patTravel = 0;
  patStartedAt = elapsed;
  patTriggered = false;
}

function triggerHeadPat(forceConfused = false) {
  const confused = forceConfused || Math.random() < .1;
  interactionActionName = confused ? 'head_pat_confused' : 'head_pat';
  interactionActionTime = 0;
  autonomousActionName = 'none';
  nextAutonomousActionAt = elapsed + 4 + Math.random() * 4;
  window.AndroidStage?.onInteraction?.(confused ? '摸头彩蛋：疑惑' : '摸头反应');
}

function updatePatCandidate(event) {
  if (event.pointerId !== patPointerId || !patCandidate || patTriggered) return;
  if (!isPointInHeadZone(event, .08)) {
    patCandidate = false;
    return;
  }
  const point = canvasPointFromEvent(event);
  if (!point || !patLastPoint) return;
  patTravel += Math.hypot(point.x - patLastPoint.x, point.y - patLastPoint.y);
  patLastPoint = point;
  const threshold = Math.max(34, app.screen.width * .075);
  if (elapsed - patStartedAt >= .12 && patTravel >= threshold) {
    patTriggered = true;
    triggerHeadPat(false);
  }
}

function clearPatCandidate(event) {
  if (event.pointerId !== patPointerId) return;
  patPointerId = null;
  patCandidate = false;
  patLastPoint = null;
  patTravel = 0;
  patTriggered = false;
}

function installInteractionGestures() {
  const canvas = app.view;
  canvas.style.touchAction = 'none';

  canvas.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    canvas.setPointerCapture?.(event.pointerId);
    if (!adjustMode) {
      if (handleHeadZoneCalibration(event)) return;
      if (touchGazePointerId === null) touchGazePointerId = event.pointerId;
      if (event.pointerId === touchGazePointerId) {
        touchGazeActive = true;
        updateTouchGaze(event);
        beginPatCandidate(event);
      }
      return;
    }
    activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    resetGestureBaseline();
  });

  canvas.addEventListener('pointermove', (event) => {
    event.preventDefault();
    if (!adjustMode) {
      if (event.pointerId === touchGazePointerId && touchGazeActive) {
        updateTouchGaze(event);
        updatePatCandidate(event);
      }
      return;
    }
    if (!activePointers.has(event.pointerId)) return;
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
    clearPatCandidate(event);
    if (event.pointerId === touchGazePointerId) {
      touchGazeActive = false;
      touchGazePointerId = null;
      touchGazeReleasedAt = elapsed;
    }
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
  if (typeof action.sample === 'function') {
    return amplifyActionPose(action.sample(Math.min(time, action.duration), action.duration));
  }
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
  return amplifyActionPose(values);
}

function addValues(target, source) {
  for (const [key, value] of Object.entries(source)) {
    target[key] = (target[key] || 0) + value;
  }
}

const DIRECTED_ACTIONS = {
  agree: ['small_nod', 'nod', 'small_nod'],
  disagree: ['shake_head'],
  curious: ['tilt_head', 'head_tilt_idle', 'side_look', 'look_down_up', 'gentle_lean'],
  approach: ['lean_forward', 'gentle_lean', 'head_tilt_idle'],
  withdraw: ['lean_back', 'weight_shift'],
  surprised_react: ['blink_surprised', 'lean_back', 'blink_surprised'],
  sigh_react: ['sigh', 'sigh_sink'],
  pout_react: ['pout', 'head_tilt_idle'],
  celebrate: ['excited_bounce', 'nod', 'wind_sway_medium'],
  calm_react: ['slow_blink', 'soft_sway', 'gentle_lean'],
};

const EMOTION_ACCENT_ACTIONS = {
  happy: { probability: .58, pool: ['small_nod', 'nod', 'soft_sway', 'weight_shift'] },
  excited: { probability: .82, pool: ['excited_bounce', 'nod', 'wind_sway_medium'] },
  sad: { probability: .62, pool: ['sigh_sink', 'sigh', 'slow_blink', 'head_tilt_idle'] },
  shy: { probability: .52, pool: ['head_tilt_idle', 'side_look', 'slow_blink', 'pout'] },
  angry: { probability: .68, pool: ['shake_head', 'weight_shift', 'side_look'] },
  surprised: { probability: .82, pool: ['blink_surprised', 'lean_back'] },
  thinking: { probability: .64, pool: ['side_look', 'look_down_up', 'head_tilt_idle'] },
  confused: { probability: .72, pool: ['tilt_head', 'side_look', 'look_down_up'] },
  empathy: { probability: .46, pool: ['gentle_lean', 'slow_blink', 'head_tilt_idle'] },
  love: { probability: .56, pool: ['gentle_lean', 'head_tilt_idle', 'soft_sway'] },
  neutral: { probability: .16, pool: ['small_nod', 'slow_blink', 'side_look'] },
};

function chooseResponseAction(pool) {
  if (!pool?.length) return 'none';
  const candidates = pool.filter((name) => !recentResponseActions.includes(name));
  const choices = candidates.length ? candidates : pool;
  const selected = choices[Math.floor(Math.random() * choices.length)];
  recentResponseActions.push(selected);
  if (recentResponseActions.length > 3) recentResponseActions.shift();
  return selected;
}

function resolveDirectedAction(intent, emotion) {
  if (DIRECTED_ACTIONS[intent]) return chooseResponseAction(DIRECTED_ACTIONS[intent]);
  if (ACTION_LIBRARY[intent]) return intent;
  const accent = EMOTION_ACCENT_ACTIONS[emotion] || EMOTION_ACCENT_ACTIONS.neutral;
  return Math.random() < accent.probability ? chooseResponseAction(accent.pool) : 'none';
}

function updateEmotion(dt) {
  const target = getAmplifiedEmotionParams(EMOTIONS[emotionName] || EMOTIONS.neutral);
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
    // Two non-matching waves avoid the mechanical pendulum look.
    head_x: (Math.sin(t * .55) * 2.55 + Math.sin(t * .21 + 1.2) * 1.05) * amp,
    head_y: (Math.sin(t * .43 + .7) * 1.45 + Math.sin(t * .19) * .65) * amp,
    head_z: (Math.sin(t * .31 + 2.1) * 1.35 + Math.sin(t * .13) * .55) * amp,
    body_x: (Math.sin(t * .36) * 1.8 + Math.sin(t * .17 + 1.4) * .75) * amp,
    body_y: Math.sin(t * .28 + .5) * .24 * amp,
    body_z: Math.sin(t * .23 + 2.4) * .65 * amp,
    breath: .5 + Math.sin(t * 1.7) * .45,
  };
}

function updateGaze(dt) {
  const recentlyTouched = touchGazeActive || elapsed - touchGazeReleasedAt < .65;
  if (!touchGazeActive && !recentlyTouched) {
    touchGazeTargetX = 0;
    touchGazeTargetY = 0;
  }

  // Soullink-inspired idle gaze: move, hold, then choose a different target.
  if (!recentlyTouched && !focusedInteraction && elapsed >= nextIdleGazeAt) {
    idleGazeTargetX = (Math.random() * 2 - 1) * .38;
    idleGazeTargetY = (Math.random() * 2 - 1) * .2;
    nextIdleGazeAt = elapsed + 1.7 + Math.random() * 3.4;
  } else if (focusedInteraction || recentlyTouched) {
    idleGazeTargetX = 0;
    idleGazeTargetY = 0;
  }

  const eyeBlend = 1 - Math.exp(-dt / .075);
  const headBlend = 1 - Math.exp(-dt / .19);
  const rollBlend = 1 - Math.exp(-dt / .25);
  const bodyBlend = 1 - Math.exp(-dt / .43);
  const idleBlend = 1 - Math.exp(-dt / .48);
  touchGazeX += (touchGazeTargetX - touchGazeX) * eyeBlend;
  touchGazeY += (touchGazeTargetY - touchGazeY) * eyeBlend;
  touchHeadX += (touchGazeTargetX - touchHeadX) * headBlend;
  touchHeadY += (touchGazeTargetY - touchHeadY) * headBlend;
  // Cubism's standard nine-grid focus relation: the four corners add roll (Z),
  // while centre/top/bottom/left/right remain clean X/Y poses.
  const touchRollTarget = -touchGazeTargetX * touchGazeTargetY;
  touchHeadZ += (touchRollTarget - touchHeadZ) * rollBlend;
  touchBodyX += (touchGazeTargetX - touchBodyX) * bodyBlend;
  touchBodyY += (touchGazeTargetY - touchBodyY) * bodyBlend;
  touchBodyZ += (touchRollTarget - touchBodyZ) * bodyBlend;
  idleGazeX += (idleGazeTargetX - idleGazeX) * idleBlend;
  idleGazeY += (idleGazeTargetY - idleGazeY) * idleBlend;

  const touchWeight = Math.max(Math.abs(touchGazeX), Math.abs(touchGazeY)) > .006 ? 1 : 0;
  const follow = TOUCH_FOLLOW_LEVELS[touchFollowLevel] || TOUCH_FOLLOW_LEVELS.vivid;
  const patActive = interactionActionName === 'head_pat' || interactionActionName === 'head_pat_confused';
  const headFollowWeight = patActive ? .25 : 1;
  const bodyFollowWeight = patActive ? .15 : 1;
  return {
    eye_x: touchGazeX * follow.eyeX + idleGazeX * (1 - touchWeight),
    eye_y: touchGazeY * follow.eyeY + idleGazeY * (1 - touchWeight),
    head_x: (touchHeadX * follow.headX + idleGazeX * 3.4 * (1 - touchWeight)) * headFollowWeight,
    head_y: (touchHeadY * follow.headY + idleGazeY * 2.2 * (1 - touchWeight)) * headFollowWeight,
    head_z: touchHeadZ * follow.headZ * headFollowWeight,
    body_x: touchBodyX * follow.bodyX * bodyFollowWeight,
    // Kept below one degree: enough to feed the model's vertical physics without
    // repeating the earlier visible squash.
    body_y: touchBodyY * follow.bodyY * bodyFollowWeight,
    body_z: touchBodyZ * follow.bodyZ * bodyFollowWeight,
  };
}

function chooseAutonomousAction(profile) {
  const weighted = emotionName === 'sad'
    ? ['sigh_sink', 'sigh', 'slow_blink', 'head_tilt_idle', 'side_look', 'gentle_lean']
    : emotionName === 'excited'
      ? ['excited_bounce', 'small_nod', 'nod', 'weight_shift', 'look_around', 'soft_sway', 'wind_sway_soft', 'wind_sway_medium']
      : emotionName === 'happy'
        ? ['small_nod', 'nod', 'weight_shift', 'look_around', 'head_tilt_idle', 'soft_sway', 'wind_sway_soft', 'excited_bounce']
        : emotionName === 'thinking' || emotionName === 'confused'
          ? ['side_look', 'head_tilt_idle', 'tilt_head', 'look_down_up', 'slow_blink', 'gentle_lean']
          : emotionName === 'angry'
            ? ['shake_head', 'weight_shift', 'side_look', 'head_tilt_idle']
            : emotionName === 'shy'
              ? ['head_tilt_idle', 'side_look', 'slow_blink', 'pout', 'gentle_lean']
              : emotionName === 'surprised'
                ? ['blink_surprised', 'lean_back', 'side_look', 'slow_blink']
                : emotionName === 'love' || emotionName === 'empathy'
                  ? ['gentle_lean', 'head_tilt_idle', 'slow_blink', 'soft_sway', 'wind_sway_soft']
                  : ['small_nod', 'head_tilt_idle', 'side_look', 'weight_shift', 'gentle_lean', 'slow_blink', 'look_around', 'soft_sway', 'wind_sway_soft'];
  const candidates = weighted.filter((name) => !recentAutonomousActions.includes(name));
  const pool = candidates.length ? candidates : weighted;
  const selected = pool[Math.floor(Math.random() * pool.length)];
  recentAutonomousActions.push(selected);
  if (recentAutonomousActions.length > 3) recentAutonomousActions.shift();
  return selected;
}

function maybeStartAutonomousAction() {
  if (!autonomousIdleEnabled || adjustMode || focusedInteraction
      || touchGazeActive || elapsed - touchGazeReleasedAt < 1
      || interactionActionName !== 'none'
      || actionName !== 'none' || autonomousActionName !== 'none') return;
  if (elapsed >= nextShowcaseActionAt) {
    const roll = Math.random();
    autonomousActionName = roll < .55 ? 'wind_sway_medium'
      : roll < .86 ? 'showcase_orbit' : 'wind_sway_showcase';
    autonomousActionTime = 0;
    nextShowcaseActionAt = elapsed + 48 + Math.random() * 52;
    return;
  }
  if (elapsed < nextAutonomousActionAt) return;
  autonomousActionName = chooseAutonomousAction(EMOTIONS[emotionName] || EMOTIONS.neutral);
  autonomousActionTime = 0;
}

function finishActionIfNeeded(name, time) {
  const action = ACTION_LIBRARY[name];
  return Boolean(action && action.duration > 0 && time >= action.duration);
}

function tick(dt) {
  if (!core) return;
  elapsed += dt;
  actionTime += dt;
  autonomousActionTime += dt;
  interactionActionTime += dt;
  blinkTime -= dt;

  const profile = EMOTIONS[emotionName] || EMOTIONS.neutral;
  const values = updateEmotion(dt);
  addValues(values, idleOffsets(profile));
  addValues(values, updateGaze(dt));

  maybeStartAutonomousAction();
  if (autonomousActionName !== 'none') {
    addValues(values, interpolateAction(autonomousActionName, autonomousActionTime));
    if (finishActionIfNeeded(autonomousActionName, autonomousActionTime)) {
      autonomousActionName = 'none';
      nextAutonomousActionAt = elapsed + 4.8 + Math.random() * 6.7;
    }
  }
  if (actionName !== 'none') {
    addValues(values, interpolateAction(actionName, actionTime));
    if (finishActionIfNeeded(actionName, actionTime)) {
      actionName = 'none';
      nextAutonomousActionAt = elapsed + 5 + Math.random() * 7;
    }
  }
  if (interactionActionName !== 'none') {
    addValues(values, interpolateAction(interactionActionName, interactionActionTime));
    if (finishActionIfNeeded(interactionActionName, interactionActionTime)) {
      interactionActionName = 'none';
      interactionActionTime = 0;
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

function runPerformanceFrame() {
  const now = performance.now();
  const dt = lastPerformanceUpdateAt
    ? Math.max(.001, Math.min(.05, (now - lastPerformanceUpdateAt) / 1000))
    : 1 / 60;
  lastPerformanceUpdateAt = now;
  tick(dt);
  updateAppearanceFades(dt);
}

function limitSwayFaceYaw() {
  const activeSway = SWAY_FACE_YAW_ACTIONS.has(actionName)
    || SWAY_FACE_YAW_ACTIONS.has(autonomousActionName);
  if (!activeSway || !core) return;

  // 迷梦的 X2 是动作/物理输入，ParamAngleX 是物理计算后的最终脸部左右转向。
  // 只压低输出，不改 X2、身体参数或动作路线，因此头部位置、头发惯性和身体摆动保留。
  const physicsInputIndex = findRawIndex('ParamAngleX2');
  const faceYawIndex = findRawIndex('ParamAngleX');
  if (physicsInputIndex < 0 || faceYawIndex < 0 || physicsInputIndex === faceYawIndex) return;
  try {
    const current = core.getParameterValueByIndex(faceYawIndex);
    if (!Number.isFinite(current)) return;
    const reduced = Math.max(-SWAY_FACE_YAW_LIMIT,
      Math.min(SWAY_FACE_YAW_LIMIT, current * SWAY_FACE_YAW_GAIN));
    core.setParameterValueByIndex(faceYawIndex, reduced);
  } catch { /* model/core without readable output parameters: leave the original motion */ }
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
  loadInteractionSettings();
  fitModel();
  addEventListener('resize', fitModel);
  installInteractionGestures();
  // afterMotionUpdate runs before this renderer's focus/physics/model update.
  // Writing X2/Y2/Z2 here lets hair, clothing and accessories consume the new
  // pose during the same frame instead of receiving it one frame too late.
  model.internalModel.on('afterMotionUpdate', runPerformanceFrame);
  model.internalModel.on('beforeModelUpdate', limitSwayFaceYaw);
  model.internalModel.on('beforeModelUpdate', applyActiveAppearancePresets);
  setStatus('');
}

window.live2dStage = {
  applyResponse(emotion = 'neutral', action = 'none') {
    emotionName = EMOTIONS[emotion] ? emotion : 'neutral';
    actionName = resolveDirectedAction(action, emotionName);
    actionTime = 0;
    autonomousActionName = 'none';
    nextAutonomousActionAt = elapsed + 5 + Math.random() * 7;
  },
  testEmotion(name) {
    emotionName = EMOTIONS[name] ? name : 'neutral';
    actionName = 'none';
    actionTime = 0;
  },
  testAction(name) {
    actionName = ACTION_LIBRARY[name] ? name : 'none';
    actionTime = 0;
    autonomousActionName = 'none';
  },
  testHeadPat(confused = false) {
    triggerHeadPat(Boolean(confused));
    return interactionActionName;
  },
  testExpression(name) {
    if (!model || !name) return false;
    Promise.resolve(model.expression(name)).catch(console.error);
    return true;
  },
  clearExpression() {
    const manager = model?.internalModel?.motionManager?.expressionManager;
    manager?.resetExpression?.();
  },
  setAppearancePreset(name, active = true) {
    return setAppearancePresetActive(name, Boolean(active));
  },
  setAppearancePresets(names) {
    return applyAppearancePresetSet(names);
  },
  clearAppearancePresets(immediate = false) {
    clearAllAppearancePresets(Boolean(immediate));
    return [];
  },
  getActiveAppearancePresets() {
    return [...desiredAppearancePresets];
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
    nextShowcaseActionAt = elapsed + 24 + Math.random() * 32;
    return autonomousIdleEnabled;
  },
  setFocusedInteraction(enabled) {
    focusedInteraction = Boolean(enabled);
    if (focusedInteraction) {
      autonomousActionName = 'none';
      idleGazeTargetX = 0;
      idleGazeTargetY = 0;
      if (actionName === 'none') {
        actionName = 'listening';
        actionTime = 0;
      }
    } else if (actionName === 'listening') {
      actionName = 'none';
      actionTime = 0;
      nextAutonomousActionAt = elapsed + 2.5 + Math.random() * 3;
    }
    return focusedInteraction;
  },
  resetPerformance() {
    emotionName = 'neutral';
    actionName = 'none';
    autonomousActionName = 'none';
    interactionActionName = 'none';
    actionTime = 0;
    interactionActionTime = 0;
    this.clearExpression();
    this.clearAppearancePresets();
  },
  setTouchFollowLevel(level) {
    touchFollowLevel = TOUCH_FOLLOW_LEVELS[level] ? level : 'vivid';
    saveInteractionSettings();
    return touchFollowLevel;
  },
  getTouchFollowLevel() { return touchFollowLevel; },
  beginHeadZoneCalibration() {
    adjustMode = false;
    headZoneCalibrationMode = true;
    headZoneCalibrationFirstPoint = null;
    setStatus('摸头区域校准：请点击头部左上角');
    return true;
  },
  resetHeadZone() {
    headZone = { ...DEFAULT_HEAD_ZONE };
    headZoneCalibrationMode = false;
    headZoneCalibrationFirstPoint = null;
    saveInteractionSettings();
    return true;
  },
  setAdjustMode(enabled) {
    adjustMode = Boolean(enabled);
    activePointers.clear();
    resetGestureBaseline();
    touchGazeActive = false;
    touchGazePointerId = null;
    touchGazeTargetX = 0;
    touchGazeTargetY = 0;
    clearPatCandidate({ pointerId: patPointerId });
    headZoneCalibrationMode = false;
    headZoneCalibrationFirstPoint = null;
    autonomousActionName = 'none';
    if (app?.view) app.view.style.touchAction = 'none';
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
