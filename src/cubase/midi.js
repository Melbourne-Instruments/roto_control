// midi.js
// Copyright (c) 2026 Melbourne Instruments. All Rights Reserved.
//
// This script is provided "as is", without any warranty of any kind, express or
// implied, including but not limited to the warranties of merchantability,
// fitness for a particular purpose, and noninfringement. In no event shall the
// authors or copyright holders be liable for any claim, damages, or other
// liability, whether in an action of contract, tort, or otherwise, arising from,
// out of, or in connection with the software or the use or other dealings in the
// software.

var utils = require('./utils')

// SYSEX Command groups
const GENERAL_COMMAND_GROUP = 0x0A
const PLUGIN_COMMAND_GROUP = 0x0B
const MIXER_COMMAND_GROUP = 0x0C

// SYSEX General commands
const DAW_STARTED = 0x01
const PING_DAW = 0x02
const DAW_PING_RESP = 0x03
const NUM_TRACKS = 0x04
// Sent after a block of track details; ROTO then updates its MIX-TRACKS /
// MIX-RTN title and redraws the slots from the tracks it has.
const TRACK_DETAILS_END = 0x08
const ROTO_SELECT_TRACK = 0x09
const REQUEST_TRANSPORT_STATUS = 0x0A
const TRANSPORT_STATUS = 0x0B
const ROTO_DAW_CONNECTED = 0x0C
// DAW -> ROTO: asks for ROTO_FW_VERSION <VX VY VZ GC:7> (major, minor,
// patch, 7 ASCII bytes of git commit)
const REQUEST_ROTO_FW_VERSION = 0x0D
const ROTO_FW_VERSION = 0x0E
const SET_TRACK_DETAILS = 0x11
const RESET_TRACK_DETAILS = 0x12
const SET_TRACK_COLOUR = 0x13
const PAGE_LEFT = 0x14
const PAGE_RIGHT = 0x15
const SET_CURRENT_TRACK_NAME = 0x16
const SET_CURRENT_TRACK_COLOUR = 0x17
// Undocumented in the v1.6 SYSEX draft; reverse-engineered from the Ableton
// ROTO_CONTROL.py script. Sends the display string for a knob (button=0) or
// button (button=1) parameter so ROTO can show e.g. "-6.02 dB" while touched.
const PARAM_VALUES = 0x18

// SYSEX PLUGIN commands
// ROTO -> DAW on PLUGIN entry. Payload <mode>: 0 = PLUGIN, 1 = the MODE menu's
// 4th entry (Logic's SMART; QUICK CTRL for Cubase).
const SET_PLUGIN_MODE = 0x01
// The selected track's plugin list (as the Ableton script sends it): NUM_PLUGINS,
// FIRST_PLUGIN (page start, a multiple of 8), PLUGIN_DETAILS for each plugin on
// that page, PLUGIN_DETAILS_END, then DAW_SELECT_PLUGIN.
const NUM_PLUGINS = 0x02
const FIRST_PLUGIN = 0x03
const SET_FIRST_PLUGIN = 0x04          // ROTO -> DAW: plugin page changed
const PLUGIN_DETAILS = 0x05
const PLUGIN_DETAILS_END = 0x06
const ROTO_SELECT_PLUGIN = 0x07        // ROTO -> DAW: <index on the page>
const DAW_SELECT_PLUGIN = 0x08
const SET_DEVICE_LEARN = 0x09          // ROTO -> DAW: <learning>
// DAW -> ROTO: a parameter, for learning (while ROTO learns) or in reply to
// CONTROL_MAPPED. <PI:2 PH:6 MP CI NS PP:2 PN:13 SN:NS*13 (NS <= 16)>
const LEARN_PARAM = 0x0A
const CONTROL_MAPPED = 0x0B            // ROTO -> DAW: <PI:2 PH:6 CT CI MP>
const SET_PLUGIN_ENABLE = 0x0C         // ROTO -> DAW: <index on the page, enabled>
const SET_PLUGINS_LOCK = 0x0D          // ROTO -> DAW: <locked>
// A knob's name and colour scheme in the smart sub-mode (QUICK CTRL).
const SET_PLUGIN_CTL_DETAILS = 0x13
// ROTO -> DAW: after each CONTROL_MAPPED burst, even an empty one. Payload
// <page index, map empty>. Cubase firmware only; map empty (newer firmware):
// 1 = the selected plugin has nothing mapped on any page, so a default map
// may be sent (SET_DEFAULT_CTL). (The firmware's command values from here
// are its enum's order, no longer pinned, 2026-11-10: CONTROL_MAPPED_END was
// 0x20, sharing UNMAP_CTLS' value, and the rest one lower.)
const CONTROL_MAPPED_END = 0x21
// ROTO -> DAW, no payload: drop the mapped controls (master firmware; sent
// before it reloads a plugin the configurator changed, whose CONTROL_MAPPED
// burst and CONTROL_MAPPED_END follow).
const UNMAP_CTLS = 0x20
// DAW -> ROTO: one control of the selected plugin's default map, held in RAM
// only. <PH:8 CT CI CS MN:2 MX:2 FL I1 I2 LN LF, LEARN_PARAM payload without
// step strings>: the plugin's hash (ROTO ignores another plugin's), control
// type (0 knob, 1 switch), index in the map (page * 8 + control), then what
// the configurator sets: colour scheme, min/max (14-bit knob, 7-bit switch),
// flags (1: indent 1, 2: indent 2, 4: push switch), the two detents (0..127),
// LED on/off colours. Cubase and FL firmware.
const SET_DEFAULT_CTL = 0x22
// DAW -> ROTO: the default map is complete. <PH:8>. ROTO redraws and sends
// its CONTROL_MAPPED burst for the page.
const SET_DEFAULT_CTL_END = 0x23
// DAW -> ROTO: a QUICK CTRL knob's haptics, <index, haptic mode, steps,
// indent 1 (high bit, low 7 bits), indent 2 (likewise)>. Cubase firmware only
// (2026-11-05): mode 1 continuous (indents 0..127, 255 = none), 2 the centre
// detent, 4 N steps with end stops.
const SET_QC_KNOB_HAPTICS = 0x24
const SET_AI_KNOB_HAPTICS = 0x25        // Cubase TRANSPORT: the AI knob's haptics (new, 2026-11-06), as SET_QC_KNOB_HAPTICS for knob 7
// ROTO -> DAW: PLUGIN's FUNC (track select) shown <1> / left <0>. Cubase
// firmware only; while shown, PAGE_LEFT/RIGHT page the track bank.
const SET_TRACK_SELECT_MODE = 0x15

// SYSEX MIX commands
const SET_MIX_ALL_TRACKS_MODE = 0x01
const SET_MIX_TRACK_FOCUS_MODE = 0x02
// ROTO -> DAW: MIX-TRACKS / MIX-RTN toggled (LEFT+RIGHT together). Payload <AM>.
const SET_MIX_ALL_TRACKS_MODE_MODE = 0x05
// ROTO -> DAW: LINK held, then a knob touched in all-tracks. Payload <track:2>.
const TOGGLE_TRACK_GROUPING = 0x06
const NUM_SENDS = 0x03
const SEND_TRACK_NAMES = 0x08
const DAW_SELECT_FOCUS_TRACK = 0x0A
// Undocumented in the v1.6 SYSEX draft; reverse-engineered from the Ableton
// ROTO_CONTROL.py script. Sets the 0-127 thresholds at which the meter rings
// turn yellow / red. Sent once at handshake.
const SET_MIX_VU_METER_POINTS = 0x0B
// Per-slot meter enable (0 = greyed, e.g. muted / soloed out). Sent by the
// Ableton script; firmware handles it in MIX all-tracks mode.
const SET_MIX_VU_METER_STATES = 0x0C
// Cubase only (new, 2026-11-05): where 0 dB sits on Cubase's volume faders,
// <pos MSB, pos LSB> (14-bit, 0..16383). It depends on the project's Max.
// Volume (Project Setup: +6 or +12 dB). The firmware puts the Cubase volume
// and send knobs' 0 dB detent there.
const SET_MIX_VOL_0DB_POS = 0x0D

// Meter values are streamed as plain MIDI CC (not SYSEX) on the ROTO MIDI
// channel. Stereo pair per encoder slot: encoder N -> L=METERS_FIRST_CC+N*2,
// R=+1. With 8 slots that occupies CC65..CC80.
const METERS_FIRST_CC = 65
const METER_LEVEL_YELLOW = 87
const METER_LEVEL_RED = 113

// ROTO SYSEX ID
const MI_SYSEX_ID_BYTE_1 = 0x00
const MI_SYSEX_ID_BYTE_2 = 0x22
const MI_SYSEX_ID_BYTE_3 = 0x03
const ROTO_V1_SYSEX_DEVICE_ID = 0x02

// DAW Type
const CUBASE_DAW_TYPE = 0x05

// General constants
const NUM_MIX_BANK_CHANNELS = 8
const MAX_NAME_STRING_SIZE = 12
const CC_14BIT_LSB_OFFSET = 32

// ROTO ignores MIDI from the DAW until it has issued PING_DAW. Until then,
// all output is dropped except the handshake commands that drive the
// connection forward (DAW_STARTED, which makes ROTO start pinging; the
// firmware version request, answered before connecting; DAW_PING_RESP, which
// is the reply ROTO is waiting for). Flipped true by setRotoReady() once the
// main script has checked ROTO's firmware version.
var rotoReady = false

function isHandshakeCmd(group, cmd) {
    return group === GENERAL_COMMAND_GROUP &&
        (cmd === DAW_STARTED || cmd === REQUEST_ROTO_FW_VERSION || cmd === DAW_PING_RESP)
}

module.exports = {
    GENERAL_COMMAND_GROUP,
    PLUGIN_COMMAND_GROUP,
    MIXER_COMMAND_GROUP,
    DAW_STARTED,
    PING_DAW,
    DAW_PING_RESP,
    NUM_TRACKS,
    TRACK_DETAILS_END,
    ROTO_SELECT_TRACK,
    REQUEST_TRANSPORT_STATUS,
    TRANSPORT_STATUS,
    ROTO_DAW_CONNECTED,
    ROTO_FW_VERSION,
    SET_TRACK_DETAILS,
    SET_TRACK_COLOUR,
    PAGE_LEFT,
    PAGE_RIGHT,
    SET_CURRENT_TRACK_NAME,
    SET_CURRENT_TRACK_COLOUR,
    PARAM_VALUES,
    SET_PLUGIN_MODE,
    SET_FIRST_PLUGIN,
    ROTO_SELECT_PLUGIN,
    SET_DEVICE_LEARN,
    CONTROL_MAPPED,
    SET_PLUGIN_ENABLE,
    SET_PLUGINS_LOCK,
    SET_PLUGIN_CTL_DETAILS,
    CONTROL_MAPPED_END,
    UNMAP_CTLS,
    SET_DEFAULT_CTL,
    SET_DEFAULT_CTL_END,
    SET_QC_KNOB_HAPTICS,
    SET_AI_KNOB_HAPTICS,
    SET_TRACK_SELECT_MODE,
    SET_MIX_ALL_TRACKS_MODE,
    SET_MIX_TRACK_FOCUS_MODE,
    SET_MIX_ALL_TRACKS_MODE_MODE,
    TOGGLE_TRACK_GROUPING,
    NUM_SENDS,
    SEND_TRACK_NAMES,
    DAW_SELECT_FOCUS_TRACK,
    SET_MIX_VU_METER_POINTS,
    SET_MIX_VU_METER_STATES,
    SET_MIX_VOL_0DB_POS,
    METERS_FIRST_CC,
    METER_LEVEL_YELLOW,
    METER_LEVEL_RED,
    NUM_MIX_BANK_CHANNELS,

    setRotoReady(ready) {
        rotoReady = ready
    },

    sendDawStarted(config, context) {
        sendMidiSysex(config, context, GENERAL_COMMAND_GROUP, DAW_STARTED, [CUBASE_DAW_TYPE])
    },

    sendPingDawResp(config, context) {
        sendMidiSysex(config, context, GENERAL_COMMAND_GROUP, DAW_PING_RESP, [CUBASE_DAW_TYPE])
    },

    sendRequestRotoFwVersion(config, context) {
        sendMidiSysex(config, context, GENERAL_COMMAND_GROUP, REQUEST_ROTO_FW_VERSION, [])
    },

    sendNumTracks(config, context) {
        sendMidiSysex(config, context, GENERAL_COMMAND_GROUP, NUM_TRACKS, [0x00, NUM_MIX_BANK_CHANNELS])        
    },

    sendTrackDetailsEnd(config, context) {
        sendMidiSysex(config, context, GENERAL_COMMAND_GROUP, TRACK_DETAILS_END, [])
    },

    sendSetTrackDetails(config, context, index, name) {
        const bytes = nameToByteArray(name)
        const cmd = [((index >> 7) & 0x7f), (index & 0x7f)].concat(bytes, [0x00, 0x00])
        sendMidiSysex(config, context, GENERAL_COMMAND_GROUP, SET_TRACK_DETAILS, cmd)        
    },

    sendResetTrackDetails(config, context, index) {
        const cmd = [((index >> 7) & 0x7f), (index & 0x7f)]
        sendMidiSysex(config, context, GENERAL_COMMAND_GROUP, RESET_TRACK_DETAILS, cmd)        
    },
    
    sendSetTrackColour(config, context, index, colour) {
        const cmd = [
            ((index >> 7) & 0x7f), (index & 0x7f),
            ((colour.r & 0x80) >> 7), (colour.r & 0x7f),
            ((colour.g & 0x80) >> 7), (colour.g & 0x7f),
            ((colour.b & 0x80) >> 7), (colour.b & 0x7f)]
        sendMidiSysex(config, context, GENERAL_COMMAND_GROUP, SET_TRACK_COLOUR, cmd)        
    },

    sendSetCurrentTrackName(config, context, name) {
        const cmd = nameToByteArray(name)
        sendMidiSysex(config, context, GENERAL_COMMAND_GROUP, SET_CURRENT_TRACK_NAME, cmd)        
    },

    sendNumSends(config, context, numSends) {
        sendMidiSysex(config, context, MIXER_COMMAND_GROUP, NUM_SENDS, [(numSends & 0x7f)])
    },

    // Send a block of 8 send-track names to ROTO. Per spec each name is a
    // 13-byte NULL-terminated ASCII string; SI is the global start index.
    // Names shorter than 8 are padded with empty strings.
    sendSendTrackNames(config, context, sendIndex, names) {
        var nameBytes = []
        for (var i = 0; i < 8; i++) {
            nameBytes = nameBytes.concat(nameToByteArray(names[i] || ""))
        }
        const cmd = [(sendIndex & 0x7f)].concat(nameBytes)
        sendMidiSysex(config, context, MIXER_COMMAND_GROUP, SEND_TRACK_NAMES, cmd)
    },

    // isButton: false (knob) or true (button) — picks the column on ROTO.
    sendParamValue(config, context, isButton, index, valueString) {
        const bytes = nameToByteArray(valueString || "")
        const cmd = [(isButton ? 1 : 0), (index & 0x7f)].concat(bytes)
        sendMidiSysex(config, context, GENERAL_COMMAND_GROUP, PARAM_VALUES, cmd)
    },

    sendNumPlugins(config, context, count) {
        sendMidiSysex(config, context, PLUGIN_COMMAND_GROUP, NUM_PLUGINS, [(count & 0x7f)])
    },

    sendFirstPlugin(config, context, first) {
        sendMidiSysex(config, context, PLUGIN_COMMAND_GROUP, FIRST_PLUGIN, [(first & 0x7f)])
    },

    // Payload <PI PH:8 PE PN:13 PT NP>: type 0 (normal), no macro pages.
    sendPluginDetails(config, context, index, hash, enabled, name) {
        const cmd = [(index & 0x7f)].concat(hash.map(function(b) { return b & 0x7f }),
                                            [(enabled ? 1 : 0)], nameToByteArray(name), [0x00, 0x00])
        sendMidiSysex(config, context, PLUGIN_COMMAND_GROUP, PLUGIN_DETAILS, cmd)
    },

    sendPluginDetailsEnd(config, context) {
        sendMidiSysex(config, context, PLUGIN_COMMAND_GROUP, PLUGIN_DETAILS_END, [])
    },

    // Payload <PI MP FS>: no macro page, no forced selection.
    sendDawSelectPlugin(config, context, index) {
        sendMidiSysex(config, context, PLUGIN_COMMAND_GROUP, DAW_SELECT_PLUGIN, [(index & 0x7f), 0x00, 0x00])
    },

    // index: the parameter's index in the plugin (14-bit); hash: 6 x 7-bit;
    // steps: 0 (continuous) or 2..24; position: 0..16383; indent: a knob's
    // centre detent (from a default map). No macro. The step strings are sent
    // empty (as the Ableton script does): ROTO shows the value strings sent
    // live with PARAM_VALUES.
    sendLearnParam(config, context, index, hash, steps, position, name, indent) {
        const cmd = learnParamBytes(index, hash, steps, position, name, indent)
        if (steps > 0 && steps <= 16) {
            for (var i=0; i<steps * (MAX_NAME_STRING_SIZE + 1); i++) cmd.push(0)
        }
        sendMidiSysex(config, context, PLUGIN_COMMAND_GROUP, LEARN_PARAM, cmd)
    },

    // A default map control: pluginHash 8 x 7-bit; isKnob; ctlIndex 0..63;
    // details (default_maps.details); the rest as sendLearnParam (no step
    // strings).
    sendSetDefaultCtl(config, context, pluginHash, isKnob, ctlIndex, details, index, hash, steps, position, name, indent) {
        const d = details
        const flags = (d.indents.length > 0 ? 1 : 0) | (d.indents.length > 1 ? 2 : 0) | (d.push ? 4 : 0)
        const cmd = pluginHash.map(function(b) { return b & 0x7f })
            .concat([(isKnob ? 0 : 1), (ctlIndex & 0x7f), (d.colour & 0x7f),
                     ((d.min >> 7) & 0x7f), (d.min & 0x7f), ((d.max >> 7) & 0x7f), (d.max & 0x7f),
                     flags, ((d.indents[0] || 0) & 0x7f), ((d.indents[1] || 0) & 0x7f),
                     (d.ledOn & 0x7f), (d.ledOff & 0x7f)],
                    learnParamBytes(index, hash, steps, position, name, indent))
        sendMidiSysex(config, context, PLUGIN_COMMAND_GROUP, SET_DEFAULT_CTL, cmd)
    },

    sendSetDefaultCtlEnd(config, context, pluginHash) {
        sendMidiSysex(config, context, PLUGIN_COMMAND_GROUP, SET_DEFAULT_CTL_END, pluginHash.map(function(b) { return b & 0x7f }))
    },

    // Knob `index`'s label in QUICK CTRL mode. Payload <type=0 (knob), index,
    // 13-byte name, colour scheme index>, as the Logic script sends it.
    sendSetPluginCtlDetails(config, context, index, name, colourScheme) {
        const cmd = [0x00, (index & 0x7f)].concat(nameToByteArray(name), [(colourScheme & 0x7f)])
        sendMidiSysex(config, context, PLUGIN_COMMAND_GROUP, SET_PLUGIN_CTL_DETAILS, cmd)
    },

    // Knob `index`'s haptics in QUICK CTRL: h = [mode, steps, indent 1, indent 2]
    // (plugin_haptics_data.js)
    sendSetQcKnobHaptics(config, context, index, h) {
        sendMidiSysex(config, context, PLUGIN_COMMAND_GROUP, SET_QC_KNOB_HAPTICS,
                      [(index & 0x7f), (h[0] & 0x7f), (h[1] & 0x7f), ((h[2] >> 7) & 0x01), (h[2] & 0x7f),
                       ((h[3] >> 7) & 0x01), (h[3] & 0x7f)])
    },

    // TRANSPORT's AI knob (knob 8) haptics, h as above
    sendSetAiKnobHaptics(config, context, h) {
        sendMidiSysex(config, context, PLUGIN_COMMAND_GROUP, SET_AI_KNOB_HAPTICS,
                      [7, (h[0] & 0x7f), (h[1] & 0x7f), ((h[2] >> 7) & 0x01), (h[2] & 0x7f),
                       ((h[3] >> 7) & 0x01), (h[3] & 0x7f)])
    },

    // states: 8 booleans, one per transport button (PLAY, STOP, RECORD, ...),
    // in reply to REQUEST_TRANSPORT_STATUS. Sets the transport button LEDs.
    sendTransportStatus(config, context, states) {
        const data = []
        for (var i = 0; i < 8; i++) data.push(states[i] ? 1 : 0)
        sendMidiSysex(config, context, GENERAL_COMMAND_GROUP, TRANSPORT_STATUS, data)
    },

    // Selected (focused) track's colour. Only valid while ROTO's selected
    // track is a bank slot: firmware indexes its track table with it.
    sendSetCurrentTrackColour(config, context, colour) {
        sendMidiSysex(config, context, GENERAL_COMMAND_GROUP, SET_CURRENT_TRACK_COLOUR, [
            ((colour.r & 0x80) >> 7), (colour.r & 0x7f),
            ((colour.g & 0x80) >> 7), (colour.g & 0x7f),
            ((colour.b & 0x80) >> 7), (colour.b & 0x7f)])
    },

    // enabled: 8 booleans, one per bank slot.
    sendSetMixVuMeterStates(config, context, enabled) {
        const data = []
        for (var i = 0; i < 8; i++) data.push(enabled[i] ? 1 : 0)
        sendMidiSysex(config, context, MIXER_COMMAND_GROUP, SET_MIX_VU_METER_STATES, data)
    },

    sendSetMixVuMeterPoints(config, context, yellow, red) {
        sendMidiSysex(config, context, MIXER_COMMAND_GROUP, SET_MIX_VU_METER_POINTS,
                      [(yellow & 0x7f), (red & 0x7f)])
    },

    // pos: 0 dB's fader position, 14-bit (0..16383)
    sendSetMixVol0dbPos(config, context, pos) {
        sendMidiSysex(config, context, MIXER_COMMAND_GROUP, SET_MIX_VOL_0DB_POS,
                      [((pos >> 7) & 0x7f), (pos & 0x7f)])
    },

    // channelLeg: 0 = left, 1 = right.
    sendMeterCc(config, context, slotIndex, channelLeg, value) {
        if (!rotoReady) return
        const cc = METERS_FIRST_CC + (slotIndex * 2) + channelLeg
        utils.flushMidiLog(config.midiOutput, context)
        config.midiOutput.sendMidi(context, [0xBF, cc, (value & 0x7f)])
    },

    sendDawSelectFocusTrack(config, context, index, name, colour) {
        const bytes = nameToByteArray(name)
        const cmd = [
            ((index >> 7) & 0x7f), (index & 0x7f)]
            .concat(bytes, [((colour.r & 0x80) >> 7), (colour.r & 0x7f),
                            ((colour.g & 0x80) >> 7), (colour.g & 0x7f),
                            ((colour.b & 0x80) >> 7), (colour.b & 0x7f)])
        sendMidiSysex(config, context, MIXER_COMMAND_GROUP, DAW_SELECT_FOCUS_TRACK, cmd)        
    },    

    sysexMsgIsFromRoto(msg) {
        if (msg[1] == MI_SYSEX_ID_BYTE_1 && msg[2] == MI_SYSEX_ID_BYTE_2 &&
            msg[3] == MI_SYSEX_ID_BYTE_3 && msg[4] == ROTO_V1_SYSEX_DEVICE_ID) {
            return true
        }
        return false
    },

    sendMidiCc7it(config, context, param, value) {
        if (!rotoReady) return
        utils.flushMidiLog(config.midiOutput, context)
        config.midiOutput.sendMidi(context, [0xBF, param, (value & 0x7f)])
    },

    // 14-bit CC: MSB on `param`, LSB on `param` + 32 (the standard pairing,
    // and what both ROTO firmware and Cubase's bindToControlChange14Bit use).
    sendMidiCc14Bit(config, context, param, value) {
        if (!rotoReady) return
        utils.flushMidiLog(config.midiOutput, context)
        config.midiOutput.sendMidi(context, [0xBF, param, ((value >> 7) & 0x7f)])
        config.midiOutput.sendMidi(context, [0xBF, param + CC_14BIT_LSB_OFFSET, (value & 0x7f)])
    }
}

// SysEx data bytes are 7-bit: a name or value string with other characters
// (Cubase's "-∞ dB" sent as UTF-8 E2 88 9E) broke the MIDI stream into
// pitch-bend and note messages (capture 2026-10-23 15:46). Common symbols get
// an ASCII spelling, accents are dropped, anything else is "?".
const ASCII_SPELLINGS = {
    '∞': 'inf', 'µ': 'u', 'μ': 'u', '°': 'deg', '±': '+-',
    '−': '-', '–': '-', '—': '-', '‘': "'", '’': "'",
    '“': '"', '”': '"', '×': 'x', '♯': '#', '♭': 'b',
    '½': '1/2', '¼': '1/4', '¾': '3/4', '…': '...', ' ': ' ',
}

function toAscii(text) {
    var s = String(text)
    if (typeof s.normalize === 'function') s = s.normalize('NFD')
    var out = ''
    for (var i=0; i<s.length; i++) {
        const ch = s.charAt(i)
        const code = s.charCodeAt(i)
        if (code >= 0x20 && code < 0x7F) out += ch
        else if (ASCII_SPELLINGS[ch] !== undefined) out += ASCII_SPELLINGS[ch]
        else if (code >= 0x0300 && code <= 0x036F) continue      // (a dropped accent)
        else if (code >= 0xD800 && code <= 0xDBFF) { out += '?'; i++ } // (one character in two)
        else out += '?'
    }
    return out
}

// LEARN_PARAM's payload up to the name: <PI:2 PH:6 MP CI NS PP:2 PN:13>, no
// macro.
function learnParamBytes(index, hash, steps, position, name, indent) {
    return [((index >> 7) & 0x7f), (index & 0x7f)]
        .concat(hash.map(function(b) { return b & 0x7f }),
                [0x00, (indent ? 1 : 0), (steps & 0x7f), ((position >> 7) & 0x7f), (position & 0x7f)],
                nameToByteArray(name))
}

function nameToByteArray(name) {
    const bytes = []
    const text = toAscii(name)
    // Up to MAX_NAME_STRING_SIZE chars; the last byte of the field is the NUL.
    for (var i=0; i<MAX_NAME_STRING_SIZE; i++) {
        bytes.push(i < text.length ? text.charCodeAt(i) : 0x00)
    }
    bytes.push(0x00)
    return bytes
}

function sendMidiSysex(config, context, group, cmd, data) {
    // Send the SYSEX message
    const msg = [
        0xf0,
        MI_SYSEX_ID_BYTE_1,
        MI_SYSEX_ID_BYTE_2,
        MI_SYSEX_ID_BYTE_3,
        ROTO_V1_SYSEX_DEVICE_ID,
        group,
        cmd].concat(data, [0xf7])
    // (A data byte with the top bit set would end the SysEx early)
    for (var i=1; i<msg.length - 1; i++) {
        if (msg[i] > 0x7f) {
            utils.log("SysEx data byte 0x" + msg[i].toString(16) + " replaced: " + utils.byteArrayToHexString(msg), utils.LOG_BASIC)
            msg[i] = 0x3f
        }
    }
    if (!rotoReady && !isHandshakeCmd(group, cmd)) {
        if (utils.VERBOSE) utils.log("Suppressed (ROTO not ready): " + utils.byteArrayToHexString(msg), utils.LOG_VERBOSE)
        return
    }
    utils.flushMidiLog(config.midiOutput, context)
    config.midiOutput.sendMidi(context, msg)
    if (utils.VERBOSE) utils.log("Sent SYSEX: " + utils.byteArrayToHexString(msg), utils.LOG_VERBOSE)
}
