window.SAFArtworkModalNav = (function () {
  function items(content) {
    return Array.prototype.filter.call(content.children, function (el) {
      return el.hasAttribute('data-media-id');
    });
  }

  function activeIndex(list) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].classList.contains('active')) return i;
    }
    return 0;
  }

  function go(content, delta) {
    var list = items(content);
    if (list.length < 2) return;
    var current = activeIndex(list);
    var next = (current + delta + list.length) % list.length;
    list[current].classList.remove('active');
    list[next].classList.add('active');
    if (list[next].scrollIntoView) {
      list[next].scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  function addButton(dialog, direction, label, onActivate) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'artwork-modal-nav artwork-modal-nav--' + direction;
    button.setAttribute('aria-label', label);
    button.innerHTML =
      '<svg viewBox="0 0 12 7" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M1 1l5 4.5L11 1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>';
    // Dawn's ModalDialog closes the media modal on ANY mouse pointerup that
    // isn't inside a deferred-media/product-model element (see global.js) —
    // stop it here before it bubbles up from this button, or every arrow
    // click would immediately close the popup instead of paging it.
    button.addEventListener('pointerup', function (event) {
      event.stopPropagation();
    });
    button.addEventListener('click', function (event) {
      event.stopPropagation();
      onActivate();
    });
    dialog.appendChild(button);
  }

  function bind(modal) {
    if (!modal || modal.dataset.artworkNavBound) return;
    modal.dataset.artworkNavBound = 'true';

    var content = modal.querySelector('.product-media-modal__content');
    var dialog = modal.querySelector('.product-media-modal__dialog');
    if (!content || !dialog || items(content).length < 2) return;

    addButton(dialog, 'prev', 'Previous image', function () {
      go(content, -1);
    });
    addButton(dialog, 'next', 'Next image', function () {
      go(content, 1);
    });

    var touchStartX = null;
    content.addEventListener(
      'touchstart',
      function (event) {
        touchStartX = event.touches[0].clientX;
      },
      { passive: true }
    );
    content.addEventListener(
      'touchend',
      function (event) {
        if (touchStartX === null) return;
        var deltaX = event.changedTouches[0].clientX - touchStartX;
        touchStartX = null;
        if (Math.abs(deltaX) < 40) return;
        go(content, deltaX < 0 ? 1 : -1);
      },
      { passive: true }
    );

    modal.addEventListener('keyup', function (event) {
      if (event.code === 'ArrowRight') go(content, 1);
      if (event.code === 'ArrowLeft') go(content, -1);
    });
  }

  return { bind: bind };
})();
