// -------- landing hero featured worlds carousel --------
// Fetches /api/worlds/featured (public, unauthenticated — published worlds only)
// and renders them as isometric canvas previews that cycle in the home hero. The
// preview renderer lives in scripts/world-preview.js (window.TinyWorldPreview),
// which must be loaded before this script.
// If the feed is empty or fails, the section stays hidden (hideFeed pattern from
// landing-feed.js).
(function () {
  'use strict';

  var section = document.getElementById('world-carousel');
  var track = document.getElementById('world-carousel-track');
  var dotsEl = document.getElementById('world-carousel-dots');
  var prevBtn = document.getElementById('world-carousel-prev');
  var nextBtn = document.getElementById('world-carousel-next');
  if (!section || !track || !dotsEl || !prevBtn || !nextBtn) return;

  function hideCarousel() {
    section.hidden = true;
  }

  var worlds = [];
  var current = 0;
  var timer = null;
  var INTERVAL = 5000;
  var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function worldHref(w) {
    var slug = String((w && w.slug) || '').trim();
    if (!slug) return '/tiny-world-builder';
    return '/tiny-world-builder?world=' + encodeURIComponent(slug);
  }

  function buildSlide(w, idx) {
    var slide = document.createElement('div');
    slide.className = 'world-carousel-slide';
    slide.setAttribute('role', 'group');
    slide.setAttribute('aria-label', String(w.name || w.slug || 'World'));
    slide.dataset.idx = String(idx);

    var cnv = document.createElement('canvas');
    cnv.className = 'world-carousel-canvas';
    // Set explicit pixel dimensions as fallback for renderPreview when slide
    // is not yet visible (clientWidth may be 0 while display:none).
    cnv.width = 320;
    cnv.height = 200;

    var info = document.createElement('div');
    info.className = 'world-carousel-info';

    var name = document.createElement('span');
    name.className = 'world-carousel-name';
    name.textContent = String(w.name || w.slug || 'World');

    var link = document.createElement('a');
    link.className = 'world-carousel-open';
    link.href = worldHref(w);
    link.textContent = 'Open world';
    link.setAttribute('aria-label', 'Open ' + String(w.name || w.slug || 'world'));

    info.appendChild(name);
    info.appendChild(link);
    slide.appendChild(cnv);
    slide.appendChild(info);

    // Render preview onto canvas via the shared renderer module.
    try {
      window.TinyWorldPreview.renderPreview(cnv, w.preview);
    } catch (_) {}

    return slide;
  }

  function updateDots() {
    var dotEls = dotsEl.querySelectorAll('.world-carousel-dot');
    for (var i = 0; i < dotEls.length; i++) {
      var active = i === current;
      dotEls[i].classList.toggle('is-active', active);
      dotEls[i].setAttribute('aria-current', active ? 'true' : 'false');
    }
  }

  function goTo(idx, skipTimer) {
    var n = worlds.length;
    if (!n) return;
    current = ((idx % n) + n) % n;
    // Slide via CSS transform on the track
    track.style.transform = 'translateX(' + (-current * 100) + '%)';
    updateDots();
    if (!skipTimer) resetTimer();
  }

  function resetTimer() {
    if (timer) clearTimeout(timer);
    if (reducedMotion) return;
    timer = setTimeout(function () { goTo(current + 1); }, INTERVAL);
  }

  function render(wList) {
    if (!wList || !wList.length) { hideCarousel(); return; }
    worlds = wList;

    // Build slides
    track.textContent = '';
    dotsEl.textContent = '';

    worlds.forEach(function (w, i) {
      track.appendChild(buildSlide(w, i));

      var dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'world-carousel-dot';
      dot.setAttribute('aria-label', 'Go to world ' + (i + 1));
      dot.setAttribute('aria-current', i === 0 ? 'true' : 'false');
      dot.addEventListener('click', function () { goTo(i); });
      dotsEl.appendChild(dot);
    });

    goTo(0, true);
    section.hidden = false;
    if (!reducedMotion) resetTimer();
  }

  // Pause auto-advance on hover/focus inside the carousel
  section.addEventListener('mouseenter', function () { if (timer) { clearTimeout(timer); timer = null; } });
  section.addEventListener('mouseleave', function () { if (!reducedMotion && worlds.length) resetTimer(); });
  section.addEventListener('focusin', function () { if (timer) { clearTimeout(timer); timer = null; } });
  section.addEventListener('focusout', function (e) {
    if (!section.contains(e.relatedTarget) && !reducedMotion && worlds.length) resetTimer();
  });

  prevBtn.addEventListener('click', function () { goTo(current - 1); });
  nextBtn.addEventListener('click', function () { goTo(current + 1); });

  // Keyboard nav on the track wrapper
  section.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft') { goTo(current - 1); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { goTo(current + 1); e.preventDefault(); }
  });

  function load() {
    // Public discovery feed: /api/worlds/featured returns only published worlds
    // with preview data and needs no auth, so it works for anonymous landing
    // visitors (the auth-gated /api/worlds returns [] for them).
    fetch('/api/worlds/featured', { headers: { Accept: 'application/json' } })
      .then(function (res) { return res && res.ok ? res.json() : null; })
      .then(function (data) {
        var all = data && Array.isArray(data.worlds) ? data.worlds : [];
        var ready = all.filter(function (w) {
          return w && w.preview && Array.isArray(w.preview.cells) && w.preview.cells.length > 0;
        }).slice(0, 8);
        render(ready);
      })
      .catch(hideCarousel);
  }

  hideCarousel();
  load();
})();
