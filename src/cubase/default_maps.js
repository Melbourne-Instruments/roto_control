// default_maps.js
// Copyright (c) 2026 Melbourne Instruments. All Rights Reserved.
//
// This script is provided "as is", without any warranty of any kind, express or
// implied, including but not limited to the warranties of merchantability,
// fitness for a particular purpose, and noninfringement. In no event shall the
// authors or copyright holders be liable for any claim, damages, or other
// liability, whether in an action of contract, tort, or otherwise, arising from,
// out of, or in connection with the software or the use or other dealings in the
// software.

// Default control maps for Cubase's own plugins, for ROTO's PLUGIN mode. ROTO
// asks for one when the selected plugin has nothing mapped on any page (the
// map-empty byte of CONTROL_MAPPED_END); the driver resolves it and sends it
// with SET_DEFAULT_CTL. ROTO holds it in RAM only, so it updates with the
// script. LEARN starts from a blank plugin (the default is dropped; left
// with nothing learnt, the default comes back), and what's learnt is saved
// to ROTO and used from then on. CLEARing a control of the default saves the
// rest of it.
//
// Keyed by the text a plugin's ROTO hash is made from (plugins.js, hashKey):
// the VST3 class ID for plugins and the channel strip modules (the same on
// every track and instance), 'prefilter:InputFilter' for the pre-filter on a
// channel without the strip EQ.
//
// A control: { page: 0..7, knob: 0..7 } or { page, switch: 0..7 }, and the
// parameter's DirectAccess tag (as da_probe dumps it, "tag=4201"), which
// survives parameter reordering, and its haptics:
//   steps: n           0 = continuous, 2..24 = detents (a switch: its positions)
//   indent: true       a knob's centre detent (e.g. a gain at 0 dB)
// Without steps, the steps Cubase reports are used (some plugins report them
// wrongly, so give them). The haptics also hold for that parameter when it is
// learnt, or mapped from a saved map. Optional:
//   prefilter: true    the strip EQ's pre-filter parameter (its own tags)
//   name: '...'        ROTO's label, instead of the parameter's title
// and what ROTO's configurator can set on a control (defaults: as LEARN):
//   colour: c          the label's colour: a palette index (0..82, as the
//                      configurator's) or a name (COLOURS below)
//   min: 0..1, max: 0..1   the part of the parameter's range the control covers
//   indents: [p, p]    a continuous knob's own detents (up to 2), at 0..1 of
//                      its travel (not with steps or indent)
//   push: true         a momentary switch (on while held), not a toggle
//   ledOn: c, ledOff: c    a switch's LED colours (palette index or name)
// Step labels aren't set here: ROTO keeps them in a file, and Cubase's
// value strings show live.
//
// Most maps are made in roto_mapper (Development/roto_mapper) and generated
// into default_maps_data.js by its maps_to_js.py; a plugin here overrides its
// generated map. To make one by hand: learn the controls on ROTO, then leave
// LEARN with the script's verbose log on (roto_midi_mon). Each page ROTO loads
// logs a "DEFAULT MAP" line in this format, ready to paste here.

var data = require('./default_maps_data')

// Hand-made maps, which override the generated ones (a plugin's whole map):
//   '<hashKey>': [ { page: 0, knob: 0, tag: 4201, steps: 0 }, ... ],
const MAPS = {
    // Input Filter (pre-filter, on a channel without the strip EQ): the strip
    // EQ's pre-filter controls, where the EQ's map has them (its own tags here,
    // so no prefilter flag), and its Bypass where the EQ's is
    'prefilter:InputFilter': [
        { page: 0, knob: 0, tag: 4204, name: "LC Freq", steps: 0, colour: 28 },              // LC-Freq
        { page: 0, knob: 1, tag: 4210, name: "LC Slope", steps: 5, colour: 28 },             // LC-Slope
        { page: 0, knob: 2, tag: 4206, name: "HC Freq", steps: 0, colour: 28 },              // HC-Freq
        { page: 0, knob: 3, tag: 4211, name: "HC Slope", steps: 5, colour: 28 },             // HC-Slope
        { page: 0, switch: 0, tag: 4203, name: "LC On", steps: 2, ledOn: 6, colour: 28 },    // LC-On
        { page: 0, switch: 1, tag: 4205, name: "HC On", steps: 2, ledOn: 6, colour: 28 },    // HC-On
        { page: 0, switch: 2, tag: 4202, steps: 2, ledOn: 6, colour: 28 },                   // Phase
        { page: 0, switch: 7, tag: 4207, steps: 2, ledOn: 70, ledOff: 13, colour: 13 },      // Bypass
    ],
}

const PAGE_SIZE = 8

// ROTO's colour palette (labels and LEDs share it): 0..69 are Ableton's
// colours, then these
const COLOURS = {
    white: 13, black: 70, red: 71, green: 72, yellow: 73, blue: 74, magenta: 75, cyan: 76,
    maroon: 77, olive: 78, darkgreen: 79, teal: 80, navy: 81, purple: 82,
}
const NUM_COLOURS = 83
// What LEARN gives a control (firmware PLUGIN_PARAM_COLOUR_SCHEME,
// PLUGIN_CTL_DEFAULT_LED_COLOUR)
const DEFAULT_COLOUR = 64
const DEFAULT_LED_ON = COLOURS.white
const DEFAULT_LED_OFF = COLOURS.black
const KNOB_MAX = 16383          // 14-bit
const SWITCH_MAX = 127
const INDENT_MAX = 127          // ROTO's detent positions, 7-bit

// The plugin's default map (its controls), or null.
function lookup(hashKey) {
    return MAPS[hashKey] || data.MAPS[hashKey] || null
}

// The control's index in ROTO's plugin map: page * 8 + control.
function controlIndex(c) {
    return c.page * PAGE_SIZE + (c.knob !== undefined ? c.knob : c.switch)
}

function isKnob(c) {
    return c.knob !== undefined
}

function colourIndex(c, fallback) {
    if (c === undefined) return fallback
    const i = (typeof c === 'string') ? COLOURS[c.toLowerCase()] : c
    return (i === undefined || i < 0 || i >= NUM_COLOURS) ? fallback : Math.round(i)
}

function clamp01(v, fallback) {
    return (v === undefined) ? fallback : Math.max(0, Math.min(1, v))
}

// The configurator's settings of a control, filled in with LEARN's:
// { colour, min, max, indents: [0..127], push, ledOn, ledOff }
function details(c) {
    const top = isKnob(c) ? KNOB_MAX : SWITCH_MAX
    const indents = []
    if (isKnob(c) && c.indents && !c.steps && !c.indent) {
        for (var i=0; i<c.indents.length && i<2; i++) indents.push(Math.round(clamp01(c.indents[i], 0) * INDENT_MAX))
    }
    // (ROTO takes the range as given: not one that's empty or backwards)
    var min = Math.round(clamp01(c.min, 0) * top)
    var max = Math.round(clamp01(c.max, 1) * top)
    if (min >= max) {
        min = 0
        max = top
    }
    return {
        colour: colourIndex(c.colour, DEFAULT_COLOUR),
        min: min,
        max: max,
        indents: indents,
        push: !isKnob(c) && !!c.push,
        ledOn: colourIndex(c.ledOn, DEFAULT_LED_ON),
        ledOff: colourIndex(c.ledOff, DEFAULT_LED_OFF),
    }
}

// The haptics a plugin's map gives a parameter: { steps, indent } (steps
// undefined: Cubase's), or null if the map doesn't have it.
function haptics(hashKey, tag, prefilter) {
    const map = lookup(hashKey)
    if (!map) return null
    for (var i=0; i<map.length; i++) {
        const c = map[i]
        if (c.tag === tag && !!c.prefilter === !!prefilter) return { steps: c.steps, indent: !!c.indent }
    }
    return null
}

// One control as a line of a map above, for the dev log (steps: what the
// control has now; correct them by hand if Cubase reports them wrongly).
function format(page, isKnob, control, tag, prefilter, steps, indent, title) {
    return "{ page: " + page + ", " + (isKnob ? "knob" : "switch") + ": " + control + ", tag: " + tag +
           (prefilter ? ", prefilter: true" : "") + ", steps: " + steps + (indent ? ", indent: true" : "") + " },    // " + title
}

module.exports = { lookup, controlIndex, isKnob, haptics, details, format, MAPS, COLOURS, GENERATED: data.MAPS }
