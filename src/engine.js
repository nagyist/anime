import {
  defaults,
  globals,
  globalVersions,
} from './globals.js';

import {
  tickModes,
  isBrowser,
  K,
  doc,
} from './consts.js';

import {
  now,
  forEachChildren,
  removeChild,
} from './helpers.js';

import {
  Clock,
} from './clock.js';

import {
  additive,
} from './additive.js';

import {
  tick,
} from './render.js';

export const engineTickMethod = /*#__PURE__*/ (() => isBrowser ? requestAnimationFrame : setImmediate)();
export const engineCancelMethod = /*#__PURE__*/ (() => isBrowser ? cancelAnimationFrame : clearImmediate)();

export class Engine extends Clock {

  /** @param {Number} [initTime] */
  constructor(initTime) {
    super(initTime);
    this.useDefaultMainLoop = true;
    this.pauseOnDocumentHidden = true;
    /** @type {DefaultsParams} */
    this.defaults = defaults;
    this.paused = isBrowser && doc.hidden ? true  : false;
    /** @type {Number|NodeJS.Immediate} */
    this.reqId = null;
  }

  update() {
    const time = this._currentTime = now();
    if (this.requestTick(time)) {
      this.computeDeltaTime(time);
      const engineSpeed = this._speed;
      const engineFps = this._fps;
      let activeTickable = /** @type {Tickable} */(this._head);
      while (activeTickable) {
        const nextTickable = activeTickable._next;
        if (!activeTickable.paused) {
          tick(
            activeTickable,
            (time - activeTickable._startTime) * activeTickable._speed * engineSpeed,
            0, // !muteCallbacks
            0, // !internalRender
            activeTickable._fps < engineFps ? activeTickable.requestTick(time) : tickModes.AUTO
          );
        } else {
          removeChild(this, activeTickable);
          this._hasChildren = !!this._tail;
          activeTickable._running = false;
          if (activeTickable.completed && !activeTickable._cancelled) {
            activeTickable.cancel();
          }
        }
        activeTickable = nextTickable;
      }
      additive.update();
    }
  }

  wake() {
    if (this.useDefaultMainLoop && !this.reqId && !this.paused) {
      this.reqId = engineTickMethod(tickEngine);
    }
    return this;
  }

  pause() {
    this.paused = true;
    return killEngine();
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    forEachChildren(this, (/** @type {Tickable} */child) => child.resetTime());
    return this.wake();
  }

  // Getter and setter for speed
  get speed() {
    return this._speed * (globals.timeScale === 1 ? 1 : K);
  }

  set speed(playbackRate) {
    this._speed = playbackRate * globals.timeScale;
    forEachChildren(this, (/** @type {Tickable} */child) => child.speed = child._speed);
  }

  // Getter and setter for timeUnit
  get timeUnit() {
    return globals.timeScale === 1 ? 'ms' : 's';
  };

  set timeUnit(unit) {
    const secondsScale = 0.001;
    const isSecond = unit === 's';
    const newScale = isSecond ? secondsScale : 1;
    if (globals.timeScale !== newScale) {
      globals.timeScale = newScale;
      globals.tickThreshold = 200 * newScale;
      const scaleFactor = isSecond ? secondsScale : K;
      /** @type {Number} */
      (this.defaults.duration) *= scaleFactor;
      this._speed *= scaleFactor;
    }
  }

  // Getter and setter for precision
  get precision() {
    return globals.precision;
  }

  set precision(precision) {
    globals.precision = precision;
  }

};

export const engine = /*#__PURE__*/(() => {
  const engine = new Engine(now());
  if (isBrowser) {
    globalVersions.engine = engine;
    doc.addEventListener('visibilitychange', () => {
      if (!engine.pauseOnDocumentHidden) return;
      doc.hidden ? engine.pause() : engine.resume();
    });
  }
  return engine;
})();


const tickEngine = () => {
  if (engine._head) {
    engine.reqId = engineTickMethod(tickEngine);
    engine.update();
  } else {
    engine.reqId = 0;
  }
};

const killEngine = () => {
  engineCancelMethod(/** @type {NodeJS.Immediate & Number} */(engine.reqId));
  engine.reqId = 0;
  return engine;
};
