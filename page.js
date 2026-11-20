/* Builds the section index in the project page rail, and marks the section
   you are currently reading.

   The rail only exists on wide screens, where the left margin would otherwise
   be several hundred pixels of nothing. The index is generated from the
   headings already on the page, so there is no second copy of the structure
   to keep in sync. Progressive enhancement: without this file the page is a
   normal single column and loses nothing but the shortcut. */
(function () {
  'use strict';

  var rail = document.querySelector('.project-rail');
  var body = document.querySelector('.project-body');
  if (!rail || !body) return;

  var headings = body.querySelectorAll('.project-section > h2');
  if (headings.length < 3) return;   // not worth an index

  function slug(text) {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  var list = document.createElement('ol');
  var links = [];
  var sections = [];

  Array.prototype.forEach.call(headings, function (h2) {
    var section = h2.parentNode;
    if (!section.id) section.id = slug(h2.textContent) || 'section';

    var a = document.createElement('a');
    a.href = '#' + section.id;
    a.textContent = h2.textContent;

    var li = document.createElement('li');
    li.appendChild(a);
    list.appendChild(li);

    links.push(a);
    sections.push(section);
  });

  var nav = document.createElement('nav');
  nav.className = 'rail-index';
  nav.appendChild(list);
  rail.appendChild(nav);

  // Only now does the page become two columns. Without this the grid would
  // apply to pages that have no rail and split their content across columns.
  var page = rail.closest('.project-page');
  if (page) page.classList.add('has-rail');

  // Start the index level with the first heading rather than level with the
  // back link, so the two columns line up before you scroll. offsetTop is a
  // layout position, so it is not disturbed by the sticky positioning.
  function alignRail() {
    rail.style.marginTop = '0px';
    if (getComputedStyle(rail).display === 'none') return;
    var delta = sections[0].offsetTop - rail.offsetTop;
    if (delta > 0) rail.style.marginTop = delta + 'px';
  }

  // Mark the heading nearest the top of the viewport rather than whatever
  // happens to be intersecting, so one entry is current at a time.
  var current = -1;
  function update() {
    var best = 0;
    var header = document.querySelector('body > nav');
    var top = (header ? header.offsetHeight : 60) + 24;
    for (var i = 0; i < sections.length; i++) {
      if (sections[i].getBoundingClientRect().top - top <= 0) best = i;
    }
    // The last section is usually short, so its heading may never cross the
    // line no matter how far you scroll. Once the page has run out of scroll,
    // the last section is what you are looking at.
    if (window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 2) {
      best = sections.length - 1;
    }
    if (best === current) return;
    if (current >= 0) links[current].classList.remove('is-current');
    links[best].classList.add('is-current');
    current = best;
  }

  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () { ticking = false; update(); });
  }

  alignRail();
  update();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', function () { alignRail(); onScroll(); });
  window.addEventListener('load', alignRail);
})();
