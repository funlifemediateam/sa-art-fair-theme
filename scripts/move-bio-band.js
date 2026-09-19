#!/usr/bin/env node
/*
 * move-bio-band.js — put the "More about <Name>." band second on every person page.
 *
 * An artist or teacher page is built from a collection template whose first
 * section is `rb-person-hero`. The hero sets the person's first sentence in the
 * script face; `rb-script-statement` carries the rest of the bio. On the teacher
 * pages the band already follows the hero, but on the artist pages it was
 * appended after `rb-artworks`, so a visitor met the work before they met the
 * person. This moves the band up to sit directly under the hero everywhere.
 *
 * What it touches: the "order" array, and nothing else. Section settings, blocks
 * and every other key are rewritten byte-for-byte as they were read. Where a
 * template has a hero but no band at all (the base template new artists are cut
 * from), the band is inserted with the settings the live artist pages use.
 *
 * It is idempotent: a template whose band already follows the hero is skipped,
 * so a second run prints "already second" for everything and writes no files.
 *
 *   node scripts/move-bio-band.js            # apply
 *   node scripts/move-bio-band.js --dry-run  # report only
 */

'use strict';

const fs = require('fs');
const path = require('path');

const HERO = 'rb-person-hero';
const BAND = 'rb-script-statement';
const TEMPLATES = path.join(__dirname, '..', 'templates');
const DRY = process.argv.includes('--dry-run');

/* The band as the live artist pages carry it. Copied from
 * templates/collection.lauren-ratcliffe.json — sage panel, moss accent, the
 * wider-than-body script line. `heading` is the one per-page field: it names the
 * artist, so it is left to the caller.
 *
 * `use_collection_description` + `skip_first_sentence` are what keep the bio
 * from being printed twice — the hero has already said sentence one. A page
 * whose bio is a single sentence has no remainder, and rb-script-statement
 * stands the whole band down by itself. Neither flag is ever changed here. */
function artistBandSettings(heading) {
  return {
    heading: heading,
    body: '',
    use_collection_description: true,
    skip_first_sentence: true,
    background: '#e2ead7',
    heading_color: '#1e1e1e',
    accent_color: '#505a43',
    body_color: '#1e1e1e',
    heading_width: 700,
    body_width: 640,
    padding_top: 140,
    padding_bottom: 160
  };
}

/* Templates that carry a hero but no band. Adding one is a content change, not
 * a reordering, so each is named deliberately rather than swept up by a glob.
 *
 * `collection.artist.json` is the blueprint: the booking app reads it from the
 * live theme and copies it verbatim for every new artist collection
 * (TEMPLATE_BLUEPRINTS.artist in netlify/functions/api.js), which is why a new
 * artist page has never had a bio band. Its heading stays blank — the app does
 * no substitution, so any name written here would be printed on every artist
 * created from then on. rb-script-statement omits the script line when the
 * heading is blank and still prints the bio, so a new page is correct if plain
 * until someone types the name in.
 *
 * Natali Downing is the one live page already cut from that blank blueprint.
 * Her bio is a single sentence today, so the band stands down and her page
 * renders exactly as it does now; this is only so her bio does not silently
 * lose its tail the day it gains a second sentence. */
const ADD_BAND = {
  'collection.artist.json': '',
  'collection.natali-downing.json': '<p>More about <em>Natali<\/em>.<\/p>'
};

/* Shopify writes an auto-generated banner above the JSON in these files and the
 * repo keeps it. Split it off, edit the JSON, put it back. */
function splitHeader(raw) {
  const start = raw.indexOf('{');
  return { header: raw.slice(0, start), json: raw.slice(start) };
}

/* Re-serialise with the same shape Shopify writes: two-space indent, and every
 * "/" escaped as "\/" the way its own encoder does. Escaping is optional in
 * JSON and changes no value, but matching Shopify byte for byte keeps the diff
 * on these files down to the one line that actually moved. A bare "/" only ever
 * occurs inside a string here — JSON structure has none — so the replace cannot
 * reach anything but string contents. */
function serialise(doc) {
  return JSON.stringify(doc, null, 2).replace(/\//g, '\\/');
}

function keysOfType(doc, type) {
  return doc.order.filter(function (k) {
    return doc.sections[k] && doc.sections[k].type === type;
  });
}

function uniqueKey(doc, base) {
  if (!doc.sections[base]) return base;
  let n = 2;
  while (doc.sections[base + '_' + n]) n++;
  return base + '_' + n;
}

const report = { moved: [], added: [], skipped: [], untouched: [] };

fs.readdirSync(TEMPLATES)
  .filter(function (f) { return /^collection\..+\.json$/.test(f) || f === 'collection.json'; })
  .sort()
  .forEach(function (file) {
    const full = path.join(TEMPLATES, file);
    const raw = fs.readFileSync(full, 'utf8');
    const parts = splitHeader(raw);

    let doc;
    try { doc = JSON.parse(parts.json); }
    catch (e) { console.log('  ! ' + file + ' — unparseable, left alone (' + e.message + ')'); return; }
    if (!doc.order || !doc.sections) return;

    const heroKeys = keysOfType(doc, HERO);
    if (!heroKeys.length) { report.untouched.push(file); return; }

    const heroKey = heroKeys[0];
    const heroIdx = doc.order.indexOf(heroKey);
    const before = doc.order.slice();
    let bandKey = keysOfType(doc, BAND)[0];
    let action;

    if (!bandKey) {
      if (!(file in ADD_BAND)) { report.untouched.push(file); return; }
      bandKey = uniqueKey(doc, 'about');
      doc.sections[bandKey] = { type: BAND, settings: artistBandSettings(ADD_BAND[file]) };
      doc.order.splice(heroIdx + 1, 0, bandKey);
      action = 'added';
    } else {
      if (doc.order.indexOf(bandKey) === heroIdx + 1) {
        report.skipped.push(file);
        console.log('  = ' + file + ' — band already second, skipped');
        return;
      }
      doc.order.splice(doc.order.indexOf(bandKey), 1);
      doc.order.splice(doc.order.indexOf(heroKey) + 1, 0, bandKey);
      action = 'moved';
    }

    const typesOf = function (order) {
      return order.map(function (k) { return doc.sections[k] ? doc.sections[k].type : '?'; });
    };
    console.log('  ' + (action === 'added' ? '+' : '>') + ' ' + file);
    console.log('      before: ' + before.join(', ') + '   [' + typesOf(before).join(' | ') + ']');
    console.log('      after : ' + doc.order.join(', ') + '   [' + typesOf(doc.order).join(' | ') + ']');

    if (!DRY) fs.writeFileSync(full, parts.header + serialise(doc) + '\n');
    report[action === 'added' ? 'added' : 'moved'].push(file);
  });

console.log('\n' + (DRY ? '[dry run] ' : '') +
  report.moved.length + ' reordered, ' +
  report.added.length + ' band added, ' +
  report.skipped.length + ' already second, ' +
  report.untouched.length + ' not a person page.');
