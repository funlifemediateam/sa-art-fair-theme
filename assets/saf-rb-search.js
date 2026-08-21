/* Rebrand search toolbar — progressive enhancement only.
 *
 * The toolbar in sections/rb-search.liquid is a plain GET form: every filter
 * and the sort select are real inputs, and the Apply button submits them. That
 * is the whole feature with JavaScript off.
 *
 * All this file does is make it behave the way Dawn's facets did — apply on
 * change — and hide the Apply button once it can, so the button is never a
 * dead control sitting next to controls that already applied themselves.
 *
 * Empty inputs are stripped before submit so the URL does not collect a tail
 * of blank params, and re-binds on shopify:section:load for the theme editor.
 */
(function () {
  'use strict';

  function bind(form) {
    if (!form || form.dataset.rbsBound === '1') return;
    form.dataset.rbsBound = '1';

    /* NOT the hidden attribute: .rb-btn sets display:inline-flex, which beats
       the UA's [hidden]{display:none} and leaves the button on screen. */
    var apply = form.querySelector('[data-rbs-apply]');
    if (apply) apply.style.display = 'none';

    var submitting = false;
    function submit() {
      if (submitting) return;
      submitting = true;
      /* a name-less input is never serialised, which is how blank price
         fields are kept out of the query string */
      form.querySelectorAll('input[type="number"], input[type="search"]').forEach(function (el) {
        if (el.value === '' && el.name) {
          el.dataset.rbsName = el.name;
          el.removeAttribute('name');
        }
      });
      form.submit();
    }

    form.addEventListener('change', function (e) {
      if (e.target.closest('[data-rbs-apply]')) return;
      submit();
    });

    /* number fields fire change on blur, which is too late to feel connected;
       Enter should apply straight away */
    form.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.matches('input[type="number"]')) {
        e.preventDefault();
        submit();
      }
    });
  }

  function init(root) {
    (root || document).querySelectorAll('[data-rbs-form]').forEach(bind);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { init(document); });
  } else {
    init(document);
  }

  document.addEventListener('shopify:section:load', function (e) { init(e.target); });
})();
