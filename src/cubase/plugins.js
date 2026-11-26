// plugins.js
// Copyright (c) 2026 Melbourne Instruments. All Rights Reserved.
//
// This script is provided "as is", without any warranty of any kind, express or
// implied, including but not limited to the warranties of merchantability,
// fitness for a particular purpose, and noninfringement. In no event shall the
// authors or copyright holders be liable for any claim, damages, or other
// liability, whether in an action of contract, tort, or otherwise, arising from,
// out of, or in connection with the software or the use or other dealings in the
// software.

// The selected track's plugins for ROTO's PLUGIN mode, read through Cubase's
// DirectAccess API (page.mHostAccess.makeDirectAccess on the selected track's
// channel). The object tree, as seen in captures (da_probe.js):
//
//   channel (type "AudioChannel" / "Synth" / ...)
//     "InputFilter" -> the channel's pre-filter (PreGain, Phase, Bypass,
//                   LC/HC On, Freq, Slope); listed as itself, its own slot
//     "Strips"   -> 6 "Slot"s -> a module (type "EQ", "Comp", ...)
//     "Slot"     -> the instrument (instrument tracks only)
//     "Inserts"  -> 16 "Slot"s -> a plugin (type "")
//     (Sends, Foldbacks, DirectRouting, Panner, ... are skipped)
//
// A plugin object's unique name is "<32-hex VST3 class ID>-<n>"; the class ID
// is the same for every instance of a plugin, so ROTO's per-plugin mappings
// (stored on ROTO by hash) are shared by all its instances.

const HASH_SIZE = 8

// One plugin of the list, in ROTO's order: the pre-filter (first in the signal
// chain; part of the strip EQ when there is one), then the channel strip
// modules (the most useful), then the instrument, then the inserts.
//   { objectID, slotID, name, hash: [8 x 7-bit], hashKey, enabled, kind, type, extraID }
// (hashKey: the text the hash is made from; default_maps.js is keyed by it)
// Channel strip modules are listed whenever their slot holds one, bypassed or
// deactivated too (shown off: enabled false); an empty slot (no module loaded,
// as Cubase 15's strip has: capture cubase_inst_load) isn't (user request
// 2026-11-13; from 2026-10-28 they were only listed while on). The list's
// stripSlots holds every strip slot (empty ones too), so a module put in one
// in Cubase can be noticed, and stripKey what each held then
// (stripSignature): Cubase doesn't always report a module switched on or put
// in a slot (capture 2026-11-12).
function scan(da, mapping) {
    const list = []
    const base = da.getBaseObjectID(mapping)
    if (base === undefined || base < 0) return list

    const sections = { prefilter: [], strips: [], instrument: [], inserts: [] }
    const stripSlots = []
    const n = da.getNumberOfChildObjects(mapping, base)
    for (var c=0; c<n; c++) {
        const child = da.getChildObjectID(mapping, base, c)
        const type = da.getObjectTypeName(mapping, child)
        if (type === 'Strips') {
            collectSlots(da, mapping, child, 'strip', sections.strips)
            const ns = da.getNumberOfChildObjects(mapping, child)
            for (var s=0; s<ns; s++) stripSlots.push(da.getChildObjectID(mapping, child, s))
        }
        else if (type === 'Inserts') {
            collectSlots(da, mapping, child, 'insert', sections.inserts)
        }
        else if (type === 'Slot') {
            // The instrument slot hangs straight off the channel
            addSlotPlugin(da, mapping, child, 'instrument', sections.instrument, -1)
        }
        else if (type === 'InputFilter') {
            // Not in a slot: it is its own slot (its Bypass is ON/OFF). The
            // same hash on every track, so ROTO shares its mappings.
            sections.prefilter.push({
                objectID: child,
                slotID: child,
                name: da.getObjectTitle(mapping, child),
                hash: pluginHash('prefilter:InputFilter'),
                hashKey: 'prefilter:InputFilter',
                enabled: slotEnabled(da, mapping, child),
                kind: 'prefilter',
                type: 'InputFilter',
                extraID: -1,
                slotIndex: -1,
            })
        }
    }
    // With the channel strip EQ (loaded, on or not), the pre-filter is part of
    // it: its parameters follow the EQ's (they appear together in Cubase's EQ
    // window), and it isn't listed itself (user request, 2026-10-22).
    if (sections.prefilter.length > 0) {
        for (var i=0; i<sections.strips.length; i++) {
            if (sections.strips[i].type === 'EQ') {
                sections.strips[i].extraID = sections.prefilter[0].objectID
                sections.prefilter = []
                break
            }
        }
    }
    const result = list.concat(sections.prefilter, sections.strips, sections.instrument, sections.inserts)
    result.stripSlots = stripSlots
    result.stripKey = stripSignature(da, mapping, stripSlots)
    return result
}

// What each strip slot holds: its module's object ID (-1 empty) and whether
// it's on, e.g. "3201:1,-1:0,...". Any DirectAccess will do (IDs are global).
function stripSignature(da, mapping, slots) {
    const parts = []
    for (var i=0; i<slots.length; i++) {
        const slot = slots[i]
        const held = (da.getNumberOfChildObjects(mapping, slot) > 0) ? da.getChildObjectID(mapping, slot, 0) : -1
        parts.push(held + ':' + (slotEnabled(da, mapping, slot) ? 1 : 0))
    }
    return parts.join(',')
}

function collectSlots(da, mapping, folder, kind, out) {
    const n = da.getNumberOfChildObjects(mapping, folder)
    for (var s=0; s<n; s++) {
        addSlotPlugin(da, mapping, da.getChildObjectID(mapping, folder, s), kind, out, s)
    }
}

// The slot's plugin, if it has one (empty slots have no children).
function addSlotPlugin(da, mapping, slot, kind, out, slotIndex) {
    if (da.getNumberOfChildObjects(mapping, slot) < 1) return
    const plugin = da.getChildObjectID(mapping, slot, 0)
    const name = da.getObjectTitle(mapping, plugin)
    const uname = da.getObjectUniqueName(mapping, plugin)
    const hashKey = classID(uname) || (kind + ':' + da.getObjectTypeName(mapping, plugin) + ':' + name)
    out.push({
        objectID: plugin,
        slotID: slot,
        name: name,
        hash: pluginHash(hashKey),
        hashKey: hashKey,
        enabled: slotEnabled(da, mapping, slot),
        kind: kind,
        type: da.getObjectTypeName(mapping, plugin),
        extraID: -1,            // a second object whose parameters follow (the strip EQ's pre-filter)
        slotIndex: slotIndex,   // in its folder (insert 0..15, strip 0..5); -1 for the instrument
    })
}

// "946051208E29496E804F64A825C8A047-0" -> "946051208E29496E804F64A825C8A047"
function classID(uname) {
    const m = /^([0-9A-Fa-f]{32})-\d+$/.exec(uname || '')
    return m ? m[1].toUpperCase() : ''
}

// On and not bypassed. Slots without those parameters (the instrument slot)
// count as enabled. (One pass over the parameters, not two slotParamTag calls.)
function slotEnabled(da, mapping, slot) {
    var on = true
    var bypass = false
    const n = da.getNumberOfParameters(mapping, slot)
    for (var p=0; p<n; p++) {
        const tag = da.getParameterTagByIndex(mapping, slot, p)
        const title = da.getParameterTitle(mapping, slot, tag, 32)
        if (title === 'On') on = da.getParameterProcessValue(mapping, slot, tag) > 0.5
        else if (title === 'Bypass') bypass = da.getParameterProcessValue(mapping, slot, tag) > 0.5
    }
    return on && !bypass
}

// 8 x 7-bit bytes (SysEx data). Two 32-bit FNV-1a passes with different
// seeds; FNV's multiply is done with shifts (no Math.imul in ES5).
function pluginHash(text) {
    const bytes = []
    const seeds = [0x811C9DC5, 0x050C5D1F]
    for (var k=0; k<seeds.length; k++) {
        var h = seeds[k]
        for (var i=0; i<text.length; i++) {
            h = (h ^ text.charCodeAt(i)) >>> 0
            h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0
        }
        for (var b=0; b<4; b++) {
            bytes.push((h >>> (b * 7)) & 0x7F)
        }
    }
    // An all-zero hash reads as "no plugin" on ROTO
    if (bytes.every(function(v) { return v === 0 })) bytes[0] = 1
    return bytes.slice(0, HASH_SIZE)
}

// What ROTO's list shows, for "has it changed?"
function listKey(list) {
    return list.map(function(p) {
        return p.objectID + ':' + p.name + ':' + p.hash.join('.') + ':' + (p.enabled ? 1 : 0)
    }).join('|')
}

// Which plugins are listed, ignoring their on/off state: ROTO needs a re-select
// (to reload mappings) only when this changes.
function identityKey(list) {
    return list.map(function(p) { return p.objectID + '+' + p.extraID + ':' + p.hash.join('.') }).join('|')
}

// The tag of a slot parameter by title ("On", "Bypass"); -1 if it has none.
function slotParamTag(da, mapping, slot, title) {
    const n = da.getNumberOfParameters(mapping, slot)
    for (var p=0; p<n; p++) {
        const tag = da.getParameterTagByIndex(mapping, slot, p)
        if (da.getParameterTitle(mapping, slot, tag, 32) === title) return tag
    }
    return -1
}

// Switch a listed plugin on (slot On, not bypassed) or off (bypassed), as
// ROTO's plugin ON/OFF screen asks. Returns false for a slot without a Bypass
// parameter (the instrument slot).
function setEnabled(da, mapping, plugin, enable) {
    const bypassTag = slotParamTag(da, mapping, plugin.slotID, 'Bypass')
    if (bypassTag < 0) return false
    if (enable) {
        const onTag = slotParamTag(da, mapping, plugin.slotID, 'On')
        if (onTag >= 0 && da.getParameterProcessValue(mapping, plugin.slotID, onTag) < 0.5) {
            da.setParameterProcessValue(mapping, plugin.slotID, onTag, 1)
        }
        da.setParameterProcessValue(mapping, plugin.slotID, bypassTag, 0)
    }
    else {
        da.setParameterProcessValue(mapping, plugin.slotID, bypassTag, 1)
    }
    return true
}

// A slot's plugin window, through the slot's "Edit" parameter (inserts and
// strip modules; "On" while the window is open, seen in captures). Returns
// -1 for a slot without one (the instrument slot, the pre-filter), 0 if the
// window was already open, 1 if it was opened. raise: a window already open
// is closed and opened again, to bring it to the front.
function openEditor(da, mapping, slot, raise) {
    const tag = slotParamTag(da, mapping, slot, 'Edit')
    if (tag < 0) return -1
    const open = da.getParameterProcessValue(mapping, slot, tag) > 0.5
    if (open && !raise) return 0
    if (open) da.setParameterProcessValue(mapping, slot, tag, 0)
    da.setParameterProcessValue(mapping, slot, tag, 1)
    return open ? 0 : 1
}

function closeEditor(da, mapping, slot) {
    const tag = slotParamTag(da, mapping, slot, 'Edit')
    if (tag >= 0 && da.getParameterProcessValue(mapping, slot, tag) > 0.5) {
        da.setParameterProcessValue(mapping, slot, tag, 0)
    }
}

//-----------------------------------------------------------------------------
// Parameters, for LEARN and mapped controls. ROTO stores a mapped parameter
// as <index, 6-byte hash>. The hash here is the parameter's tag (its
// DirectAccess ID, up to 32 bits, e.g. 1835236713 for Surge XT), carried
// exactly in 6 x 7 bits, so a mapping survives parameter reordering; the
// index is the fallback.
//-----------------------------------------------------------------------------
const PARAM_HASH_SIZE = 6
const MAX_STEPS = 24            // ROTO's stepped knob haptics; more -> continuous

function paramHash(tag) {
    const bytes = []
    for (var k=0; k<PARAM_HASH_SIZE; k++) {
        bytes.push(Math.floor(tag / Math.pow(128, k)) % 128)
    }
    return bytes
}

function tagFromHash(hash) {
    var tag = 0
    for (var k=0; k<PARAM_HASH_SIZE; k++) tag += (hash[k] & 0x7f) * Math.pow(128, k)
    return tag
}

// tag -> index for one plugin, built on first use and kept until another
// plugin is asked about (Surge XT has 2855 parameters).
var indexCache = {}                 // objectID -> { byTag, tags }; a few at a time
var indexCacheSize = 0

function parameterTags(da, mapping, objectID) {
    if (indexCache[objectID] === undefined) {
        if (indexCacheSize >= 4) {
            indexCache = {}
            indexCacheSize = 0
        }
        const byTag = {}
        const tags = []
        const n = da.getNumberOfParameters(mapping, objectID)
        for (var i=0; i<n; i++) {
            const tag = da.getParameterTagByIndex(mapping, objectID, i)
            tags.push(tag)
            if (byTag[tag] === undefined) byTag[tag] = i
        }
        indexCache[objectID] = { byTag: byTag, tags: tags }
        indexCacheSize++
    }
    return indexCache[objectID]
}

// A plugin with a second object (extraID >= 0: the strip EQ's pre-filter) has
// one parameter space: the main object's parameters, then the extra's. The
// two objects' tags overlap (4204 is the EQ's "Bypass" and the pre-filter's
// "LC-Freq"), so an extra tag goes into the hash with EXTRA_TAG_OFFSET added
// (6 x 7 bits hold 42 bits).
const EXTRA_TAG_OFFSET = 4294967296     // 2^32

function hashFor(tag, isExtra) {
    return paramHash(isExtra ? tag + EXTRA_TAG_OFFSET : tag)
}

// ROTO's <index, hash> -> { objectID, tag } in the plugin (main, extra): by
// the tag in the hash if the right object has it, else by index; null if
// neither.
function resolveParamIn(da, mapping, mainID, extraID, index, hash) {
    const main = parameterTags(da, mapping, mainID)
    const extra = (extraID >= 0) ? parameterTags(da, mapping, extraID) : null
    const t = tagFromHash(hash)
    if (t >= EXTRA_TAG_OFFSET) {
        if (extra && extra.byTag[t - EXTRA_TAG_OFFSET] !== undefined) return { objectID: extraID, tag: t - EXTRA_TAG_OFFSET }
    }
    else if (main.byTag[t] !== undefined) {
        return { objectID: mainID, tag: t }
    }
    if (index < main.tags.length) return { objectID: mainID, tag: main.tags[index] }
    if (extra && index - main.tags.length < extra.tags.length) return { objectID: extraID, tag: extra.tags[index - main.tags.length] }
    return null
}

// The parameter's index in the plugin's space (main, extra); -1 if not there.
function indexIn(da, mapping, mainID, extraID, objectID, tag) {
    const main = parameterTags(da, mapping, mainID)
    if (objectID === mainID) {
        return (main.byTag[tag] === undefined) ? -1 : main.byTag[tag]
    }
    if (extraID >= 0 && objectID === extraID) {
        const i = parameterTags(da, mapping, extraID).byTag[tag]
        return (i === undefined) ? -1 : main.tags.length + i
    }
    return -1
}

// ROTO's <index, hash> -> the parameter's tag in this plugin: by the tag in
// the hash if the plugin has it, else by index; -1 if neither.
function resolveParam(da, mapping, objectID, index, hash) {
    const cache = parameterTags(da, mapping, objectID)
    const tag = tagFromHash(hash)
    if (cache.byTag[tag] !== undefined) return tag
    if (index < cache.tags.length) return cache.tags[index]
    return -1
}

function indexOfTag(da, mapping, objectID, tag) {
    const i = parameterTags(da, mapping, objectID).byTag[tag]
    return (i === undefined) ? -1 : i
}

// Everything LEARN_PARAM needs, plus the value string. trustBinary: the
// plugin reports its ranges correctly (Cubase's own modules), so a 0..1
// discrete range is 2 steps (e.g. the EQ's band 2 Type).
function paramInfo(da, mapping, objectID, tag, trustBinary) {
    const type = da.getParameterProcessValueType(mapping, objectID, tag)
    var steps = 0
    var binary = false
    if (type === 'discrete') {
        // (PROPOSED API: a VST3 step count from DirectAccess would replace
        // this guess; see the driver's note above quickCtrlHaptics)
        // Plain range = steps - 1. A 0..1 range isn't trusted in general:
        // Waves' stepped knobs report it (capture: API-550A "High Freq" moves
        // in quarters), so 2-step parameters stay continuous on a knob.
        const lo = da.convertParameterProcessValueToPlain(mapping, objectID, tag, 0)
        const hi = da.convertParameterProcessValueToPlain(mapping, objectID, tag, 1)
        const n = Math.round(hi - lo) + 1
        if ((n >= 3 || (n === 2 && trustBinary)) && n <= MAX_STEPS) steps = n
        binary = (n === 2)
    }
    const units = da.getParameterDisplayUnits(mapping, objectID, tag)
    const display = da.getParameterDisplayValue(mapping, objectID, tag)
    return {
        name: da.getParameterTitle(mapping, objectID, tag, 32),
        automatable: da.isParameterAutomatable(mapping, objectID, tag),
        steps: steps,
        // A 0..1 discrete range: 2 positions, or more (Waves) that only the
        // values it takes can tell (see the driver's seenSteps)
        binary: binary,
        value: da.getParameterProcessValue(mapping, objectID, tag),
        display: valueString(display, units),
    }
}

// A value string with its units, only for a plain number. Cubase's own
// plugins (roto_mapper's dumps of all of them, 2026-11-10) put the units in
// the value too ("88.7Hz", "1.50 kHz" + "Hz", "12 dB/Oct" + "dB", "-22.0
// LUFS" + "dB"), give a word for some values of a numeric parameter ("Off" /
// "LP" + "%", "x 1" + "%"), and mark switches with an on/off range as the
// units, whatever the value ("On" + "On/Off", capture 2026-10-29; "Off" +
// "OnOff", DeEsser's Side-Chain, capture 2026-11-10; "0" / "Prog." +
// "On/Off"). So a value that ends with its units ("50 %"), has a letter in
// it ("-oo" is a number) or is a note length ("1 / 8", as "1 / 8 D") is shown
// as it is, and on/off units never.
function valueString(display, units) {
    display = display || ''
    if (!units || display.trim() === '') return display
    const d = display.replace(/\s+/g, '').toLowerCase()
    const u = units.replace(/\s+/g, '').toLowerCase()
    if (d.length >= u.length && d.slice(d.length - u.length) === u) return display
    if (/[a-z]/i.test(display) && !/^\s*[+-]?(oo|inf)\s*$/i.test(display)) return display
    if (display.indexOf('/') >= 0) return display
    if (/^\s*(on|off)([\s\/,|]*(on|off))*\s*$/i.test(units)) return display
    return display + (units.charAt(0) === ':' ? '' : ' ') + units
}

// A proxy parameter that isn't worth mapping, as Nektar's Cubase script
// filters them (Panorama CS12, ControlCore 1.1.67, VST3ParamFilter): MIDI CC
// and MPE proxies by title ("MIDI CC 0|0", "CC 7 Chan 1", "CC 1, Ch 2"), and
// HALion's tags 945..3024. Some are marked automatable, so the automatable
// check doesn't catch them. The loose "cc"/"chan" match is Nektar's too.
function fakeParam(pluginName, tag, title) {
    const label = String(title).toLowerCase()
    const digit = /\d/.test(label)
    if (label.indexOf('midi cc') >= 0 || label.indexOf('mpe_') >= 0) return true
    if (digit && label.indexOf('cc') >= 0 && label.indexOf('chan') >= 0) return true
    if (digit && label.indexOf('cc') >= 0 && label.indexOf('ch') >= 0 && label.indexOf(',') >= 0) return true
    if (pluginName && String(pluginName).indexOf('HALion') >= 0 && tag >= 945 && tag < 3025) return true
    return false
}

module.exports = {
    scan, stripSignature, pluginHash, classID, listKey, identityKey, setEnabled, openEditor, closeEditor,
    paramHash, tagFromHash, resolveParam, indexOfTag, paramInfo, fakeParam,
    hashFor, resolveParamIn, indexIn, valueString,
    HASH_SIZE, PARAM_HASH_SIZE, MAX_STEPS,
}
