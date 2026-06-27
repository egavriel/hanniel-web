/* Splide 4 init for Hanniel carousels.
   Mounts every .hanniel-splide element on the page.
   Coexists with the existing scroll-reveal handler in script.js. */
(function () {
  'use strict';
  function mountSplides() {
    if (typeof Splide !== 'function') return;
    document.querySelectorAll('.hanniel-splide').forEach(function (node) {
      new Splide(node, {
        type: 'loop',
        perPage: 1,
        focus: 'center',
        gap: '16px',
        arrows: true,
        pagination: true,
        autoplay: false,
        keyboard: true,
        drag: true,
        breakpoints: {
          720: { perPage: 1, gap: '12px' },
        },
      }).mount();
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountSplides);
  } else {
    mountSplides();
  }
})();