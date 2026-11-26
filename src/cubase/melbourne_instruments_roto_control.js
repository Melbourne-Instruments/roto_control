// melbourne_instruments_roto_control.js
// Copyright (c) 2026 Melbourne Instruments. All Rights Reserved.
//
// This script is provided "as is", without any warranty of any kind, express or
// implied, including but not limited to the warranties of merchantability,
// fitness for a particular purpose, and noninfringement. In no event shall the
// authors or copyright holders be liable for any claim, damages, or other
// liability, whether in an action of contract, tort, or otherwise, arising from,
// out of, or in connection with the software or the use or other dealings in the
// software.

var midi = require('./midi')
var utils = require('./utils')
// DEV ONLY: log Cubase's DirectAccess object tree and parameter changes in
// PLUGIN mode (da_probe.js). Leave false for release.
const PROBE_DIRECT_ACCESS = false
var daProbe = (PROBE_DIRECT_ACCESS && !utils.RELEASE) ? require('./da_probe') : null
// DEV ONLY: probe folder tracks and channel visibility in MIX, and try the
// folding key commands on ROTO's TOGGLE_TRACK_GROUPING (folder_probe.js).
// Leave false for release.
const PROBE_FOLDERS = false
var folderProbe = (PROBE_FOLDERS && !utils.RELEASE) ? require('./folder_probe') : null
var folderToggle = null             // { id, name }: trigger once that track is selected
// DEV ONLY: log what Cubase reports when plugin windows get focus (Focus
// Quick Controls, focus-following insert viewers, instrument windows), for
// focus follow in PLUGIN and QUICK CTRL (focus_probe.js). Leave false for
// release.
const PROBE_FOCUS = false
var focusProbe = (PROBE_FOCUS && !utils.RELEASE) ? require('./focus_probe') : null
// DEV ONLY: log the selected channel's Volume parameter (DirectAccess range,
// default, plain values) and the fader's value/dB pairs, to find whether the
// project's Max. Volume (+6/+12 dB) can be told (volume_probe.js). Leave
// false for release.
const PROBE_VOLUME = false
var volumeProbe = (PROBE_VOLUME && !utils.RELEASE) ? require('./volume_probe') : null
// DEV ONLY: log how many send slots Cubase's API gives the selected channel
// (mSends.getSize(), slots 1..16 bound to sinks, DirectAccess send
// parameters), for Cubase 16's 16 sends (send_probe.js). Leave false for
// release.
const PROBE_SENDS = false
var sendProbe = (PROBE_SENDS && !utils.RELEASE) ? require('./send_probe') : null
// DEV ONLY: log the Control Room's monitor and cue selectors, and run one
// test write per ROTO TRANSPORT entry, for TRANSPORT buttons that cycle the
// cue mix and the monitor set (cr_probe.js). Leave false for release.
const PROBE_CONTROL_ROOM = false
var crProbe = (PROBE_CONTROL_ROOM && !utils.RELEASE) ? require('./cr_probe') : null
// DEV ONLY: when the Focus Quick Controls show a plugin of ROTO's list, log
// their titles and the plugin's DirectAccess titles at several lengths
// ("QCPROBE" lines, once per plugin), to find how they match (2026-11-05:
// "1 Threshold" vs "Threshold1", "AutoRelease" vs "Auto Release"), for the
// Quick Controls' haptics. Leave false for release.
const PROBE_QC_TITLES = false
const QC_PROBE_TITLE_LENGTHS = [8, 12, 16, 32, 128]
var qcTitleProbed = {}
// DEV ONLY: on the first QUICK CTRL entry, open every insert plugin's window
// in turn and log its Focus Quick Control titles (qc_dump.js), for
// roto_mapper's haptics database. For the reference project. Leave false.
const DUMP_QC_TITLES = false
var qcDump = (DUMP_QC_TITLES && !utils.RELEASE) ? require('./qc_dump') : null
// DEV ONLY: on the first PLUGIN entry, dump every plugin in the mixer with
// all its parameters to the MIDI log, for roto_mapper (param_dump.js). For
// the reference project. Leave false for release.
const DUMP_PLUGIN_PARAMS = false
var paramDump = (DUMP_PLUGIN_PARAMS && !utils.RELEASE) ? require('./param_dump') : null
// DEV ONLY: Cubase 16.0.10+'s HostValue.getReferencedParameter: the
// parameter behind each Focus Quick Control, track Quick Control and the
// value under the mouse, described through DirectAccess ("QP" lines,
// qc_probe.js), for haptics without the database. Leave false for release.
const PROBE_QC_REFS = false
var qcProbe = (PROBE_QC_REFS && !utils.RELEASE) ? require('./qc_probe') : null
// Edit-lock PLUGIN parameters during ROTO's gestures (see pluginKnobTouch).
// Off while checking whether it makes written automation steppier
// (2026-10-22); it didn't fix what it was added for.
const EDIT_LOCK_GESTURES = true
// PLUGIN knobs read ROTO's CCs from their own input-only variables instead of
// the knob, which is bound to a dummy host value there: Cubase only reported
// the bound knob's value about once per idle tick (~100 ms), so a slow turn
// gave 7 writes for 124 CCs (capture 2026-10-22 13:44). If MIX knobs stop
// responding with this on, Cubase gives a CC to one binding only: turn it off.
const PLUGIN_KNOB_INPUT_VARS = true
// Likewise for PLUGIN's switches: Cubase pushed the button's dummy value (0)
// back into it, which was taken as a press and switched EQ bands off ~1-5 s
// after they were pressed on (capture 2026-10-22 15:26).
const PLUGIN_BUTTON_INPUT_VARS = true
var plugins = require('./plugins')
var defaultMaps = require('./default_maps')
// QUICK CTRL's knob haptics for Cubase's own plugins, by plugin name and Quick
// Control title (generated by roto_mapper's haptics_to_js.py)
var pluginHaptics = require('./plugin_haptics_data')
const QC_HAPTICS_CONTINUOUS = [1, 0, 255, 255]   // [mode, steps, indent 1, indent 2]
const QC_HAPTICS_STEPS_MODE = 4                    // N steps with end stops
// QUICK CTRL's haptics from plugin_haptics_data.js, by title. Off while
// validating the steps read from the parameter itself (2026-11-10:
// getReferencedParameter -> DirectAccess -> SET_QC_KNOB_HAPTICS, see
// quickCtrlHaptics). Without it, Cubase 15 (no getReferencedParameter) is
// continuous everywhere, and the database's centre detents are gone.
const QC_HAPTICS_DATABASE = false
// The AI knob's haptics for the mixer (see aiKnobHaptics): a fader, the 0 dB
// indent of the MIX knobs (HapticMode KNOB_300_DEG_VOL_0DB_INDENT_CUBASE, 13);
// a panner, the centre detent (KNOB_300_DEG_TOP_INDENT, 2)
const AI_HAPTICS_FADER = [13, 0, 255, 255]
const AI_HAPTICS_CENTRE = [2, 0, 255, 255]
const AI_PAN_TITLES = ['Pan Left-Right', 'Pan Front-Rear']
var quickCtrlHapticsShown = []      // per knob: what ROTO has, "mode,steps,i1,i2"

//-----------------------------------------------------------------------------
// 1. Constants
//-----------------------------------------------------------------------------

// Active mode
const ACTIVE_MODE_NONE = 0x00
const ACTIVE_MODE_MIX = 0x01
const ACTIVE_MODE_PLUGIN = 0x02

// PLUGIN mode (the SET_PLUGIN_MODE payload). QUICK CTRL is the MODE menu's
// 4th entry: the knobs control the selected track's Quick Controls.
const PLUGIN_MODE_NORMAL = 0x00
const PLUGIN_MODE_QUICK_CTRL = 0x01
// Added to SET_PLUGIN_MODE's payload by the Cubase firmware (2026-11-05) for
// the LEFT+RIGHT PLUGIN <-> QUICK CTRL toggle, where ROTO keeps its plugin
// (both ways), and while QUICK CTRL entered that way shows (its re-sends after
// TRANSPORT). Only the firmware knows: a mode picked from the MODE menu (ROTO
// reset its plugin) looked the same, and was taken for the toggle (capture
// 2026-11-05 15:42: PLUGIN's list, strip modules named "QUICK CTRL", on the
// MODE menu's QUICK CTRL picker).
const PLUGIN_MODE_TOGGLED = 0x02
// Firmware colour schemes for the QUICK CTRL labels: PLUGIN_MACRO_PARAM (as
// Logic's SMART labels), and black for an unassigned Quick Control.
const QUICK_CTRL_COLOUR_SCHEME = 21
const QUICK_CTRL_UNASSIGNED_COLOUR_SCHEME = 70

// MIX mode
const MIX_MODE_ALL_TRACKS = 0x00
const MIX_MODE_TRACK_FOCUS = 0x01

// MIX knob mode
const MIX_KNOB_MODE_VOLUME = 0x00
const MIX_KNOB_MODE_PAN = 0x01
const MIX_KNOB_MODE_SEND = 0x02

// MIX button mode
const MIX_BUTTON_MODE_MUTE = 0x00
const MIX_BUTTON_MODE_SOLO = 0x01
const MIX_BUTTON_MODE_REC_ENABLE = 0x02
const MIX_BUTTON_MODE_INPUT_MON = 0x03
const MIX_BUTTON_MODE_LISTEN = 0x04     // (Cubase firmware only, 2026-11-12: see pollListen)

// General
const NUM_CONTROL_PAIRS = 8
const DEFAULT_MIDI_CHANNEL = 15
// Knobs are 14-bit CCs: MSB on 12+i, LSB on 44+i (firmware CC_14BIT mode).
const PLUGIN_MIX_MODE_KNOB_CC_BASE = 12
const KNOB_14BIT_MAX = 16383
const PLUGIN_MIX_MODE_BUTTON_CC_BASE = 12 + NUM_CONTROL_PAIRS
const TRANSPORT_BUTTON_CC_BASE = PLUGIN_MIX_MODE_BUTTON_CC_BASE + NUM_CONTROL_PAIRS
// Transport buttons 1..8 are PLAY, STOP, RECORD, CYCLE, CUE MIX, MONITOR,
// METRONOME, LOCK (matching the firmware's Cubase transport screen). 5 and 6
// cycle the Control Room's source and monitor set (user request 2026-11-17,
// see makeControlRoomButtons), and METRONOME moved from 5 to 7 for them; 6..7
// were READ, WRITE until 2026-10-28; 8, was PUNCH IN, is the AI knob's LOCK
// since 2026-11-04 (TRANSPORT_AI_LOCK_BUTTON). ROTO's LEFT/RIGHT buttons follow
// on the next two CCs in transport mode: rewind / fast-forward.
const NUM_TRANSPORT_BUTTONS = 4     // 1..4, bound to host transport values
const TRANSPORT_CUE_BUTTON = 4
const TRANSPORT_MONITOR_BUTTON = 5
const TRANSPORT_METRONOME_BUTTON = 6
// The Control Room selectors watched for them (mDefaults says 4 and 8)
const CR_MAX_MONITORS = 4
const CR_MAX_CUES = 8
const TRANSPORT_REWIND_CC = TRANSPORT_BUTTON_CC_BASE + NUM_CONTROL_PAIRS
const TRANSPORT_FORWARD_CC = TRANSPORT_REWIND_CC + 1
// Transport mode's endless knobs (user requests 2026-10-28): knobs 1 and 2
// zoom (horizontally, vertically), as the Nektar CS12's zoom encoder, and knob
// 7 (over METRONOME; knob 5 until 2026-11-17) sets the tempo. 7-bit CCs 38, 39, 40 (the firmware numbers its labelled
// knobs in order), with 16 detents per turn (firmware KNOB_16_STEP_ENDLESS).
// The value is the knob's angle (0..1 a turn, wrapping), so each detent passed
// is one step. A value further than DETENT_WINDOW (of a detent) from a detent
// is between two, and ignored, so a knob resting halfway doesn't flap.
// Knob 3 (user request 2026-11-12) zooms the waveforms vertically ("Zoom In On
// Waveform Vertically"), on CC 60: a free CC outside the run (it would have
// taken 40 and pushed the tempo onto 41, the Control Room level's LSB). The
// firmware special-cases it (CUBASE_TRANSPORT_ZOOM_WAVE_KNOB).
const TRANSPORT_ENDLESS_CC_BASE = TRANSPORT_FORWARD_CC + 1
const TRANSPORT_ZOOM_WAVE_CC = 60
const ENDLESS_ZOOM = 0              // [0, 1]: zoom horizontally, vertically
const ENDLESS_TEMPO = 2
const ENDLESS_ZOOM_WAVE = 3
const NUM_ENDLESS_KNOBS = 4
const ENDLESS_DETENTS = 16
const DETENT_WINDOW = 0.3
// Tempo: 1 BPM a detent, in Cubase's range
const TEMPO_MIN_BPM = 30
const TEMPO_MAX_BPM = 300
// Transport mode's knob 4: the Control Room's main level (user request
// 2026-10-29). An absolute 14-bit knob, positioned from Cubase, on CC 9 / 41:
// a free pair (the endless knobs' run can't take one: 40's LSB, 72, is a
// meter CC).
const TRANSPORT_CR_LEVEL_CC = 9
// Transport mode's knob 8 and button 8: an AI knob and its LOCK, as Steinberg's
// CC121 (user request 2026-11-04). The knob controls the parameter under the
// mouse (mMouseCursor.mValueUnderMouse), LOCK keeps it on that parameter
// (mValueLocked). The knob is a 300 degree absolute 14-bit knob (user request
// 2026-11-04; it was endless), as the Control Room level's: CC 10 / 42, a free
// pair; the script positions it on the parameter's value (sendAiKnob). LOCK is
// button 8's transport CC (35), with its LED from Cubase.
// The API has no step count for the value under the mouse (only its value,
// display string, titles, and increment/decrement), so no haptics follow it.
const TRANSPORT_AI_KNOB_CC = 10
const TRANSPORT_AI_LOCK_BUTTON = 7
// TRANSPORT's knobs with value popups (see transportPopup): the Control Room
// level, tempo and the AI knob (0-based)
const TRANSPORT_CR_LEVEL_KNOB = 3
const TRANSPORT_TEMPO_KNOB = 6     // (over METRONOME: 4 until 2026-11-17)
const TRANSPORT_AI_KNOB = 7
// The knobs the script positions (Control Room level, AI knob): while one is
// turned, Cubase's values trail the turn by 20-50 ms, and sending them moved
// the motor back against the hand (capture 2026-11-04 13:13, the AI knob).
// TRANSPORT sends no touch CCs, so a turn is seen through an input-only
// variable on the same CC (Cubase gives the CC to both), and nothing is sent
// until KNOB_ECHO_HOLD_MS after the knob's last CC: then the value it ended on.
const KNOB_ECHO_HOLD_MS = 300
// ROTO emits CC 52..59 on the ROTO MIDI channel when a knob is touched (>0)
// or released (0). Undocumented in the v1.6 spec. Firmware only sends them
// for knobs in CC_14BIT mode, which is why the knobs must be 14-bit.
const KNOB_TOUCH_CC_BASE = 52

// Track focus (FUNC) pages, as the firmware draws them: page 1 is VOLUME,
// PAN and up to 6 sends on knobs 2..7; each page after it holds 8 more sends
// from knob 0. Cubase 16's 16 sends make 3 pages (6 + 8 + 2), Cubase 15's 8
// make 2. Pages past 2 need the Cubase firmware of 2026-11-16 (older firmware
// stops at page 2).
const FOCUS_PAGE_1_SENDS = 6
const FOCUS_PAGE_1_FIRST_SEND_KNOB = 2

// Send slots per track: Cubase 15 has 8, Cubase 16 has 16 (send_probe.js
// capture 2026-11-16: mSends.getSize() is 16 from script load, and slots
// 9..16 report titles and values as 1..8 do). Read at load from the API
// (setNumSends), capped at MAX_SENDS, 8 if it can't be read. All the send
// sub-pages are built for this many. Reported to ROTO (NUM_SENDS) on
// all-tracks entry, so its send selector cycles through all of them.
const MAX_SENDS = 16
const DEFAULT_NUM_SENDS = 8
var CUBASE_NUM_SENDS = DEFAULT_NUM_SENDS

// mSends.getSize() is the one seen (16 in Cubase 16); mDefaults'
// getNumberOfSendSlots() (edition-aware, by its name) is the fallback, and
// logged to compare.
function setNumSends(page) {
    const read = function(f) {
        try {
            const v = f()
            return (typeof v === 'number' && v >= 1) ? Math.floor(v) : null
        }
        catch (e) {
            return null
        }
    }
    const size = read(function() { return page.mHostAccess.mTrackSelection.mMixerChannel.mSends.getSize() })
    const slots = read(function() { return midiremote_api.mDefaults.getNumberOfSendSlots() })
    const n = size || slots || DEFAULT_NUM_SENDS
    CUBASE_NUM_SENDS = Math.min(n, MAX_SENDS)
    utils.log("SENDS " + CUBASE_NUM_SENDS + " send slots (getSize " + size + ", getNumberOfSendSlots " + slots + ")", utils.LOG_BASIC)
}

// The last FUNC page the routed sends fill (0-based)
function focusLastPage(numRouted) {
    if (numRouted <= FOCUS_PAGE_1_SENDS) return 0
    return 1 + Math.floor((numRouted - FOCUS_PAGE_1_SENDS - 1) / NUM_CONTROL_PAIRS)
}

// Audio meters: Cubase fires mOnProcessValueChange at the host metering rate
// (much faster than the device needs). Throttle to 12 fps and emit the
// peak-hold value accumulated within the window — mirrors the Ableton script.
const AUDIO_METER_FPS = 12
const AUDIO_METER_PERIOD_MS = 1000 / AUDIO_METER_FPS

// Parameter value display string throttle — same rate. On touch we ignore
// this and emit the cached string immediately.
const VALUE_UPDATE_PERIOD_MS = 1000 / 12

//-----------------------------------------------------------------------------
// 2. Globals
//-----------------------------------------------------------------------------

var config = {}
var activeMode = ACTIVE_MODE_NONE
// The two all-tracks banks (ROTO MIX-TRACKS / MIX-RTN): tracks, and FX
// channels + outputs (Cubase's equivalent of Ableton's returns + master).
// Both are bound at load with their own sub-pages and caches; only the active
// bank's changes reach ROTO.
const BANK_TRACKS = 0
const BANK_RETURNS = 1
const NUM_BANKS = 2
const BANK_SUFFIX = ['', ' (Returns)']
var activeBank = BANK_TRACKS
// Per-bank slot cache: { id, name, colour } per slot. `channels` is the active
// bank's (everything that talks to ROTO uses it); bank callbacks write their
// own bank's via bankChannels.
var bankChannels = [[], []]
var channels = bankChannels[BANK_TRACKS]
var selectedChannelId = ""
var mixMode = MIX_MODE_ALL_TRACKS
var mixKnobMode = MIX_KNOB_MODE_VOLUME
var mixButtonMode = MIX_BUTTON_MODE_MUTE
// Active send slot (0..7) when in all-tracks SEND knob mode. Driven by the
// SI byte in SET_MIX_ALL_TRACKS_MODE; ROTO emits a fresh message every time
// the user pages between sends.
var mixSendIndex = 0
var pluginMode = PLUGIN_MODE_NORMAL

// Per-encoder-slot meter throttle state.
var meterLastSendMs = []
var meterMaxHold = []
// Per-slot cache + throttle for the knob value display strings. The cache lets
// the touch handler re-send the current string instantly without waiting
// for the next mOnDisplayValueChange. The "dirty" flag is set when a change
// is throttled out — mOnIdle flushes any dirty slot whose throttle window
// has since elapsed, ensuring the trailing edge is never dropped.
// `lastSent` is the string ROTO most recently received; it dedups identical
// updates and — when cleared on mode/bank change — swallows the first display
// change per slot so the rebind storm doesn't trigger value popups.
// Button value strings are not sent: ROTO firmware ignores them in MIX mode.
var knobLatestStr = []
var knobLastSent = []
var knobLastSendMs = []
var knobDirty = []

// What ROTO is currently showing per slot, so rebinds that re-fire identical
// names/colours/meter levels don't redraw the screen. `null` means unknown
// (after a handshake or a firmware-side registry reset) and forces the next
// send. ROTO latches the RGB colour across RESET_TRACK_DETAILS and ignores
// the colour-scheme byte in SET_TRACK_DETAILS once an RGB colour is set, so
// the colour cache survives a reset; the name cache does not.
var displayedName = []
var displayedColour = []
var displayedMeter = []
var displayedKnob = []
for (var i=0; i<NUM_CONTROL_PAIRS; i++) {
    meterLastSendMs[i] = 0
    meterMaxHold[i] = 0
    knobLatestStr[i] = ""
    knobLastSent[i] = ""
    knobLastSendMs[i] = 0
    knobDirty[i] = false
    displayedName[i] = null
    displayedColour[i] = null
    displayedMeter[i] = null
    displayedKnob[i] = null
}


// Called on every mode/sub-mode entry and bank page. Clearing lastSent arms
// the suppress-first-change behaviour in pushKnobValue, which silences the
// popup burst Cubase fires when it rebinds the controls.
function resetParamValueState() {
    for (var i=0; i<NUM_CONTROL_PAIRS; i++) {
        knobLastSent[i] = ""
        knobDirty[i] = false
        buttonEarly[i] = null
        listenShown[i] = null
    }
}

// Forget what ROTO is showing, so the next name/colour/meter is always sent.
function invalidateDisplayState() {
    for (var i=0; i<NUM_CONTROL_PAIRS; i++) {
        displayedName[i] = null
        displayedColour[i] = null
        displayedMeter[i] = null
        displayedKnob[i] = null
    }
    // (The firmware keeps the Control Room buttons' labels until it reboots)
    crLabelSent = {}
}

// ROTO's track registry (what its MIX and PLUGIN FUNC screens list) shows the
// active bank: in MIX all-tracks mode, and in PLUGIN (normal and QUICK CTRL),
// whose FUNC lists the bank's tracks to pick from. The firmware keeps the
// registry across modes for Cubase. (Not FOCUS: there every title is the
// focused track's.)
function trackListActive() {
    return (activeMode == ACTIVE_MODE_MIX && mixMode == MIX_MODE_ALL_TRACKS) || activeMode == ACTIVE_MODE_PLUGIN
}

// PLUGIN's FUNC (track select) is shown: set by ROTO's SET_TRACK_SELECT_MODE,
// cleared by anything else from PLUGIN, a track pick or a mode change.
var pluginTrackSelect = false

// LEFT/RIGHT page the bank: MIX all-tracks mode, and PLUGIN's FUNC, which
// lists the bank's tracks.
function bankPagingActive() {
    return (activeMode == ACTIVE_MODE_MIX && mixMode == MIX_MODE_ALL_TRACKS) ||
        (activeMode == ACTIVE_MODE_PLUGIN && pluginTrackSelect)
}

function quickCtrlActive() {
    return activeMode == ACTIVE_MODE_PLUGIN && pluginMode == PLUGIN_MODE_QUICK_CTRL
}

// The knobs drive Cubase (and their values and strings go to ROTO): MIX,
// PLUGIN's QUICK CTRL, and PLUGIN's mapped knobs.
function knobsActive() {
    return activeMode == ACTIVE_MODE_MIX || quickCtrlActive() || pluginModeActive()
}

// An all-tracks slot with no track bound (e.g. past the end of the last bank).
// Its knob is parked at 0 on ROTO. `null` (unknown) is not vacant.
function isVacantSlot(index) {
    return mixMode == MIX_MODE_ALL_TRACKS && displayedName[index] === ""
}

// Knob position to ROTO. Compared against what ROTO shows rather than
// Cubase's diff, so a slot refilled after being parked at 0 is always re-sent.
// value: 0..1, sent as a 14-bit CC (MSB 12+i, LSB 44+i).
function sendKnob(context, index, value) {
    const value14 = Math.round(value * KNOB_14BIT_MAX)
    if (displayedKnob[index] === value14) return
    displayedKnob[index] = value14
    midi.sendMidiCc14Bit(config, context, (PLUGIN_MIX_MODE_KNOB_CC_BASE + index), value14)
}

function sendTrackName(context, index, name) {
    if (displayedName[index] === name) return
    const wasVacant = (displayedName[index] === "")
    displayedName[index] = name
    // ROTO may re-init the slot's meter when a track is registered.
    displayedMeter[index] = null
    midi.sendSetTrackDetails(config, context, index, name)
    // Slot refilled — move the knob off 0 to the new track's value now.
    // Cubase won't fire mOnProcessValueChange if the value didn't change.
    // (MIX only: in PLUGIN the knobs are the plugin's.)
    if (wasVacant && activeMode == ACTIVE_MODE_MIX) {
        const value = surfaceElements.controlsStrip[index].knob.mSurfaceValue.getProcessValue(context)
        sendKnob(context, index, value)
        // ...and its button, held off while vacant (LISTEN: from its poll)
        if (mixButtonMode == MIX_BUTTON_MODE_LISTEN) {
            listenShown[index] = null
        }
        else {
            const button = surfaceElements.controlsStrip[index].button.mSurfaceValue.getProcessValue(context)
            midi.sendMidiCc7it(config, context, (PLUGIN_MIX_MODE_BUTTON_CC_BASE + index), Math.round(button * 127))
        }
    }
}

function sendTrackReset(context, index) {
    if (displayedName[index] === "") return
    displayedName[index] = ""
    midi.sendResetTrackDetails(config, context, index)
    // In PLUGIN the knobs and buttons are the plugin's; MIX entry resets
    // again, after invalidateDisplayState.
    if (activeMode != ACTIVE_MODE_MIX) return
    midi.sendMidiCc7it(config, context, (PLUGIN_MIX_MODE_BUTTON_CC_BASE + index), 0)
    listenShown[index] = null
    sendKnob(context, index, 0)
    meterMaxHold[index] = 0
    sendMeter(context, index, 0)
}

function sendTrackColour(context, index, colour) {
    const shown = displayedColour[index]
    if (shown && shown.r === colour.r && shown.g === colour.g && shown.b === colour.b) return
    displayedColour[index] = { r: colour.r, g: colour.g, b: colour.b }
    midi.sendSetTrackColour(config, context, index, colour)
}

// Summed level to both L/R meter CCs. ROTO decays toward and then holds the
// last received value, so repeats can be dropped.
function sendMeter(context, index, value) {
    if (displayedMeter[index] === value) return
    displayedMeter[index] = value
    midi.sendMeterCc(config, context, index, 0, value)
    midi.sendMeterCc(config, context, index, 1, value)
}

// A MIX knob on a volume or send level (not pan). FUNC page 1: knob 0 is
// volume, 1 pan, 2.. sends; pages 2..: all sends.
function mixKnobIsLevel(index) {
    if (activeMode != ACTIVE_MODE_MIX) return false
    if (mixMode == MIX_MODE_TRACK_FOCUS) return focusPage != 0 || index != 1
    return mixKnobMode != MIX_KNOB_MODE_PAN
}

function formatDisplayValue(displayValue, units) {
    return plugins.valueString(displayValue, units)
}

function pushKnobValue(context, index, force) {
    const now = Date.now()
    const latest = knobLatestStr[index]
    if (!force) {
        // Empty string = slot just vacated; RESET_TRACK_DETAILS clears it.
        if (latest === "") return
        if (latest === knobLastSent[index]) return
        if (knobLastSent[index] === "") {
            knobLastSent[index] = latest
            return
        }
        if ((now - knobLastSendMs[index]) < VALUE_UPDATE_PERIOD_MS) {
            knobDirty[index] = true
            return
        }
    }
    else if (latest === knobLastSent[index] && (now - knobLastSendMs[index]) < VALUE_UPDATE_PERIOD_MS) {
        // Touch force-send of a string that just went out (Cubase often reports
        // the display change in the same moment as the touch): ROTO shows it.
        return
    }
    knobLastSendMs[index] = now
    knobLastSent[index] = latest
    knobDirty[index] = false
    midi.sendParamValue(config, context, false, index, latest)
}

// Trailing-edge flush — called from mOnIdle. Sends any cached value whose
// throttle window has expired but never got re-sent because the user
// stopped touching the control during the cooldown.
function flushPendingValues(context) {
    if (!knobsActive()) return
    const now = Date.now()
    for (var i=0; i<NUM_CONTROL_PAIRS; i++) {
        if (knobDirty[i] && (now - knobLastSendMs[i]) >= VALUE_UPDATE_PERIOD_MS) {
            knobDirty[i] = false
            if (knobLatestStr[i] !== knobLastSent[i] && knobLastSent[i] !== "") {
                knobLastSendMs[i] = now
                knobLastSent[i] = knobLatestStr[i]
                midi.sendParamValue(config, context, false, i, knobLatestStr[i])
            }
        }
    }
}

//-----------------------------------------------------------------------------
// 3. DRIVER SETUP - create driver object, midi ports and detection information
//-----------------------------------------------------------------------------

// Get the api's entry point
var midiremote_api = require('midiremote_api_v1')

// Create the device driver main object
config.deviceDriver = midiremote_api.makeDeviceDriver('Melbourne Instruments', 'ROTO-CONTROL', 'Melbourne Instruments')

// Create objects representing the hardware's MIDI ports
config.midiInput = config.deviceDriver.mPorts.makeMidiInput()
config.midiOutput = config.deviceDriver.mPorts.makeMidiOutput()

// Define all possible namings the devices MIDI ports could have
// NOTE: Windows and MacOS handle port naming differently
config.deviceDriver.makeDetectionUnit().detectPortPair(config.midiInput, config.midiOutput)
    .expectInputNameEquals('Roto-Control')
    .expectOutputNameEquals('Roto-Control')

// Driver setup complete
utils.log('ROTO driver setup', utils.LOG_BASIC)

//-----------------------------------------------------------------------------
// 4. SURFACE LAYOUT - create control elements and midi bindings
//-----------------------------------------------------------------------------

var surfaceElements = makeSurfaceElements()

//-----------------------------------------------------------------------------
// 5. HOST MAPPING - create mapping pages and host bindings
//-----------------------------------------------------------------------------

// Create at least one mapping page
var page = config.deviceDriver.mMapping.makePage('Mixer Page')
setNumSends(page)
var pageMixer = makePageMixer(page)
var pageTransport = makePageTransport(page)
makePluginAccess(page)
if (folderProbe) {
    folderProbe.make(page, function(name) {
        return config.deviceDriver.mSurface.makeCustomValueVariable(name)
    })
}
if (daProbe) {
    daProbe.make(page, page.mHostAccess.mTrackSelection.mMixerChannel, function(name) {
        return config.deviceDriver.mSurface.makeCustomValueVariable(name)
    })
}
if (focusProbe) {
    focusProbe.make(page, page.mHostAccess.mTrackSelection.mMixerChannel, pageMixer.banks[BANK_TRACKS].channels, function(name) {
        return config.deviceDriver.mSurface.makeCustomValueVariable(name)
    })
}
if (volumeProbe) {
    volumeProbe.make(page, page.mHostAccess.mTrackSelection.mMixerChannel, function(name) {
        return config.deviceDriver.mSurface.makeCustomValueVariable(name)
    })
}
if (crProbe) {
    crProbe.make(page, function(name) {
        return config.deviceDriver.mSurface.makeCustomValueVariable(name)
    }, midiremote_api.mDefaults)
}
if (sendProbe) {
    sendProbe.make(page, page.mHostAccess.mTrackSelection.mMixerChannel, function(name) {
        return config.deviceDriver.mSurface.makeCustomValueVariable(name)
    })
}
if (qcProbe) {
    // (The driver owns the host values' callbacks: the probe reads its state)
    qcProbe.make(page, page.mHostAccess.mTrackSelection.mMixerChannel, {
        titles: function(src, i) {
            if (src === 'F') return [fqcObjects[i], fqcNames[i]]
            if (src === 'T') return ['', quickCtrlNames[i]]
            return [aiObjectTitle, aiValueTitle]
        },
        // The Focus Quick Controls' values only in QUICK CTRL (the knobs are
        // bound to them there); the track's own have no surface value
        value: function(context, src, i) {
            if (src === 'F') return quickCtrlActive() ? surfaceElements.controlsStrip[i].knob.mSurfaceValue.getProcessValue(context) : null
            if (src === 'M') return surfaceElements.aiKnob.getProcessValue(context)
            return null
        },
        // What the haptics database gives it now (undefined: not in it)
        lookup: function(src, objectTitle, valueTitle) {
            if (src === 'M') return aiKnobHaptics(objectTitle, valueTitle)
            const byTitle = pluginHapticsFor(objectTitle)
            return (byTitle && Object.prototype.hasOwnProperty.call(byTitle, valueTitle)) ? byTitle[valueTitle] : undefined
        },
    })
}
// (Debug: a page re-activation would reset every sub-page area to its default)
page.mOnActivate = function(context, activeMapping) {
    utils.log("PAGE activate", utils.LOG_VERBOSE)
    if (daProbe) daProbe.setMapping(activeMapping)
}
page.mOnDeactivate = function(context, activeMapping) {
    utils.log("PAGE deactivate", utils.LOG_VERBOSE)
}
// DirectAccess calls need the page's activeMapping, so PLUGIN mode's list
// work runs here rather than in the device's mOnIdle.
page.mOnIdle = function(context, activeMapping) {
    if (folderProbe) {
        folderProbe.setMapping(activeMapping)
        folderProbe.setEnabled(activeMode == ACTIVE_MODE_MIX)
        folderProbe.idle()
    }
    if (daProbe) {
        daProbe.setMapping(activeMapping)
        daProbe.idle()
    }
    if (focusProbe) {
        focusProbe.setMapping(activeMapping)
        focusProbe.idle()
    }
    if (volumeProbe) {
        volumeProbe.setMapping(activeMapping)
        volumeProbe.idle()
    }
    if (sendProbe) {
        sendProbe.setMapping(activeMapping)
        sendProbe.idle()
    }
    if (crProbe) {
        crProbe.setMapping(activeMapping)
        crProbe.idle()
    }
    if (qcProbe) qcProbe.idle(context, activeMapping)
    pluginIdle(context, activeMapping)
    pollListen(context, activeMapping)
    if (paramDump && pluginAccessActivated) paramDump.idle(mixerAccess, activeMapping)
    pollVol0dbPos(context, activeMapping)
    applyTempoSteps(activeMapping)
}

//-----------------------------------------------------------------------------
// 6. CONNECT - connect to ROTO
//-----------------------------------------------------------------------------

// Let ROTO know we're attached
config.deviceDriver.mOnActivate = function(context) {
    // ROTO ignores MIDI before it has pinged us; midi.js gates all output
    // until setRotoReady(true), which fires on the first PING_DAW receipt.
    // Reset here so a script reload while the device is connected re-arms
    // the gate and waits for a fresh ping.
    midi.setRotoReady(false)
    rotoPingPending = false
    invalidateDisplayState()
    focusSendsKey = null
    focusTrackKey = ""
    focusTrackShown = null
    rotoSelectedIndex = null
    meterStatesKey = null
    // Activated again (Cubase deactivates and reactivates the driver, e.g.
    // around a script reload, capture 2026-11-12): the DirectAccess objects
    // are activated again on the next page idle, with its new mapping; the
    // old mapping isn't used from MIDI callbacks meanwhile. (After the
    // reactivation the channels' unique IDs were "" and DirectAccess's base
    // -1: to see whether this brings DirectAccess back.)
    pluginAccessActivated = false
    pluginMapping = null
    midi.sendDawStarted(config, context)
    utils.log("Driver activate", utils.LOG_BASIC)
}

// Cubase stops the script when it loses the ports (e.g. ROTO unplugged), and
// activates it again when it finds them.
config.deviceDriver.mOnDeactivate = function(context) {
    midi.setRotoReady(false)
    utils.log("Driver deactivate", utils.LOG_BASIC)
}

// ROTO's firmware version, asked for on each PING_DAW before replying (the
// firmware answers it before connecting, 3.3.0 too). Cubase support came with
// firmware 4.0.0 (the ATARI-537 branch raised it from the 3.3.0 release).
// Older firmware would connect as an unknown DAW type (Cubase's 5 is past its
// list) with none of its Cubase handling, so the script doesn't connect to it
// at all (user decision 2026-10-23): ROTO keeps pinging, and the reason is in
// Cubase's script console.
const MIN_FW_VERSION = [4, 0, 0]
var rotoFwVersion = null            // [major, minor, patch] ROTO last said
var rotoFwLogged = ''               // the version last logged (pings repeat every second)
var rotoPingPending = false         // a PING_DAW waits for the version

function fwVersionOlder(v, min) {
    for (var i=0; i<3; i++) {
        if (v[i] !== min[i]) return v[i] < min[i]
    }
    return false
}

function onRotoFwVersion(context, major, minor, patch, commit) {
    rotoFwVersion = [major, minor, patch]
    var hash = ''
    for (var i=0; i<commit.length; i++) {
        if (commit[i] >= 0x20 && commit[i] < 0x7F) hash += String.fromCharCode(commit[i])
    }
    const version = rotoFwVersion.join('.')
    const tooOld = fwVersionOlder(rotoFwVersion, MIN_FW_VERSION)
    if (rotoFwLogged !== version + hash) {
        rotoFwLogged = version + hash
        utils.log("ROTO firmware " + version + (hash ? " (" + hash + ")" : ""), utils.LOG_BASIC)
        if (tooOld) {
            utils.log("WARNING: ROTO firmware " + version + " doesn't support Cubase, so ROTO isn't connected: " +
                      "update it to " + MIN_FW_VERSION.join('.') + " or later with ROTO-SETUP", utils.LOG_BASIC)
        }
    }
    if (!rotoPingPending || tooOld) return
    rotoPingPending = false
    // Open the output gate, then reply: ROTO connects (ROTO_DAW_CONNECTED)
    midi.setRotoReady(true)
    midi.sendPingDawResp(config, context)
}

// Idle tick — flushes throttled value-string updates whose trailing edge
// would otherwise be dropped when the user stops moving a control
// mid-cooldown, and applies batched selection / focus-send changes.
config.deviceDriver.mOnIdle = function(context) {
    checkBankPage(context)
    flushPendingValues(context)
    if (folderToggle !== null && selectedChannelId === folderToggle.id) {
        // (Probe) the touched track is selected: fold/unfold
        const toggle = folderToggle
        folderToggle = null
        folderProbe.trigger(context, toggle.name)
    }
    if (focusSendsDirty) {
        if (activeMode == ACTIVE_MODE_MIX && mixMode == MIX_MODE_TRACK_FOCUS) {
            applyFocusSends(context, false)
        }
        else {
            // Applied (forced) on the next focus entry.
            focusSendsDirty = false
        }
    }
    // (Not while a bank page is checked: the slots' IDs are in flux)
    if (selectionDirty && !bankSendsHeld()) {
        resolveSelectedTrack(context)
    }
    flushKnobPositions(context)
    flushTransportPopups(context)
    flushControlRoomButtons(context)
    flushRebindKnobs(context)
    flushQuickCtrlKnobs(context)
    // (Mode changes: QUICK CTRL entered locked, or left)
    applyFocusQcLock(context)
    // (Held for the select: not for good, e.g. if the list can't be read)
    if (quickCtrlAwaitSelect && Date.now() >= quickCtrlAwaitUntilMs) quickCtrlAwaitSelect = false
    if (quickCtrlDirty && quickCtrlActive() && !quickCtrlLabelsHeld()) {
        applyQuickCtrl(context)
    }
    if (meterStatesDirty && activeMode == ACTIVE_MODE_MIX && (mixMode == MIX_MODE_TRACK_FOCUS || !bankSendsHeld())) {
        updateMeterStates(context)
    }
    utils.flushMidiLog(config.midiOutput, context)
}

// Common handler for all received SYSEX
config.midiInput.mOnSysex = function(context, msg) {
    // roto_midi_mon asking for the script log while it captures
    if (utils.handleMidiLogRequest(msg)) return
    // Make sure the SYSEX is from ROTO
    if (midi.sysexMsgIsFromRoto(msg)) {
        // Log the received message
        if (utils.VERBOSE) utils.log("Received SYSEX: " + utils.byteArrayToHexString(msg), utils.LOG_VERBOSE)

        // Switch on the command group
        switch (msg[5]) {
            case midi.GENERAL_COMMAND_GROUP:
                // Switch on the general command message
                switch (msg[6]) {
                    case midi.PING_DAW:
                        // ROTO is listening (it pings until connected).
                        // Check its firmware first: the reply (onRotoFwVersion)
                        // connects, or not for firmware without Cubase support.
                        // Every ping asks again, so updated firmware connects.
                        rotoPingPending = true
                        midi.sendRequestRotoFwVersion(config, context)
                        break

                    case midi.ROTO_SELECT_TRACK:
                        // If we are in MIX mode, select the track (a bank slot).
                        // QUICK CTRL and PLUGIN too: ROTO's SEL lists the bank's
                        // tracks, and the Quick Controls / plugin list follow the
                        // Cubase selection.
                        if (activeMode == ACTIVE_MODE_MIX || quickCtrlActive() || pluginModeActive()) {
                            const index = (msg[7] << 7) + msg[8]
                            if (quickCtrlActive()) {
                                quickCtrlRotoSelect(index)
                            }
                            // The firmware selects the track itself. (Whether ROTO's
                            // selected index changes: if so, PLUGIN's firmware clears
                            // its plugin, even for the track Cubase has selected)
                            const rotoIndexChanged = (index !== rotoSelectedIndex)
                            rotoSelectedIndex = index
                            // A pick leaves PLUGIN's FUNC (no message for it)
                            pluginTrackSelect = false
                            // PLUGIN (and QUICK CTRL's list): read the picked track's
                            // plugins straight away
                            const picked = channels[index]
                            if (pluginListActive() && pluginFollowing() && index < NUM_CONTROL_PAIRS &&
                                picked !== undefined && picked.id !== "" && picked.id !== selectedChannelId) {
                                pluginEarlyPick = { bank: activeBank, slot: index, id: picked.id }
                                const queued = pluginEarlyPick
                                if (!withMapping('early pick', function(m) { readEarlyPick(context, m, true) })) pluginEarlyPick = queued
                            }
                            else if (pluginListActive() && !pluginLocked && rotoIndexChanged && picked !== undefined &&
                                     picked.id !== "" && picked.id === selectedChannelId) {
                                // The track Cubase already has selected: nothing changes in
                                // Cubase, but ROTO cleared its plugin (it showed "---" until
                                // its plugin list was opened, capture 2026-10-23 15:59).
                                // Send the list and selection again.
                                pluginListKey = null
                                pluginSelectSent = -1
                                if (!withMapping('re-pick', function(m) { refreshPluginList(context, m) })) schedulePluginScan(0)
                            }
                            if (index < midi.NUM_MIX_BANK_CHANNELS) {
                                pageMixer.banks[activeBank].select[index].setProcessValue(context, 1)
                            }
                        }
                        break

                    case midi.REQUEST_TRANSPORT_STATUS:
                        // ROTO asks on entering its transport screen, after
                        // clearing the button LEDs.
                        sendTransportStatus(context)
                        resetEndlessKnobs()
                        resetTransportPopups()
                        transportShown = true
                        // (The status reply set the Control Room buttons' LEDs)
                        crLedSent = {}
                        crLedSent[TRANSPORT_CUE_BUTTON] = crCueLit()
                        crLedSent[TRANSPORT_MONITOR_BUTTON] = crMonitorLit()
                        if (crProbe) crProbe.step(context)
                        // (The firmware has only just mapped the knob's CC)
                        crLevelSent = null
                        sendCrLevel(context, surfaceElements.crLevel.getProcessValue(context))
                        // (Its haptics before its position; the firmware set it up continuous)
                        aiHapticsSent = QC_HAPTICS_CONTINUOUS.join(',')
                        sendAiKnobHaptics(context)
                        aiKnobSent = null
                        sendAiKnob(context, surfaceElements.aiKnob.getProcessValue(context))
                        break

                    case midi.ROTO_DAW_CONNECTED:
                        // Cubase and ROTO are connected! ROTO may have
                        // rebooted with the script running: it shows nothing.
                        invalidateDisplayState()
                        // (Its firmware may have changed: wait for a marker again)
                        mappedEndSeen = false
                        // (The firmware clears its LOCK on connecting, without
                        // telling the script: so does the script, and Cubase's
                        // Focus Quick Controls lock goes with it)
                        if (pluginLocked) setPluginsLock(false)
                        applyFocusQcLock(context)
                        // Send the number of tracks (fixed to the mixer zone bank size)
                        midi.sendNumTracks(config, context)
                        // Configure VU meter yellow/red thresholds (0-127 scale).
                        midi.sendSetMixVuMeterPoints(config, context, midi.METER_LEVEL_YELLOW, midi.METER_LEVEL_RED)
                        // Where 0 dB sits on the faders (once it's been read)
                        vol0dbSent = -1
                        sendVol0dbPos(context)
                        utils.log("Cubase connected to ROTO", utils.LOG_BASIC)
                        break

                    case midi.ROTO_FW_VERSION:
                        // Payload <VX VY VZ GC:7>
                        if (msg.length > 10) onRotoFwVersion(context, msg[7], msg[8], msg[9], msg.slice(10, msg.length - 1))
                        break

                    case midi.PAGE_LEFT:
                        // If we are in MIX all-tracks mode or PLUGIN's FUNC
                        // (track select), page the bank left. In MIX's FUNC
                        // (track focus) and PLUGIN's controls the firmware
                        // sends these for its own pages — the bank must not move.
                        if (bankPagingActive()) {
                            // Swallow the value-change burst from the rebind
                            resetParamValueState()
                            pageMixer.banks[activeBank].prev.setProcessValue(context, 1)
                        }
                        break

                    case midi.PAGE_RIGHT:
                        // If we are in MIX all-tracks mode, page the MIX bank right.
                        // Not from the last bank (its last slot is empty): Cubase
                        // doesn't move, but re-fires slot 1's title "" then its
                        // name, which flashed that screen blank (seen in a capture).
                        const lastSlot = channels[NUM_CONTROL_PAIRS - 1]
                        const lastBank = (lastSlot !== undefined && lastSlot.name === "")
                        if (bankPagingActive() && !lastBank && pageCheck === null) {
                            resetParamValueState()
                            // A full page may be the last: hold ROTO's
                            // updates until the new page shows (checkBankPage)
                            if (lastSlot !== undefined && lastSlot.id !== "" && channels[0] !== undefined) {
                                pageCheck = { firstId: channels[0].id, lastId: lastSlot.id,
                                              untilMs: Date.now() + PAGE_CHECK_MS, reverting: false }
                            }
                            pageMixer.banks[activeBank].next.setProcessValue(context, 1)
                        }
                        break
                }
                break

            case midi.PLUGIN_COMMAND_GROUP:
                // Anything else from PLUGIN means its FUNC isn't shown
                if (msg[6] != midi.SET_TRACK_SELECT_MODE) pluginTrackSelect = false
                switch (msg[6]) {
                    case midi.SET_TRACK_SELECT_MODE:
                        // Payload <on> (Cubase firmware): PLUGIN's FUNC shown
                        // or left; while shown, LEFT/RIGHT page the bank
                        pluginTrackSelect = activeMode == ACTIVE_MODE_PLUGIN && (msg.length > 8 ? msg[7] != 0 : true)
                        break

                    case midi.SET_PLUGIN_MODE:
                        // The knobs are reconfigured on PLUGIN entry. ROTO
                        // keeps its track registry for Cubase (its FUNC lists
                        // it), so names and colours are still known.
                        for (var i=0; i<NUM_CONTROL_PAIRS; i++) {
                            displayedKnob[i] = null
                            displayedMeter[i] = null
                        }
                        // Payload <mode>: bit 0 = QUICK CTRL, plus
                        // PLUGIN_MODE_TOGGLED for the LEFT+RIGHT toggle.
                        const pluginModeByte = msg.length > 8 ? msg[7] : PLUGIN_MODE_NORMAL
                        const qcMode = (pluginModeByte & PLUGIN_MODE_QUICK_CTRL) ? PLUGIN_MODE_QUICK_CTRL : PLUGIN_MODE_NORMAL
                        // The same mode again, after TRANSPORT: the firmware
                        // leaving its TRANSPORT screen (2026-11-04)
                        const backFromTransport = transportShown && pluginListActive() &&
                                                  ((qcMode == PLUGIN_MODE_QUICK_CTRL) === quickCtrlActive())
                        transportShown = false
                        if (backFromTransport) {
                            pluginBackFromTransport(context)
                            break
                        }
                        setPluginMode(context, qcMode, (pluginModeByte & PLUGIN_MODE_TOGGLED) != 0)
                        break

                    case midi.ROTO_SELECT_PLUGIN:
                        // Payload <PI>: the plugin's index on ROTO's page
                        if (msg.length > 8) rotoSelectPlugin(context, msg[7])
                        break

                    case midi.SET_FIRST_PLUGIN:
                        // Payload <FP>: ROTO paged its plugin list
                        if (msg.length > 8) setFirstPlugin(msg[7])
                        break

                    case midi.SET_DEVICE_LEARN:
                        // Payload <DL>: ROTO's LEARN on/off
                        if (msg.length > 8) setPluginLearn(msg[7] != 0)
                        break

                    case midi.CONTROL_MAPPED:
                        // Payload <PI:2 PH:6 CT CI MP>, one per mapped control
                        // on the page, after ROTO loads a plugin or a page
                        if (msg.length > 17) {
                            controlMapped(((msg[7] & 0x7f) << 7) + (msg[8] & 0x7f), msg.slice(9, 15), msg[15], msg[16])
                        }
                        break

                    case midi.CONTROL_MAPPED_END:
                        // Payload <page index, map empty>: the burst is
                        // complete (map empty: newer firmware only)
                        controlMappedEnd(context, (msg.length > 8) ? msg[7] : 0, (msg.length > 9) && (msg[8] != 0))
                        break

                    case midi.UNMAP_CTLS:
                        // No payload: nothing mapped (a plugin the configurator
                        // changed; its reload's burst and marker follow).
                        // Taken as an end marker with nothing mapped, as when
                        // the two shared a value
                        controlMappedEnd(context, 0, false)
                        break

                    case midi.SET_PLUGIN_ENABLE:
                        // Payload <PI ES>: plugin on ROTO's page switched on/off
                        if (msg.length > 9) setPluginEnable(msg[7], msg[8] != 0)
                        break

                    case midi.SET_PLUGINS_LOCK:
                        // Payload <LS>
                        if (msg.length > 8) {
                            setPluginsLock(msg[7] != 0)
                            applyFocusQcLock(context)
                        }
                        break
                }
                break

            case midi.MIXER_COMMAND_GROUP:
                // Switch on the MIX command message
                switch (msg[6]) {
                    case midi.SET_MIX_ALL_TRACKS_MODE:
                        // Payload: <AM KM SM SI> — msg[7]=AM (0 = tracks,
                        // 1 = returns/master), msg[8]=KM, msg[9]=SM, msg[10]=SI.
                        setMixAllTracksMode(context, msg[7], msg[8], msg[9], msg[10])
                        break

                    case midi.TOGGLE_TRACK_GROUPING:
                        // Payload <track:2> (a bank slot). (Probe: select the
                        // track, then try a folding key command on it)
                        if (folderProbe && activeMode == ACTIVE_MODE_MIX && msg.length > 9) {
                            const slot = (msg[7] << 7) + msg[8]
                            const ch = channels[slot]
                            utils.log("TOGGLE_TRACK_GROUPING slot " + slot + (ch ? ' "' + ch.name + '"' : ''), utils.LOG_VERBOSE)
                            if (ch !== undefined && ch.id !== "" && slot < NUM_CONTROL_PAIRS) {
                                folderToggle = { id: ch.id, name: ch.name }
                                pageMixer.banks[activeBank].select[slot].setProcessValue(context, 1)
                            }
                        }
                        break

                    case midi.SET_MIX_ALL_TRACKS_MODE_MODE:
                        // ROTO toggled MIX-TRACKS / MIX-RTN (LEFT+RIGHT together
                        // in all-tracks). Payload <AM>.
                        switchAllTracksBank(context, msg[7])
                        break

                    case midi.SET_MIX_TRACK_FOCUS_MODE:
                        // Set MIX track focus mode. Payload <PI>: the focus
                        // page ROTO is showing (0 = VOLUME/PAN + sends 1..6).
                        setMixTrackFocusMode(context, msg.length > 8 ? msg[7] : 0)
                        break
                }
                break
        }
    }
}

// ROTO's TRANSPORT screen is up (REQUEST_TRANSPORT_STATUS), until a mode message
var transportShown = false

// Back from ROTO's TRANSPORT screen in PLUGIN or QUICK CTRL: the firmware sends
// SET_PLUGIN_MODE again (2026-11-04), as MIX sends its mode. Nothing changed
// but the knobs, which are where TRANSPORT left them (the AI knob, the Control
// Room level, zoom, tempo; knob 8 didn't go back, user 2026-11-04): only their
// positions go back (displayedKnob was reset with the message). No list or
// select: ROTO kept its plugin, and a select would make it reload.
function pluginBackFromTransport(context) {
    utils.log("Back from TRANSPORT: knob positions", utils.LOG_VERBOSE)
    if (quickCtrlActive()) {
        quickCtrlKnobsPending = false
        for (var i=0; i<NUM_CONTROL_PAIRS; i++) {
            sendKnob(context, i, surfaceElements.controlsStrip[i].knob.mSurfaceValue.getProcessValue(context))
        }
        return
    }
    // PLUGIN: the mapped parameters' positions, on the next poll
    for (var k=0; k<NUM_CONTROL_PAIRS; k++) {
        if (pluginKnobMap[k]) pluginKnobMap[k].value = NaN
    }
    pluginPollMs = 0
}

function setMixAllTracksMode(context, allTracksMode, knobMode, buttonMode, sendIndex) {
    transportShown = false
    // Latched before the mode globals are overwritten. `firstEntry` flags the
    // post-handshake transition out of NONE, when ROTO's state is unknown.
    // `exitingFocus` gates the colour re-flush below.
    const firstEntry = (activeMode == ACTIVE_MODE_NONE)
    const exitingFocus = (activeMode == ACTIVE_MODE_MIX && mixMode == MIX_MODE_TRACK_FOCUS)
    const fromPlugin = (activeMode == ACTIVE_MODE_PLUGIN)
    if (daProbe && fromPlugin) daProbe.setEnabled(false)

    // Set the MIX mode
    activeMode = ACTIVE_MODE_MIX
    mixMode = MIX_MODE_ALL_TRACKS
    quickCtrlAwaitSelect = false
    setActiveBank(allTracksMode == 1 ? BANK_RETURNS : BANK_TRACKS)

    // Set the MIX knob and button modes
    mixKnobMode = knobMode
    mixButtonMode = buttonMode
    // Clamp SI to the available sub-page range. Undefined (legacy callers /
    // truncated frames) falls back to 0.
    if (typeof sendIndex === 'number' && sendIndex >= 0 && sendIndex < CUBASE_NUM_SENDS) {
        mixSendIndex = sendIndex
    } else {
        mixSendIndex = 0
    }

    // Arm suppression for the rebind storm that follows sub-page activation.
    resetParamValueState()
    // Meters stop in FOCUS mode; force the first level after re-entry.
    for (var i=0; i<NUM_CONTROL_PAIRS; i++) {
        displayedMeter[i] = null
    }

    // The firmware redraws the names it holds for Cubase, and their switch
    // line, on entry (_show_mix_mode_all_tracks_screen), so only names that
    // differ go out. Re-sending them all (as before 2026-10-28) made it redraw
    // all 8 screens again, one at a time, ~330 ms, and the button states drew
    // after that (capture 2026-10-28 15:14). On first entry and from PLUGIN
    // ROTO's names are unknown: all of them go out. The bank rebind that
    // follows re-fires the same titles, which are then deduped.
    if (firstEntry || fromPlugin) {
        invalidateDisplayState()
        // Selection callbacks before the handshake were dropped, and QUICK
        // CTRL leaves ROTO's selected index out of bank (see resolveSelectedTrack).
        focusTrackKey = ""
        focusTrackShown = null
        selectionDirty = true
    }
    else {
        // Empty slots are reset again: that re-parks their knobs and buttons
        for (var i=0; i<NUM_CONTROL_PAIRS; i++) {
            if (displayedName[i] === "") displayedName[i] = null
        }
    }
    sendEarlyButtonStates(context)
    flushBankSlots(context)
    resendKnobsIfSameBindings(context)

    // On focus exit, re-paint colours after the names. Cubase's mOnColorChange
    // callbacks fire async from the bank rebind; sending colours explicitly here
    // pins the order so ROTO never briefly shows a name with a stale colour.
    // Deduped, so this is a no-op when ROTO already has the right colours.
    if (exitingFocus) {
        for (var i=0; i<NUM_CONTROL_PAIRS; i++) {
            if (channels[i] !== undefined && channels[i].name && channels[i].colour) {
                sendTrackColour(context, i, channels[i].colour)
            }
        }
    }

    // Unbind the focus send knobs, and restore the all-tracks send count
    // (FOCUS set it to the focused track's routed sends) so ROTO's send
    // selector cycles all the slots (8, or 16 in Cubase 16).
    disableFocusSends(context)
    midi.sendNumSends(config, context, CUBASE_NUM_SENDS)

    activateAllTracksSubPages(context)

    // ROTO's meter enable states are unknown after a mode change.
    meterStatesKey = null
    meterStatesDirty = true
}

// The knobs' bindings at the last all-tracks entry (bank, knob mode, send)
var allTracksKnobKey = null

// Back in all-tracks mode with the same knob bindings (e.g. from TRANSPORT),
// Cubase reports no knob changes, so nothing went to ROTO's knobs: they kept
// TRANSPORT's haptics (the firmware sends a knob's new haptic mode with its
// next position) until turned, and any turned there were left where they were
// (capture 2026-10-28 15:45). So every knob's position is sent again: the
// motors go back, and take the MIX haptics. With other bindings (a knob mode
// change) Cubase's rebind moves the knobs itself.
function resendKnobsIfSameBindings(context) {
    const key = activeBank + ':' + mixKnobMode + ':' + mixSendIndex
    const same = (key === allTracksKnobKey)
    allTracksKnobKey = key
    // Other bindings (a send or knob mode change): Cubase's rebind moves the
    // knobs, and any it doesn't go out after it (holdRebindKnobs)
    if (!same) {
        holdRebindKnobs()
        return
    }
    rebindKnobsResendAtMs = 0
    for (var i=0; i<NUM_CONTROL_PAIRS; i++) {
        displayedKnob[i] = null
        const vacant = (channels[i] === undefined || !channels[i].name)
        sendKnob(context, i, vacant ? 0 : surfaceElements.controlsStrip[i].knob.mSurfaceValue.getProcessValue(context))
    }
}

// PAGE_RIGHT from a full page: Cubase moves the bank even when it was the
// last, by 7, so the new page is the last track alone in slot 1 (capture
// 2026-11-12: 8 tracks, page 2 showed "Diva" again, and its knob went to 0
// and back to 0 dB). So from a full page, nothing goes to ROTO (names,
// colours, resets, knobs, buttons, meters, the selection) until the new
// slot 1 is known: page 1's last track means there was no next page, and
// the bank is paged back, so ROTO never sees it. Otherwise the new page is
// sent from the cache.
const PAGE_CHECK_MS = 400
var pageCheck = null            // { firstId, lastId, untilMs, reverting } while held; null = not

function bankSendsHeld() {
    return pageCheck !== null
}

// From the device's idle.
function checkBankPage(context) {
    if (pageCheck === null) return
    if (!bankPagingActive()) {
        pageCheck = null            // (a mode change sends what it needs)
        return
    }
    const now = Date.now()
    const first = (channels[0] !== undefined) ? channels[0].id : ""
    if (pageCheck.reverting) {
        // Back on the page ROTO shows: nothing to send, it has it
        if (first === pageCheck.firstId || now >= pageCheck.untilMs) {
            const back = (first === pageCheck.firstId)
            pageCheck = null
            releaseBankPage(context, !back)
        }
        return
    }
    if (first !== "" && first !== pageCheck.firstId) {
        if (first === pageCheck.lastId) {
            utils.log("PAGE_RIGHT: no next page (Cubase showed the last track again); back", utils.LOG_VERBOSE)
            pageCheck.reverting = true
            pageCheck.untilMs = now + PAGE_CHECK_MS
            pageMixer.banks[activeBank].prev.setProcessValue(context, 1)
            return
        }
        pageCheck = null
        releaseBankPage(context, true)
        return
    }
    // (Cubase didn't move: nothing changed)
    if (now >= pageCheck.untilMs) {
        pageCheck = null
        releaseBankPage(context, false)
    }
}

// Send the page Cubase now shows: names, colours and resets (deduped against
// ROTO's), then, for a new page, every knob position and button state, which
// were held back.
function releaseBankPage(context, changed) {
    flushBankSlots(context)
    selectionDirty = true
    meterStatesDirty = true
    if (!changed || activeMode != ACTIVE_MODE_MIX || mixMode != MIX_MODE_ALL_TRACKS) return
    for (var i=0; i<NUM_CONTROL_PAIRS; i++) {
        if (isVacantSlot(i)) continue
        const strip = surfaceElements.controlsStrip[i]
        sendKnob(context, i, strip.knob.mSurfaceValue.getProcessValue(context))
        // (LISTEN: the poll sends them, listenShown was forgotten with the page)
        if (mixButtonMode == MIX_BUTTON_MODE_LISTEN) continue
        midi.sendMidiCc7it(config, context, (PLUGIN_MIX_MODE_BUTTON_CC_BASE + i),
                           Math.round(strip.button.mSurfaceValue.getProcessValue(context) * 127))
    }
}

// Send every slot of the active bank from the cache (names and colours, or a
// reset for an empty slot). Deduped against what ROTO shows.
function flushBankSlots(context) {
    for (var i=0; i<NUM_CONTROL_PAIRS; i++) {
        if (channels[i] !== undefined && channels[i].name) {
            sendTrackName(context, i, channels[i].name)
            // Deduped; only sends on first entry or after a colour change.
            if (channels[i].id !== "") {
                sendTrackColour(context, i, channels[i].colour)
            }
        }
        else if (channels[i] !== undefined) {
            // Empty slot — clear it and park the knob (FOCUS may have moved it).
            sendTrackReset(context, i)
        }
    }
}

// Activate the active bank's sub-pages for the current knob and button modes.
function activateAllTracksSubPages(context) {
    const bank = pageMixer.banks[activeBank]
    if (mixKnobMode == MIX_KNOB_MODE_VOLUME) {
        bank.activateVolume.setProcessValue(context, 1)
    }
    else if (mixKnobMode == MIX_KNOB_MODE_PAN) {
        bank.activatePan.setProcessValue(context, 1)
    }
    else if (mixKnobMode == MIX_KNOB_MODE_SEND) {
        // The sub-page that binds every bank knob to its channel's send-SI level.
        bank.activateSends[mixSendIndex].setProcessValue(context, 1)
    }

    if (mixButtonMode == MIX_BUTTON_MODE_MUTE) {
        bank.activateMute.setProcessValue(context, 1)
    }
    else if (mixButtonMode == MIX_BUTTON_MODE_SOLO) {
        bank.activateSolo.setProcessValue(context, 1)
    }
    else if (mixButtonMode == MIX_BUTTON_MODE_REC_ENABLE) {
        bank.activateRecEnable.setProcessValue(context, 1)
    }
    else if (mixButtonMode == MIX_BUTTON_MODE_INPUT_MON) {
        bank.activateInputMon.setProcessValue(context, 1)
    }
    else if (mixButtonMode == MIX_BUTTON_MODE_LISTEN) {
        // (The dummy bindings: a sub-page with none would leave the last
        // mode's live. The script writes Listen itself, see pollListen)
        pageMixer.activateSubPagePluginButtons.setProcessValue(context, 1)
    }
}

// Make `bank` the one whose slots ROTO shows. Returns whether it changed.
function setActiveBank(bank) {
    if (bank === activeBank) return false
    activeBank = bank
    channels = bankChannels[bank]
    // The selected track may be in this bank, or not any more.
    selectionDirty = true
    meterStatesKey = null
    meterStatesDirty = true
    for (var i=0; i<NUM_CONTROL_PAIRS; i++) {
        meterMaxHold[i] = 0
        displayedMeter[i] = null
    }
    return true
}

// ROTO toggled MIX-TRACKS / MIX-RTN in all-tracks mode. It doesn't redraw by
// itself: send the other bank's slots, then TRACK_DETAILS_END, on which the
// firmware updates its MIX-TRACKS / MIX-RTN title and redraws from its tracks.
function switchAllTracksBank(context, allTracksMode) {
    if (activeMode != ACTIVE_MODE_MIX || mixMode != MIX_MODE_ALL_TRACKS) return
    setActiveBank(allTracksMode == 1 ? BANK_RETURNS : BANK_TRACKS)
    // Swallow the value popups from the rebind. (Its transient "" knob
    // titles, ~70 ms after the switch, are ignored in onBankTrackTitle.)
    resetParamValueState()
    sendEarlyButtonStates(context)
    activateAllTracksSubPages(context)
    flushBankSlots(context)
    midi.sendTrackDetailsEnd(config, context)
}

// MUTE and SOLO button states go to ROTO at once on all-tracks entry and a
// bank toggle, from the mute/solo sinks (bankMuted, bankSoloed), rather than
// when Cubase pushes them through the newly active sub-page, ~105 ms later
// (capture 2026-10-28 15:14). That push then repeats them: each slot's first
// one is dropped if it matches (buttonEarly), as ROTO already shows it.
// (REC and INPUT MON have no sinks: they wait for Cubase.)
var buttonEarly = []            // by slot: the CC value sent early; null = none pending

function sendEarlyButtonStates(context) {
    const states = (mixButtonMode == MIX_BUTTON_MODE_MUTE) ? bankMuted[activeBank] :
                   (mixButtonMode == MIX_BUTTON_MODE_SOLO) ? bankSoloed[activeBank] : null
    for (var i=0; i<NUM_CONTROL_PAIRS; i++) {
        buttonEarly[i] = null
        if (!states || states[i] === undefined) continue
        // (Not for an empty slot: its reset sends the button off)
        if (channels[i] === undefined || !channels[i].name) continue
        const value = states[i] ? 127 : 0
        buttonEarly[i] = value
        midi.sendMidiCc7it(config, context, (PLUGIN_MIX_MODE_BUTTON_CC_BASE + i), value)
    }
}

// MIX's LISTEN button mode (user request 2026-11-12; the Cubase firmware's 5th
// SEL button mode, 4). The API's mixer values have no Listen (only the Control
// Room's as a whole), but each channel object has a "listen" parameter in
// DirectAccess (tag 4111, "Off"/"On": TREE capture 2026-11-12). Each bank
// slot's is read and written through its slot's DirectAccess
// (pluginSlotAccess), from the page's idle (DirectAccess needs its
// activeMapping). Meanwhile the buttons are on the dummy-bound 'Plugin
// Buttons' sub-page, so no other mode's binding is live, and the presses come
// from their input variables (PLUGIN_BUTTON_INPUT_VARS). The firmware's Cubase
// switches send 127 on every press (SWITCH_TOGGLE_SEND_MAX): each is a toggle.
// DirectAccess reports no changes from a slot's DirectAccess (assumed, as
// mixerAccess), so the states are polled (LISTEN_POLL_MS) and sent when they
// differ from what ROTO shows (listenShown, forgotten on any mode entry and
// bank page). Listen needs Cubase's Control Room on.
const LISTEN_TAG = 4111
const LISTEN_POLL_MS = 100
var listenShown = []                // by slot: the CC ROTO has (0 / 127); null = unknown
var listenPressed = []              // by slot: a press to apply on the next page idle
var listenPolledMs = 0

function listenModeActive() {
    return activeMode == ACTIVE_MODE_MIX && mixMode == MIX_MODE_ALL_TRACKS &&
           mixButtonMode == MIX_BUTTON_MODE_LISTEN
}

function listenButtonInput(i, value) {
    if (value <= 0 || isVacantSlot(i) || bankSendsHeld()) return
    listenPressed[i] = true
}

function pollListen(context, mapping) {
    if (!listenModeActive() || !pluginAccessActivated || bankSendsHeld()) {
        listenPressed = []
        return
    }
    var pressed = false
    for (var i=0; i<NUM_CONTROL_PAIRS; i++) {
        if (listenPressed[i]) pressed = true
    }
    const now = Date.now()
    if (!pressed && now - listenPolledMs < LISTEN_POLL_MS) return
    listenPolledMs = now
    for (var i=0; i<NUM_CONTROL_PAIRS; i++) {
        const press = listenPressed[i]
        listenPressed[i] = false
        if (isVacantSlot(i)) continue
        const ch = channels[i]
        if (ch === undefined || !ch.name) continue
        var on
        try {
            const da = pluginSlotAccess[activeBank][i]
            const id = da.getBaseObjectID(mapping)
            // (Only if it's on that track: it could lag a bank page)
            if (id < 0 || da.getObjectTitle(mapping, id) !== ch.name) continue
            on = da.getParameterProcessValue(mapping, id, LISTEN_TAG) > 0.5
            if (press) {
                on = !on
                da.setParameterProcessValue(mapping, id, LISTEN_TAG, on ? 1 : 0)
                utils.log("LISTEN slot " + (i + 1) + " \"" + ch.name + "\" " + (on ? "on" : "off"), utils.LOG_VERBOSE)
            }
        }
        catch (e) {
            utils.log("LISTEN slot " + (i + 1) + " failed: " + e, utils.LOG_VERBOSE)
            continue
        }
        const cc = on ? 127 : 0
        if (listenShown[i] === cc) continue
        listenShown[i] = cc
        midi.sendMidiCc7it(config, context, (PLUGIN_MIX_MODE_BUTTON_CC_BASE + i), cc)
    }
}


function setMixTrackFocusMode(context, page) {
    // Set the MIX mode
    activeMode = ACTIVE_MODE_MIX
    mixMode = MIX_MODE_TRACK_FOCUS
    // (0-based. Clamped to the routed sends in applyFocusSends)
    focusPage = (typeof page === 'number' && page > 0) ? Math.min(page, focusLastPage(MAX_SENDS)) : 0

    // Arm suppression for the rebind storm that follows sub-page activation.
    resetParamValueState()
    // Knob 0's meter is the selected track's now (page 1), and its state
    meterStatesKey = null
    meterStatesDirty = true

    // Page 1: knobs 0/1 -> selected track volume/pan, knobs 2..7 -> its first
    // 6 routed sends. Pages 2..: knobs 0.. -> the next 8 routed sends each.
    applyFocusSends(context, true)
}

//-----------------------------------------------------------------------------
// PLUGIN mode's QUICK CTRL: the knobs control Cubase's Focus Quick Controls
// ('Quick Controls' sub-page; user request 2026-11-04, as the other Cubase
// controllers do): the focused plugin window's own Quick Controls, on any
// track, or the selected track's with the project window focused. The
// switches are unused. The
// firmware configures the knobs as 14-bit CCs on the MIX knobs' CCs and labels
// them from SET_PLUGIN_CTL_DETAILS. (PLUGIN proper is further down.)
//-----------------------------------------------------------------------------
var quickCtrlNames = []         // by Quick Control; "" = unassigned
var quickCtrlShown = []         // names ROTO has; null = unknown
var quickCtrlDirty = false
// A track change: ROTO dropped its plugin and labels (firmware
// _process_plugin_track_selected), and selects one again once the new track's
// list goes out. The labels wait for that, or they'd be sent twice.
var quickCtrlAwaitSelect = false
var quickCtrlAwaitUntilMs = 0   // ...but not after this
const QUICK_CTRL_AWAIT_MS = 1200     // (PLUGIN_TRACK_WAIT_MS, and a little)

function holdQuickCtrlLabels(hold) {
    quickCtrlAwaitSelect = hold
    quickCtrlAwaitUntilMs = Date.now() + QUICK_CTRL_AWAIT_MS
}
var quickCtrlFromPlugin = false // QUICK CTRL was entered from PLUGIN (LEFT+RIGHT)
// A ROTO pick: its window opens, and the Focus Quick Controls move to it
// ~130 ms later (captures 2026-11-04). The labels wait for that (or the old
// plugin's would show first), but not after this.
const QUICK_CTRL_FOCUS_WAIT_MS = 500
var quickCtrlFocusWaitUntilMs = 0   // 0 = not waiting
// Entering QUICK CTRL, the knobs' values are the Quick Controls last shown
// until Cubase activates the sub-page and rebinds them (~120 ms): positions
// sent from them moved every knob twice (capture 2026-11-04 13:37). So the
// script's own position sends wait QUICK_CTRL_REBIND_MS; the rebind's values
// go out as they come, and the rest after.
const QUICK_CTRL_REBIND_MS = 250
// After a track or plugin select, the firmware redraws its QUICK CTRL screen
// when it gets to it (+50..250 ms), and that moves every knob's motor to its
// own stored value: positions sent before were lost (capture 2026-11-04 14:12,
// only knob 1 of 8 moved on selecting Audio 02). So they wait this long.
const QUICK_CTRL_SELECT_KNOBS_MS = 400
var quickCtrlKnobsFromMs = 0
var quickCtrlKnobsPending = false

// QUICK CTRL's knob positions wait (Cubase's echoes too), then all 8 go out
// (flushQuickCtrlKnobs)
function holdQuickCtrlKnobs(ms) {
    quickCtrlKnobsFromMs = Math.max(quickCtrlKnobsFromMs, Date.now() + ms)
    quickCtrlKnobsPending = true
}
var quickCtrlFocusWaitFromMs = 0

// QUICK CTRL's labels wait: for a track change's select (quickCtrlAwaitSelect),
// or for the Focus Quick Controls to follow a ROTO pick's window (their titles
// changed since, and settled).
function quickCtrlLabelsHeld() {
    if (quickCtrlAwaitSelect) return true
    if (quickCtrlFocusWaitUntilMs === 0) return false
    const now = Date.now()
    if (now >= quickCtrlFocusWaitUntilMs ||
        (fqcTitleMs >= quickCtrlFocusWaitFromMs && now - fqcTitleMs >= FOCUS_SETTLE_MS)) {
        quickCtrlFocusWaitUntilMs = 0
        return false
    }
    return true
}

// Whether the Focus Quick Controls show this entry of ROTO's list already
function focusShows(p) {
    if (p === undefined) return false
    if (isQcTrackEntry(p)) return sameNames(fqcNames, quickCtrlNames)
    for (var i=0; i<NUM_CONTROL_PAIRS; i++) {
        if (fqcNames[i] !== '') return fqcObjects[i] === p.name
    }
    return false
}
for (var i=0; i<NUM_CONTROL_PAIRS; i++) {
    quickCtrlNames[i] = ""
    quickCtrlShown[i] = null
    quickCtrlHapticsShown[i] = QC_HAPTICS_CONTINUOUS.join(',')
}

// QUICK CTRL's SEL lists the track's plugins (user request 2026-10-27), as
// PLUGIN does: it follows the focused window (followFocusedQuickControls), and
// a pick opens the plugin's window, so the Focus Quick Controls move to it.
// The strip
// EQ (or the pre-filter, without an EQ) has none, so its entry stands for the
// track's own Quick Controls, named QC_TRACK_ENTRY_NAME: no extra entry, so
// the list matches PLUGIN's. It can't be switched off there.
const QC_TRACK_ENTRY_NAME = "QUICK CTRL"

function isQcTrackEntry(p) {
    return p !== undefined && (p.type === 'EQ' || p.kind === 'prefilter')
}

function qcTrackEntryIndex() {
    for (var i=0; i<pluginList.length; i++) {
        if (isQcTrackEntry(pluginList[i])) return i
    }
    return -1
}

// QUICK CTRL lists no channel strip modules (user request 2026-10-28): they
// have no Quick Controls of their own, only the track's. The strip EQ stays,
// as the track entry. So the list differs from PLUGIN's when a strip module
// other than the EQ is on. Not in QUICK CTRL entered from PLUGIN (LEFT+RIGHT):
// it has no plugin picker (user request 2026-11-05; firmware), so it keeps
// PLUGIN's list, and the toggle doesn't re-send it and select again (capture
// 2026-11-05 15:24: the buttons drew PLUGIN's 8 plugins, then QUICK CTRL's 4).
function listForMode(list) {
    if (!quickCtrlActive() || quickCtrlFromPlugin) return list
    const shown = list.filter(function(p) { return p.kind !== 'strip' || isQcTrackEntry(p) })
    shown.stripSlots = list.stripSlots
    return shown
}

// A plugin as ROTO's list shows it. In QUICK CTRL from PLUGIN, the strip
// modules it keeps are named as the track entry too: their knobs are the
// track's Quick Controls, and the name only shows as the screen title (no
// picker). Same indices, so the toggle renames them without a re-select.
function shownPlugin(p) {
    if (!quickCtrlActive()) return p
    if (!isQcTrackEntry(p) && !(quickCtrlFromPlugin && p.kind === 'strip')) return p
    return { objectID: p.objectID, name: QC_TRACK_ENTRY_NAME, hash: p.hash, enabled: true }
}

function shownPluginListKey() {
    return pluginFirst + '#' + plugins.listKey(pluginList.map(shownPlugin))
}

// The Quick Controls moved to another track: ROTO dropped the labels, and the
// rebind's value changes aren't popped up (capture 2026-10-27: the new track's
// values showed in place of the names, "Audio In", "96.97 %")
function quickCtrlTrackChanged() {
    quickCtrlLabelsCleared()
    resetParamValueState()
}

// ROTO blanked its labels: send them all again
function quickCtrlLabelsCleared() {
    for (var i=0; i<NUM_CONTROL_PAIRS; i++) {
        quickCtrlShown[i] = ""
        // (The firmware's knob configs are reset with them: continuous)
        quickCtrlHapticsShown[i] = QC_HAPTICS_CONTINUOUS.join(',')
    }
    quickCtrlDirty = true
}

// toggled: ROTO's LEFT+RIGHT PLUGIN <-> QUICK CTRL toggle (PLUGIN_MODE_TOGGLED),
// where it keeps its list and plugin; not a mode picked from the MODE menu.
function setPluginMode(context, mode, toggled) {
    if (daProbe) daProbe.setEnabled(true)
    if (paramDump) paramDump.start()
    // LEFT+RIGHT toggles PLUGIN <-> QUICK CTRL (firmware); QUICK CTRL entered
    // from PLUGIN shows the selected plugin's own Quick Controls
    const fromPlugin = !!toggled && pluginModeActive()
    const fromPluginQc = !!toggled && quickCtrlActive() && quickCtrlFromPlugin
    // Straight after the handshake (ROTO started in PLUGIN or QUICK CTRL):
    // selections Cubase reported before were dropped (no mode yet), so ROTO
    // gets the track again, before the list (pluginIdle resolves it first;
    // capture 2026-11-04 13:13 had the track after the list and labels)
    if (activeMode == ACTIVE_MODE_NONE) {
        focusTrackKey = ""
        focusTrackShown = null
        selectionDirty = true
    }
    activeMode = ACTIVE_MODE_PLUGIN
    pluginMode = (mode == PLUGIN_MODE_QUICK_CTRL) ? PLUGIN_MODE_QUICK_CTRL : PLUGIN_MODE_NORMAL

    // Swallow the value popups from the rebind.
    resetParamValueState()
    disableFocusSends(context)
    // ROTO's FUNC lists the bank's tracks: send any it doesn't have (all of
    // them when ROTO started in PLUGIN, before any MIX entry)
    pluginTrackSelect = false
    flushBankSlots(context)
    if (pluginMode == PLUGIN_MODE_QUICK_CTRL) {
        if (qcDump) qcDump.start()
        // (The firmware's word: QUICK CTRL entered from PLUGIN has no picker)
        quickCtrlFromPlugin = !!toggled
        qcReturnMapped = null
        mappedSetOpen = false
        pluginLearning = false
        clearPluginMappings()
        if (!fromPlugin) {
            // From the MODE menu: the track's own Quick Controls. ROTO reset
            // its plugin: send the list again, with the track entry selected.
            pluginSelected = -1
            pluginSelectedExtra = -1
            pluginSelectedHash = ''
            pluginSelectedName = ''
            pluginListKey = null
            pluginSelectSent = -1
        }
        // (From PLUGIN, ROTO kept its list and plugin: only the track entry's
        // name changes)
        pageMixer.activateSubPageQuickControls.setProcessValue(context, 1)
        quickCtrlKnobsFromMs = 0
        holdQuickCtrlKnobs(QUICK_CTRL_REBIND_MS)
        // The firmware blanks its control names on entry, so only assigned
        // names need sending (a blank pass redrew all 8 screens for nothing:
        // Cubase only reports the titles ~200 ms after the sub-page is
        // active). Names and knob positions go out from mOnIdle.
        quickCtrlLabelsCleared()
        // (From the MODE menu, the select blanks them again: they follow it)
        holdQuickCtrlLabels(!fromPlugin)
        pluginAwaitUntilMs = 0
        pluginTrackID = selectedChannelId
        pluginTrackBase = -1
        schedulePluginScan(0)
    }
    else {
        // Knobs and buttons drive mapped parameters only (pluginKnobInput)
        pageMixer.activateSubPagePluginKnobs.setProcessValue(context, 1)
        pageMixer.activateSubPagePluginButtons.setProcessValue(context, 1)
        pluginLearning = false
        clearPluginMappings()
        // Back from QUICK CTRL: ROTO's PLUGIN burst came before this (qcReturnMapped)
        if (fromPluginQc && qcReturnMapped !== null) {
            pluginMappedQueue = qcReturnMapped
            mappedSetOpen = false
            // (Its marker asked for the default map: ROTO reloaded the plugin)
            if (qcReturnMapEmpty) defaultMapPending = true
        }
        qcReturnMapped = null
        qcReturnMapEmpty = false
        learnReadParams()
        quickCtrlAwaitSelect = false
        preFilterDumped = {}            // (debug: dump again on each entry)
        // ROTO resets its plugin list on entry: send it all again. Not back
        // from the plugin Quick Controls: the firmware's LEFT+RIGHT toggle
        // keeps its list and plugin for Cubase, and a re-select would make it
        // reload (capture 2026-10-22 16:17: ~1.3 s back to PLUGIN). Unless
        // QUICK CTRL's LEFT/RIGHT paged the list away from the selected
        // plugin: the firmware then drops it (its selection is page-relative),
        // so its page and the select go out again.
        if (!fromPluginQc || pluginSelectPage !== pluginFirst) {
            pluginListKey = null
            pluginSelectSent = -1
        }
        pluginAwaitUntilMs = 0
        pluginTrackID = selectedChannelId
        pluginTrackBase = -1
        schedulePluginScan(0)
    }
}

// A track picked with ROTO's SEL. When that changes ROTO's selected track, the
// firmware blanks the labels rather than show the old track's until Cubase's
// selection catches up (~230 ms). Track that so the names are sent again, even
// if the new track's are the same.
function quickCtrlRotoSelect(index) {
    if (index === rotoSelectedIndex) return
    for (var i=0; i<NUM_CONTROL_PAIRS; i++) {
        quickCtrlShown[i] = ""
    }
    // Picking the track Cubase already has selected changes nothing in Cubase,
    // so relabel now. Otherwise the selection change does it
    // (resolveSelectedTrack); sending now would send the old track's names.
    const ch = channels[index]
    if (ch !== undefined && ch.id !== "" && ch.id === selectedChannelId) {
        quickCtrlDirty = true
    }
}

// Send the Quick Control names that changed, and the knob positions (deduped:
// invalidateDisplayState on entry makes the first pass send them all).
function applyQuickCtrl(context) {
    quickCtrlDirty = false
    // The Focus Quick Controls' (the focused plugin's, or the track's)
    const names = fqcNames
    for (var i=0; i<NUM_CONTROL_PAIRS; i++) {
        const name = names[i]
        if (quickCtrlShown[i] !== name) {
            quickCtrlShown[i] = name
            midi.sendSetPluginCtlDetails(config, context, i, name,
                name ? QUICK_CTRL_COLOUR_SCHEME : QUICK_CTRL_UNASSIGNED_COLOUR_SCHEME)
        }
        // Its haptics (before its position, which the firmware's new mode snaps)
        const h = quickCtrlHaptics(i)
        const hk = h.join(',')
        if (quickCtrlHapticsShown[i] !== hk) {
            quickCtrlHapticsShown[i] = hk
            utils.log("QUICK CTRL qc=" + (i + 1) + " haptics " + hk + " (\"" + fqcObjects[i] + "\" / \"" + fqcNames[i] +
                      "\", param " + (qcRefKeys[i] || "none") + ")", utils.LOG_VERBOSE)
            midi.sendSetQcKnobHaptics(config, context, i, h)
            // (Its steps can arrive after its position went out: the
            // reference is read on the page's idle. Sent again, on the new mode)
            displayedKnob[i] = null
        }
        if (!quickCtrlKnobsPending) sendKnob(context, i, surfaceElements.controlsStrip[i].knob.mSurfaceValue.getProcessValue(context))
    }
}

// QUICK CTRL haptics: getReferencedParameter -> [objectID, tag] (readQuickCtrlRefs)
// -> steps from DirectAccess's discrete plain range (quickCtrlSteps) -> SET_QC_KNOB_HAPTICS.
// Third-party VST3s (Waves) report 0..1 whatever their steps, so stay continuous.
// PROPOSED API: DirectAccess.getParameterStepCount(mapping, objectID, tag) = ParameterInfo.stepCount.

// A plugin's entries in the haptics database, by its object title. An
// instrument's can carry its instance number ("Sampler Track 01", capture
// 2026-11-06): the database has it without.
function pluginHapticsFor(objectTitle) {
    if (!objectTitle) return undefined
    if (Object.prototype.hasOwnProperty.call(pluginHaptics, objectTitle)) return pluginHaptics[objectTitle]
    const base = objectTitle.replace(/ \d+$/, '')
    return (base !== objectTitle && Object.prototype.hasOwnProperty.call(pluginHaptics, base)) ? pluginHaptics[base] : undefined
}

function quickCtrlHaptics(i) {
    if (QC_HAPTICS_DATABASE) {
        const byTitle = pluginHapticsFor(fqcObjects[i])
        const title = fqcNames[i]
        if (byTitle && title && Object.prototype.hasOwnProperty.call(byTitle, title)) return byTitle[title]
        return QC_HAPTICS_CONTINUOUS
    }
    const steps = qcSteps[i] || 0
    return (steps >= 2) ? [QC_HAPTICS_STEPS_MODE, steps, 255, 255] : QC_HAPTICS_CONTINUOUS
}

// Step 1: each Focus Quick Control's parameter, from the page's idle (it
// needs the mapping) in QUICK CTRL. It moves 110-220 ms before the titles
// (qc_probe capture 2026-11-10), so the haptics can lead the labels.
var qcRefKeys = []                  // per Focus Quick Control: "objectID/tag"; "" = none
var qcSteps = []                    // its steps (step 2); 0 = continuous

function readQuickCtrlRefs(mapping) {
    for (var i=0; i<NUM_CONTROL_PAIRS; i++) {
        const value = fqcValues[i]
        var ref = []
        if (value && typeof value.getReferencedParameter === 'function') {
            try {
                ref = value.getReferencedParameter(mapping)
            }
            catch (e) {
                ref = []
            }
        }
        const key = (ref instanceof Array && ref.length >= 2 && ref[0] >= 0) ? ref[0] + '/' + ref[1] : ''
        if (key === qcRefKeys[i]) continue
        qcRefKeys[i] = key
        var steps = 0
        if (key !== '') {
            try {
                steps = quickCtrlSteps(mapping, ref[0], ref[1], i)
            }
            catch (e) {
                utils.log("QUICK CTRL qc=" + (i + 1) + " param " + key + " steps failed: " + e, utils.LOG_VERBOSE)
                steps = 0
            }
        }
        else {
            utils.log("QUICK CTRL qc=" + (i + 1) + " param none", utils.LOG_VERBOSE)
        }
        if (steps !== (qcSteps[i] || 0)) {
            qcSteps[i] = steps
            quickCtrlDirty = true
        }
    }
}

// Step 2: 2..MAX_STEPS from a discrete parameter's plain range, else 0. A
// 0..1 range is 2 steps only with on/off units (MonoDelay's TempoSync and
// Bypass: "On/Off"); Waves' stepped knobs report 0..1 with no units.
const QC_ON_OFF_UNITS = /^\s*(on|off)([\s\/,|]*(on|off))*\s*$/i
function quickCtrlSteps(mapping, objectID, tag, i) {
    const type = mixerAccess.getParameterProcessValueType(mapping, objectID, tag)
    const lo = mixerAccess.convertParameterProcessValueToPlain(mapping, objectID, tag, 0)
    const hi = mixerAccess.convertParameterProcessValueToPlain(mapping, objectID, tag, 1)
    const units = mixerAccess.getParameterDisplayUnits(mapping, objectID, tag) || ''
    const n = (type === 'discrete') ? Math.round(hi - lo) + 1 : 0
    var steps = 0
    if (n === 2) steps = QC_ON_OFF_UNITS.test(units) ? 2 : 0
    else if (n >= 3 && n <= plugins.MAX_STEPS) steps = n
    utils.log("QUICK CTRL qc=" + (i + 1) + " param " + objectID + "/" + tag + " \"" +
              mixerAccess.getParameterTitle(mapping, objectID, tag, 32) + "\" " + type +
              " plain " + lo + ".." + hi + " units \"" + units + "\" -> steps " + steps, utils.LOG_VERBOSE)
    return steps
}

// From the device's idle: the rebind's wait is over, every knob's position
// (those the rebind moved are deduped)
function flushQuickCtrlKnobs(context) {
    if (!quickCtrlKnobsPending || Date.now() < quickCtrlKnobsFromMs) return
    quickCtrlKnobsPending = false
    if (!quickCtrlActive()) return
    for (var i=0; i<NUM_CONTROL_PAIRS; i++) {
        // (The firmware may have moved them itself: not deduped)
        displayedKnob[i] = null
        sendKnob(context, i, surfaceElements.controlsStrip[i].knob.mSurfaceValue.getProcessValue(context))
    }
}

//-----------------------------------------------------------------------------
// The project's fader range (Project Setup's Max. Volume, +6 or +12 dB)
// The channel's Volume parameter (DirectAccess tag 1025, units dB) defaults
// to 0 dB, so its default process value is where 0 dB sits on the fader:
// 0.789087 on a +6 dB project, 0.748222 on +12. It changed as soon as Max.
// Volume was switched, and the sends' Level (tag 4097) moved with it
// (volume_probe.js capture 2026-11-05). ROTO's Cubase volume and send detent
// goes there (SET_MIX_VOL_0DB_POS): the fixed one (0.7913) read +2.06 dB on
// a +12 project. Read from the selected channel through the whole-mixer
// DirectAccess, which reports no parameter changes (through pluginAccess, the
// read would make Cubase report the fader's moves to PLUGIN's LEARN).
//-----------------------------------------------------------------------------
const VOLUME_PARAM_TAG = 1025
const VOL_0DB_POLL_MS = 1000
var vol0dbPos = -1              // 14-bit, as last read; -1: not yet
var vol0dbSent = -1             // what ROTO has; -1: unknown
var vol0dbPolledMs = 0

// From the page's mOnIdle, after pluginIdle (which activates the DirectAccess)
function pollVol0dbPos(context, mapping) {
    if (!pluginAccessActivated) return
    const now = Date.now()
    if (now - vol0dbPolledMs < VOL_0DB_POLL_MS) return
    vol0dbPolledMs = now
    const pos = readVol0dbPos(mapping)
    if (pos < 0 || pos === vol0dbPos) return
    vol0dbPos = pos
    utils.log("Volume 0 dB at " + pos + " (" + (pos / 16383).toFixed(6) + ")", utils.LOG_VERBOSE)
    sendVol0dbPos(context)
}

// -1 if there's no channel selected, or its Volume isn't a dB fader (a MIDI
// track's channel)
function readVol0dbPos(mapping) {
    try {
        const ch = pluginAccess.getBaseObjectID(mapping)
        if (!(ch >= 0)) return -1
        if (mixerAccess.getParameterDisplayUnits(mapping, ch, VOLUME_PARAM_TAG) !== 'dB') return -1
        const v = mixerAccess.getParameterDefaultProcessValue(mapping, ch, VOLUME_PARAM_TAG)
        if (!(v > 0 && v < 1)) return -1
        return Math.round(v * 16383)
    }
    catch (e) {
        return -1
    }
}

function sendVol0dbPos(context) {
    if (vol0dbPos < 0 || vol0dbPos === vol0dbSent) return
    vol0dbSent = vol0dbPos
    midi.sendSetMixVol0dbPos(config, context, vol0dbPos)
}

//-----------------------------------------------------------------------------
// PLUGIN mode: the selected track's plugins (plugins.js: channel strip
// modules, then the instrument, then the inserts), read through DirectAccess.
// ROTO stores each plugin's control mappings itself, by the hash in
// PLUGIN_DETAILS. Cubase reports object changes in bursts and also with
// nothing changed (a capture had 70 in 90 s), so the list is re-read at most
// every PLUGIN_SCAN_MS and only sent when it differs from what ROTO has.
//-----------------------------------------------------------------------------
const NUM_PLUGINS_PER_PAGE = 8
const PLUGIN_SCAN_MS = 150
// (No initialisers: makePluginAccess runs at load, before this part of the
// file, and an initialiser here would wipe what it made.)
var pluginAccess                // DirectAccess on the selected track's channel
var focusedPluginAccess         // DirectAccess on the insert whose window has focus
var focusedPluginViewer         // and its insert viewer
var pluginSlotAccess            // [bank][slot]: DirectAccess on each bank channel (pluginEarlyPick)
// A track picked on ROTO: its plugins are read through its bank slot's
// DirectAccess on the next idle, rather than waiting for Cubase to report the
// selection and the selected-track DirectAccess to move (~450 ms, capture
// 2026-10-23 15:33). Until the selection lands, the list ROTO has is the
// picked track's, so the selected-track DirectAccess (still on the old
// track) doesn't re-read it, and the selection then isn't sent to ROTO
// (DAW_SELECT_FOCUS_TRACK would make it drop the plugin it now has).
var pluginEarlyPick = null      // { bank, slot, id } to read on the next idle
var pluginEarlyTrackID = ""     // the picked track whose list ROTO has, until Cubase selects it
var pluginList = []             // plugins.scan() result, in ROTO's order
var pluginListKey = null        // the list (and page) ROTO has; null = unknown
var pluginIdentityKey = null    // which plugins ROTO has (not their on/off); null = unknown
// LOCK on ROTO keeps it on the current plugin while other tracks are
// selected. The DirectAccess object follows the selection, so while another
// track is selected the locked track's plugins can't be read or changed.
var pluginLocked = false
var pluginLockedTrackID = ""
var pluginLockedBase = -1          // the locked track's channel object (DirectAccess base); -1 = unknown
var pluginEnableQueue = []      // ROTO's on/off presses, applied from the page's mOnIdle
var pluginFirst = 0             // ROTO's page start (a multiple of 8)
var pluginSelected = -1         // object ID of the selected plugin; -1 = none
var pluginSelectedExtra = -1    // its second object (the strip EQ's pre-filter); -1 = none
var pluginSelectedHash = ''     // its class hash: a new track selects the same plugin if it has one
var pluginSelectedName = ''     // and its name, the fallback
var pluginSelectSent = -1       // list index ROTO has selected; -1 = unknown
var pluginSelectPage = 0        // pluginFirst when it was selected (ROTO's selection is page-relative)
var pluginScanDueMs = 0         // when to re-read the list; 0 = not due
var objChangeCount = 0          // DEBUG: mOnObjectChange calls since the last idle tick
var scanHeldLogged = ""         // DEBUG: the last reason a due scan was held, logged
var focusedPluginID = -1        // object ID of the plugin whose window has focus
var focusAfterTrackChange = false   // the next focused-window report follows a track change
var focusedPluginDirty = false
var focusedViewerEdit = false   // the focus viewer's slot has its window open (else it's only the default, slot 1)

// Focus follow (user request 2026-11-04): PLUGIN and QUICK CTRL follow the
// plugin window last focused in Cubase, inserts and instruments, on the
// selected track (another track's: not yet, option B under discussion). The detector is Cubase's Focus Quick
// Controls (followFocusedQuickControls): they follow the focused plugin window
// on any track, and their value titles name the plugin ("Surge XT") and its
// Quick Controls. With the project window focused they're the selected
// track's own Quick Controls again, and ROTO keeps the last plugin. (Captures
// 2026-11-04 10:50, 11:42, 11:46; see tests/harness.js.)
const FOCUS_FOLLOW = true
const FOCUS_SETTLE_MS = 40              // the 8 titles come one by one
// After a selection change, the Focus Quick Controls move to the new track's
// Quick Controls in the same burst as the selection, and the track's own
// titles (quickCtrlNames) catch up: until then they'd look like a plugin.
const FOCUS_SELECTION_SETTLE_MS = 300
// After a ROTO pick, the Focus Quick Controls still show the old focus until
// the picked plugin's window has opened and taken it: following them then
// selected the old entry and, ~470 ms later, the pick again, redrawing ROTO
// twice (capture 2026-11-05, QUICK CTRL's buttons: Compressor -> "EQ" ->
// Compressor). So the follow waits until they show the pick, at most this long.
const PICK_FOCUS_HOLD_MS = 1000
var pickFocusUntilMs = 0        // 0 = not held
// (Made in makePluginAccess, which runs at load before this part of the
// file: no initialisers)
var fqcObjects                  // by Focus Quick Control: its plugin (objectTitle)
var fqcNames                    // and its parameter (valueTitle); '' = unassigned
var fqcValues                   // the host values themselves (getReferencedParameter)
var fqcChangedMs = 0            // when the Focus Quick Controls last changed; 0 = handled
var fqcTitleMs = 0              // when they last changed
var selectionChangedMs = 0      // when Cubase last reported a selection
var selTitleChannelId = null    // the selected channel's ID at its last title callback
// After a track change, wait for DirectAccess to move to the new channel
// before sending the list, or the old track's plugins would go out again.
// Cubase may move DirectAccess before or after it reports the selection, so
// the check is against the channel object of the previous track.
const PLUGIN_TRACK_WAIT_MS = 1000
var pluginMapping = null        // the page's activeMapping, from its mOnIdle
// Speed (2026-10-23, experimental): DirectAccess work for ROTO's messages runs
// straight from the MIDI callback with the page's last activeMapping, rather
// than on the page's next idle tick (~30-200 ms apart: a ROTO track pick's
// list went out at +221 ms, capture 15:54). Turns itself off if a call throws.
var daFromMidi = true

// fn(mapping) now, if allowed; false if it didn't run (then the idle tick does it).
function withMapping(what, fn) {
    if (!daFromMidi || !pluginMapping || !pluginAccessActivated) return false
    try {
        fn(pluginMapping)
        return true
    }
    catch (e) {
        daFromMidi = false
        utils.log("DirectAccess from a MIDI callback failed (" + what + "): " + e + "; back to the idle tick", utils.LOG_BASIC)
        return false
    }
}
var pluginAccessActivated = false
var pluginTrackBase = -1        // channel object of the current track; -1 = unknown
var pluginTrackID = ""          // the current track (selected channel ID)
var pluginAwaitUntilMs = 0      // waiting for a new channel object until then; 0 = not waiting

function pluginModeActive() {
    return activeMode == ACTIVE_MODE_PLUGIN && pluginMode == PLUGIN_MODE_NORMAL
}

// ROTO's plugin list follows the selected track: PLUGIN, and QUICK CTRL (its
// SEL picks whose Quick Controls show)
function pluginListActive() {
    return activeMode == ACTIVE_MODE_PLUGIN
}

function makePluginAccess(page) {
    const selChannel = page.mHostAccess.mTrackSelection.mMixerChannel
    pluginAccess = page.mHostAccess.makeDirectAccess(selChannel)
    // Track selection, plugins inserted or removed, ...
    pluginAccess.mOnObjectChange = function(context, activeMapping, objectID) {
        objChangeCount++
        schedulePluginScan(pluginAwaitUntilMs !== 0 ? 0 : PLUGIN_SCAN_MS)
    }
    // A slot switched on/off, bypassed or given another plugin ("On",
    // "Bypass", "Effect Type" are slot parameters); else a plugin parameter,
    // for LEARN and mapped controls.
    pluginAccess.mOnParameterChange = function(context, activeMapping, objectID, tag) {
        if (scanning) return            // (the step scan's own writes)
        // (Debug: the channel strip EQ can't be learnt; does Cubase report
        // its changes on the slot, which is taken as an on/off change below?)
        if (pluginLearning && pluginModeActive()) {
            var onSlot = false
            for (var j=0; j<pluginList.length; j++) {
                if (pluginList[j].slotID === objectID) onSlot = true
            }
            utils.log("PLUGIN learn-change obj=" + objectID + " tag=" + tag + (onSlot ? " (slot)" : "") +
                      " selected=" + pluginSelected, utils.LOG_VERBOSE)
        }
        // A channel strip module switched on or off, or loaded or removed: its
        // slot counts even when the list has no module there (plugins.scan)
        if (pluginList.stripSlots && pluginList.stripSlots.indexOf(objectID) >= 0) schedulePluginScan(PLUGIN_SCAN_MS)
        for (var i=0; i<pluginList.length; i++) {
            if (pluginList[i].slotID === objectID) {
                schedulePluginScan(PLUGIN_SCAN_MS)
                // (The pre-filter is its own slot: its parameters are control
                // as well)
                if (pluginList[i].objectID !== objectID) return
            }
        }
        onPluginParamChange(context, activeMapping, objectID, tag)
    }
    // Reads and writes of mapped parameters, on any track (object IDs are
    // global). It reports no parameter changes (captures).
    mixerAccess = page.mHostAccess.makeDirectAccess(page.mHostAccess.mMixConsole)

    // The insert whose plugin window has focus: its base object is the slot.
    // Binding its On value to a sink keeps the viewer live (as with meters).
    const viewer = selChannel.mInsertAndStripEffects.makeInsertEffectViewer('Focused Plugin').followPluginWindowInFocus()
    page.makeValueBinding(config.deviceDriver.mSurface.makeCustomValueVariable('Focused Plugin Sink'), viewer.mOn)
    focusedPluginAccess = page.mHostAccess.makeDirectAccess(viewer)
    focusedPluginViewer = viewer

    // One per bank slot, for tracks picked on ROTO (pluginEarlyPick). Made
    // after the three above (the test harness relies on the order).
    pluginSlotAccess = []
    for (var b=0; b<NUM_BANKS; b++) {
        pluginSlotAccess[b] = []
        for (var i=0; i<NUM_CONTROL_PAIRS; i++) {
            pluginSlotAccess[b][i] = page.mHostAccess.makeDirectAccess(pageMixer.banks[b].channels[i])
        }
    }

    // The windows without a slot "Edit" parameter (openPluginEditor)
    pluginEditInstrument = config.deviceDriver.mSurface.makeCustomValueVariable('Plugin Edit Instrument')
    page.makeValueBinding(pluginEditInstrument, selChannel.mInstrumentPluginSlot.mEdit)
    pluginEditChannel = config.deviceDriver.mSurface.makeCustomValueVariable('Plugin Edit Channel')
    page.makeValueBinding(pluginEditChannel, selChannel.mValue.mEditorOpen)
    focusedPluginAccess.mOnObjectChange = function(context, activeMapping, objectID) {
        focusedPluginDirty = true
    }
    makeFocusFollow(page)
}

// Focus follow's inputs (see FOCUS_FOLLOW). Each host value reports only while
// something is bound to it, hence the sinks.
function makeFocusFollow(page) {
    const mkVar = function(name) { return config.deviceDriver.mSurface.makeCustomValueVariable(name) }
    // The selected track's focus viewer: is its slot's window open? With none
    // of the track's windows focused it sits on slot 1, window closed
    // (capture 2026-11-04 11:46: taken as a focus after a track change).
    const viewer = focusedPluginViewer
    page.makeValueBinding(mkVar('Focused Plugin Edit Sink'), viewer.mEdit)
    viewer.mEdit.mOnProcessValueChange = function(context, activeMapping, value) {
        focusedViewerEdit = value > 0.5
        focusedPluginDirty = true
    }
    // Cubase's Focus Quick Controls
    const fqc = page.mHostAccess.mFocusedQuickControls
    // Their lock, ROTO's LOCK in QUICK CTRL (applyFocusQcLock). No
    // setTypeToggle: the script writes the state itself.
    fqcLockVar = mkVar('Focus QC Lock')
    page.makeValueBinding(fqcLockVar, fqc.mFocusLockedValue)
    fqcObjects = []
    fqcNames = []
    fqcValues = []
    for (var i=0; i<NUM_CONTROL_PAIRS; i++) {
        const value = fqc.getByIndex(i)
        fqcValues[i] = value
        fqcObjects[i] = ''
        fqcNames[i] = ''
        page.makeValueBinding(mkVar('Focus QC Sink ' + (i + 1)), value)
        value.mOnTitleChange = function(context, activeMapping, objectTitle, valueTitle) {
            const obj = objectTitle || ''
            const name = valueTitle || ''
            if (fqcObjects[this.i] === obj && fqcNames[this.i] === name) return
            fqcObjects[this.i] = obj
            fqcNames[this.i] = name
            fqcChangedMs = Date.now()
            fqcTitleMs = fqcChangedMs
            // QUICK CTRL's labels (applyQuickCtrl)
            quickCtrlDirty = true
        }.bind({ i: i })
    }
}

function schedulePluginScan(delayMs) {
    const due = Date.now() + delayMs
    // A pending scan isn't pushed back, so a steady stream still scans
    if (pluginScanDueMs === 0 || due < pluginScanDueMs) pluginScanDueMs = due
}

// A channel strip module swapped in Cubase (Tube Compressor -> Standard
// Compressor) replaces the slot's module object, and DirectAccess reports
// nothing: no mOnObjectChange, no slot parameter change (capture 2026-11-10:
// the mapped parameters read -1 and the list was never re-read). So the
// listed slots are checked for the objects the list has, every
// SLOT_CHECK_MS, and a mismatch re-reads the list. The selected plugin's
// slot is kept, so its new module is selected (pluginReplacedSlot).
// The strip slots the list doesn't show are checked too (plugins.stripKey):
// a module switched on, or put in a slot, isn't always reported either
// (capture 2026-11-12: Tube Compressor and the EQ switched on in HALion
// Sonic 02's strip only reached ROTO when its track was picked again).
const SLOT_CHECK_MS = 300
var slotCheckMs = 0
var pluginReplacedSlot = -1         // slot ID whose selected plugin was replaced; -1 = none

function checkSlotObjects(mapping) {
    const now = Date.now()
    if (now - slotCheckMs < SLOT_CHECK_MS) return
    slotCheckMs = now
    try {
        for (var i=0; i<pluginList.length; i++) {
            const p = pluginList[i]
            if (p.slotID === p.objectID) continue       // (the pre-filter: its own slot)
            // (Through the whole mixer: object IDs are global, and the list
            // can be a track picked on ROTO that Cubase hasn't selected yet)
            const held = (mixerAccess.getNumberOfChildObjects(mapping, p.slotID) > 0) ?
                         mixerAccess.getChildObjectID(mapping, p.slotID, 0) : -1
            if (held !== p.objectID) {
                utils.log("PLUGIN slot " + p.slotID + " changed: " + p.objectID + " -> " + held + " (\"" + p.name + "\")", utils.LOG_VERBOSE)
                if (p.objectID === pluginSelected) pluginReplacedSlot = p.slotID
                schedulePluginScan(0)
                return
            }
        }
        if (pluginList.stripKey !== undefined) {
            const key = plugins.stripSignature(mixerAccess, mapping, pluginList.stripSlots)
            if (key !== pluginList.stripKey) {
                utils.log("PLUGIN strip changed: " + pluginList.stripKey + " -> " + key, utils.LOG_VERBOSE)
                pluginList.stripKey = key           // (one re-read per change)
                schedulePluginScan(0)
            }
        }
    }
    catch (e) {
        utils.log("PLUGIN slot check error: " + e, utils.LOG_VERBOSE)
    }
}

function pluginIndexOf(objectID) {
    for (var i=0; i<pluginList.length; i++) {
        if (pluginList[i].objectID === objectID) return i
    }
    return -1
}

// Debug: when Cubase really runs the PLUGIN callbacks (log lines are only
// flushed on idle, so their capture times don't show it). Each idle tick logs
// how many arrived since the last one, and over how long. Automation written
// from ROTO and played back to it was steppy at ~100 ms (2026-10-22): this
// shows whether the callbacks themselves come in ~100 ms batches.
var callbackTimes = { knobIn: [], paramChange: [] }
var callbackValues = { knobIn: [], paramChange: [] }
var lastIdleMs = 0

function noteCallback(kind, label) {
    callbackTimes[kind].push(Date.now())
    callbackValues[kind].push(label)
}

function logCallbackTimes() {
    const now = Date.now()
    for (var kind in callbackTimes) {
        const times = callbackTimes[kind]
        if (times.length === 0) continue
        const gaps = []
        for (var i=1; i<times.length; i++) gaps.push(times[i] - times[i - 1])
        utils.log("TIMING " + kind + " n=" + times.length + " span=" + (times[times.length - 1] - times[0]) +
                  "ms gaps=" + gaps.join(",") + " idle=" + (now - lastIdleMs) + "ms", utils.LOG_VERBOSE)
        utils.log("TIMING " + kind + " values " + callbackValues[kind].join(" "), utils.LOG_VERBOSE)
        callbackTimes[kind] = []
        callbackValues[kind] = []
    }
    lastIdleMs = now
}

// From the page's mOnIdle (DirectAccess needs its activeMapping).
function pluginIdle(context, mapping) {
    logCallbackTimes()
    pluginMapping = mapping
    // The probe activated its DirectAccess objects before it saw any
    // parameter changes; the driver's did no LEARN until they were too
    // (capture 2026-10-21 19:34: no LEARN_PARAM while learning).
    if (!pluginAccessActivated) {
        pluginAccessActivated = true
        pluginAccess.activate(mapping)
        mixerAccess.activate(mapping)
        focusedPluginAccess.activate(mapping)
        for (var b=0; b<NUM_BANKS; b++) {
            for (var i=0; i<NUM_CONTROL_PAIRS; i++) pluginSlotAccess[b][i].activate(mapping)
        }
        utils.log("PLUGIN DirectAccess activated", utils.LOG_VERBOSE)
    }
    // QUICK CTRL's haptics: the Focus Quick Controls' parameters
    if (quickCtrlActive() && !QC_HAPTICS_DATABASE) readQuickCtrlRefs(mapping)
    if (!pluginListActive()) {
        // (Focus follow: only windows focused while in PLUGIN or QUICK CTRL,
        // so mode entry picks what it always has)
        fqcChangedMs = 0
        return
    }
    if (pluginLearnOffUntilMs !== 0 && Date.now() >= pluginLearnOffUntilMs) {
        endLearnOffHold()
    }
    // Locked (or learning) with another track selected: nothing here is about
    // the held track. Changes are caught up on unlock (setPluginsLock) or
    // LEARN off (setPluginLearn).
    const heldBase = pluginHeldBase()
    const onLockedTrack = pluginFollowing() || (selectedChannelId === pluginHeldTrackID() && pluginAwaitUntilMs === 0 &&
                                                (heldBase < 0 || pluginAccess.getBaseObjectID(mapping) === heldBase))
    if (pluginEnableQueue.length > 0) {
        const queue = pluginEnableQueue
        pluginEnableQueue = []
        // Away from the held track, through the whole mixer (object IDs are
        // global): the list is still the held track's
        const da = onLockedTrack ? pluginAccess : mixerAccess
        for (var i=0; i<queue.length; i++) applyPluginEnable(da, mapping, queue[i].index, queue[i].enable)
    }
    if (focusedPluginDirty) {
        focusedPluginDirty = false
        // (Not in QUICK CTRL: its Quick Controls stay on the SEL pick)
        if (pluginFollowing() && pluginModeActive()) readFocusedPlugin(mapping)
    }
    if (fqcChangedMs !== 0) {
        followFocusedQuickControls(context, mapping)
    }
    if (PROBE_QC_TITLES && !utils.RELEASE) probeQcTitles(mapping)
    if (qcDump && qcDump.running()) {
        qcDump.idle(mixerAccess, mapping, function() {
            return { objects: fqcObjects, names: fqcNames, changedMs: fqcTitleMs }
        })
    }
    if (onLockedTrack && pluginScanDueMs === 0 && !selectionDirty && pluginEarlyTrackID === "" && pluginAwaitUntilMs === 0) {
        checkSlotObjects(mapping)
    }
    // (Not with a selection change pending: ROTO gets the track first, which
    // makes it drop its plugin, then the list. Resolved here rather than
    // waiting for the device's idle tick: a mode change's rebind marks the
    // selection dirty, which held the list back ~220 ms, capture 2026-10-23
    // 15:33)
    if (pluginEarlyPick !== null) {
        readEarlyPick(context, mapping)
    }
    if (selectionDirty && pluginScanDueMs !== 0 && !bankSendsHeld()) resolveSelectedTrack(context)
    // DEBUG (2026-11-05, QUICK CTRL's list didn't follow inserts added in
    // Cubase): object changes reported, and scans held back
    if (objChangeCount > 0) {
        utils.log("PLUGIN objchange x" + objChangeCount, utils.LOG_VERBOSE)
        objChangeCount = 0
    }
    if (pluginScanDueMs !== 0 && Date.now() >= pluginScanDueMs) {
        const held = !onLockedTrack ? "not on the held track" : selectionDirty ? "selection dirty" :
                     pluginEarlyTrackID !== "" ? "early pick " + pluginEarlyTrackID : ""
        if (held !== scanHeldLogged) {
            scanHeldLogged = held
            if (held) utils.log("PLUGIN scan held: " + held, utils.LOG_VERBOSE)
        }
    }
    // (Not while ROTO has a picked track's list that Cubase hasn't selected yet)
    if (pluginScanDueMs !== 0 && Date.now() >= pluginScanDueMs && onLockedTrack && !selectionDirty &&
        pluginEarlyTrackID === "") {
        pluginScanDueMs = 0
        refreshPluginList(context, mapping)
    }
    if (pluginMappedQueue.length > 0) {
        resolveMappedControls(context, mapping)
    }
    if (defaultMapPending && pluginModeActive()) {
        defaultMapPending = false
        sendDefaultMap(context, mapping)
    }
    if (learnOffMarked) {
        // LEARN off's reload is resolved against the learnt plugin: catch up
        learnOffMarked = false
        endLearnOffHold()
    }
    // (After ROTO's reload of the picked plugin is answered: opening a window
    // holds Cubase up ~115 ms, which held the knob names back, capture
    // 2026-10-23 15:33)
    if (pluginEditorQueued >= 0 && !pluginEditorAwaitMarker && pluginMappedQueue.length === 0) {
        const picked = pluginList[pluginEditorQueued]
        pluginEditorQueued = -1
        openPluginEditor(context, mapping, picked, onLockedTrack)
    }
    if (pluginEditorCloseQueued) {
        pluginEditorCloseQueued = false
        closeOpenedPluginEditor(context, mapping)
    }
    if (pluginSubscribe && onLockedTrack) {
        subscribeNextParams(mapping)
    }
    if (learnSnapshot && pluginLearning && onLockedTrack) {
        pollLearnParams(context, mapping)
    }
    if (pendingLearn && pluginLearning) {
        flushPendingLearn(context, mapping)
    }
    if (pluginFeedbackDirty) {
        sendPendingFeedback(context, mapping)
    }
    pollMappedParams(context, mapping)
}

// ROTO's plugin ON/OFF screen. The slot parameter change this makes would
// re-send the list, so the list ROTO has is updated to match first.
function applyPluginEnable(da, mapping, index, enable) {
    const p = pluginList[index]
    if (p === undefined) return
    if (quickCtrlActive() && isQcTrackEntry(p)) {
        // QUICK CTRL's track entry: nothing to switch; undo ROTO's change
        pluginListKey = null
        schedulePluginScan(0)
        return
    }
    var done = false
    try {
        done = plugins.setEnabled(da, mapping, p, enable)
    }
    catch (e) {
        // (A locked plugin deleted on another track: its object is gone)
        utils.log("PLUGIN " + p.name + " on/off failed: " + e, utils.LOG_VERBOSE)
    }
    if (done) {
        p.enabled = enable
        pluginListKey = shownPluginListKey()
    }
    else {
        // Can't (the instrument): ROTO set it locally, so send the list back
        // (on the held track; scans wait for it)
        utils.log("PLUGIN " + p.name + " can't be switched on/off", utils.LOG_VERBOSE)
        pluginListKey = null
        schedulePluginScan(0)
    }
}

function setPluginEnable(indexOnPage, enable) {
    if (!pluginListActive()) return
    pluginEnableQueue.push({ index: pluginFirst + indexOnPage, enable: enable })
}

// ROTO follows the selected track and the plugin window in focus, except
// while LOCK or LEARN holds it on a plugin (as the Ableton script: no device
// changes while learning).
function pluginFollowing() {
    return !pluginLocked && !pluginLearnHeld()
}

// After LEARN off: catch up with a track or plugin window picked while learning
function endLearnOffHold() {
    pluginLearnOffUntilMs = 0
    selectionDirty = true
    focusedPluginDirty = true
}

// LEARN, and LEARN_OFF_HOLD_MS after it: ROTO reloads the learnt plugin on
// LEARN off (CONTROL_MAPPED ~170 ms later), and that must resolve against the
// plugin ROTO shows, not one caught up with since (capture 2026-10-22 14:09).
function pluginLearnHeld() {
    return pluginLearning || pluginLearnOffUntilMs !== 0
}

// The track the held plugin is on.
function pluginHeldTrackID() {
    return pluginLocked ? pluginLockedTrackID : pluginLearnTrackID
}

// Its channel object: the selected-track DirectAccess has to be back on it
// before the held track's list is read again (capture 2026-10-22 14:28: back
// on the locked track, Cubase hadn't moved it yet, and the other track's list
// went out as the locked one's). -1 = unknown, not checked.
function pluginHeldBase() {
    return pluginLocked ? pluginLockedBase : pluginLearnBase
}

function currentPluginBase() {
    return pluginMapping ? pluginAccess.getBaseObjectID(pluginMapping) : -1
}

// ROTO's LOCK in QUICK CTRL locks Cubase's Focus Quick Controls (user request
// 2026-11-06, as MiniLab mk2's encoder push): a manual override, so the knobs
// stay on the plugin whatever gets focus. Only a lock the script set is
// released (leaving QUICK CTRL, or LOCK off): one switched on in Cubase is
// left alone.
// (No initialiser: makeFocusFollow sets it at load, before this line runs)
var fqcLockVar
var fqcLockOurs = false

function applyFocusQcLock(context) {
    if (!fqcLockVar) return
    const want = pluginLocked && quickCtrlActive()
    if (want === fqcLockOurs) return
    fqcLockOurs = want
    fqcLockVar.setProcessValue(context, want ? 1 : 0)
    utils.log("QUICK CTRL focus lock " + (want ? "on" : "off"), utils.LOG_VERBOSE)
}

function setPluginsLock(locked) {
    pluginLocked = locked
    pluginLockedTrackID = selectedChannelId
    pluginLockedBase = locked ? currentPluginBase() : -1
    if (!locked && pluginModeActive()) {
        // Catch up with the current track: its list and selection
        pluginListKey = null
        pluginSelectSent = -1
        pluginTrackID = selectedChannelId
        pluginTrackBase = -1
        pluginAwaitUntilMs = 0
        schedulePluginScan(0)
    }
}

// Opening a plugin's window in Cubase selects it on ROTO.
function readFocusedPlugin(mapping) {
    const slot = focusedPluginAccess.getBaseObjectID(mapping)
    var id = -1
    // (Only with its window open: with none of the track's windows focused the
    // viewer sits on slot 1, capture 2026-11-04 11:46)
    if (slot >= 0 && focusedViewerEdit && focusedPluginAccess.getNumberOfChildObjects(mapping, slot) > 0) {
        id = focusedPluginAccess.getChildObjectID(mapping, slot, 0)
    }
    // Only a window focused on the same track selects its plugin. The viewer
    // follows the selected track too, so a track change moves it to the new
    // track's open window, which would override the same-plugin rule (and,
    // after an early pick, reload a second plugin: capture 2026-10-23 15:46).
    // So the first report after a track change (or during a ROTO pick) is
    // only recorded.
    const trackChange = focusAfterTrackChange || pluginEarlyTrackID !== ""
    if (pluginEarlyTrackID === "") focusAfterTrackChange = false
    if (id === focusedPluginID) return
    focusedPluginID = id
    if (trackChange) return
    if (id >= 0 && id !== pluginSelected) {
        pluginSelected = id
        pluginSelectedExtra = -1
        schedulePluginScan(0)
    }
}

function sameNames(a, b) {
    for (var i=0; i<NUM_CONTROL_PAIRS; i++) {
        if ((a[i] || '') !== (b[i] || '')) return false
    }
    return true
}

function isWindowPlugin(p) {
    return p.kind === 'insert' || p.kind === 'instrument'
}

// Focus follow (see FOCUS_FOLLOW): the Focus Quick Controls changed. What
// they show, if it's in ROTO's list, becomes its selected entry
// (focusedListEntry).
function followFocusedQuickControls(context, mapping) {
    if (!FOCUS_FOLLOW) {
        fqcChangedMs = 0
        return
    }
    const now = Date.now()
    if (now - fqcChangedMs < FOCUS_SETTLE_MS || now - selectionChangedMs < FOCUS_SELECTION_SETTLE_MS) return
    // Held on a plugin (LOCK, LEARN), or a track change or a ROTO pick's
    // window under way: later
    if (!pluginFollowing() || selectionDirty || pluginEarlyTrackID !== "" || pluginEarlyPick !== null ||
        pluginAwaitUntilMs !== 0 || pluginEditorQueued >= 0 || pluginEditorCloseQueued) return
    // A ROTO pick: not until the Focus Quick Controls show it (PICK_FOCUS_HOLD_MS)
    if (pickFocusUntilMs !== 0) {
        if (now < pickFocusUntilMs && !focusShows(pluginList[pluginIndexOf(pluginSelected)])) return
        pickFocusUntilMs = 0
    }
    fqcChangedMs = 0
    const p = focusedListEntry()
    if (p === null || p.objectID === pluginSelected) return
    utils.log("FOCUS follow \"" + p.name + "\"", utils.LOG_VERBOSE)
    pluginSelected = p.objectID
    pluginSelectedExtra = p.extraID
    pluginSelectedHash = p.hash.join('.')
    pluginSelectedName = p.name
    schedulePluginScan(0)
}

// PROBE_QC_TITLES: the Focus Quick Controls' titles next to the plugin's own
// parameter titles, once per plugin, after they've settled
function probeQcTitles(mapping) {
    if (fqcTitleMs === 0 || Date.now() - fqcTitleMs < 300) return
    const p = focusedListEntry()
    if (p === null || isQcTrackEntry(p) || qcTitleProbed[p.name]) return
    qcTitleProbed[p.name] = true
    const qcs = []
    for (var i=0; i<NUM_CONTROL_PAIRS; i++) qcs.push(fqcObjects[i] + '/' + fqcNames[i])
    utils.log("QCPROBE plugin \"" + p.name + "\" kind=" + p.kind + " qcs: " + qcs.join(' | '), utils.LOG_VERBOSE)
    try {
        const id = p.objectID
        const n = mixerAccess.getNumberOfParameters(mapping, id)
        for (var k=0; k<n; k++) {
            const tag = mixerAccess.getParameterTagByIndex(mapping, id, k)
            if (!mixerAccess.isParameterAutomatable(mapping, id, tag)) continue
            const titles = []
            for (var j=0; j<QC_PROBE_TITLE_LENGTHS.length; j++) {
                const t = mixerAccess.getParameterTitle(mapping, id, tag, QC_PROBE_TITLE_LENGTHS[j])
                if (titles.indexOf(t) < 0) titles.push(t)
            }
            utils.log("QCPROBE  p" + k + " tag=" + tag + " " + titles.map(function(t) { return '"' + t + '"' }).join(' '), utils.LOG_VERBOSE)
        }
    }
    catch (e) {
        utils.log("QCPROBE failed: " + e, utils.LOG_VERBOSE)
    }
}

// The entry of ROTO's list the Focus Quick Controls show: a plugin window's
// own Quick Controls, that plugin if it's on the selected track; the track's
// own (the project window focused), in QUICK CTRL its track entry, in PLUGIN
// none (ROTO keeps the last plugin). null = none of the list's.
// (The track's Quick Controls can be the same as a plugin's own, e.g. an
// instrument track's defaults: then they count as the track's.)
function focusedListEntry() {
    if (sameNames(fqcNames, quickCtrlNames)) {
        if (!quickCtrlActive()) return null
        const t = qcTrackEntryIndex()
        return (t >= 0) ? pluginList[t] : null
    }
    var name = ''
    for (var i=0; i<NUM_CONTROL_PAIRS && name === ''; i++) {
        if (fqcNames[i] !== '') name = fqcObjects[i]
    }
    return (name === '') ? null : focusedPluginOnSelectedTrack(name)
}

// The focused plugin among the selected track's; the same plugin twice: the
// window in focus (the insert viewer), then the selected one. null if it
// isn't on this track.
function focusedPluginOnSelectedTrack(name) {
    const matches = pluginList.filter(function(p) { return isWindowPlugin(p) && p.name === name })
    if (matches.length === 0) return null
    for (var i=0; i<matches.length; i++) {
        if (matches[i].objectID === focusedPluginID) return matches[i]
    }
    for (var j=0; j<matches.length; j++) {
        if (matches[j].objectID === pluginSelected) return matches[j]
    }
    return matches[0]
}

// The selected track changed (or was renamed), and ROTO cleared its selected
// plugin: send the whole list and selection again.
// keepList: ROTO already has the new track's list (pluginEarlyPick). It's
// still re-read once DirectAccess moves, and only sent if it changed.
function pluginTrackSelected(keepList) {
    // Locked: ROTO stays on the locked plugin (the firmware ignores lists for
    // other tracks too). Unlocking catches up.
    if (!pluginFollowing()) return
    if (!keepList) {
        pluginListKey = null
        pluginSelectSent = -1
    }
    if (selectedChannelId !== pluginTrackID && pluginTrackBase !== -1 && pluginMapping) {
        // A new track: unless DirectAccess has moved already, wait for it
        const base = pluginAccess.getBaseObjectID(pluginMapping)
        if (base === pluginTrackBase) {
            pluginAwaitUntilMs = Date.now() + PLUGIN_TRACK_WAIT_MS
        }
        else {
            pluginTrackBase = base
        }
    }
    pluginTrackID = selectedChannelId
    focusAfterTrackChange = true
    // QUICK CTRL: ROTO dropped its plugin; its labels wait for the select
    if (quickCtrlActive()) holdQuickCtrlLabels(true)
    schedulePluginScan(0)
}

var treeLoggedBase = -1  // DEBUG: the channel last logged (again once another is scanned)

// DEBUG: an object and its children as "TREE" lines (type, title, unique
// name, parameter count), depth levels down.
function logObjectTree(da, mapping, id, level, depth) {
    var pad = ''
    for (var k=0; k<level; k++) pad += '  '
    const n = da.getNumberOfChildObjects(mapping, id)
    utils.log("TREE " + pad + id + " type=\"" + da.getObjectTypeName(mapping, id) +
              "\" title=\"" + da.getObjectTitle(mapping, id) +
              "\" uname=\"" + da.getObjectUniqueName(mapping, id) +
              "\" params=" + da.getNumberOfParameters(mapping, id) + " children=" + n, utils.LOG_VERBOSE)
    // A MIDI track's channel: which parameter (if any) names its output, the
    // rack instrument (capture 2026-11-12: "MidiChannel", 89 parameters)
    if (level === 0) {
        const np = da.getNumberOfParameters(mapping, id)
        for (var p=0; p<np; p++) {
            const tag = da.getParameterTagByIndex(mapping, id, p)
            utils.log("TREE param " + p + " tag=" + tag + " \"" + da.getParameterTitle(mapping, id, tag, 64) +
                      "\" = \"" + da.getParameterDisplayValue(mapping, id, tag) + "\" (" +
                      da.getParameterProcessValue(mapping, id, tag) + ")", utils.LOG_VERBOSE)
        }
    }
    if (level >= depth) return
    for (var c=0; c<n; c++) logObjectTree(da, mapping, da.getChildObjectID(mapping, id, c), level + 1, depth)
}

function refreshPluginList(context, mapping) {
    const base = pluginAccess.getBaseObjectID(mapping)
    if (pluginAwaitUntilMs !== 0) {
        if (base === pluginTrackBase && Date.now() < pluginAwaitUntilMs) {
            // Still the old track; mOnObjectChange re-schedules (or time out)
            schedulePluginScan(PLUGIN_SCAN_MS)
            return
        }
        pluginAwaitUntilMs = 0
        pluginTrackBase = base
    }
    if (pluginTrackBase === -1) pluginTrackBase = base
    if (DEBUG_PREFILTER_DUMP) dumpPreFilter(mapping)
    const list = plugins.scan(pluginAccess, mapping)
    utils.log("PLUGIN scan base=" + base + " " + list.length + " entries" +
              (pluginAwaitUntilMs !== 0 ? " (awaiting the track)" : ""), utils.LOG_VERBOSE)
    // DEBUG (2026-11-12): a rack instrument's channel ("Diva 01") scanned 0
    // entries; log its object tree to see what it holds. Remove once known.
    // (Also with no instrument: the instrument track "Diva" listed only its
    // EQ. Audio tracks log too; debug only.)
    var hasInstrument = false
    for (var t=0; t<list.length; t++) if (list[t].kind === 'instrument') hasInstrument = true
    if (hasInstrument) treeLoggedBase = -1
    else if (utils.VERBOSE && base >= 0 && base !== treeLoggedBase) {
        treeLoggedBase = base
        logObjectTree(pluginAccess, mapping, base, 0, 3)
        // Where's the VST Instruments rack? (A rack channel, type "Synth",
        // has no instrument slot; a MIDI track's Output names the rack slot,
        // "05. Diva - Midi In".) The whole mixer's top level, with each TREE.
        if (mixerAccess) {
            const root = mixerAccess.getBaseObjectID(mapping)
            const nc = mixerAccess.getNumberOfChildObjects(mapping, root)
            utils.log("MIXTREE root=" + root + " type=\"" + mixerAccess.getObjectTypeName(mapping, root) +
                      "\" title=\"" + mixerAccess.getObjectTitle(mapping, root) + "\" children=" + nc, utils.LOG_VERBOSE)
            for (var mc=0; mc<nc; mc++) {
                const ch = mixerAccess.getChildObjectID(mapping, root, mc)
                const chType = mixerAccess.getObjectTypeName(mapping, ch)
                utils.log("MIXTREE " + ch + " type=\"" + chType + "\" title=\"" + mixerAccess.getObjectTitle(mapping, ch) +
                          "\" uname=\"" + mixerAccess.getObjectUniqueName(mapping, ch) + "\" children=" +
                          mixerAccess.getNumberOfChildObjects(mapping, ch), utils.LOG_VERBOSE)
                // (Rack channels: their direct children, for a plugin)
                if (chType === 'Synth') {
                    const nk = mixerAccess.getNumberOfChildObjects(mapping, ch)
                    for (var k=0; k<nk; k++) {
                        const kid = mixerAccess.getChildObjectID(mapping, ch, k)
                        utils.log("MIXTREE   " + kid + " type=\"" + mixerAccess.getObjectTypeName(mapping, kid) +
                                  "\" title=\"" + mixerAccess.getObjectTitle(mapping, kid) + "\"", utils.LOG_VERBOSE)
                    }
                }
            }
        }
    }
    applyPluginList(context, list)
}

// A track picked on ROTO: its list, from its bank slot's DirectAccess.
// fromMidi: run from a MIDI callback (withMapping), which falls back to the
// idle tick if DirectAccess throws there.
function readEarlyPick(context, mapping, fromMidi) {
    const pick = pluginEarlyPick
    pluginEarlyPick = null
    // (A ROTO pick Cubase has selected already: as usual. Selected in Cubase
    // (pick.cubase): read through the slot all the same)
    if (!pick.cubase && pick.id === selectedChannelId) return
    var list = null
    try {
        const da = pluginSlotAccess[pick.bank][pick.slot]
        const base = da.getBaseObjectID(mapping)
        // (Only if it's on that track: it could lag a bank page, as the
        // selected-track one lags a selection)
        const ch = bankChannels[pick.bank][pick.slot]
        if (base >= 0 && ch !== undefined && da.getObjectTitle(mapping, base) === ch.name) list = plugins.scan(da, mapping)
    }
    catch (e) {
        if (fromMidi) throw e
        utils.log("PLUGIN early pick failed: " + e, utils.LOG_VERBOSE)
    }
    if (list === null) return                       // (then as before: once Cubase selects it)
    utils.log("PLUGIN early pick slot " + pick.slot + (pick.cubase ? " (selected in Cubase)" : ""), utils.LOG_VERBOSE)
    // (Selected in Cubase: ROTO has been told; the selected-track
    // DirectAccess's re-read waits for it to move, as usual)
    // (Selected in Cubase: pluginTrackSelected has already forgotten the
    // list ROTO had, and a scan may have sent this one since: deduped)
    if (!pick.cubase) {
        pluginEarlyTrackID = pick.id
        pluginListKey = null
        pluginSelectSent = -1
    }
    applyPluginList(context, list)
}

// A track's plugins: keep or pick the selection, and send what ROTO lacks.
function applyPluginList(context, list) {
    pluginList = listForMode(list)

    // Keep the selection if its plugin is still there; else the same plugin
    // (class) on this track, as ROTO does in other DAWs; else the plugin whose
    // window has focus, else the first. A new selection brings its page.
    var sel = pluginIndexOf(pluginSelected)
    const reselect = (sel < 0 || sel !== pluginSelectSent)
    // (QUICK CTRL: not the same plugin on a new track; the knobs show what
    // has focus)
    const samePlugin = !quickCtrlActive()
    // (A module swapped in the selected plugin's slot: the new module, even
    // with another instance of the old one on the track)
    const replacedSlot = pluginReplacedSlot
    pluginReplacedSlot = -1
    if (sel < 0 && samePlugin && replacedSlot >= 0) {
        for (var i=0; i<pluginList.length; i++) {
            if (pluginList[i].slotID === replacedSlot) { sel = i; break }
        }
    }
    if (sel < 0 && samePlugin && pluginSelectedHash) {
        for (var i=0; i<pluginList.length; i++) {
            if (pluginList[i].hash.join('.') === pluginSelectedHash) { sel = i; break }
        }
    }
    // (Then by name: a plugin whose variants have separate class IDs)
    if (sel < 0 && samePlugin && pluginSelectedName) {
        for (var i=0; i<pluginList.length; i++) {
            if (pluginList[i].name === pluginSelectedName) { sel = i; break }
        }
    }
    if (quickCtrlActive()) {
        // QUICK CTRL: what the Focus Quick Controls show (not just after a
        // selection: the track's own Quick Controls' titles may not have
        // caught up, and the track entry is likely), else the track entry
        if (sel < 0 && Date.now() - selectionChangedMs >= FOCUS_SELECTION_SETTLE_MS) {
            sel = pluginList.indexOf(focusedListEntry())
        }
        if (sel < 0) sel = qcTrackEntryIndex()
    }
    else {
        if (sel < 0) sel = pluginIndexOf(focusedPluginID)
        if (sel < 0 && pluginList.length > 0) sel = 0
    }
    pluginSelected = (sel >= 0) ? pluginList[sel].objectID : -1
    pluginSelectedExtra = (sel >= 0) ? pluginList[sel].extraID : -1
    if (sel >= 0) {
        pluginSelectedHash = pluginList[sel].hash.join('.')
        pluginSelectedName = pluginList[sel].name
    }
    if (reselect && sel >= 0) {
        pluginFirst = Math.floor(sel / NUM_PLUGINS_PER_PAGE) * NUM_PLUGINS_PER_PAGE
    }
    if (pluginFirst >= pluginList.length) {
        pluginFirst = Math.max(0, Math.floor((pluginList.length - 1) / NUM_PLUGINS_PER_PAGE) * NUM_PLUGINS_PER_PAGE)
    }

    const key = shownPluginListKey()
    if (key !== pluginListKey) {
        // ROTO only reloads the selected plugin's mappings on a select, so
        // re-send it when the plugins changed (not for a page change, or a
        // plugin switched on/off)
        const identity = plugins.identityKey(pluginList)
        if (pluginListKey === null || identity !== pluginIdentityKey) {
            pluginSelectSent = -1
        }
        pluginIdentityKey = identity
        pluginListKey = key
        sendPluginList(context)
    }
    if (sel >= 0 && sel !== pluginSelectSent) {
        pluginSelectSent = sel
        pluginSelectPage = pluginFirst
        utils.log("PLUGIN select " + sel + " \"" + pluginList[sel].name + "\"", utils.LOG_VERBOSE)
        if (pluginModeActive()) {
            // ROTO reloads the plugin and sends its CONTROL_MAPPED again
            clearPluginMappings()
            learnReadParams()
        }
        // (QUICK CTRL: ROTO keeps its labels on the select. It handles it
        // only after it has drawn a track pick, ~250-500 ms later, and
        // clearing them then wiped labels sent since: capture 2026-10-27.
        // A track change or a ROTO pick clears them, before this.)
        midi.sendDawSelectPlugin(config, context, sel)
        if (quickCtrlActive()) holdQuickCtrlKnobs(QUICK_CTRL_SELECT_KNOBS_MS)
    }
    if (quickCtrlActive()) {
        // Labelled now the select has gone out. (A track picked on ROTO that
        // Cubase hasn't selected yet: the Quick Controls are still the old
        // track's, so the labels wait for the selection, resolveSelectedTrack)
        if (quickCtrlAwaitSelect || pluginEarlyTrackID !== "") holdQuickCtrlLabels(pluginEarlyTrackID !== "")
        if (quickCtrlDirty && !quickCtrlLabelsHeld()) applyQuickCtrl(context)
    }
}

// Debug: where is the channel's pre-filter (high/low cut, gain, phase)? The
// channel has an "InputFilter" child that plugins.scan skips. Log its
// parameters, and the channel's own, once per track.
const DEBUG_PREFILTER_DUMP = false
var preFilterDumped = {}

function dumpPreFilter(mapping) {
    const base = pluginAccess.getBaseObjectID(mapping)
    if (base < 0 || preFilterDumped[base]) return
    preFilterDumped[base] = true
    const dump = function(label, id) {
        const n = pluginAccess.getNumberOfParameters(mapping, id)
        utils.log("PREFILTER " + label + " obj=" + id + " type=\"" + pluginAccess.getObjectTypeName(mapping, id) +
                  "\" title=\"" + pluginAccess.getObjectTitle(mapping, id) + "\" params=" + n +
                  " children=" + pluginAccess.getNumberOfChildObjects(mapping, id), utils.LOG_VERBOSE)
        for (var i=0; i<Math.min(n, 64); i++) {
            const tag = pluginAccess.getParameterTagByIndex(mapping, id, i)
            utils.log("PREFILTER  p" + i + " tag=" + tag + " \"" + pluginAccess.getParameterTitle(mapping, id, tag, 32) +
                      "\" = \"" + pluginAccess.getParameterDisplayValue(mapping, id, tag) + "\" auto=" +
                      pluginAccess.isParameterAutomatable(mapping, id, tag), utils.LOG_VERBOSE)
        }
    }
    try {
        dump("channel", base)
        const n = pluginAccess.getNumberOfChildObjects(mapping, base)
        for (var c=0; c<n; c++) {
            const child = pluginAccess.getChildObjectID(mapping, base, c)
            const type = pluginAccess.getObjectTypeName(mapping, child)
            if (type === 'InputFilter') dump("input filter", child)
        }
    }
    catch (e) {
        utils.log("PREFILTER dump error: " + e, utils.LOG_BASIC)
    }
}

function sendPluginList(context) {
    utils.log("PLUGINS " + pluginList.map(function(p) { return p.kind + ':' + p.name + (p.type ? ' [' + p.type + ']' : '') }).join(', '), utils.LOG_VERBOSE)
    midi.sendNumPlugins(config, context, pluginList.length)
    midi.sendFirstPlugin(config, context, pluginFirst)
    const last = Math.min(pluginList.length, pluginFirst + NUM_PLUGINS_PER_PAGE)
    for (var i=pluginFirst; i<last; i++) {
        const p = shownPlugin(pluginList[i])
        midi.sendPluginDetails(config, context, i, p.hash, p.enabled, p.name)
    }
    midi.sendPluginDetailsEnd(config, context)
}

// ROTO picked a plugin on its page. The firmware selects and loads it itself,
// so this only records it (no DAW_SELECT_PLUGIN echo). Its mapped controls
// follow as CONTROL_MAPPED. QUICK CTRL: its Quick Controls (ROTO blanked the
// labels).
function rotoSelectPlugin(context, indexOnPage) {
    if (!pluginListActive()) return
    const index = pluginFirst + indexOnPage
    if (index >= pluginList.length) return
    const shown = pluginList[pluginIndexOf(pluginSelected)]
    pluginSelected = pluginList[index].objectID
    pluginSelectedExtra = pluginList[index].extraID
    pluginSelectedHash = pluginList[index].hash.join('.')
    pluginSelectedName = pluginList[index].name
    pluginSelectSent = index
    pluginSelectPage = pluginFirst
    pickFocusUntilMs = Date.now() + PICK_FOCUS_HOLD_MS
    if (quickCtrlActive()) {
        // ROTO keeps the old labels (2026-11-05: clearing them blanked all 8
        // screens on each pick), and only those that differ are sent. The
        // Focus Quick Controls follow the plugin once its window has focus:
        // open it (the track entry: close the window ROTO opened), and hold
        // the labels until they move.
        const p = pluginList[index]
        if (!focusShows(p)) {
            quickCtrlFocusWaitFromMs = Date.now()
            quickCtrlFocusWaitUntilMs = quickCtrlFocusWaitFromMs + QUICK_CTRL_FOCUS_WAIT_MS
        }
        if (isQcTrackEntry(p)) {
            pluginEditorCloseQueued = true
            // (And the window of the plugin shown, whoever opened it: while it
            // has focus, the Focus Quick Controls stay its. Capture 2026-11-05:
            // MultibandCompressor's window, open before its pick, stayed, and
            // its labels and knobs with it)
            pluginEditorCloseShown = (shown !== undefined && shown !== p && isWindowPlugin(shown)) ? shown : null
        }
        else {
            pluginEditorQueued = index
            pluginEditorAwaitMarker = false
        }
        // Now, from ROTO's message, rather than on the page's next idle tick
        // (+50..195 ms in capture 2026-11-05 15:42): the labels and knobs only
        // follow once the window has focus, so everything after waits for it.
        // (QUICK CTRL has no reload to answer first.) Locked: the idle tick.
        if (pluginFollowing()) {
            withMapping('qc pick', function(m) {
                if (pluginEditorQueued >= 0) {
                    pluginEditorQueued = -1
                    openPluginEditor(context, m, p, true)
                }
                if (pluginEditorCloseQueued) {
                    pluginEditorCloseQueued = false
                    closeOpenedPluginEditor(context, m)
                }
            })
        }
        return
    }
    clearPluginMappings()
    learnReadParams()
    if (PLUGIN_OPEN_EDITOR) {
        pluginEditorQueued = index
        // With the firmware's end-of-burst marker, open it once the reload is in
        pluginEditorAwaitMarker = mappedEndSeen
    }
}

// A plugin picked on ROTO opens its window (as picking a device in Live shows
// it; user request 2026-10-23), in PLUGIN and QUICK CTRL (2026-11-04: the
// Focus Quick Controls then follow it). A window already open is closed and
// opened again, to bring it to the front (user request 2026-11-04: there is
// no maximise in the API). The window the script opened for the previous
// pick is closed, after the new one opens (ROTO follows the focused window,
// which then stays on the new one); windows opened in Cubase are left alone.
const PLUGIN_OPEN_EDITOR = true
var pluginEditorQueued = -1         // list index picked: open its window on the next idle
var pluginEditorAwaitMarker = false // ...after ROTO's CONTROL_MAPPED_END for it
var pluginEditorOpened = -1         // the slot whose window the script opened; -1 = none
var pluginEditorCloseQueued = false // QUICK CTRL's track entry picked: close it on the next idle
var pluginEditorCloseShown = null   // ...and the window of the plugin it was showing (list entry)
var pluginEditInstrument            // the selected track's instrument window (mEdit)
var pluginEditChannel               // the selected track's channel settings window (mEditorOpen)

// From the page's mOnIdle. Inserts through their slot's "Edit" parameter, on
// any track (whole-mixer DirectAccess). The instrument slot and the pre-filter
// have none: the selected track's instrument window, or its channel settings
// (which show the pre-filter), if it is the held track. A channel strip module
// opens the channel settings too, where the whole strip shows (user request
// 2026-10-28), rather than its own editor; on another track (locked), only
// its own editor can open, through its slot's "Edit".
// QUICK CTRL's track entry: the window ROTO opened for the last pick closes
// (the Focus Quick Controls then follow the next window, or the track).
function closeOpenedPluginEditor(context, mapping) {
    const shown = pluginEditorCloseShown
    pluginEditorCloseShown = null
    if (shown !== null && shown.slotID !== pluginEditorOpened) {
        try {
            if (shown.kind === 'instrument') {
                // (No Edit parameter: the selected track's instrument window)
                if (pluginEditInstrument.getProcessValue(context) > 0.5) pluginEditInstrument.setProcessValue(context, 0)
            }
            else {
                plugins.closeEditor(mixerAccess, mapping, shown.slotID)
            }
        }
        catch (e) {
            // (its slot is gone)
        }
    }
    if (pluginEditorOpened < 0) return
    try {
        plugins.closeEditor(mixerAccess, mapping, pluginEditorOpened)
    }
    catch (e) {
        // (its slot is gone)
    }
    pluginEditorOpened = -1
}

function openPluginEditor(context, mapping, p, onHeldTrack) {
    if (p === undefined) return
    const previous = pluginEditorOpened
    const channelWindow = (p.kind === 'prefilter' || p.kind === 'strip')
    var opened = -1
    if (!(channelWindow && onHeldTrack)) {
        try {
            opened = plugins.openEditor(mixerAccess, mapping, p.slotID, true)
        }
        catch (e) {
            utils.log("PLUGIN " + p.name + " window failed: " + e, utils.LOG_VERBOSE)
            return
        }
    }
    if (opened === -1 && onHeldTrack) {
        const edit = (p.kind === 'instrument') ? pluginEditInstrument : (channelWindow ? pluginEditChannel : null)
        if (edit !== null) {
            // (Open already: close it first, to bring it to the front)
            if (edit.getProcessValue(context) > 0.5) edit.setProcessValue(context, 0)
            edit.setProcessValue(context, 1)
        }
    }
    utils.log("PLUGIN window " + p.name + (opened === 1 ? " opened" : opened === 0 ? " brought to the front" : " (no Edit)"), utils.LOG_VERBOSE)
    if (previous === p.slotID) return
    pluginEditorOpened = (opened === 1) ? p.slotID : -1
    if (previous >= 0) {
        try {
            plugins.closeEditor(mixerAccess, mapping, previous)
        }
        catch (e) {
            // (its slot is gone)
        }
    }
}

// ROTO paged its plugin list: send that page.
function setFirstPlugin(first) {
    if (!pluginListActive()) return
    pluginFirst = first
    schedulePluginScan(0)
}

//-----------------------------------------------------------------------------
// PLUGIN mode controls: LEARN, mapped knobs/switches and their feedback.
//
// ROTO stores the mappings. On loading a plugin (or a page of its controls,
// or leaving LEARN) it sends CONTROL_MAPPED for each mapped control on the
// page; the script resolves the parameter (plugins.resolveParam), replies
// LEARN_PARAM for knobs (name and position) and routes the control's CC to
// it. ROTO doesn't say which controls are unmapped, so each burst of
// CONTROL_MAPPED replaces the previous set. Unmapped controls are disabled on
// ROTO (no CCs).
//
// Reads and writes go through a DirectAccess on the whole mixer (object IDs
// are global), so a locked plugin on another track works too. Changes are
// only reported for the selected track's objects, so a locked plugin there is
// polled instead (PLUGIN_POLL_MS).
//-----------------------------------------------------------------------------
const CONTROL_KNOB = 0
const CONTROL_SWITCH = 1
const MAPPED_BURST_MS = 150         // CONTROL_MAPPEDs further apart start a new set
const LEARN_REPEAT_MS = 750         // the same parameter again after a pause: learn it again
const OWN_WRITE_TOLERANCE = 0.002   // a reported value this close to our last write is its echo
const PLUGIN_POLL_MS = 100
var mixerAccess                     // DirectAccess on the whole mixer (made at load)
var pluginKnobMap = []              // control -> { objectID, tag, value } or undefined
var pluginSwitchMap = []
var pluginMappedQueue = []          // CONTROL_MAPPEDs to resolve from the page's mOnIdle
var pluginMappedLastMs = 0
var pluginLearning = false
var pluginLearnTrackID = ""         // the track LEARN started on
var pluginLearnBase = -1            // its channel object (DirectAccess base); -1 = unknown
const LEARN_OFF_HOLD_MS = 300
var pluginLearnOffUntilMs = 0       // still held until then after LEARN off; 0 = not
// ROTO marks the end of each CONTROL_MAPPED burst (CONTROL_MAPPED_END, Cubase
// firmware): the controls since the last marker are the page's whole set, and
// LEARN off's hold ends once that set is resolved. No timing (FEATURE_GAPS
// timing #2 and #3). Firmware without it: MAPPED_BURST_MS and LEARN_OFF_HOLD_MS.
var mappedEndSeen = false           // ROTO sends the marker
var mappedSetOpen = false           // CONTROL_MAPPEDs came since the last marker
var learnOffMarked = false          // the marker of LEARN off's reload came: end the hold once resolved
const LEARN_OFF_FALLBACK_MS = 2000  // (marker firmware: only if the marker never comes)
var pluginLearnLastTag = -1
var pluginLearnLastMs = 0
var pluginLastWrite = null          // { objectID, tag, value }: our last write, whose echo isn't learned
var pluginPollMs = 0
var pluginFeedbackDirty = false     // a mapped parameter changed: read and send from pluginIdle
var knobTouched = []
var knobReleasedMs = []             // when each knob was last let go
// QUICK CTRL pops up a knob's value only while it's held, or this long after
// it's let go (the turn's last value): the Focus Quick Controls move with the
// focus and the selection, and their new values all popped up (capture
// 2026-11-04 13:26: ROTO drew 8 popups, ~170 ms, which held its handling of a
// track select back until it wiped the labels sent after it)
const QUICK_CTRL_POPUP_RELEASE_MS = 400

function quickCtrlPopupAllowed(i) {
    return !!knobTouched[i] || (Date.now() - (knobReleasedMs[i] || 0)) < QUICK_CTRL_POPUP_RELEASE_MS
}
var switchShown = []                // switch CC value ROTO has; undefined = unknown
var switchStrShown = []

function clearPluginMappings() {
    pluginKnobMap = []
    pluginSwitchMap = []
    pluginMappedQueue = []
    switchShown = []
    switchStrShown = []
}

function setPluginLearn(on) {
    if (!pluginModeActive()) return
    pluginLearning = on
    pluginLearnLastTag = -1
    pendingLearn = null
    if (on) {
        pluginLearnTrackID = pluginLocked ? pluginLockedTrackID : selectedChannelId
        pluginLearnBase = pluginLocked ? pluginLockedBase : currentPluginBase()
        pluginLearnOffUntilMs = 0
    }
    else {
        // Catch up with a track or plugin window picked while learning, once
        // ROTO has reloaded the learnt plugin (pluginIdle): at its marker, or
        // after LEARN_OFF_HOLD_MS with firmware that doesn't send one
        pluginLearnOffUntilMs = Date.now() + (mappedEndSeen ? LEARN_OFF_FALLBACK_MS : LEARN_OFF_HOLD_MS)
        learnOffMarked = false
    }
    // Leaving LEARN reloads the plugin on ROTO: CONTROL_MAPPED follows
    clearPluginMappings()
    learnReadParams()
}

// While learning, read the selected plugin's parameters so their changes are
// reported (see subscribeParams).
function learnReadParams() {
    pluginSubscribe = null
    learnSnapshot = null
    if (pluginLearning && pluginSelected >= 0) {
        // (Both objects of the strip EQ: its own, then its pre-filter)
        const objects = [pluginSelected]
        if (pluginSelectedExtra >= 0) objects.push(pluginSelectedExtra)
        pluginSubscribe = { objects: objects, k: 0, objectID: pluginSelected, next: 0 }
        learnSnapshot = { mainID: pluginSelected, entries: [] }
    }
}

// LEARN also compares a small plugin's values on each idle tick and takes a
// changed one as moved: Cubase reports no changes of the channel strip EQ
// through DirectAccess (capture 2026-10-22 14:41: only "Show Spectrum" fired
// while its bands were moved). Plugins that do report still learn at once;
// the repeat check stops a second offer. Big plugins (Surge XT: 2855
// parameters) are polled LEARN_POLL_CHUNK a tick, in turn: Diva reported no
// changes at all (capture 2026-11-12).
const LEARN_POLL_MAX = 128
const LEARN_POLL_CHUNK = 300        // parameters per idle tick above LEARN_POLL_MAX
var learnSnapshot = null            // { mainID, entries: [{ objectID, tag, value, display }] } while learning; null = none

// A parameter's value string as plugins.paramInfo gives it (with its units).
function displayString(mapping, objectID, tag) {
    const units = mixerAccess.getParameterDisplayUnits(mapping, objectID, tag)
    const display = mixerAccess.getParameterDisplayValue(mapping, objectID, tag)
    return plugins.valueString(display, units)
}

function snapshotParams(mapping, objectID, start, end) {
    for (var i=start; i<end; i++) {
        const tag = pluginAccess.getParameterTagByIndex(mapping, objectID, i)
        learnSnapshot.entries.push({ objectID: objectID, tag: tag, value: mixerAccess.getParameterProcessValue(mapping, objectID, tag),
                                     display: displayString(mapping, objectID, tag) })
    }
}

function pollLearnParams(context, mapping) {
    const snap = learnSnapshot
    if (snap.mainID !== pluginSelected) return
    // Up to LEARN_POLL_MAX all at once; a bigger plugin a slice per tick,
    // round and round (Diva: 2361 parameters, and Cubase reported none of its
    // changes, capture 2026-11-12)
    const total = snap.entries.length
    const count = (total <= LEARN_POLL_MAX) ? total : LEARN_POLL_CHUNK
    const first = (total <= LEARN_POLL_MAX) ? 0 : ((snap.cursor || 0) % total)
    if (total > LEARN_POLL_MAX) snap.cursor = (first + count) % total
    try {
        for (var k=0; k<count; k++) {
            const e = snap.entries[(first + k) % total]
            const value = mixerAccess.getParameterProcessValue(mapping, e.objectID, e.tag)
            if (value !== e.value) {
                learnParam(context, mapping, e.objectID, e.tag)     // (updates e, after using its old value)
            }
        }
    }
    catch (e) {
        utils.log("PLUGIN learn poll error: " + e, utils.LOG_BASIC)
        learnSnapshot = null
    }
}

// Cubase only reports changes of parameters a script has read (seen: the
// probe got mOnParameterChange for exactly the parameters its dump had read,
// and none from the whole-mixer DirectAccess, which read none). So LEARN reads
// every parameter of the selected plugin first, in chunks (Surge XT has 2855).
const SUBSCRIBE_CHUNK = 200
var pluginSubscribe = null          // { objects, k, objectID, next } while reading; null = done

function subscribeParams(mapping, objectID, tag) {
    // (Through the selected-track DirectAccess, whose changes are reported.
    // A locked plugin on another track isn't in its tree: it's polled.)
    try {
        pluginAccess.getParameterTitle(mapping, objectID, tag, 32)
        pluginAccess.getParameterDisplayValue(mapping, objectID, tag)
        pluginAccess.getParameterProcessValueType(mapping, objectID, tag)
        pluginAccess.getParameterProcessValue(mapping, objectID, tag)
    }
    catch (e) {
        utils.log("PLUGIN can't read obj=" + objectID + " tag=" + tag + ": " + e, utils.LOG_VERBOSE)
    }
}

function subscribeNextParams(mapping) {
    // SUBSCRIBE_CHUNK parameters per idle tick, across the plugin's objects
    var budget = SUBSCRIBE_CHUNK
    while (pluginSubscribe && budget > 0) {
        budget -= subscribeChunk(mapping, budget)
    }
}

// Reads up to `budget` parameters of the current object; returns how many.
function subscribeChunk(mapping, budget) {
    const sub = pluginSubscribe
    const n = pluginAccess.getNumberOfParameters(mapping, sub.objectID)
    const start = sub.next
    const end = Math.min(n, sub.next + budget)
    for (var i=sub.next; i<end; i++) {
        subscribeParams(mapping, sub.objectID, pluginAccess.getParameterTagByIndex(mapping, sub.objectID, i))
    }
    // (The LEARN poll's snapshot, a chunk at a time as well)
    if (learnSnapshot && learnSnapshot.mainID === pluginSelected) snapshotParams(mapping, sub.objectID, start, end)
    sub.next = end
    if (end >= n) {
        utils.log("PLUGIN read " + n + " parameters of obj=" + sub.objectID + " for LEARN", utils.LOG_VERBOSE)
        if (DEBUG_LEARN_EXTRA && !sub.extra && sub.k === 0) learnDebugExtra(mapping, sub.objectID, n)
        // The next of the plugin's objects (the strip EQ's pre-filter)
        if (pluginSubscribe === sub && sub.objects && sub.k + 1 < sub.objects.length) {
            sub.k++
            sub.objectID = sub.objects[sub.k]
            sub.next = 0
        }
        else if (pluginSubscribe === sub) {
            pluginSubscribe = null
        }
    }
    return Math.max(1, end - start)
}

// Debug: the channel strip EQ can't be learnt. Cubase reported only one
// parameter of it (tag 14268, twice) while its bands were moved (capture
// 2026-10-22 14:38). Dump a small plugin's parameter titles, and also read the
// channel's own parameters, so changes reported there show up in the log
// ("PLUGIN learn-change").
const DEBUG_LEARN_EXTRA = false

function learnDebugExtra(mapping, objectID, n) {
    if (n <= 64) {
        for (var i=0; i<n; i++) {
            const tag = pluginAccess.getParameterTagByIndex(mapping, objectID, i)
            utils.log("PLUGIN p" + i + " tag=" + tag + " \"" + pluginAccess.getParameterTitle(mapping, objectID, tag, 32) +
                      "\" auto=" + pluginAccess.isParameterAutomatable(mapping, objectID, tag), utils.LOG_VERBOSE)
        }
    }
    const base = pluginAccess.getBaseObjectID(mapping)
    if (base >= 0 && base !== objectID) {
        pluginSubscribe = { objectID: base, next: 0, extra: true }
        utils.log("PLUGIN also reading the channel obj=" + base, utils.LOG_VERBOSE)
    }
}

// QUICK CTRL from PLUGIN: LEFT+RIGHT back makes the firmware redraw its PLUGIN
// screen and send that plugin's CONTROL_MAPPED burst ~170 ms *before* its
// SET_PLUGIN_MODE PLUGIN, so the script is still in QUICK CTRL. Kept here and
// resolved on PLUGIN entry: dropped, ROTO's knobs got no positions (it takes
// them from the LEARN_PARAM replies) and drove nothing (capture 2026-11-05
// 15:35). Before, a re-select on the way back made ROTO send another burst.
var qcReturnMapped = null           // [CONTROL_MAPPED]; null = none
var qcReturnMapEmpty = false        // ...and its marker asked for a default map

function controlMapped(index, hash, type, control) {
    if (control >= NUM_CONTROL_PAIRS) return
    if (quickCtrlActive() && quickCtrlFromPlugin) {
        if (qcReturnMapped === null || !mappedSetOpen) qcReturnMapped = []
        mappedSetOpen = true
        qcReturnMapped.push({ index: index, hash: hash, type: type, control: control })
        return
    }
    if (!pluginModeActive()) return
    if (mappedEndSeen) {
        // The first of a burst: a new set
        if (!mappedSetOpen) clearPluginMappings()
    }
    else {
        const now = Date.now()
        if (now - pluginMappedLastMs > MAPPED_BURST_MS) clearPluginMappings()
        pluginMappedLastMs = now
    }
    // (Also before the first marker: else that marker took the burst for an
    // empty set and dropped it, capture 2026-10-29 70950 s)
    mappedSetOpen = true
    pluginMappedQueue.push({ index: index, hash: hash, type: type, control: control })
}

// ROTO's marker after a CONTROL_MAPPED burst. With no CONTROL_MAPPED since the
// last one, the page has nothing mapped: drop the previous page's controls.
// mapEmpty: nothing mapped on any page, so ROTO takes a default map.
function controlMappedEnd(context, page, mapEmpty) {
    // (In any mode: the firmware sends one on drawing its PLUGIN screen, before
    // SET_PLUGIN_MODE)
    mappedEndSeen = true
    if (quickCtrlActive() && quickCtrlFromPlugin) {
        // (A marker alone: PLUGIN's plugin has nothing mapped)
        if (!mappedSetOpen) qcReturnMapped = []
        qcReturnMapEmpty = mapEmpty
        mappedSetOpen = false
        return
    }
    if (!pluginModeActive()) return
    mappedPage = page
    pluginEditorAwaitMarker = false
    if (!mappedSetOpen) clearPluginMappings()
    mappedSetOpen = false
    if (pluginLearnOffUntilMs !== 0) learnOffMarked = true
    // Reply to the set now (names and positions), rather than on the next idle
    if (pluginMappedQueue.length > 0) {
        const queued = pluginMappedQueue.slice()
        if (!withMapping('controls', function(m) { resolveMappedControls(context, m) })) pluginMappedQueue = queued
    }
    defaultMapPending = false
    if (mapEmpty && !withMapping('default map', function(m) { sendDefaultMap(context, m) })) defaultMapPending = true
}

//-----------------------------------------------------------------------------
// Default maps (default_maps.js). ROTO asks for one when the selected plugin
// has nothing mapped (CONTROL_MAPPED_END's map-empty byte), on every load of
// it: it holds the default in RAM only. LEARN drops it (starts blank; ROTO
// asks again if nothing was learnt), and CLEARing a control of it saves the
// rest. Each control is resolved as for LEARN (index, name,
// steps, position) and sent with the plugin's hash, so ROTO drops a map meant
// for a plugin it has left. ROTO then sends its CONTROL_MAPPED burst, which
// the usual path answers.
//-----------------------------------------------------------------------------
var mappedPage = 0                  // the controls page of ROTO's last marker
var defaultMapPending = false       // asked for: send from pluginIdle

// The haptics the selected plugin's default map gives a parameter, which win
// over what Cubase reports (LEARN, mapped controls): { steps, indent }, or null.
function mapHaptics(objectID, tag) {
    const p = pluginList[pluginIndexOf(pluginSelected)]
    return p ? defaultMaps.haptics(p.hashKey, tag, pluginSelectedExtra >= 0 && objectID === pluginSelectedExtra) : null
}

// info (plugins.paramInfo) with the map's haptics, if it gives any.
function withMapHaptics(info, objectID, tag) {
    const h = mapHaptics(objectID, tag)
    if (h) {
        if (h.steps !== undefined) {
            info.steps = h.steps
            info.binary = false             // (decided: no step detection)
        }
        info.indent = h.indent
    }
    return info
}

function sendDefaultMap(context, mapping) {
    const p = pluginList[pluginIndexOf(pluginSelected)]
    const map = p ? defaultMaps.lookup(p.hashKey) : null
    if (!map) return
    var sent = 0
    for (var i=0; i<map.length; i++) {
        const c = map[i]
        const objectID = c.prefilter ? pluginSelectedExtra : pluginSelected
        const index = (objectID < 0) ? -1 : plugins.indexIn(mixerAccess, mapping, pluginSelected, pluginSelectedExtra, objectID, c.tag)
        if (index < 0 || index > 0x3FFF) {
            utils.log("PLUGIN default map of " + p.name + ": no parameter with tag " + c.tag, utils.LOG_VERBOSE)
            continue
        }
        const info = plugins.paramInfo(mixerAccess, mapping, objectID, c.tag, builtinObject(objectID))
        if (info.binary && !builtinObject(objectID)) info.steps = knownSteps(objectID, c.tag)
        const isKnob = defaultMaps.isKnob(c)
        midi.sendSetDefaultCtl(config, context, p.hash, isKnob, defaultMaps.controlIndex(c), defaultMaps.details(c), index,
                               plugins.hashFor(c.tag, !!c.prefilter), (c.steps !== undefined) ? c.steps : info.steps,
                               Math.round(info.value * KNOB_14BIT_MAX), c.name || info.name, isKnob && !!c.indent)
        sent++
    }
    midi.sendSetDefaultCtlEnd(config, context, p.hash)
    utils.log("PLUGIN default map of " + p.name + ": " + sent + " of " + map.length + " controls", utils.LOG_VERBOSE)
}

// From pluginIdle (needs the mapping).
function resolveMappedControls(context, mapping) {
    const queue = pluginMappedQueue
    pluginMappedQueue = []
    // (Dev: the page's mapping, as default_maps.js lines)
    const mapLines = utils.VERBOSE ? [] : null
    for (var q=0; q<queue.length; q++) {
        const c = queue[q]
        if (pluginSelected < 0) continue
        // (In the plugin's parameter space: the strip EQ's includes its pre-filter)
        const p = plugins.resolveParamIn(mixerAccess, mapping, pluginSelected, pluginSelectedExtra, c.index, c.hash)
        if (!p) {
            utils.log("PLUGIN control " + c.control + " maps to no parameter (index " + c.index + ")", utils.LOG_VERBOSE)
            continue
        }
        const info = plugins.paramInfo(mixerAccess, mapping, p.objectID, p.tag, builtinObject(p.objectID))
        if (info.binary && !builtinObject(p.objectID)) info.steps = knownSteps(p.objectID, p.tag)
        withMapHaptics(info, p.objectID, p.tag)
        if (mapLines) mapLines.push(defaultMaps.format(mappedPage, c.type == CONTROL_KNOB, c.control, p.tag, p.objectID === pluginSelectedExtra,
                                                       info.steps, c.type == CONTROL_KNOB && info.indent, info.name))
        const entry = { objectID: p.objectID, tag: p.tag, value: info.value, steps: info.steps, dirty: false }
        // So its changes are reported (only for parameters read; see subscribeParams)
        subscribeParams(mapping, p.objectID, p.tag)
        if (c.type == CONTROL_KNOB) {
            pluginKnobMap[c.control] = entry
            // Name and position for ROTO (it matches on index and hash)
            midi.sendLearnParam(config, context, c.index, c.hash, info.steps,
                                Math.round(info.value * KNOB_14BIT_MAX), info.name, info.indent)
            displayedKnob[c.control] = null
            knobLatestStr[c.control] = info.display
        }
        else {
            pluginSwitchMap[c.control] = entry
            sendSwitchState(context, c.control, info)
        }
    }
    if (mapLines && mapLines.length > 0) {
        const p = pluginList[pluginIndexOf(pluginSelected)]
        // (One line per log entry: the MIDI log cuts each one at 120 characters)
        utils.log("DEFAULT MAP '" + (p ? p.hashKey : '?') + "' (" + (p ? p.name : '?') + "):", utils.LOG_VERBOSE)
        for (var i=0; i<mapLines.length; i++) utils.log("    " + mapLines[i], utils.LOG_VERBOSE)
    }
}

// The selected track's DirectAccess reported a parameter change.
function onPluginParamChange(context, mapping, objectID, tag) {
    if (!pluginModeActive()) return
    noteCallback('paramChange', objectID + '/' + tag)
    if (pluginLearning) {
        utils.log("PLUGIN param obj=" + objectID + " tag=" + tag + " (selected " + pluginSelected + ")", utils.LOG_VERBOSE)
    }
    try {
        if (pluginLearning && (objectID === pluginSelected || (pluginSelectedExtra >= 0 && objectID === pluginSelectedExtra))) {
            learnParam(context, mapping, objectID, tag)
            return
        }
        pluginParamFeedback(context, mapping, objectID, tag)
    }
    catch (e) {
        // (A DirectAccess call failing would otherwise vanish in Cubase's console)
        utils.log("PLUGIN param error: " + e, utils.LOG_BASIC)
    }
}

// A non-automatable parameter of Cubase's own channel modules that is still
// worth mapping.
const BUILTIN_SWITCHES = /^(Phase|Invert( All| \d+)?)$/

function builtinSwitch(objectID, title) {
    return builtinObject(objectID) && BUILTIN_SWITCHES.test(title)
}

// One of Cubase's own channel modules (strip modules, the pre-filter), which
// report their parameters' ranges correctly, unlike some plugins.
function builtinObject(objectID) {
    const p = pluginList[pluginIndexOf(pluginSelected)]
    return (pluginSelectedExtra >= 0 && objectID === pluginSelectedExtra) || (p !== undefined && (p.kind === 'strip' || p.kind === 'prefilter'))
}

// While ROTO learns, a parameter moved in the selected plugin is offered to
// the control picked on ROTO (the firmware ignores it if none is).
function learnParam(context, mapping, objectID, tag) {
    const now = Date.now()
    const key = objectID + '/' + tag       // (the EQ's and its pre-filter's tags overlap)
    // (The default map's haptics, if it has the parameter, decide its steps)
    const info = withMapHaptics(plugins.paramInfo(mixerAccess, mapping, objectID, tag, builtinObject(objectID)), objectID, tag)
    // The LEARN poll's snapshot: the value before this change (one click of
    // an on/off only reports the new one: capture 2026-10-23 11:24 "Analog"),
    // then updated, so a reported change doesn't come back from the poll as a
    // new gesture
    var before = null
    if (learnSnapshot) {
        for (var i=0; i<learnSnapshot.entries.length; i++) {
            const e = learnSnapshot.entries[i]
            if (e.objectID === objectID && e.tag === tag) {
                if (e.value !== info.value) before = { value: e.value, display: e.display }
                e.value = info.value
                e.display = info.display
            }
        }
    }
    // A third-party 0..1 parameter (Waves): its steps come from the values it
    // takes (seenSteps). Until they're decided it's held back, because ROTO
    // only takes the first LEARN_PARAM after a control is picked (capture
    // 2026-10-23 11:00: a re-send with the steps found later was ignored).
    // Undecided at the gesture's pause (an on/off: 2 strings): offered then,
    // as 2-position (pluginIdle, flushPendingLearn).
    if (info.binary && !builtinObject(objectID)) {
        if (before) seenSteps(objectID, tag, before.value, before.display)
        // Just offered (a change reported after the drag was let go: capture
        // 2026-10-23 11:43): the same gesture, not held back and offered again
        if (key === pluginLearnLastTag && now - pluginLearnLastMs < LEARN_REPEAT_MS) {
            pluginLearnLastMs = now
            return
        }
        const seen = seenSteps(objectID, tag, info.value, info.display)
        info.steps = seen.steps
        if (!seen.decided) {
            const same = pendingLearn && pendingLearn.key === key
            pendingLearn = { objectID: objectID, tag: tag, key: key, lastMs: now,
                             lockSeen: same && pendingLearn.lockSeen, locked: same && pendingLearn.locked }
            return
        }
        if (pendingLearn && pendingLearn.key === key) {
            // Decided during the gesture it was held back in: offer it now
            pendingLearn = null
            offerLearn(context, mapping, objectID, tag, info, key, now)
            return
        }
    }
    // The same parameter still moving (a gesture) isn't offered again. Only
    // its own changes count: other parameters (e.g. a meter streaming) mustn't
    // keep the gesture open.
    if (key === pluginLearnLastTag) {
        const repeat = (now - pluginLearnLastMs < LEARN_REPEAT_MS)
        pluginLearnLastMs = now
        if (repeat) return
    }
    offerLearn(context, mapping, objectID, tag, info, key, now)
}

function offerLearn(context, mapping, objectID, tag, info, key, now) {
    // Not the echo of the script's own write, however late Cubase reports it
    // (recognised by value, not by a time window: FEATURE_GAPS, timing #5)
    const w = pluginLastWrite
    if (w && w.objectID === objectID && w.tag === tag && Math.abs(info.value - w.value) < OWN_WRITE_TOLERANCE) return
    // Not automatable: the instrument's MIDI CC proxies, plugin housekeeping.
    // Except useful switches of Cubase's own modules, which it also marks so:
    // the pre-filter's Phase and the EQ's Invert (user request, 2026-10-22).
    if (!info.automatable && !builtinSwitch(objectID, info.name)) {
        utils.log("PLUGIN learn skip \"" + info.name + "\" tag " + tag + ": not automatable", utils.LOG_VERBOSE)
        return
    }
    // MIDI CC / MPE proxies and HALion's housekeeping range (plugins.fakeParam)
    const owner = (objectID === pluginSelectedExtra) ? undefined : pluginList[pluginIndexOf(pluginSelected)]
    if (plugins.fakeParam(owner && owner.name, tag, info.name)) {
        utils.log("PLUGIN learn skip \"" + info.name + "\" tag " + tag + ": proxy parameter", utils.LOG_VERBOSE)
        return
    }
    const index = plugins.indexIn(mixerAccess, mapping, pluginSelected, pluginSelectedExtra, objectID, tag)
    if (index < 0 || index > 0x3FFF) {
        utils.log("PLUGIN learn skip \"" + info.name + "\" tag " + tag + ": index " + index, utils.LOG_VERBOSE)
        return
    }
    pluginLearnLastTag = key
    pluginLearnLastMs = now
    const seen = stepsSeenEntry(objectID, tag)
    utils.log("PLUGIN learn \"" + info.name + "\" index " + index + " tag " + tag + " steps " + info.steps +
              (seen ? " (seen " + seen.values.join(",") + " / \"" + seen.strings.join("\",\"") + "\")" : ""), utils.LOG_VERBOSE)
    midi.sendLearnParam(config, context, index, plugins.hashFor(tag, objectID === pluginSelectedExtra), info.steps,
                        Math.round(info.value * KNOB_14BIT_MAX), info.name, info.indent)
}

// A held-back parameter whose gesture has ended: offered with its steps. The
// end is the drag being let go, if the plugin reports its edit lock while
// dragged (DirectAccess getParameterEditLockState: a plugin window wraps a
// drag in begin/end edit; user request 2026-10-23, to avoid the pause), else
// the gesture's pause (LEARN_REPEAT_MS, a human timescale). From pluginIdle.
var pendingLearn = null             // { objectID, tag, key, lastMs, lockSeen, locked }; null = none

function flushPendingLearn(context, mapping) {
    const p = pendingLearn
    if (!p) return
    var locked = false
    try {
        locked = !!mixerAccess.getParameterEditLockState(mapping, p.objectID, p.tag)
    }
    catch (e) {
        locked = false                  // (not reported: the pause decides)
    }
    if (locked !== !!p.locked) {
        p.locked = locked
        utils.log("PLUGIN learn edit lock " + (locked ? "on (dragging)" : "off (let go)") + " obj=" + p.objectID + " tag=" + p.tag, utils.LOG_VERBOSE)
    }
    if (locked) {
        p.lockSeen = true               // still dragging, however long
        return
    }
    if (!p.lockSeen && Date.now() - p.lastMs < LEARN_REPEAT_MS) return
    pendingLearn = null
    try {
        // Not decided by the values seen: scan it (as Logic/Bitwig), now that
        // the gesture has paused; else (automation Write on, or a string that
        // didn't follow) what was seen
        const e = stepsSeenEntry(p.objectID, p.tag)
        if (!(e && (e.steps || e.continuous))) {
            const scanned = scanSteps(mapping, p.objectID, p.tag)
            if (scanned >= 0) setSeenSteps(p.objectID, p.tag, scanned)
        }
        const info = plugins.paramInfo(mixerAccess, mapping, p.objectID, p.tag, false)
        info.steps = knownSteps(p.objectID, p.tag)
        offerLearn(context, mapping, p.objectID, p.tag, info, p.key, Date.now())
    }
    catch (e) {
        utils.log("PLUGIN learn flush error: " + e, utils.LOG_BASIC)
    }
}

// Steps of a third-party parameter that reports a 0..1 discrete range but
// really has more positions (Waves: API-550A "High Freq" takes exact
// quarters, 5 steps; user request 2026-10-23, "right 99% of the time is
// enough"). It only takes values on its steps, so the distinct values seen
// while it moves during LEARN give them:
//   - stepped only once it has shown 3+ different value strings: an on/off
//     parameter shows 2 however it encodes them (0 / not 0, < / > 0.5,
//     not 1 / 1), and stays a 2-position control (0: the firmware's toggle);
//   - steps = round(1 / smallest gap) + 1, if every value sits on that grid;
//   - off the grid, or more than MAX_STEPS (24): continuous for good.
// Returns { steps, decided }: not decided while it has shown fewer than 3.
// Kept per plugin class and tag for the session, so all instances share it.
var stepsSeen = {}                  // "<class hash>/<tag>" -> { values, strings, steps, continuous }

function seenSteps(objectID, tag, value, display) {
    const p = pluginList[pluginIndexOf(pluginSelected)]
    if (!p || objectID !== p.objectID) return { steps: 0, decided: true }
    const key = p.hash.join('.') + '/' + tag
    const e = stepsSeen[key] || (stepsSeen[key] = { values: [], strings: [], steps: 0, continuous: false })
    if (e.continuous || e.steps) return { steps: e.steps, decided: true }
    if (e.strings.indexOf(display) < 0 && e.strings.length < 64) e.strings.push(display)
    const v = Math.round(value * 10000) / 10000
    if (e.values.indexOf(v) < 0) {
        e.values.push(v)
        e.values.sort(function(a, b) { return a - b })
    }
    if (e.strings.length < 3 || e.values.length < 3) return { steps: 0, decided: false }
    var gap = 1
    for (var i=1; i<e.values.length; i++) {
        const d = e.values[i] - e.values[i - 1]
        if (d > 0.001 && d < gap) gap = d
    }
    const n = Math.round(1 / gap) + 1
    const g = 1 / (n - 1)
    const onGrid = e.values.every(function(x) { return Math.abs(x / g - Math.round(x / g)) < 0.02 })
    if (!onGrid || n > plugins.MAX_STEPS) {
        e.continuous = true
        e.steps = 0
    }
    else {
        e.steps = n
    }
    return { steps: e.steps, decided: true }
}

// The step scan (as the Logic and Bitwig drivers do; user request 2026-10-23):
// the parameter is written across its range in SCAN_SAMPLES steps (1/96, under
// a quarter of the narrowest step at 24) and its value string read back at
// each; the number of string changes + 1 is its steps (1 change: an on/off, 2;
// more than MAX_STEPS: continuous, 0). Then the value is put back. With the
// channel's automation Write on, Write is switched off for the scan and back
// on after, so the sweep isn't recorded (user request 2026-10-23). Returns -1
// if it can't tell: Write wouldn't switch off, or the string never changed (it
// didn't follow the writes). Audible for a moment, as in Logic.
const SCAN_SAMPLES = 96
var scanning = false                // the scan's own writes aren't learnt or fed back

function scanSteps(mapping, objectID, tag) {
    // (Read before Write is touched, so nothing can leave it switched off)
    const v0 = mixerAccess.getParameterProcessValue(mapping, objectID, tag)
    const write = writeAutomation(mapping)
    scanning = true
    if (write && write.on) {
        mixerAccess.setParameterProcessValue(mapping, write.base, write.tag, 0)
        if (mixerAccess.getParameterProcessValue(mapping, write.base, write.tag) > 0.5) {
            scanning = false
            utils.log("PLUGIN scan skipped: automation Write wouldn't switch off", utils.LOG_VERBOSE)
            return -1
        }
        utils.log("PLUGIN scan: automation Write off for the scan", utils.LOG_VERBOSE)
    }
    var changes = 0
    var prev = null
    try {
        for (var k=0; k<=SCAN_SAMPLES; k++) {
            mixerAccess.setParameterProcessValue(mapping, objectID, tag, k / SCAN_SAMPLES)
            const str = mixerAccess.getParameterDisplayValue(mapping, objectID, tag)
            if (prev !== null && str !== prev) {
                changes++
                if (changes + 1 > plugins.MAX_STEPS) break
            }
            prev = str
        }
    }
    finally {
        mixerAccess.setParameterProcessValue(mapping, objectID, tag, v0)
        if (write && write.on) mixerAccess.setParameterProcessValue(mapping, write.base, write.tag, 1)
        scanning = false
    }
    const steps = (changes === 0) ? -1 : ((changes + 1 > plugins.MAX_STEPS) ? 0 : changes + 1)
    utils.log("PLUGIN scan obj=" + objectID + " tag=" + tag + ": " + changes + " string changes -> steps " + steps, utils.LOG_VERBOSE)
    return steps
}

// The selected channel's automation Write switch (its "Write Automation"
// parameter, as dumped 2026-10-22): { base, tag, on }, or null if not found.
function writeAutomation(mapping) {
    const base = pluginAccess.getBaseObjectID(mapping)
    if (base < 0) return null
    const n = pluginAccess.getNumberOfParameters(mapping, base)
    for (var i=0; i<n; i++) {
        const tag = pluginAccess.getParameterTagByIndex(mapping, base, i)
        if (pluginAccess.getParameterTitle(mapping, base, tag, 32) === 'Write Automation') {
            return { base: base, tag: tag, on: pluginAccess.getParameterProcessValue(mapping, base, tag) > 0.5 }
        }
    }
    return null
}

function setSeenSteps(objectID, tag, steps) {
    const p = pluginList[pluginIndexOf(pluginSelected)]
    if (!p || objectID !== p.objectID) return
    const key = p.hash.join('.') + '/' + tag
    const e = stepsSeen[key] || (stepsSeen[key] = { values: [], strings: [], steps: 0, continuous: false })
    e.steps = steps
    e.continuous = (steps === 0)
}

// Known steps of a third-party 0..1 parameter (seen during LEARN): its steps,
// or 2 for an on/off (2 strings, values more than half the range apart, e.g. 0
// and 1), so a knob gets 2 detents rather than turning continuously (user
// request 2026-10-23). A stepped parameter moved one step shows 2 strings at
// most half the range apart (capture 11:24: "High Freq" 0 -> 0.25, 5 steps;
// 11:16: "High Gain" 0.5 -> 0.6): 0, continuous, rather than a wrong count.
function knownSteps(objectID, tag) {
    const e = stepsSeenEntry(objectID, tag)
    if (!e) return 0
    if (e.steps) return e.steps
    const spread = e.values.length ? e.values[e.values.length - 1] - e.values[0] : 0
    return (!e.continuous && e.strings.length === 2 && spread > 0.51) ? 2 : 0
}

function stepsSeenEntry(objectID, tag) {
    const p = pluginList[pluginIndexOf(pluginSelected)]
    if (!p || objectID !== p.objectID) return undefined
    return stepsSeen[p.hash.join('.') + '/' + tag]
}

// The value is read on the next idle tick, not in the change callback: in a
// capture, switch value strings read there were often the previous value
// (and dropped as repeats). A knob's position also goes out from here at once
// (user report 2026-11-12, "steppy": Cubase reported Input Filter "HC-Freq"
// every 17-28 ms while it was moved, but the page's idle only ran every
// ~100-115 ms, so ROTO got ~9 positions a second). The idle still reads it
// again with its string: a stale value here repeats what ROTO shows (deduped
// by sendKnob), and the idle's corrects it within a tick.
function pluginParamFeedback(context, mapping, objectID, tag) {
    for (var i=0; i<NUM_CONTROL_PAIRS; i++) {
        const k = pluginKnobMap[i]
        if (k && k.objectID === objectID && k.tag === tag) {
            k.dirty = true
            pluginFeedbackDirty = true
            if (!knobHeld(i)) {
                k.value = mixerAccess.getParameterProcessValue(mapping, objectID, tag)
                sendKnob(context, i, k.value)
            }
        }
        const s = pluginSwitchMap[i]
        if (s && s.objectID === objectID && s.tag === tag) {
            s.dirty = true
            pluginFeedbackDirty = true
        }
    }
}

// From pluginIdle.
function sendPendingFeedback(context, mapping) {
    pluginFeedbackDirty = false
    for (var i=0; i<NUM_CONTROL_PAIRS; i++) {
        const k = pluginKnobMap[i]
        if (k && k.dirty) {
            k.dirty = false
            sendKnobFeedback(context, mapping, i, k)
        }
        else if (k && k.positionPending && !knobHeld(i)) {
            k.positionPending = false
            sendKnob(context, i, mixerAccess.getParameterProcessValue(mapping, k.objectID, k.tag))
        }
        // (A position held back still needs sending)
        if (k && k.positionPending) pluginFeedbackDirty = true
        const s = pluginSwitchMap[i]
        if (s && s.dirty) {
            s.dirty = false
            const info = plugins.paramInfo(mixerAccess, mapping, s.objectID, s.tag)
            s.value = info.value
            sendSwitchState(context, i, info)
        }
    }
}

// A knob being turned: ROTO marks every gesture with touch on/off, so no
// time window after the last CC is needed (FEATURE_GAPS, timing #5). A change
// from Cubase meanwhile is sent on release (positionPending).
function knobHeld(i) {
    return !!knobTouched[i]
}

function sendKnobFeedback(context, mapping, i, entry) {
    const value = mixerAccess.getParameterProcessValue(mapping, entry.objectID, entry.tag)
    entry.value = value
    // Not to a knob being turned: Cubase's value would fight the motor. Sent
    // once the hold is over instead (capture 2026-10-22: a change ~60 ms after
    // release was dropped, and the knob never moved to it).
    if (knobHeld(i)) {
        entry.positionPending = true
        pluginFeedbackDirty = true
    }
    else {
        entry.positionPending = false
        sendKnob(context, i, value)
    }
    const units = mixerAccess.getParameterDisplayUnits(mapping, entry.objectID, entry.tag)
    const display = mixerAccess.getParameterDisplayValue(mapping, entry.objectID, entry.tag)
    knobLatestStr[i] = plugins.valueString(display, units)
    // (The value and its string disagreed in a capture: Surge's display had
    // jumped back, the value hadn't)
    utils.log("PLUGIN feedback knob " + i + " value=" + value + " \"" + knobLatestStr[i] + "\"", utils.LOG_VERBOSE)
    pushKnobValue(context, i, false)
}

// A mapped switch's LED (CC) and its value string, on change.
function sendSwitchState(context, i, info) {
    const cc = Math.round(info.value * 127)
    if (switchShown[i] !== cc) {
        switchShown[i] = cc
        midi.sendMidiCc7it(config, context, (PLUGIN_MIX_MODE_BUTTON_CC_BASE + i), cc)
    }
    if (switchStrShown[i] !== info.display) {
        switchStrShown[i] = info.display
        midi.sendParamValue(config, context, true, i, info.display)
    }
}

// ROTO turned a mapped knob (14-bit CC, value 0..1).
function pluginKnobInput(context, i, value) {
    const entry = pluginKnobMap[i]
    if (!entry || !pluginMapping) return
    noteCallback('knobIn', i + '=' + Math.round(value * 1000) / 1000)
    // (Debug: a jump while ROTO isn't touching the knob is likely Cubase
    // pushing another binding's value into it, e.g. a mixer fader)
    if (!knobTouched[i] && Math.abs(value - entry.value) > 0.05) {
        utils.log("PLUGIN knob " + i + " untouched jump " + entry.value + " -> " + value, utils.LOG_VERBOSE)
    }
    // ROTO's knob is already there
    displayedKnob[i] = Math.round(value * KNOB_14BIT_MAX)
    pluginWrite(entry, value)
}

// ROTO pressed a mapped switch (7-bit CC, value 0..1). A gesture, as below.
// The parameter is read back on the next idle tick and its state (CC) and
// value string sent: the firmware doesn't light a plugin switch's LED itself
// (auto LED off; it waits for the DAW), and Cubase doesn't always report the
// change (capture 2026-11-02, MultibandCompressor "Byp1": no LED or value
// string after any press). ROTO's switch value follows the CC too.
function pluginButtonInput(context, i, value) {
    const entry = pluginSwitchMap[i]
    if (!entry || !pluginMapping) return
    switchShown[i] = undefined
    setEditLock(entry, true)
    pluginWrite(entry, value)
    setEditLock(entry, false)
    entry.dirty = true
    pluginFeedbackDirty = true
}

// A mapped knob touched or released. ROTO's turn is a gesture, as a plugin
// window's begin/end edit: the parameter is edit-locked from touch to release.
// (Device 2026-10-22: without it, Surge's "A Osc 2 Volume" turned on ROTO
// jumped back in its window ~1 s after release; moved in the window it
// stayed.) The release unlocks what the touch locked, even if the mapping
// changed in between.
var knobLocked = []                 // control -> { objectID, tag } while locked

function pluginKnobTouch(i, on) {
    if (on) {
        const entry = pluginKnobMap[i]
        if (pluginModeActive() && entry && !knobLocked[i]) {
            knobLocked[i] = { objectID: entry.objectID, tag: entry.tag }
            setEditLock(knobLocked[i], true)
        }
    }
    else if (knobLocked[i]) {
        setEditLock(knobLocked[i], false)
        knobLocked[i] = undefined
    }
}

function setEditLock(param, state) {
    if (!EDIT_LOCK_GESTURES || !pluginMapping) return
    try {
        mixerAccess.setParameterEditLockState(pluginMapping, param.objectID, param.tag, state)
    }
    catch (e) {
        utils.log("PLUGIN can't " + (state ? "lock" : "unlock") + " obj=" + param.objectID + " tag=" + param.tag + ": " + e, utils.LOG_BASIC)
    }
}

function pluginWrite(entry, value) {
    // A stepped parameter gets its exact step: Cubase rounds down, so ROTO's
    // 5-step switch value 31 (0.244) gave step 0, not 1 (capture)
    if (entry.steps >= 2) {
        value = Math.round(value * (entry.steps - 1)) / (entry.steps - 1)
    }
    pluginLastWrite = { objectID: entry.objectID, tag: entry.tag, value: value }
    entry.value = value
    try {
        mixerAccess.setParameterProcessValue(pluginMapping, entry.objectID, entry.tag, value)
    }
    catch (e) {
        // (e.g. a locked plugin deleted on another track)
        utils.log("PLUGIN can't write obj=" + entry.objectID + " tag=" + entry.tag + ": " + e, utils.LOG_BASIC)
    }
}

// Mapped parameters are also polled, on any track: a locked plugin on a track
// that isn't selected reports no changes, and neither does the channel strip
// EQ (capture 2026-10-22 14:41). Reported changes still come at once
// (pluginParamFeedback); the script's own writes set entry.value, so they
// aren't seen as changes.
function pollMappedParams(context, mapping) {
    const now = Date.now()
    if (now - pluginPollMs < PLUGIN_POLL_MS) return
    pluginPollMs = now
    try {
        for (var i=0; i<NUM_CONTROL_PAIRS; i++) {
            const k = pluginKnobMap[i]
            if (k && mixerAccess.getParameterProcessValue(mapping, k.objectID, k.tag) !== k.value) {
                sendKnobFeedback(context, mapping, i, k)
            }
            const s = pluginSwitchMap[i]
            if (s && mixerAccess.getParameterProcessValue(mapping, s.objectID, s.tag) !== s.value) {
                const info = plugins.paramInfo(mixerAccess, mapping, s.objectID, s.tag)
                s.value = info.value
                sendSwitchState(context, i, info)
            }
        }
    }
    catch (e) {
        // The locked plugin is gone (deleted on its track): stop polling it.
        // Its controls send nothing until ROTO reloads a plugin.
        utils.log("PLUGIN poll error, mappings dropped: " + e, utils.LOG_BASIC)
        clearPluginMappings()
    }
}

//-----------------------------------------------------------------------------
// Track focus — follows the Cubase track selection (not the bank), so it also
// works for a selected track outside the current bank.
//-----------------------------------------------------------------------------

// Cubase send slots aren't statically allocated (a track may use sends 1 and
// 3 only), so focus mode packs the routed sends onto the knobs in order,
// across the firmware's focus pages: every knob has its own sub-page area
// with one sub-page per Cubase send slot, plus 'Off'. The selected track's
// send names arrive one callback per slot, so changes are batched and
// applied from mOnIdle.
var focusSendNames = []         // by Cubase send slot; "" = not routed
var focusSendsDirty = false
var focusSendsKey = null        // layout ROTO currently has; null = unknown
var focusPage = 0               // 0 = VOLUME/PAN + sends 1..6, 1 = sends 7..14, 2 = 15..16
var focusKnobBound = []         // by knob: bound to volume, pan or a send in FOCUS

// MIX knobs after a rebind. The firmware sets its MIX knobs up again on each
// all-tracks and FOCUS entry, and only sends a knob's new haptic mode to the
// motor with a position. Cubase's rebind positions the knobs, but one whose
// new value is what ROTO showed before was skipped (sendKnob's dedup), or not
// reported at all, and had no haptics until turned: FUNC from SEND knob mode
// (the selected track's send 1 on the same knob, capture 2026-11-06), or
// cycling the send number with two sends at the same level (e.g. both at the
// default 0 dB). So every knob's position is forgotten, and any the rebind
// didn't send goes out once it's done: Cubase's values came ~285-450 ms
// after entry (same capture).
const REBIND_KNOBS_RESEND_MS = 600
var rebindKnobsResendAtMs = 0   // 0 = none pending

function holdRebindKnobs() {
    for (var i=0; i<NUM_CONTROL_PAIRS; i++) displayedKnob[i] = null
    rebindKnobsResendAtMs = Date.now() + REBIND_KNOBS_RESEND_MS
}

// From the device's idle: the knobs the rebind didn't position
function flushRebindKnobs(context) {
    if (rebindKnobsResendAtMs === 0 || Date.now() < rebindKnobsResendAtMs) return
    rebindKnobsResendAtMs = 0
    if (activeMode != ACTIVE_MODE_MIX) return
    for (var i=0; i<NUM_CONTROL_PAIRS; i++) {
        if (displayedKnob[i] !== null || knobTouched[i]) continue
        // FOCUS: bound to volume, pan or a send. All-tracks: a track (an
        // empty slot is parked by its reset)
        const bound = (mixMode == MIX_MODE_TRACK_FOCUS) ? focusKnobBound[i] :
                      (channels[i] !== undefined && !!channels[i].name)
        if (!bound) continue
        sendKnob(context, i, surfaceElements.controlsStrip[i].knob.mSurfaceValue.getProcessValue(context))
    }
}

function applyFocusSends(context, force) {
    focusSendsDirty = false
    const routed = []
    for (var s=0; s<CUBASE_NUM_SENDS; s++) {
        if (focusSendNames[s]) routed.push(s)
    }
    // Page 2 only exists with more than 6 sends, page 3 with more than 14.
    // When routing drops below that, the firmware falls back to the last
    // page the sends fill as it redraws on NUM_SENDS.
    if (focusPage > focusLastPage(routed.length)) {
        focusPage = focusLastPage(routed.length)
    }
    const names = []
    for (var k=0; k<routed.length; k++) {
        names.push(focusSendNames[routed[k]])
    }
    const key = focusPage + "|" + routed.join(",") + "|" + names.join("\x1f")
    if (!force && key === focusSendsKey) return
    focusSendsKey = key
    utils.log("FOCUS page=" + (focusPage + 1) + " sends routed=[" + routed.join(",") + "]", utils.LOG_VERBOSE)

    // Swallow the value popups from the rebind.
    resetParamValueState()
    // The firmware sets its focus knobs up again: see holdRebindKnobs
    holdRebindKnobs()
    for (var i=0; i<NUM_CONTROL_PAIRS; i++) {
        // Which routed send (index into `routed`) this knob shows on this page
        const r = (focusPage == 0)
            ? (i >= FOCUS_PAGE_1_FIRST_SEND_KNOB ? i - FOCUS_PAGE_1_FIRST_SEND_KNOB : -1)
            : FOCUS_PAGE_1_SENDS + (focusPage - 1) * NUM_CONTROL_PAIRS + i
        if (r >= 0 && r < routed.length) {
            pageMixer.activateSubPagesFocusSend[i][routed[r]].setProcessValue(context, 1)
            focusKnobBound[i] = true
        }
        else {
            pageMixer.activateSubPagesFocusSendOff[i].setProcessValue(context, 1)
            // (Volume/pan on page 1)
            focusKnobBound[i] = (focusPage == 0 && i < FOCUS_PAGE_1_FIRST_SEND_KNOB)
        }
    }
    // Knobs 0/1 are volume/pan on page 1 only.
    if (focusPage == 0) {
        pageMixer.activateSubPageTrackFocus.setProcessValue(context, 1)
    }
    else {
        pageMixer.activateSubPageTrackFocusSends.setProcessValue(context, 1)
    }

    // Names first: ROTO firmware redraws the focus screen on NUM_SENDS. It
    // labels page 1 knobs 2.. with names 1..6 and the pages after it 8 each.
    // In blocks of 8 (SEND_TRACK_NAMES' index is the block's first send).
    // Names 9..16 go first: firmware from before 2026-11-16 ignores the index
    // and keeps the last block, so it still ends up with 1..8.
    while (names.length < 8 || names.length % 8) names.push("")
    for (var blk=names.length - 8; blk>=0; blk-=8) {
        midi.sendSendTrackNames(config, context, blk, names.slice(blk, blk + 8))
    }
    midi.sendNumSends(config, context, routed.length)
    // The redraw zeroes knob 0's meter (reset_mix_vu_meter_data): send the
    // level again even if it hasn't changed.
    displayedMeter[0] = null
    selMeterMaxHold = 0
}

function disableFocusSends(context) {
    for (var i=0; i<NUM_CONTROL_PAIRS; i++) {
        pageMixer.activateSubPagesFocusSendOff[i].setProcessValue(context, 1)
    }
    focusSendsKey = null
}

// The selected track as reported by Cubase, and the bank slot it maps to.
// Resolved from mOnIdle so bank colour callbacks (which carry the channel
// IDs used for matching) have landed first — on a bank page, Cubase fires
// the selection callback before them.
var selectedTrackName = ""
var selectedTrackColour = { r: 0, g: 0, b: 0 }
var selectionDirty = false
var focusTrackKey = ""          // what ROTO was last told; "" = unknown
var focusTrackShown = null      // { slot, name, colour } ROTO has as selected; null = unknown
// ROTO ignores DAW_SELECT_FOCUS_TRACK for its current index, so a selected
// track outside the bank alternates between two out-of-range indices.
var outOfBankIndex = 0x3FFF
// ROTO's selected track index (the last one we sent, or ROTO picked); null =
// unknown. The firmware compares against it (see quickCtrlRotoSelect).
var rotoSelectedIndex = null

function resolveSelectedTrack(context) {
    selectionDirty = false
    if (activeMode != ACTIVE_MODE_MIX && !quickCtrlActive() && !pluginModeActive()) return
    var slot = -1
    for (var i=0; i<NUM_CONTROL_PAIRS; i++) {
        if (channels[i] !== undefined && channels[i].id !== "" && channels[i].id === selectedChannelId) {
            slot = i
            break
        }
    }
    const c = selectedTrackColour
    const track = selectedChannelId + "|" + selectedTrackName + "|" + c.r + "," + c.g + "," + c.b
    const key = track + "#" + slot
    // QUICK CTRL and PLUGIN never send the slot, so the selected track moving
    // to another bank slot (e.g. a track inserted above it) isn't a change
    const shownTrack = focusTrackKey.slice(0, focusTrackKey.lastIndexOf("#"))
    const unchanged = (quickCtrlActive() || pluginModeActive()) ? (track === shownTrack) : (key === focusTrackKey)
    if (unchanged) return
    focusTrackKey = key

    // Same bank slot as before: only the name or colour changed (a rename or
    // recolour). ROTO ignores DAW_SELECT_FOCUS_TRACK for its current index,
    // so update the selected track in place. Never for an out-of-bank track:
    // the firmware indexes its track table with the selected index.
    // QUICK CTRL titles its screen with the selected track (firmware
    // _process_plugin_track_selected). ROTO's track registry is cleared in
    // PLUGIN mode, so always send the whole track, under an out-of-bank index
    // so a rename isn't ignored as the current index; MIX entry re-sends the
    // real slot.
    // PLUGIN mode likewise; there ROTO also clears its selected plugin on it
    // (firmware _process_plugin_track_selected), so the plugin list follows.
    if (quickCtrlActive() || pluginModeActive()) {
        if (pluginModeActive() && pluginLearnHeld()) {
            // ROTO would drop the plugin it learns; sent on LEARN off
            focusTrackKey = ""
            return
        }
        if (pluginEarlyTrackID !== "") {
            const early = (selectedChannelId === pluginEarlyTrackID)
            pluginEarlyTrackID = ""
            if (early) {
                // ROTO picked this track itself (titled it) and has its list
                // (pluginEarlyPick): don't make it drop the plugin
                focusTrackShown = null
                pluginTrackSelected(true)
                if (quickCtrlActive()) {
                    // (The Quick Controls are the selected track's: they
                    // were held back until Cubase selected it)
                    quickCtrlTrackChanged()
                    quickCtrlAwaitSelect = false
                }
                return
            }
        }
        outOfBankIndex = (outOfBankIndex == 0x3FFF) ? 0x3FFE : 0x3FFF
        midi.sendDawSelectFocusTrack(config, context, outOfBankIndex, selectedTrackName, selectedTrackColour)
        if (quickCtrlActive()) holdQuickCtrlKnobs(QUICK_CTRL_SELECT_KNOBS_MS)
        rotoSelectedIndex = outOfBankIndex
        focusTrackShown = null
        // QUICK CTRL: ROTO dropped its plugin and labels (firmware
        // _process_plugin_track_selected); the labels go out after the new
        // track's list and select (pluginTrackSelected)
        if (quickCtrlActive()) quickCtrlTrackChanged()
        pluginTrackSelected()
        // A bank track: read its list through its slot now, rather than
        // wait for the selected-track DirectAccess to move (~100 ms)
        if (slot >= 0 && pluginFollowing()) {
            pluginEarlyPick = { bank: activeBank, slot: slot, id: selectedChannelId, cubase: true }
        }
        return
    }

    const shown = focusTrackShown
    if (slot >= 0 && shown && shown.slot === slot) {
        if (shown.name !== selectedTrackName) {
            midi.sendSetCurrentTrackName(config, context, selectedTrackName)
        }
        if (shown.colour.r !== c.r || shown.colour.g !== c.g || shown.colour.b !== c.b) {
            midi.sendSetCurrentTrackColour(config, context, c)
        }
        focusTrackShown = { slot, name: selectedTrackName, colour: { r: c.r, g: c.g, b: c.b } }
        return
    }

    var index = slot
    if (slot < 0) {
        outOfBankIndex = (outOfBankIndex == 0x3FFF) ? 0x3FFE : 0x3FFF
        index = outOfBankIndex
    }
    utils.log("TRACK_SELECT name=\"" + selectedTrackName + "\" slot=" + slot, utils.LOG_VERBOSE)
    midi.sendDawSelectFocusTrack(config, context, index, selectedTrackName, selectedTrackColour)
    rotoSelectedIndex = index
    focusTrackShown = { slot, name: selectedTrackName, colour: { r: c.r, g: c.g, b: c.b } }
}

// A bank slot's track name changed (or the slot emptied: name "").
// fromHost: the bank channel's own title, which is always the slot's track and
// only goes "" when the slot really empties. The knob's surface title also
// goes "" for a moment on every sub-page rebind (mode change, bank toggle;
// seen ~70 ms after), so a "" from it is ignored: no time window, which a
// slower or faster machine could miss (FEATURE_GAPS, timing #1).
function onBankTrackTitle(context, bank, index, name, fromHost) {
    if (name === "" && !fromHost) return
    // Cache even before the handshake: the initial-binding titles fire while
    // activeMode == NONE, and setMixAllTracksMode flushes the cache once ROTO
    // is ready. The inactive bank is cached too, for when ROTO switches to it.
    const cache = bankChannels[bank]
    if (cache[index] == undefined) {
        cache[index] = { id: '', name, colour: { r: 0, g: 0, b: 0 } }
    }
    else {
        cache[index].name = name
    }
    if (!trackListActive() || bank != activeBank || bankSendsHeld()) {
        return
    }
    if (name !== "") {
        sendTrackName(context, index, name)
    }
    else {
        // Slot vacated — clear it and extinguish the meter ring; the meter
        // callback for the now-unbound channel will stop firing.
        sendTrackReset(context, index)
    }
    // Bank rebind — drop any peak held against the previous channel.
    meterMaxHold[index] = 0
}

// Cubase reports colours as 0..1 floats; ROTO takes 0..255.
function colourFromHost(r, g, b) {
    return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) }
}

function makeSurfaceElements() {
    var surfaceElements = {}
    surfaceElements.controlsStrip = makeControlsStrip()
    surfaceElements.rewind = makeTransportCcCatcher('Transport Rewind', TRANSPORT_REWIND_CC)
    surfaceElements.forward = makeTransportCcCatcher('Transport Forward', TRANSPORT_FORWARD_CC)
    const endlessNames = ['Transport Zoom', 'Transport Zoom Vertical', 'Transport Tempo', 'Transport Zoom Waveform']
    surfaceElements.endless = []
    for (var i=0; i<NUM_ENDLESS_KNOBS; i++) {
        const cc = (i === ENDLESS_ZOOM_WAVE) ? TRANSPORT_ZOOM_WAVE_CC : TRANSPORT_ENDLESS_CC_BASE + i
        surfaceElements.endless[i] = makeTransportCcCatcher(endlessNames[i], cc)
        surfaceElements.endless[i].mOnProcessValueChange = function(context, value) {
            endlessKnobTurned(context, this.i, value)
        }.bind({i})
    }
    // Knob 4: the Control Room level. Input only: sent back by hand
    // (sendCrLevel), as the mixer knobs.
    surfaceElements.crLevel = config.deviceDriver.mSurface.makeCustomValueVariable('Transport Control Room Level')
    surfaceElements.crLevel.mMidiBinding
        .setInputPort(config.midiInput)
        .bindToControlChange14Bit(DEFAULT_MIDI_CHANNEL, TRANSPORT_CR_LEVEL_CC)
    surfaceElements.crLevel.mOnProcessValueChange = function(context, value) {
        sendCrLevel(context, value)
    }
    crLevelKnob = makeKnobTurnWatch('Transport Control Room Level Input', TRANSPORT_CR_LEVEL_CC)
    // (In captures: to check the firmware's 0 dB indent, the channel fader's,
    // lands on the Control Room's 0 dB)
    surfaceElements.crLevel.mOnDisplayValueChange = function(context, displayValue, units) {
        utils.log("CR level \"" + displayValue + " " + units + "\" value14=" + crLevelSent, utils.LOG_VERBOSE)
        if (knobTurning(crLevelKnob)) {
            transportPopup(context, TRANSPORT_CR_LEVEL_KNOB, formatDisplayValue(displayValue, units), false)
        }
    }
    // Knob 8: the AI knob, onto the value under the mouse. Input only: sent
    // back by hand (sendAiKnob), as the Control Room level.
    surfaceElements.aiKnob = config.deviceDriver.mSurface.makeCustomValueVariable('Transport AI Knob')
    surfaceElements.aiKnob.mMidiBinding
        .setInputPort(config.midiInput)
        .bindToControlChange14Bit(DEFAULT_MIDI_CHANNEL, TRANSPORT_AI_KNOB_CC)
    surfaceElements.aiKnob.mOnProcessValueChange = function(context, value) {
        sendAiKnob(context, value)
    }
    aiKnob = makeKnobTurnWatch('Transport AI Knob Input', TRANSPORT_AI_KNOB_CC)
    // The zoom key commands' triggers (no MIDI): [endless knob][0: out, 1: in]
    // (none for the tempo knob)
    surfaceElements.zoomCommands = []
    surfaceElements.zoomCommands[ENDLESS_ZOOM] =
        [config.deviceDriver.mSurface.makeCustomValueVariable('Zoom Out'),
         config.deviceDriver.mSurface.makeCustomValueVariable('Zoom In')]
    surfaceElements.zoomCommands[ENDLESS_ZOOM + 1] =
        [config.deviceDriver.mSurface.makeCustomValueVariable('Zoom Out Vertically'),
         config.deviceDriver.mSurface.makeCustomValueVariable('Zoom In Vertically')]
    surfaceElements.zoomCommands[ENDLESS_ZOOM_WAVE] =
        [config.deviceDriver.mSurface.makeCustomValueVariable('Zoom Out Of Waveform Vertically'),
         config.deviceDriver.mSurface.makeCustomValueVariable('Zoom In On Waveform Vertically')]
    return surfaceElements
}

// The detent each endless knob last rested on; null = unknown (the next
// value only sets it). Forgotten on each transport entry, as the knob may have
// been turned in another mode meanwhile.
var endlessDetent = [null, null, null, null]

function resetEndlessKnobs() {
    endlessDetent = [null, null, null, null]
}



// An endless knob's angle: one step per detent passed, clockwise up.
function endlessKnobTurned(context, i, value) {
    const pos = value * ENDLESS_DETENTS
    const detent = Math.round(pos)
    if (Math.abs(pos - detent) > DETENT_WINDOW) return
    const d = detent % ENDLESS_DETENTS
    const last = endlessDetent[i]
    endlessDetent[i] = d
    if (last === null) return
    // The shorter way round (it wraps at the top)
    var steps = (d - last + ENDLESS_DETENTS) % ENDLESS_DETENTS
    if (steps > ENDLESS_DETENTS / 2) steps -= ENDLESS_DETENTS
    if (steps === 0) return
    if (i === ENDLESS_TEMPO) {
        tempoSteps(context, steps)
        return
    }
    const command = surfaceElements.zoomCommands[i][steps > 0 ? 1 : 0]
    for (var n=0; n<Math.abs(steps); n++) {
        // A press per step (as a key command button: on, then off)
        command.setProcessValue(context, 1)
        command.setProcessValue(context, 0)
    }
}

// Tempo. setTempoBPM needs the page's activeMapping: the steps are applied
// straight away with its last one (as DirectAccess from MIDI callbacks), else
// on the page's next idle tick. The tempo is Cubase's (mOnChangeTempoBPM),
// stepped on locally so a fast turn adds up before Cubase reports it.
var tempoBPM = null                 // null = not reported yet
var tempoPendingSteps = 0
var tempoTurnedMs = 0               // the last detent

function tempoSteps(context, steps) {
    tempoPendingSteps += steps
    tempoTurnedMs = Date.now()
    if (pluginMapping) applyTempoSteps(pluginMapping)
    if (tempoBPM === null) return
    // The tempo it's going to (Cubase's report trails it). Forced: each
    // detent is a turn, so the limit shows again once its popup has gone.
    const bpm = Math.max(TEMPO_MIN_BPM, Math.min(TEMPO_MAX_BPM, tempoBPM + tempoPendingSteps))
    transportPopup(context, TRANSPORT_TEMPO_KNOB, formatBpm(bpm), true)
}

function formatBpm(bpm) {
    return (Math.round(bpm * 100) / 100) + " BPM"
}

// TRANSPORT's value popups (user request 2026-11-06): the Control Room level,
// tempo and the AI knob show their value in place of the knob's label while
// turned, as the mixer knobs do (the firmware reverts after 1.2 s). Sent only
// for a turn (TRANSPORT has no touch CCs: the turn watches, a tempo detent),
// at most VALUE_UPDATE_PERIOD_MS apart; the last of a turn from the device's
// idle (flushTransportPopups).
var transportPopupLatest = {}       // by knob: the string to show
var transportPopupSent = {}         // by knob: the string last sent
var transportPopupMs = {}           // by knob: when it was sent

function transportPopup(context, index, str, force) {
    // ("" = nothing to show: the AI knob's when the mouse is off a parameter)
    if (!transportShown || !str) return
    transportPopupLatest[index] = str
    if (force) transportPopupSent[index] = null
    sendTransportPopup(context, index)
}

function sendTransportPopup(context, index) {
    const str = transportPopupLatest[index]
    if (str === undefined || str === transportPopupSent[index]) return
    const now = Date.now()
    if (now - (transportPopupMs[index] || 0) < VALUE_UPDATE_PERIOD_MS) return
    transportPopupSent[index] = str
    transportPopupMs[index] = now
    midi.sendParamValue(config, context, false, index, str)
}

function flushTransportPopups(context) {
    if (!transportShown) return
    // The tempo knob shows the tempo all the time (user request 2026-11-06;
    // the firmware keeps it, with no revert timer): sent on each transport
    // entry (resetTransportPopups) and when it changes. While it's turned,
    // the turn's own value (tempoSteps), as Cubase's reports trail it
    if (tempoBPM !== null && Date.now() - tempoTurnedMs >= KNOB_ECHO_HOLD_MS) {
        transportPopupLatest[TRANSPORT_TEMPO_KNOB] = formatBpm(tempoBPM)
    }
    for (var index in transportPopupLatest) sendTransportPopup(context, Number(index))
}

// On each transport entry: nothing shown
function resetTransportPopups() {
    transportPopupLatest = {}
    transportPopupSent = {}
    transportPopupMs = {}
}

function applyTempoSteps(mapping) {
    if (tempoPendingSteps === 0 || tempoBPM === null) return
    const bpm = Math.max(TEMPO_MIN_BPM, Math.min(TEMPO_MAX_BPM, tempoBPM + tempoPendingSteps))
    tempoPendingSteps = 0
    if (bpm === tempoBPM) return
    tempoBPM = bpm
    page.mHostAccess.mTransport.mTimeDisplay.setTempoBPM(mapping, bpm)
}

function knobTurning(knob) {
    return Date.now() - knob.turnedMs < KNOB_ECHO_HOLD_MS
}

// ROTO's CCs for a positioned knob, on an input-only variable of their own.
// Returns the knob's state: when it was last turned, and whether a position
// waits for the turn to end (KNOB_ECHO_HOLD_MS).
function makeKnobTurnWatch(name, cc) {
    const knob = { turnedMs: 0, pending: false }
    const input = config.deviceDriver.mSurface.makeCustomValueVariable(name)
    input.mMidiBinding
        .setInputPort(config.midiInput)
        .bindToControlChange14Bit(DEFAULT_MIDI_CHANNEL, cc)
    input.mOnProcessValueChange = function(context, value) {
        knob.turnedMs = Date.now()
    }
    return knob
}

// From the device's idle: a turn ended, send the value the knob ended on
function flushKnobPositions(context) {
    if (aiKnob.pending && !knobTurning(aiKnob)) {
        aiKnob.pending = false
        sendAiKnob(context, surfaceElements.aiKnob.getProcessValue(context))
    }
    if (crLevelKnob.pending && !knobTurning(crLevelKnob)) {
        crLevelKnob.pending = false
        sendCrLevel(context, surfaceElements.crLevel.getProcessValue(context))
    }
}

// The AI knob's position: the value under the mouse, repeats skipped (only
// mapped in TRANSPORT; re-sent on each transport entry)
var aiKnobSent = null               // 14-bit value; null = unknown
var aiKnob                          // (made in makeSurfaceElements, which runs first: no initialiser)

function sendAiKnob(context, value) {
    if (knobTurning(aiKnob)) {
        aiKnob.pending = true
        return
    }
    const value14 = Math.round(value * KNOB_14BIT_MAX)
    if (aiKnobSent === value14) return
    aiKnobSent = value14
    midi.sendMidiCc14Bit(config, context, TRANSPORT_AI_KNOB_CC, value14)
}

// The AI knob's haptics follow the parameter under the mouse (user request
// 2026-11-06). Cubase names it by object and parameter title. Cubase's own
// plugins: "StudioEQ" / "1 Gain", the names their Quick Controls show, so
// QUICK CTRL's database gives the haptics (two instances are both "EQ-M5",
// capture 2026-11-06). The mixer: a channel's fader is the track's name /
// "Volume" ("Surge XT 01" / "Volume" was an instrument track's), its panner
// "Standard Panner" / "Pan Left-Right". Mute, solo and the other buttons
// aren't under the AI knob at all (the same capture: no title). Anything else
// is continuous. The title is "" / "" with the mouse off a parameter, which
// keeps the last haptics (the knob may be locked on it).
var aiObjectTitle = ''
var aiValueTitle = ''
var aiHapticsSent = null            // the haptics ROTO has, joined; null = unknown

// (PROPOSED API: with getReferencedParameter on the value under the mouse and
// a step count from DirectAccess, this could go by the parameter itself,
// not titles; see the note above quickCtrlHaptics)
function aiKnobHaptics(objectTitle, valueTitle) {
    const byTitle = pluginHapticsFor(objectTitle)
    if (byTitle && Object.prototype.hasOwnProperty.call(byTitle, valueTitle)) return byTitle[valueTitle]
    // (Else the mixer's: an instrument track is named after its instrument,
    // "Retrologue 01" / "Volume" is its fader. A plugin's own "Volume" gets the
    // fader's indent too: its object title can't be told from a track's)
    if (valueTitle === 'Volume') return AI_HAPTICS_FADER
    if (AI_PAN_TITLES.indexOf(valueTitle) >= 0) return AI_HAPTICS_CENTRE
    return QC_HAPTICS_CONTINUOUS
}

// Only in TRANSPORT (the firmware ignores it elsewhere), repeats skipped
function sendAiKnobHaptics(context) {
    if (!transportShown || !aiValueTitle) return
    const h = aiKnobHaptics(aiObjectTitle, aiValueTitle)
    const key = h.join(',')
    if (key === aiHapticsSent) return
    aiHapticsSent = key
    utils.log("AI haptics " + key + " for \"" + aiObjectTitle + "\" / \"" + aiValueTitle + "\"", utils.LOG_VERBOSE)
    midi.sendSetAiKnobHaptics(config, context, h)
}

// The Control Room level's knob position, repeats skipped. Sent in any mode:
// the firmware only maps CC 9 in TRANSPORT, and the position is re-sent on
// each transport entry.
var crLevelSent = null              // 14-bit value; null = unknown
var crLevelKnob                     // (likewise)

function sendCrLevel(context, value) {
    if (knobTurning(crLevelKnob)) {
        crLevelKnob.pending = true
        return
    }
    const value14 = Math.round(value * KNOB_14BIT_MAX)
    if (crLevelSent === value14) return
    crLevelSent = value14
    midi.sendMidiCc14Bit(config, context, TRANSPORT_CR_LEVEL_CC, value14)
}

// Invisible input-only CC catcher for a held transport button (no feedback).
function makeTransportCcCatcher(name, cc) {
    var catcher = config.deviceDriver.mSurface.makeCustomValueVariable(name)
    catcher.mMidiBinding
        .setInputPort(config.midiInput)
        .bindToControlChange(DEFAULT_MIDI_CHANNEL, cc)
    return catcher
}

//-----------------------------------------------------------------------------
// TRANSPORT buttons 5 and 6 (user request 2026-11-17): CUE MIX cycles the
// Control Room's source (Main Mix -> Cue 1 -> Cue 2 ... -> Main Mix), MONITOR
// its monitor set (A -> B ...). Each press is Cubase's own key command,
// 'Control Room' / 'Switch: Source Select' and 'Switch: Speakers Select': they
// cycle through what the project has, skipping cues and monitor sets that
// don't exist. The selectors themselves can be written (1 selects one, 0 on
// the selected cue goes back to Main Mix), but the API can't tell which monitor
// sets exist: a missing one reads 'Off' as the others, and writing it does
// nothing (cr_probe.js captures 2026-11-17). increment() does nothing.
// Each button's label is what it selects now: the cue channel's title (the
// project's name for it), "Main Mix", or "MONITOR A".."D" (the API gives no
// monitor set names; lettered as Cubase's Control Room), sent as a switch PARAM_VALUES,
// which the Cubase firmware keeps as the label (_transport_switch_str). LED:
// CUE MIX while a cue is the source, MONITOR while the set isn't the first.
// Both come from the selectors, which follow Cubase's own Control Room too
// (their values: the display can lag, 'On' with the value 0).
// (Set up in makeControlRoomButtons: it runs at load, before this part of the
// file, whose initialisers would empty them again)
var crMonitorOn            // by monitor set: selected
var crCueOn                // by cue: the Control Room's source
var crCueNames
var crMixOn                // Main Mix is the source
var crExtOn                // an external input is the source
var crReported             // any selector has reported
var crCommands             // TRANSPORT button -> its key command's trigger
var crLabelSent            // TRANSPORT button -> the label ROTO has (the firmware keeps it)
var crLedSent              // TRANSPORT button -> the LED ROTO has (TRANSPORT only)
function crMaxCount(f, fallback) {
    try {
        const n = f()
        if (typeof n === 'number' && n > 0) return Math.min(n, fallback)
    }
    catch (e) {}
    return fallback
}

function makeControlRoomButtons(page) {
    const surface = config.deviceDriver.mSurface
    const cr = page.mHostAccess.mControlRoom
    const main = cr.mMainChannel
    crMonitorOn = []; crCueOn = []; crCueNames = []
    crMixOn = false; crExtOn = false; crReported = false
    crCommands = {}; crLabelSent = {}; crLedSent = {}
    crCommands[TRANSPORT_CUE_BUTTON] = surface.makeCustomValueVariable('Control Room Source Select')
    crCommands[TRANSPORT_MONITOR_BUTTON] = surface.makeCustomValueVariable('Control Room Speakers Select')
    page.makeCommandBinding(crCommands[TRANSPORT_CUE_BUTTON], 'Control Room', 'Switch: Source Select')
    page.makeCommandBinding(crCommands[TRANSPORT_MONITOR_BUTTON], 'Control Room', 'Switch: Speakers Select')

    // A sink on a selector: set(on) on each change
    function sink(name, host, set) {
        const v = surface.makeCustomValueVariable(name)
        page.makeValueBinding(v, host)
        v.mOnProcessValueChange = function(context, value) {
            set(value > 0.5)
            crReported = true
        }
        return v
    }
    // A sink on a channel's level, for its title (the channel's name)
    // (Cubase's generic titles, as a missing cue's "Control Room", aren't names)
    function nameSink(name, channel, names, i, what) {
        names[i] = ''
        const v = surface.makeCustomValueVariable(name)
        page.makeValueBinding(v, channel.mLevelValue)
        v.mOnTitleChange = function(context, objectTitle, valueTitle) {
            if (!objectTitle || objectTitle === names[i] || /^(VST )?Control Room$/.test(objectTitle)) return
            names[i] = objectTitle
            utils.log("CR " + what + " " + (i + 1) + " name \"" + objectTitle + "\"", utils.LOG_VERBOSE)
        }
    }

    const defs = midiremote_api.mDefaults
    const nMon = crMaxCount(function() { return defs.getMaxControlRoomMonitorChannels() }, CR_MAX_MONITORS)
    const nCue = crMaxCount(function() { return defs.getMaxControlRoomCueChannels() }, CR_MAX_CUES)
    for (var m=0; m<nMon; m++) {
        crMonitorOn[m] = false
        sink('Control Room Monitor ' + (m + 1), cr.getSelectTargetMonitorValueByIndex(m),
             function(on) { crMonitorOn[this.m] = on }.bind({m}))
        // (No names: the API gives none for a monitor set. Its level, mute and
        // insert bypass titles, and the channel's own title, were all '' in a
        // capture, renamed or not; 2026-11-17)
    }
    for (var c=0; c<nCue; c++) {
        crCueOn[c] = false
        sink('Control Room Source Cue ' + (c + 1), main.getSelectSourceCueValueByIndex(c),
             function(on) { crCueOn[this.c] = on }.bind({c}))
        nameSink('Control Room Cue ' + (c + 1) + ' Name', cr.getCueChannelByIndex(c), crCueNames, c, 'cue')
    }
    sink('Control Room Source Main Mix', main.mSelectSourceMonitorMixValue, function(on) { crMixOn = on })
    sink('Control Room Source Ext', main.mSelectSourceExternalInputValue, function(on) { crExtOn = on })
}

function crSelected(list) {
    for (var i=0; i<list.length; i++) {
        if (list[i]) return i
    }
    return -1
}

function crCueLit() {
    return crSelected(crCueOn) >= 0
}

function crMonitorLit() {
    return crSelected(crMonitorOn) > 0
}

// What each button shows: the source and the monitor set selected now ("" =
// not known yet: the firmware's own label stays)
function crSourceLabel() {
    const c = crSelected(crCueOn)
    if (c >= 0) return crCueNames[c] || ('Cue ' + (c + 1))
    if (crExtOn) return 'Ext. Input'
    if (crMixOn) return 'Main Mix'
    return ''
}

function crMonitorLabel() {
    const m = crSelected(crMonitorOn)
    if (m < 0) return ''
    // (Lettered, as Cubase's Control Room labels them, user request 2026-11-17)
    return 'MONITOR ' + 'ABCD'.charAt(m)
}

function controlRoomButtonPressed(context, button) {
    const trigger = crCommands[button]
    if (!trigger) return
    utils.log("CR " + (button === TRANSPORT_CUE_BUTTON ? "Source Select" : "Speakers Select"), utils.LOG_VERBOSE)
    // A press of the key command (on, then off), as the zoom knobs'
    trigger.setProcessValue(context, 1)
    trigger.setProcessValue(context, 0)
}

// From the device's idle, on TRANSPORT: the labels and LEDs that changed (a
// change comes as two callbacks, the old selector off and the new one on)
function flushControlRoomButtons(context) {
    if (!transportShown || !crReported) return
    const buttons = [TRANSPORT_CUE_BUTTON, TRANSPORT_MONITOR_BUTTON]
    const labels = [crSourceLabel(), crMonitorLabel()]
    const leds = [crCueLit(), crMonitorLit()]
    for (var n=0; n<buttons.length; n++) {
        const b = buttons[n]
        if (labels[n] && labels[n] !== crLabelSent[b]) {
            crLabelSent[b] = labels[n]
            utils.log("CR button " + (b + 1) + " \"" + labels[n] + "\"", utils.LOG_VERBOSE)
            midi.sendParamValue(config, context, true, b, labels[n])
        }
        if (leds[n] !== crLedSent[b]) {
            crLedSent[b] = leds[n]
            midi.sendMidiCc7it(config, context, TRANSPORT_BUTTON_CC_BASE + b, leds[n] ? 127 : 0)
        }
    }
}

// Reply to REQUEST_TRANSPORT_STATUS: the transport catchers mirror their
// host values, so their current values are the button LED states.
function sendTransportStatus(context) {
    const states = []
    for (var i=0; i<NUM_CONTROL_PAIRS; i++) {
        if (i === TRANSPORT_CUE_BUTTON) states.push(crCueLit())
        else if (i === TRANSPORT_MONITOR_BUTTON) states.push(crMonitorLit())
        else states.push((i < NUM_TRANSPORT_BUTTONS || i === TRANSPORT_METRONOME_BUTTON || i === TRANSPORT_AI_LOCK_BUTTON) &&
                         surfaceElements.controlsStrip[i].transport.getProcessValue(context) > 0.5)
    }
    midi.sendTransportStatus(config, context, states)
}

//-----------------------------------------------------------------------------
// Meter enable states (SET_MIX_VU_METER_STATES): a slot's meter is greyed when
// its track is muted, or — if any track in the bank is soloed — not soloed,
// matching the Ableton script. The MIDI Remote API has no project-wide solo
// state, so a track soloed outside the bank doesn't grey these.
//-----------------------------------------------------------------------------
var bankMuted = [[], []]
var bankSoloed = [[], []]
var meterStatesDirty = false
var meterStatesKey = null      // states ROTO has; null = unknown
// The selected track's mute / solo (FUNC's meter state) and meter hold
var selMuted = false
var selSoloed = false
var selMeterMaxHold = 0
var selMeterLastSendMs = 0

function updateMeterStates(context) {
    meterStatesDirty = false
    var anySolo = false
    const muted = bankMuted[activeBank]
    const soloed = bankSoloed[activeBank]
    for (var i=0; i<NUM_CONTROL_PAIRS; i++) {
        if (soloed[i] && displayedName[i]) anySolo = true
    }
    const enabled = []
    if (mixMode == MIX_MODE_TRACK_FOCUS) {
        // FUNC: only knob 0 (VOLUME) has a meter, the selected track's, as
        // Ableton's MODE_SELECTED. (Solo seen in the bank, or on the track:
        // the API has no project-wide solo.)
        if (selSoloed) anySolo = true
        enabled.push(anySolo ? selSoloed : !selMuted)
        for (var i=1; i<NUM_CONTROL_PAIRS; i++) enabled.push(true)
    }
    else {
        for (var i=0; i<NUM_CONTROL_PAIRS; i++) {
            enabled.push(anySolo ? !!soloed[i] : !muted[i])
        }
    }
    const key = enabled.join(",")
    if (key === meterStatesKey) return
    meterStatesKey = key
    midi.sendSetMixVuMeterStates(config, context, enabled)
}

function makeControlsStrip() {
    var controlsStrip = {}
    for (var i=0; i<NUM_CONTROL_PAIRS; i++) {
        // Add the knob control
        controlsStrip[i] = {}
        controlsStrip[i].knob = config.deviceDriver.mSurface.makeKnob(i, 0, 1, 1)
        // No setOutputPort: mOnProcessValueChange does the emit. Binding both
        // would double-CC every value change (auto-feedback + manual).
        controlsStrip[i].knob.mSurfaceValue.mMidiBinding
            .setInputPort(config.midiInput)
            .bindToControlChange14Bit(DEFAULT_MIDI_CHANNEL, (PLUGIN_MIX_MODE_KNOB_CC_BASE + i))
        controlsStrip[i].knob.mSurfaceValue.mOnProcessValueChange = function(context, value, diff) {
            // Vacant slots stay parked at 0 (see the touch release handler).
            if (activeMode == ACTIVE_MODE_MIX && !isVacantSlot(this.i)) {
                // (A bank page being checked: sent with the page)
                if (!bankSendsHeld()) sendKnob(context, this.i, value)
            }
            // (QUICK CTRL: not while the positions wait, holdQuickCtrlKnobs)
            else if (quickCtrlActive()) {
                if (!quickCtrlKnobsPending) sendKnob(context, this.i, value)
            }
            // PLUGIN: it writes its mapped parameter (unless its input
            // variable does, see PLUGIN_KNOB_INPUT_VARS)
            else if (pluginModeActive() && !PLUGIN_KNOB_INPUT_VARS) {
                pluginKnobInput(context, this.i, value)
            }
        }.bind({i})
        // Cache the display string for this slot and push (throttled). The
        // surface value mirrors whichever host parameter the active sub-page
        // has bound, so one hook covers volume/pan/send transitions.
        controlsStrip[i].knob.mSurfaceValue.mOnDisplayValueChange = function(context, displayValue, units) {
            // (PLUGIN: the knob is unbound; its strings come from the mapped
            // parameter, in sendKnobFeedback)
            if (pluginModeActive()) return
            // (MIX levels: Cubase gives volume and sends no units, "-31.3")
            if (!units && mixKnobIsLevel(this.i)) units = 'dB'
            knobLatestStr[this.i] = formatDisplayValue(displayValue, units)
            if (knobsActive() && (!quickCtrlActive() || quickCtrlPopupAllowed(this.i))) {
                pushKnobValue(context, this.i, false)
            }
        }.bind({i})

        // Add label fields above the button
        controlsStrip[i].label1 = config.deviceDriver.mSurface.makeLabelField(i, 1, 1, 0.5)
        controlsStrip[i].label2 = config.deviceDriver.mSurface.makeLabelField(i, 1.5, 1, 0.5)

        // Add the button control. No setOutputPort (see knob).
        controlsStrip[i].button = config.deviceDriver.mSurface.makeButton(i, 2, 1, 1)
        controlsStrip[i].button.mSurfaceValue.mMidiBinding
            .setInputPort(config.midiInput)
            .bindToControlChange (DEFAULT_MIDI_CHANNEL, (PLUGIN_MIX_MODE_BUTTON_CC_BASE + i))
        // Unlike the knob, we re-assert on diff===0: ROTO resets button display
        // state on bank rebind, so the burst is necessary to keep mutes correct.
        controlsStrip[i].button.mSurfaceValue.mOnProcessValueChange = function(context, value, diff) {
            if (activeMode == ACTIVE_MODE_MIX) {
                // (A bank page being checked: sent with the page)
                if (bankSendsHeld()) return
                // (LISTEN: the dummy bindings' pushes; see pollListen)
                if (mixButtonMode == MIX_BUTTON_MODE_LISTEN) return
                const buttonValue = Math.round(value * 127)
                // The rebind's repeat of a state sent early (sendEarlyButtonStates)
                const early = buttonEarly[this.i]
                if (early !== null && early !== undefined) {
                    buttonEarly[this.i] = null
                    if (early === buttonValue) return
                }
                // Vacant slots keep their button off (sendTrackReset). Cubase's
                // rebind on a MIX-RTN toggle pushed stale "ON"s for the empty
                // slots (capture 2026-11-12); sendTrackName sends the state on refill.
                if (isVacantSlot(this.i)) return
                midi.sendMidiCc7it(config, context, (PLUGIN_MIX_MODE_BUTTON_CC_BASE + this.i), buttonValue)
            }
            // PLUGIN: it writes its mapped parameter (unless its input
            // variable does, see PLUGIN_BUTTON_INPUT_VARS)
            else if (pluginModeActive() && !PLUGIN_BUTTON_INPUT_VARS) {
                pluginButtonInput(context, this.i, value)
            }
        }.bind({i})

        // Touch detector — ROTO emits CC 52..59 with value>0 on touch press
        // and 0 on release. On press we force-emit the cached knob string at
        // this slot so the ROTO display lights up immediately. Input only: with
        // an output port, Cubase echoed every touch CC back to ROTO (seen in a
        // capture), and ROTO has no use for it.
        controlsStrip[i].touch = config.deviceDriver.mSurface.makeCustomValueVariable('Knob Touch ' + (i + 1).toString())
        controlsStrip[i].touch.mMidiBinding
            .setInputPort(config.midiInput)
            .bindToControlChange(DEFAULT_MIDI_CHANNEL, (KNOB_TOUCH_CC_BASE + i))
        controlsStrip[i].touch.mOnProcessValueChange = function(context, value, diff) {
            knobTouched[this.i] = (value > 0)
            if (value == 0) knobReleasedMs[this.i] = Date.now()
            pluginKnobTouch(this.i, value > 0)
            // (PLUGIN: mapped knobs only; an unmapped knob has no value)
            if (value > 0 && knobsActive() && (!pluginModeActive() || pluginKnobMap[this.i])) {
                pushKnobValue(context, this.i, true)
            }
            // Turned a vacant slot's knob — snap it back to 0 on release.
            if (value == 0 && activeMode == ACTIVE_MODE_MIX && isVacantSlot(this.i)) {
                displayedKnob[this.i] = null
                sendKnob(context, this.i, 0)
            }
        }.bind({i})
        // Touch automation: piping the touch signal into the knob's surface
        // value mTouchState lets Cubase drive the bound parameter's automation
        // lane in Touch / AutoLatch modes — touch press starts writing,
        // release stops. Works automatically across all sub-page bindings.
        if (controlsStrip[i].knob.mSurfaceValue.mTouchState) {
            controlsStrip[i].knob.mSurfaceValue.mTouchState.bindTo(controlsStrip[i].touch)
        }

        // Transport CC catcher — invisible (no x/y); ROTO emits these CCs
        // when the device is in transport mode, regardless of the simulator view.
        // Feedback (LED state) goes out via setOutputPort only — a manual emit
        // in mOnProcessValueChange as well would double every CC.
        // PLUGIN's knob input (see PLUGIN_KNOB_INPUT_VARS): the same 14-bit
        // CC as the knob, input only, bound to nothing in the host
        if (PLUGIN_KNOB_INPUT_VARS) {
            controlsStrip[i].pluginInput = config.deviceDriver.mSurface.makeCustomValueVariable('Plugin Knob Input ' + (i + 1).toString())
            controlsStrip[i].pluginInput.mMidiBinding
                .setInputPort(config.midiInput)
                .bindToControlChange14Bit(DEFAULT_MIDI_CHANNEL, (PLUGIN_MIX_MODE_KNOB_CC_BASE + i))
            controlsStrip[i].pluginInput.mOnProcessValueChange = function(context, value, diff) {
                if (pluginModeActive()) pluginKnobInput(context, this.i, value)
            }.bind({i})
        }

        // PLUGIN's switch input (see PLUGIN_BUTTON_INPUT_VARS): the same CC
        // as the button, input only, bound to nothing in the host
        if (PLUGIN_BUTTON_INPUT_VARS) {
            controlsStrip[i].pluginButtonInput = config.deviceDriver.mSurface.makeCustomValueVariable('Plugin Button Input ' + (i + 1).toString())
            controlsStrip[i].pluginButtonInput.mMidiBinding
                .setInputPort(config.midiInput)
                .bindToControlChange(DEFAULT_MIDI_CHANNEL, (PLUGIN_MIX_MODE_BUTTON_CC_BASE + i))
            controlsStrip[i].pluginButtonInput.mOnProcessValueChange = function(context, value, diff) {
                if (pluginModeActive()) pluginButtonInput(context, this.i, value)
                else if (listenModeActive()) listenButtonInput(this.i, value)
            }.bind({i})
        }

        controlsStrip[i].transport = config.deviceDriver.mSurface.makeCustomValueVariable('Transport ' + (i + 1).toString())
        // (The Control Room buttons are input only: they fire key commands,
        // which give no feedback, and the script sends their LEDs)
        const crButton = (i === TRANSPORT_CUE_BUTTON || i === TRANSPORT_MONITOR_BUTTON)
        if (crButton) controlsStrip[i].transport.mMidiBinding.setInputPort(config.midiInput)
        else controlsStrip[i].transport.mMidiBinding.setInputPort(config.midiInput).setOutputPort(config.midiOutput)
        controlsStrip[i].transport.mMidiBinding.bindToControlChange (DEFAULT_MIDI_CHANNEL, (TRANSPORT_BUTTON_CC_BASE + i))
        if (crButton) {
            controlsStrip[i].transport.mOnProcessValueChange = function(context, value) {
                if (value > 0.5) controlRoomButtonPressed(context, this.i)
            }.bind({i})
        }
    }
    return controlsStrip
}

// A sub-page whose activation and deactivation, as Cubase reports them, go to
// the log ("SUBPAGE + Knobs/Plugin"). Debug: in PLUGIN mode the knobs were
// found still moving the mixer faders (2026-10-22).
function tracedSubPage(area, areaName, name) {
    const subPage = area.makeSubPage(name)
    if (!utils.VERBOSE) return subPage
    const label = areaName + '/' + name
    subPage.mOnActivate = function(context, activeMapping) {
        utils.log("SUBPAGE + " + label, utils.LOG_VERBOSE)
    }
    subPage.mOnDeactivate = function(context, activeMapping) {
        utils.log("SUBPAGE - " + label, utils.LOG_VERBOSE)
    }
    return subPage
}

function makePageMixer(page) {
    // All-tracks sub-pages, one set per bank (see BANK_TRACKS / BANK_RETURNS).
    // The tracks bank keeps the original names; the returns bank's have a
    // ' (Returns)' suffix. 'Volume' (tracks) is created first, so it's the
    // Knobs area's default.
    var knobSubPageArea = page.makeSubPageArea('Knobs')
    var subPages = []
    for (var b=0; b<NUM_BANKS; b++) {
        subPages[b] = {}
        subPages[b].volume = tracedSubPage(knobSubPageArea, 'Knobs', 'Volume' + BANK_SUFFIX[b])
        subPages[b].pan = tracedSubPage(knobSubPageArea, 'Knobs', 'Pan' + BANK_SUFFIX[b])
        // One sub-page per send slot (0..7) for all-tracks SEND mode: each binds
        // every bank-slot knob to its corresponding channel's send-N level. ROTO
        // switches between these via the SI byte in SET_MIX_ALL_TRACKS_MODE.
        subPages[b].sends = []
        for (var i=0; i<CUBASE_NUM_SENDS; i++) {
            subPages[b].sends[i] = tracedSubPage(knobSubPageArea, 'Knobs', 'All Tracks Send ' + (i + 1).toString() + BANK_SUFFIX[b])
        }
    }
    // Track focus page 1: knobs 0/1 = volume/pan. Page 2 (sends 7..): no
    // bindings here, so knobs 0/1 are free for the focus send areas. All send
    // knobs come from the focus send areas.
    var subPageTrackFocus = tracedSubPage(knobSubPageArea, 'Knobs', 'Track Focus')
    var subPageTrackFocusSends = tracedSubPage(knobSubPageArea, 'Knobs', 'Track Focus Page 2')
    // PLUGIN mode's QUICK CTRL: knob n = Focus Quick Control n.
    var subPageQuickControls = tracedSubPage(knobSubPageArea, 'Knobs', 'Quick Controls')
    // PLUGIN mode: the script writes mapped parameters itself (DirectAccess),
    // so the knobs mustn't also drive a mixer value. Bound to dummy host
    // values at the end of makePageMixer (an empty sub-page doesn't unbind).
    var subPagePluginKnobs = tracedSubPage(knobSubPageArea, 'Knobs', 'Plugin')
    // One area per knob. 'Off' is created first so it's the default, and must
    // be active outside focus mode — otherwise these knobs would also drive a
    // send alongside their 'Knobs' binding.
    var subPagesFocusSendOff = []
    var subPagesFocusSend = []
    for (var i=0; i<NUM_CONTROL_PAIRS; i++) {
        var focusSendArea = page.makeSubPageArea('Focus Knob ' + (i + 1).toString())
        subPagesFocusSendOff[i] = tracedSubPage(focusSendArea, 'Focus Knob ' + (i + 1), 'Off')
        subPagesFocusSend[i] = []
        for (var s=0; s<CUBASE_NUM_SENDS; s++) {
            subPagesFocusSend[i][s] = tracedSubPage(focusSendArea, 'Focus Knob ' + (i + 1), 'Send ' + (s + 1).toString())
        }
    }
    var buttonSubPageArea = page.makeSubPageArea('Buttons')
    for (var b=0; b<NUM_BANKS; b++) {
        subPages[b].mute = tracedSubPage(buttonSubPageArea, 'Buttons', 'Mute' + BANK_SUFFIX[b])
        subPages[b].solo = tracedSubPage(buttonSubPageArea, 'Buttons', 'Solo' + BANK_SUFFIX[b])
        subPages[b].recEnable = tracedSubPage(buttonSubPageArea, 'Buttons', 'Rec Enable' + BANK_SUFFIX[b])
        subPages[b].inputMon = tracedSubPage(buttonSubPageArea, 'Buttons', 'Input Monitor' + BANK_SUFFIX[b])
    }
    // PLUGIN mode: as subPagePluginKnobs, for the buttons
    var subPagePluginButtons = tracedSubPage(buttonSubPageArea, 'Buttons', 'Plugin Buttons')

    // The MIX bank zones. Tracks: everything but inputs, outputs and FX
    // channels (FX channels are Cubase's equivalent of Ableton's returns).
    // Returns: FX channels plus the outputs (Ableton's returns + master).
    var mixerBankZones = []
    mixerBankZones[BANK_TRACKS] = page.mHostAccess.mMixConsole.makeMixerBankZone()
        .excludeInputChannels()
        .excludeOutputChannels()
        .excludeFXChannels()
    mixerBankZones[BANK_RETURNS] = page.mHostAccess.mMixConsole.makeMixerBankZone()
        .includeFXChannels()
        .includeOutputChannels()

    // Create the custom value variables to activate the various sub-pages,
    // page the banks, select a channel, and the sinks (see below).
    var pageMixer = {}
    var mkVar = function(name) { return config.deviceDriver.mSurface.makeCustomValueVariable(name) }
    pageMixer.banks = []
    for (var b=0; b<NUM_BANKS; b++) {
        var sfx = BANK_SUFFIX[b]
        var bank = { channels: [] }
        bank.activateVolume = mkVar('Activate SubPage Volume' + sfx)
        bank.activatePan = mkVar('Activate SubPage Pan' + sfx)
        bank.activateSends = []
        for (var i=0; i<CUBASE_NUM_SENDS; i++) {
            bank.activateSends[i] = mkVar('Activate SubPage All Tracks Send ' + (i + 1).toString() + sfx)
        }
        bank.activateMute = mkVar('Activate SubPage Mute' + sfx)
        bank.activateSolo = mkVar('Activate SubPage Solo' + sfx)
        bank.activateRecEnable = mkVar('Activate SubPage Rec Enable' + sfx)
        bank.activateInputMon = mkVar('Activate SubPage Input Monitor' + sfx)
        bank.prev = mkVar('Mixer Bank Zone Prev' + sfx)
        bank.next = mkVar('Mixer Bank Zone Next' + sfx)
        bank.select = []
        // Invisible sinks that we bind each channel's mVUMeter to. The binding is
        // what makes Cubase actually push meter values into the host value (and
        // therefore fire mOnProcessValueChange); without it the callback fires
        // with value=0 forever. Same idea for mute/solo, which feed the meter
        // enable states whatever the button mode (the button bindings are only
        // live in their sub-page).
        bank.meterSinks = []
        bank.muteSinks = []
        bank.soloSinks = []
        for (var i=0; i<midi.NUM_MIX_BANK_CHANNELS; i++) {
            bank.select[i] = mkVar('Mixer Channel Select' + (i + 1).toString() + sfx)
            bank.meterSinks[i] = mkVar('Meter Sink ' + (i + 1).toString() + sfx)
            bank.muteSinks[i] = mkVar('Mute Sink ' + (i + 1).toString() + sfx)
            bank.soloSinks[i] = mkVar('Solo Sink ' + (i + 1).toString() + sfx)
        }
        pageMixer.banks[b] = bank
    }
    pageMixer.activateSubPageTrackFocus = mkVar('Activate SubPage Track Focus')
    pageMixer.activateSubPageTrackFocusSends = mkVar('Activate SubPage Track Focus Page 2')
    pageMixer.activateSubPageQuickControls = mkVar('Activate SubPage Quick Controls')
    pageMixer.activateSubPagePluginKnobs = mkVar('Activate SubPage Plugin')
    pageMixer.activateSubPagePluginButtons = mkVar('Activate SubPage Plugin Buttons')
    pageMixer.activateSubPagesFocusSendOff = []
    pageMixer.activateSubPagesFocusSend = []
    for (var i=0; i<NUM_CONTROL_PAIRS; i++) {
        pageMixer.activateSubPagesFocusSendOff[i] = mkVar('Activate Focus Knob ' + (i + 1).toString() + ' Off')
        pageMixer.activateSubPagesFocusSend[i] = []
        for (var s=0; s<CUBASE_NUM_SENDS; s++) {
            pageMixer.activateSubPagesFocusSend[i][s] = mkVar('Activate Focus Knob ' + (i + 1).toString() + ' Send ' + (s + 1).toString())
        }
    }

    // Bind custom value variables
    for (var b=0; b<NUM_BANKS; b++) {
        var bank = pageMixer.banks[b]
        page.makeActionBinding(bank.activateVolume, subPages[b].volume.mAction.mActivate)
        page.makeActionBinding(bank.activatePan, subPages[b].pan.mAction.mActivate)
        for (var i=0; i<CUBASE_NUM_SENDS; i++) {
            page.makeActionBinding(bank.activateSends[i], subPages[b].sends[i].mAction.mActivate)
        }
        page.makeActionBinding(bank.activateMute, subPages[b].mute.mAction.mActivate)
        page.makeActionBinding(bank.activateSolo, subPages[b].solo.mAction.mActivate)
        page.makeActionBinding(bank.activateRecEnable, subPages[b].recEnable.mAction.mActivate)
        page.makeActionBinding(bank.activateInputMon, subPages[b].inputMon.mAction.mActivate)
        page.makeActionBinding(bank.prev, mixerBankZones[b].mAction.mPrevBank)
        page.makeActionBinding(bank.next, mixerBankZones[b].mAction.mNextBank)
    }
    page.makeActionBinding(pageMixer.activateSubPageTrackFocus, subPageTrackFocus.mAction.mActivate)
    page.makeActionBinding(pageMixer.activateSubPageTrackFocusSends, subPageTrackFocusSends.mAction.mActivate)
    page.makeActionBinding(pageMixer.activateSubPageQuickControls, subPageQuickControls.mAction.mActivate)
    page.makeActionBinding(pageMixer.activateSubPagePluginKnobs, subPagePluginKnobs.mAction.mActivate)
    page.makeActionBinding(pageMixer.activateSubPagePluginButtons, subPagePluginButtons.mAction.mActivate)
    for (var i=0; i<NUM_CONTROL_PAIRS; i++) {
        page.makeActionBinding(pageMixer.activateSubPagesFocusSendOff[i], subPagesFocusSendOff[i].mAction.mActivate)
        for (var s=0; s<CUBASE_NUM_SENDS; s++) {
            page.makeActionBinding(pageMixer.activateSubPagesFocusSend[i][s], subPagesFocusSend[i][s].mAction.mActivate)
        }
    }

    function bindChannelBankItem(b, index) {
        var channel = mixerBankZones[b].makeMixerBankChannel()
        var bank = pageMixer.banks[b]
        bank.channels[index] = channel      // (pluginSlotAccess)

        // Track-name update paths. Both feed onBankTrackTitle; sends are deduped.
        // - Host side (the bank channel's own title): always this slot's
        //   track, in every mode. Needed because the knobs also carry the
        //   focus-send bindings, and their surface title no longer re-fires
        //   when a bank page fills or empties the slot.
        // - Surface side (the knob's title): re-fires on sub-page rebinds,
        //   where the host side's diff semantics skip an unchanged title.
        //   objectTitle = bound track name; valueTitle = parameter name.
        //   It's whichever bank is active; in FOCUS it's the focused track, so
        //   it's ignored there. Set once, on the tracks bank's pass.
        channel.mOnTitleChange = function(context, activeMapping, name) {
            onBankTrackTitle(context, this.b, this.index, name, true)
        }.bind({b, index})
        if (b == BANK_TRACKS) {
            surfaceElements.controlsStrip[index].knob.mSurfaceValue.mOnTitleChange = function(context, objectTitle, valueTitle) {
                // FOCUS and PLUGIN bind the knobs to the selected track.
                if ((activeMode == ACTIVE_MODE_MIX && mixMode == MIX_MODE_TRACK_FOCUS) || activeMode == ACTIVE_MODE_PLUGIN) {
                    return
                }
                // Only the fader's title is the track's name. In SEND knob mode
                // it's the send's ("4", "4- fx 04"; capture 2026-10-28 15:03:
                // ROTO's names became "4"), in PAN the panner's ("Standard
                // Panner"; capture 2026-11-13: all 8 names, until the next
                // entry). The bank channel's own title keeps the names then.
                if (mixKnobMode != MIX_KNOB_MODE_VOLUME) return
                onBankTrackTitle(context, activeBank, this.index, objectTitle, false)
            }.bind({index})
        }

        // VU meter: summed channel level pushed to both L/R meter CC slots
        // for this encoder. Throttled to AUDIO_METER_FPS; peak-held within
        // each frame window so brief transients aren't lost between sends.
        channel.mValue.mVUMeter.mOnProcessValueChange = function(context, activeMapping, value) {
            if (activeMode != ACTIVE_MODE_MIX || mixMode != MIX_MODE_ALL_TRACKS || this.b != activeBank) return
            if (bankSendsHeld()) return
            const v7 = Math.round(value * 127)
            if (v7 > meterMaxHold[this.index]) meterMaxHold[this.index] = v7
            const now = Date.now()
            if ((now - meterLastSendMs[this.index]) < AUDIO_METER_PERIOD_MS) return
            meterLastSendMs[this.index] = now
            sendMeter(context, this.index, meterMaxHold[this.index])
            meterMaxHold[this.index] = 0
        }.bind({b, index})

        // Cached in every mode except FOCUS — including before the handshake,
        // since Cubase won't re-fire it — so selection matching (which uses
        // the IDs) and the first-entry flush have them.
        channel.mOnColorChange = function (context, activeMapping, r, g, b, a, isActive) {
            if (activeMode == ACTIVE_MODE_MIX && mixMode == MIX_MODE_TRACK_FOCUS) {
                return
            }
            const cache = bankChannels[this.b]
            const sending = (trackListActive() && this.b == activeBank && !bankSendsHeld())

            const id = channel.getUniqueIDString(activeMapping)
            if (cache[this.index] == undefined) {
                cache[this.index] = { id, name: "", colour: { r: 0, g: 0, b: 0 } }
                selectionDirty = true
            }
            else if (cache[this.index].id !== id) {
                cache[this.index].id = id
                // Bank slot now holds a different channel; re-match selection.
                selectionDirty = true
            }

            // Empty bank slot — Cubase reports black. Don't paint it: the
            // slot still shows the previous track's name until the reset
            // lands, and ROTO would latch black for the next track here.
            // (isActive is undocumented, so also require black.)
            utils.log("COLOUR bank=" + this.b + " slot=" + this.index + " id=\"" + id + "\" active=" + isActive +
                      " rgb=" + r + "," + g + "," + b, utils.LOG_VERBOSE)
            if (id === "" || (!isActive && r == 0 && g == 0 && b == 0)) {
                // Backstop for the empty-slot reset, in case the host title
                // doesn't fire "".
                cache[this.index].name = ""
                if (sending) {
                    sendTrackReset(context, this.index)
                }
                return
            }

            // Set the channel colour
            const colour = colourFromHost(r, g, b)
            cache[this.index].colour = colour
            if (sending && cache[this.index].name !== "") {
                sendTrackColour(context, this.index, colour)
            }
        }.bind({b, index})

        // Relate the labels to the knob and button so they reflect each
        // control's currently-bound parameter (and inherit its host colour).
        // setLabelFieldHostObject doesn't refresh on bank page changes for
        // bank-zone channels — relateTo does, because Cubase re-evaluates the
        // related control's active binding when the bank rebinds.
        if (b == BANK_TRACKS) {
            surfaceElements.controlsStrip[index].label1.relateTo(surfaceElements.controlsStrip[index].knob)
            surfaceElements.controlsStrip[index].label2.relateTo(surfaceElements.controlsStrip[index].button)
        }

        // Bind the knob value to the sub-pages
        var knobValue = surfaceElements.controlsStrip[index].knob.mSurfaceValue
        page.makeValueBinding (knobValue, channel.mValue.mVolume).setSubPage(subPages[b].volume)
        page.makeValueBinding (knobValue, channel.mValue.mPan).setSubPage(subPages[b].pan)
        // All-tracks SEND mode: this slot's knob controls THIS channel's send N
        // for every send sub-page. Activating send sub-page N turns the 8-knob
        // row into a column of send-N levels across the 8 bank channels.
        for (var s=0; s<CUBASE_NUM_SENDS; s++) {
            page.makeValueBinding(knobValue, channel.mSends.getByIndex(s).mLevel).setSubPage(subPages[b].sends[s])
        }

        // Bind the button value to the sub-pages
        var buttonValue = surfaceElements.controlsStrip[index].button.mSurfaceValue
        page.makeValueBinding (buttonValue, channel.mValue.mMute).setSubPage(subPages[b].mute).setTypeToggle()
        page.makeValueBinding (buttonValue, channel.mValue.mSolo).setSubPage(subPages[b].solo).setTypeToggle()
        page.makeValueBinding (buttonValue, channel.mValue.mRecordEnable).setSubPage(subPages[b].recEnable).setTypeToggle()
        page.makeValueBinding (buttonValue, channel.mValue.mMonitorEnable).setSubPage(subPages[b].inputMon).setTypeToggle()

        // Bind channel selection
        page.makeValueBinding(bank.select[index], channel.mValue.mSelected)

        // Activate the VU meter host value so Cubase actually streams data
        // into it. The sink is unused; we read via mOnProcessValueChange above.
        page.makeValueBinding(bank.meterSinks[index], channel.mValue.mVUMeter)
        page.makeValueBinding(bank.muteSinks[index], channel.mValue.mMute)
        page.makeValueBinding(bank.soloSinks[index], channel.mValue.mSolo)
        channel.mValue.mMute.mOnProcessValueChange = function(context, activeMapping, value) {
            bankMuted[this.b][this.index] = value > 0.5
            if (this.b == activeBank) meterStatesDirty = true
        }.bind({b, index})
        channel.mValue.mSolo.mOnProcessValueChange = function(context, activeMapping, value) {
            bankSoloed[this.b][this.index] = value > 0.5
            if (this.b == activeBank) meterStatesDirty = true
        }.bind({b, index})
    }

    // Bind the bank channels to the controls
    for (var b=0; b<NUM_BANKS; b++) {
        for (var i=0; i<midi.NUM_MIX_BANK_CHANNELS; ++i) {
            bindChannelBankItem(b, i)
        }
    }

    // Track focus binds to the selected track's channel.
    var selChannel = page.mHostAccess.mTrackSelection.mMixerChannel
    page.makeValueBinding(surfaceElements.controlsStrip[0].knob.mSurfaceValue, selChannel.mValue.mVolume).setSubPage(subPageTrackFocus)
    page.makeValueBinding(surfaceElements.controlsStrip[1].knob.mSurfaceValue, selChannel.mValue.mPan).setSubPage(subPageTrackFocus)
    for (var i=0; i<NUM_CONTROL_PAIRS; i++) {
        var sendKnobValue = surfaceElements.controlsStrip[i].knob.mSurfaceValue
        for (var s=0; s<CUBASE_NUM_SENDS; s++) {
            page.makeValueBinding(sendKnobValue, selChannel.mSends.getByIndex(s).mLevel).setSubPage(subPagesFocusSend[i][s])
        }
    }

    // PLUGIN: the script writes the mapped parameters itself, but each knob
    // and button still needs a binding in 'Plugin' / 'Plugin Buttons'. A
    // sub-page with no binding for a control leaves its old one live (capture
    // 2026-10-22: the mixer faders still drove the knobs, and the knobs the
    // faders, in PLUGIN). So each is bound to its own dummy host value, as
    // Steinberg's Launchkey MK4 script does. (One shared value would copy one
    // knob's turns into the others.)
    // Default takeover mode, not jump: with jump on the (inactive) dummy, in
    // MIX a knob released was set to its dummy's stale value, and the volume
    // jumped (capture 2026-10-22 13:52). PLUGIN reads its knobs from their
    // input variables (PLUGIN_KNOB_INPUT_VARS), so the knob's own value, and
    // how the dummy takes it over, don't matter there.
    for (var i=0; i<NUM_CONTROL_PAIRS; i++) {
        page.makeValueBinding(surfaceElements.controlsStrip[i].knob.mSurfaceValue,
            page.mCustom.makeHostValueVariable('Plugin Knob ' + (i + 1).toString()))
            .setSubPage(subPagePluginKnobs)
        page.makeValueBinding(surfaceElements.controlsStrip[i].button.mSurfaceValue,
            page.mCustom.makeHostValueVariable('Plugin Button ' + (i + 1).toString()))
            .setSubPage(subPagePluginButtons)
    }

    // A send slot's title is "<n>- <destination>" when routed (e.g. "1- fx 2")
    // and just its slot number ("2") when not. Keep the destination only.
    for (var s=0; s<CUBASE_NUM_SENDS; s++) {
        selChannel.mSends.getByIndex(s).mOnTitleChange = function(context, activeMapping, title) {
            utils.log("SEND_TITLE send=" + this.s + " title=\"" + title + "\"", utils.LOG_VERBOSE)
            const name = (title && !/^\d+$/.test(title)) ? title.replace(/^\d+-\s*/, "") : ""
            if (focusSendNames[this.s] === name) return
            focusSendNames[this.s] = name
            focusSendsDirty = true
        }.bind({s})
    }

    // QUICK CTRL: the Focus Quick Controls (their titles, the labels, are
    // kept in makeFocusFollow; sinks keep them live while the sub-page is
    // inactive, so the labels go out at once on entry).
    for (var i=0; i<NUM_CONTROL_PAIRS; i++) {
        page.makeValueBinding(surfaceElements.controlsStrip[i].knob.mSurfaceValue,
                              page.mHostAccess.mFocusedQuickControls.getByIndex(i)).setSubPage(subPageQuickControls)
    }
    // The selected track's own Quick Controls: only their titles, to tell the
    // project window focused (the Focus Quick Controls are then the track's)
    // from a plugin window. A Quick Control's valueTitle is the parameter it's
    // assigned to; "" when unassigned.
    for (var i=0; i<NUM_CONTROL_PAIRS; i++) {
        var quickControl = selChannel.mQuickControls.getByIndex(i)
        quickControl.mOnTitleChange = function(context, activeMapping, objectTitle, valueTitle) {
            const name = valueTitle || ""
            if (quickCtrlNames[this.i] === name) return
            quickCtrlNames[this.i] = name
            // (The Focus Quick Controls may have shown them already)
            if (fqcChangedMs === 0) fqcChangedMs = Date.now()
        }.bind({i})
        page.makeValueBinding(mkVar('Quick Control Sink ' + (i + 1)), quickControl)
    }

    // FUNC's VOLUME knob meters the selected track (page 1 only: the firmware
    // draws no meter on page 2), with its mute / solo for the grey-out. The
    // sink bindings make Cubase report them, as the bank channels' do.
    page.makeValueBinding(mkVar('Selected Meter Sink'), selChannel.mValue.mVUMeter)
    page.makeValueBinding(mkVar('Selected Mute Sink'), selChannel.mValue.mMute)
    page.makeValueBinding(mkVar('Selected Solo Sink'), selChannel.mValue.mSolo)
    selChannel.mValue.mVUMeter.mOnProcessValueChange = function(context, activeMapping, value) {
        if (activeMode != ACTIVE_MODE_MIX || mixMode != MIX_MODE_TRACK_FOCUS || focusPage != 0) return
        const v7 = Math.round(value * 127)
        if (v7 > selMeterMaxHold) selMeterMaxHold = v7
        const now = Date.now()
        if ((now - selMeterLastSendMs) < AUDIO_METER_PERIOD_MS) return
        selMeterLastSendMs = now
        sendMeter(context, 0, selMeterMaxHold)
        selMeterMaxHold = 0
    }
    selChannel.mValue.mMute.mOnProcessValueChange = function(context, activeMapping, value) {
        selMuted = value > 0.5
        meterStatesDirty = true
    }
    selChannel.mValue.mSolo.mOnProcessValueChange = function(context, activeMapping, value) {
        selSoloed = value > 0.5
        meterStatesDirty = true
    }

    selChannel.mOnColorChange = function(context, activeMapping, r, g, b, a, isActive) {
        selectedTrackColour = colourFromHost(r, g, b)
        selectionDirty = true
    }

    // The selected track's name. (mTrackSelection's own title is the window
    // name, e.g. "VST Mixer".)
    selChannel.mOnTitleChange = function(context, activeMapping, name) {
        const id = selChannel.getUniqueIDString(activeMapping)
        // Cubase re-fires every binding when a plugin window opens, this one
        // too, for the same track (capture 2026-11-05 15:42: each QUICK CTRL
        // pick's window held the knobs another QUICK_CTRL_SELECT_KNOBS_MS, so
        // they moved ~330-450 ms after the labels). Only a new track counts.
        // (Its own last ID: mTrackSelection's title callback sets
        // selectedChannelId too, maybe first)
        const changed = (id !== selTitleChannelId || name !== selectedTrackName)
        selTitleChannelId = id
        selectedChannelId = id
        selectedTrackName = name
        selectionDirty = true
        if (!changed) return
        selectionChangedMs = Date.now()
        // (QUICK CTRL: the knobs' values change with it, before ROTO is told)
        if (quickCtrlActive()) holdQuickCtrlKnobs(QUICK_CTRL_SELECT_KNOBS_MS)
    }

    // Selection changes — the channel ID is what maps it to a bank slot.
    page.mHostAccess.mTrackSelection.mOnTitleChange = function(context, activeMapping, name) {
        selectedChannelId = selChannel.getUniqueIDString(activeMapping)
        selectionDirty = true
    }
    return pageMixer
}

function makePageTransport(page) {
    // Bind the invisible transport CC catchers directly to the host transport.
    // No sub-page: ROTO only emits these CCs while in transport mode, so the
    // bindings are effectively gated by the device firmware.
    page.makeValueBinding(surfaceElements.controlsStrip[0].transport, page.mHostAccess.mTransport.mValue.mStart).setTypeToggle()
    page.makeValueBinding(surfaceElements.controlsStrip[1].transport, page.mHostAccess.mTransport.mValue.mStop).setTypeToggle()
    page.makeValueBinding(surfaceElements.controlsStrip[2].transport, page.mHostAccess.mTransport.mValue.mRecord).setTypeToggle()
    page.makeValueBinding(surfaceElements.controlsStrip[3].transport, page.mHostAccess.mTransport.mValue.mCycleActive).setTypeToggle()
    page.makeValueBinding(surfaceElements.controlsStrip[TRANSPORT_METRONOME_BUTTON].transport, page.mHostAccess.mTransport.mValue.mMetronomeActive).setTypeToggle()
    // ROTO's LEFT/RIGHT buttons send CC 36/37 in transport mode: hold to
    // rewind / fast-forward (momentary, so no setTypeToggle).
    page.makeValueBinding(surfaceElements.rewind, page.mHostAccess.mTransport.mValue.mRewind)
    page.makeValueBinding(surfaceElements.forward, page.mHostAccess.mTransport.mValue.mForward)
    // Knobs 1 and 2: zoom (see endlessKnobTurned). The API has no zoom value,
    // so these are key commands, as the Nektar CS12 script does.
    const zoom = surfaceElements.zoomCommands
    page.makeCommandBinding(zoom[0][0], 'Zoom', 'Zoom Out')
    page.makeCommandBinding(zoom[0][1], 'Zoom', 'Zoom In')
    page.makeCommandBinding(zoom[1][0], 'Zoom', 'Zoom Out Vertically')
    page.makeCommandBinding(zoom[1][1], 'Zoom', 'Zoom In Vertically')
    // Knob 3: the waveforms' vertical zoom
    page.makeCommandBinding(zoom[ENDLESS_ZOOM_WAVE][0], 'Zoom', 'Zoom Out Of Waveform Vertically')
    page.makeCommandBinding(zoom[ENDLESS_ZOOM_WAVE][1], 'Zoom', 'Zoom In On Waveform Vertically')
    // Knob 4: the Control Room's main level (see sendCrLevel)
    page.makeValueBinding(surfaceElements.crLevel, page.mHostAccess.mControlRoom.mMainChannel.mLevelValue)
    // Knob 8 and button 8: the AI knob and its LOCK (see sendAiKnob)
    const mouse = page.mHostAccess.mMouseCursor
    page.makeValueBinding(surfaceElements.aiKnob, mouse.mValueUnderMouse)
    // (Debug, for haptics later: what Cubase says about the value under the
    // mouse, to match it to a DirectAccess parameter or guess its steps)
    // (Cubase re-reports the title ~30 times a second while the value moves:
    // logged on changes only)
    var aiTitleLogged = null
    mouse.mValueUnderMouse.mOnTitleChange = function(context, activeMapping, objectTitle, valueTitle) {
        if (valueTitle) {
            aiObjectTitle = objectTitle
            aiValueTitle = valueTitle
            sendAiKnobHaptics(context)
        }
        const title = "\"" + objectTitle + "\" / \"" + valueTitle + "\""
        if (title === aiTitleLogged) return
        aiTitleLogged = title
        utils.log("AI title " + title, utils.LOG_VERBOSE)
    }
    mouse.mValueUnderMouse.mOnDisplayValueChange = function(context, activeMapping, displayValue, units) {
        utils.log("AI value \"" + displayValue + "\" \"" + units + "\"", utils.LOG_VERBOSE)
        // (Only for a turn: the value under the mouse changes as it moves)
        if (knobTurning(aiKnob)) {
            transportPopup(context, TRANSPORT_AI_KNOB, formatDisplayValue(displayValue, units), false)
        }
    }
    page.makeValueBinding(surfaceElements.controlsStrip[TRANSPORT_AI_LOCK_BUTTON].transport, mouse.mValueLocked).setTypeToggle()
    // Buttons 5 and 6: the Control Room's source and monitor set
    makeControlRoomButtons(page)
    // Knob 7: tempo (see applyTempoSteps)
    page.mHostAccess.mTransport.mTimeDisplay.mOnChangeTempoBPM = function(context, activeMapping, bpm) {
        tempoBPM = bpm
    }
    return {}
}
