/* Hero background: a particle field sampled from the Rev B RNG board
   artwork. Every filled pixel of the copper layers becomes a point on a
   spring, so the cursor pushes the traces aside and they settle back.
   Decorative only. Canvas 2D, no dependencies. */
(function () {
  'use strict';

  var host = document.getElementById('hero');
  if (!host) return;

  var stage = host.querySelector('.hero-bg');
  var canvas = stage && stage.querySelector('canvas');
  if (!canvas || !canvas.getContext) return;

  // Matches the stylesheet, which hides the layer on phones. Bailing here
  // too means no sampling and no animation loop on those devices.
  if (window.innerWidth <= 700) return;

  var ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return;

  var reduced = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Palette, kept in sync with style.css. The board greens live here and
  // nowhere else on the site; the rest of the page is paper and copper.
  var BG = '#faf8f5';
  var FRONT = '#4e9785';  // front copper
  var BACK = '#2f6557';   // back copper. Same value as --accent: the one
                          //   green on the site, used for the board and for
                          //   anything you can click.
  var ALPHA = 0.72;       // reads as a board rather than as texture

  // Physics
  var REACH = 78;        // px, how far the cursor's push carries
  var FORCE = 0.55;      // push strength at the centre of that radius
  var SPRING = 0.055;    // pull back toward home
  var DAMPING = 0.88;    // velocity kept between frames

  // Point data. Home coordinates are normalised 0..1 against the artwork box,
  // so the board can be fitted and centred at any stage size.
  var homeX, homeY, posX, posY, velX, velY, kind, n = 0;
  var aspect = 1.25;

  var dpr = 1, w = 0, h = 0;
  var ox = 0, oy = 0, spanX = 1, spanY = 1;
  var mx = -9999, my = -9999, hasPointer = false;
  var raf = null;

  function sample(img) {
    aspect = img.naturalWidth / img.naturalHeight;

    // Sampling too small blurs the thin copper traces below the colour
    // threshold and most of the board disappears, so keep this generous.
    var workW = window.innerWidth < 700 ? 700 : 1100;
    var workH = Math.round(workW / aspect);

    var off = document.createElement('canvas');
    off.width = workW;
    off.height = workH;
    var octx = off.getContext('2d', { willReadFrequently: true });
    octx.drawImage(img, 0, 0, workW, workH);

    var data;
    try {
      data = octx.getImageData(0, 0, workW, workH).data;
    } catch (e) {
      return false; // tainted canvas; nothing we can do
    }

    var step = 4;
    var cap = Math.ceil((workW / step) * (workH / step)) + 8;
    var hx = new Float32Array(cap), hy = new Float32Array(cap);
    var kd = new Uint8Array(cap);
    var count = 0;

    for (var y = 0; y < workH; y += step) {
      for (var x = 0; x < workW; x += step) {
        var i = (y * workW + x) * 4;
        var r = data[i], g = data[i + 1], b = data[i + 2];
        // The board outline is a single-pixel line, so on this grid it
        // samples as a broken dash. The stage border frames the board
        // already, so only the copper layers are taken.
        var k;
        if ((r - b > 40) && r > 90) k = 0;        // front copper
        else if ((b - r > 60) && b > 120) k = 1;  // back copper
        else continue;
        hx[count] = x / workW;
        hy[count] = y / workH;
        kd[count] = k;
        count++;
      }
    }
    if (!count) return false;

    homeX = hx.subarray(0, count);
    homeY = hy.subarray(0, count);
    kind = kd.subarray(0, count);
    posX = new Float32Array(count);
    posY = new Float32Array(count);
    velX = new Float32Array(count);
    velY = new Float32Array(count);
    n = count;

    return true;
  }

  var layoutTries = 0;

  function layout() {
    var rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      // The stage takes its height from aspect-ratio, which can still be
      // unresolved on the first pass. Retry on the next frame rather than
      // leaving the canvas at its default 300x150.
      if (layoutTries++ < 60) requestAnimationFrame(layout);
      return;
    }
    layoutTries = 0;

    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Derive the drawing box back from the rounded backing store. Using the
    // raw rect leaves the last row or column unpainted when it rounds up.
    w = canvas.width / dpr;
    h = canvas.height / dpr;

    // Cover the hero rather than fit inside it, so there are no empty
    // bands; whatever falls outside is simply not drawn. Centred either way.
    spanX = w;
    spanY = w / aspect;
    if (spanY < h) {
      spanY = h;
      spanX = h * aspect;
    }
    ox = (w - spanX) / 2;
    oy = (h - spanY) / 2;

    home();
    draw();
  }

  function home() {
    for (var i = 0; i < n; i++) {
      posX[i] = homeX[i] * spanX + ox;
      posY[i] = homeY[i] * spanY + oy;
      velX[i] = velY[i] = 0;
    }
  }

  function draw() {
    ctx.globalAlpha = 1;
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = ALPHA;
    var s = w < 420 ? 1.4 : 1.7;
    // One pass per layer, so fillStyle is set three times a frame rather
    // than once per point.
    var i;
    ctx.fillStyle = FRONT;
    for (i = 0; i < n; i++) { if (kind[i] === 0) ctx.fillRect(posX[i], posY[i], s, s); }
    ctx.fillStyle = BACK;
    for (i = 0; i < n; i++) { if (kind[i] === 1) ctx.fillRect(posX[i], posY[i], s, s); }
    ctx.globalAlpha = 1;
  }

  function step() {
    raf = null;
    var r2 = REACH * REACH;
    var moving = false;

    for (var i = 0; i < n; i++) {
      var px = posX[i], py = posY[i];
      var vx = velX[i], vy = velY[i];

      if (hasPointer) {
        var dx = px - mx, dy = py - my;
        var d2 = dx * dx + dy * dy;
        if (d2 < r2 && d2 > 0.0001) {
          var d = Math.sqrt(d2);
          var f = (1 - d / REACH) * FORCE;
          vx += (dx / d) * f * REACH * 0.08;
          vy += (dy / d) * f * REACH * 0.08;
        }
      }

      vx += (homeX[i] * spanX + ox - px) * SPRING;
      vy += (homeY[i] * spanY + oy - py) * SPRING;
      vx *= DAMPING;
      vy *= DAMPING;

      posX[i] = px + vx;
      posY[i] = py + vy;
      velX[i] = vx;
      velY[i] = vy;

      if (!moving && (vx * vx + vy * vy) > 0.0004) moving = true;
    }

    var settled = !moving && !hasPointer;
    // Snap exactly home before stopping. Without this each interaction
    // leaves a sub-pixel residue and the artwork blurs over time.
    if (settled) home();
    draw();
    if (!settled) raf = requestAnimationFrame(step);
  }

  function wake() {
    if (reduced) return;
    if (raf === null) raf = requestAnimationFrame(step);
  }

  function pointerFrom(e) {
    var rect = stage.getBoundingClientRect();
    mx = e.clientX - rect.left;
    my = e.clientY - rect.top;
    hasPointer = true;
    wake();
  }

  function clearPointer() {
    hasPointer = false;
    wake();
  }

  var img = new Image();
  img.decoding = 'async';
  img.onload = function () {
    if (!sample(img)) return;
    host.classList.add('is-ready');
    layout();
    if ('ResizeObserver' in window) {
      // Catches later reflows; its first callback is unreliable when the
      // box is still zero-sized, which is what layout()'s retry covers.
      new ResizeObserver(function () { layout(); }).observe(stage);
    }
    window.addEventListener('load', layout);

    if (!reduced) {
      // The canvas is pointer-events:none so the hero's button and links stay
      // clickable, so the section tracks the cursor on its behalf.
      host.addEventListener('pointermove', pointerFrom);
      host.addEventListener('pointerleave', clearPointer);
      host.addEventListener('pointercancel', clearPointer);
    }
    // Pause entirely when scrolled away.
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        if (!entries[0].isIntersecting) {
          if (raf !== null) { cancelAnimationFrame(raf); raf = null; }
          hasPointer = false;
        }
      }, { threshold: 0 }).observe(host);
    }
  };
  img.onerror = function () { /* leave the section hidden */ };
  img.src = 'images/rng-copper.png';

  var resizeTimer = null;
  window.addEventListener('resize', function () {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { if (n) layout(); }, 150);
  });
})();
