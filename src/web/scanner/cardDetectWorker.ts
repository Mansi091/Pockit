/**
 * Source of the background Web Worker that runs OpenCV.js for card detection.
 *
 * Why a worker: OpenCV.js is ~10 MB and compiles WebAssembly when it loads.
 * Doing that on the page's main thread froze the tab ("This page isn't
 * responding"). In a worker, the page and the live camera stay smooth.
 *
 * Plain JavaScript in a string (the worker is created from a Blob), so it
 * needs no bundler support. Protocol:
 *   → { type: 'init' }                         ← { type: 'ready' } | { type: 'failed' }
 *   → { type: 'detect', id, image: ImageData }  ← { type: 'result', id, quad: [{x,y}×4] (0..1) | null }
 */
export const OPENCV_URL = 'https://docs.opencv.org/4.10.0/opencv.js';

export const WORKER_SOURCE = String.raw`
var cvReady = false;

function waitForCv(timeoutMs) {
  return new Promise(function (resolve) {
    var started = Date.now();
    (function tick() {
      var cv = self.cv;
      if (cv && typeof cv.Mat === 'function' && typeof cv.findContours === 'function') return resolve(true);
      if (Date.now() - started > timeoutMs) return resolve(false);
      setTimeout(tick, 100);
    })();
  });
}

function orderCorners(points) {
  var cx = 0, cy = 0;
  points.forEach(function (p) { cx += p.x / 4; cy += p.y / 4; });
  var sorted = points.slice().sort(function (a, b) {
    return Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx);
  });
  var start = 0, best = Infinity;
  sorted.forEach(function (p, i) { if (p.x + p.y < best) { best = p.x + p.y; start = i; } });
  return [0, 1, 2, 3].map(function (k) { return sorted[(start + k) % 4]; });
}

function isConvex(q) {
  var sign = 0;
  for (var i = 0; i < 4; i++) {
    var a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4];
    var cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (cross === 0) continue;
    var s = cross > 0 ? 1 : -1;
    if (sign && s !== sign) return false;
    sign = s;
  }
  return sign !== 0;
}

function area(q) {
  var s = 0;
  for (var i = 0; i < 4; i++) { var a = q[i], b = q[(i + 1) % 4]; s += a.x * b.y - b.x * a.y; }
  return Math.abs(s) / 2;
}

function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

function bestQuad(cv, bin, imgArea) {
  var contours = new cv.MatVector();
  var hierarchy = new cv.Mat();
  var best = null;
  try {
    cv.findContours(bin, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
    for (var i = 0; i < contours.size(); i++) {
      var c = contours.get(i);
      var a = cv.contourArea(c);
      if (a < imgArea * 0.06 || a > imgArea * 0.97) { c.delete(); continue; }
      var hull = new cv.Mat();
      cv.convexHull(c, hull);
      var peri = cv.arcLength(hull, true);
      var quad = null;
      var eps = [0.02, 0.035, 0.05];
      for (var e = 0; e < eps.length && !quad; e++) {
        var approx = new cv.Mat();
        cv.approxPolyDP(hull, approx, eps[e] * peri, true);
        if (approx.rows === 4) {
          var pts = [];
          for (var k = 0; k < 4; k++) pts.push({ x: approx.data32S[k * 2], y: approx.data32S[k * 2 + 1] });
          quad = orderCorners(pts);
        }
        approx.delete();
      }
      hull.delete();
      c.delete();
      if (!quad || !isConvex(quad)) continue;
      var w = Math.max(dist(quad[0], quad[1]), dist(quad[3], quad[2]));
      var h = Math.max(dist(quad[0], quad[3]), dist(quad[1], quad[2]));
      var ratio = Math.max(w, h) / Math.max(1, Math.min(w, h));
      var score = area(quad) * (ratio >= 1.25 && ratio <= 2.3 ? 1 : 0.35);
      if (!best || score > best.score) best = { quad: quad, score: score };
    }
  } finally {
    contours.delete();
    hierarchy.delete();
  }
  return best;
}

function detect(image) {
  var cv = self.cv;
  var mats = [];
  function keep(m) { mats.push(m); return m; }
  try {
    var src = keep(cv.matFromImageData(image));
    var gray = keep(new cv.Mat());
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0);
    var kernel = keep(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5)));
    var edges = keep(new cv.Mat());
    cv.Canny(gray, edges, 40, 140);
    cv.dilate(edges, edges, kernel);
    var bright = keep(new cv.Mat());
    cv.threshold(gray, bright, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
    cv.morphologyEx(bright, bright, cv.MORPH_CLOSE, kernel);
    var imgArea = image.width * image.height;
    var best = null;
    [edges, bright].forEach(function (bin) {
      var found = bestQuad(cv, bin, imgArea);
      if (found && (!best || found.score > best.score)) best = found;
    });
    if (!best) return null;
    return best.quad.map(function (p) { return { x: p.x / image.width, y: p.y / image.height }; });
  } catch (err) {
    return null;
  } finally {
    mats.forEach(function (m) { try { m.delete(); } catch (e) {} });
  }
}

self.onmessage = function (event) {
  var msg = event.data || {};
  if (msg.type === 'init') {
    if (cvReady) return self.postMessage({ type: 'ready' });
    try {
      importScripts('__OPENCV_URL__');
    } catch (err) {
      return self.postMessage({ type: 'failed' });
    }
    waitForCv(60000).then(function (ok) {
      cvReady = ok;
      self.postMessage({ type: ok ? 'ready' : 'failed' });
    });
    return;
  }
  if (msg.type === 'detect') {
    var quad = cvReady ? detect(msg.image) : null;
    self.postMessage({ type: 'result', id: msg.id, quad: quad });
  }
};
`.replace('__OPENCV_URL__', OPENCV_URL);
