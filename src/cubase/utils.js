// utils.js
// Copyright (c) 2026 Melbourne Instruments. All Rights Reserved.
//
// This script is provided "as is", without any warranty of any kind, express or
// implied, including but not limited to the warranties of merchantability,
// fitness for a particular purpose, and noninfringement. In no event shall the
// authors or copyright holders be liable for any claim, damages, or other
// liability, whether in an action of contract, tort, or otherwise, arising from,
// out of, or in connection with the software or the use or other dealings in the
// software.

// Release build: install.ps1 -Release sets this true in the installed copy
// (the repo keeps false, for development). No verbose log and no script log
// to MIDI for captures; the basic lines (connection, firmware too old, errors)
// still go to Cubase's MIDI Remote Script Console. The probes are off too.
const RELEASE = true

// Log output control
const LOG_OFF = 1000
const LOG_BASIC = 1
const LOG_VERBOSE = 2
const LOG_PRINT_LEVEL = RELEASE ? LOG_BASIC : LOG_VERBOSE

// Dev only: also send log lines to ROTO as non-commercial SysEx
// (F0 7D 4D 52 <ascii> F7, "MR" = MIDI Remote) so a MIDI monitor on the
// DAW -> ROTO port records them in time order with the MIDI they explain.
// ROTO firmware doesn't process non-Melbourne SysEx, but in USB-in mode
// MIDI_PORTS it forwards it to the 5-pin MIDI outputs.
// Normally off: roto_midi_mon (Cubase profile) turns it on while it captures,
// by sending F0 7D 4D 52 'LOG' 01 F7 to the script every few seconds; it goes
// off MIDI_LOG_REQUEST_MS after the last one. LOG_TO_MIDI = true forces it on.
// Leave false for release.
const LOG_TO_MIDI = false
const MIDI_LOG_HEADER = [0xF0, 0x7D, 0x4D, 0x52]
const MIDI_LOG_REQUEST = [0xF0, 0x7D, 0x4D, 0x52, 0x4C, 0x4F, 0x47]     // + <on> F7
const MIDI_LOG_REQUEST_MS = 10000
const MIDI_LOG_MAX_CHARS = 120
var midiLogUntilMs = 0

function midiLogOn() {
    if (RELEASE) return false
    return LOG_TO_MIDI || Date.now() < midiLogUntilMs
}

// Log lines waiting to go out as SysEx. log() has no MIDI context, so they're
// flushed by the next MIDI send (midi.js) or idle tick.
var midiLogQueue = []

// From load until the capture tool's first request (it asks every 3 s), log
// lines are kept here, stamped with ms since load, and go out ahead of
// everything else once it asks: a script reload's own start (activation, the
// handshake, the first callbacks) is otherwise lost. Dev only; null once sent.
const STARTUP_LOG_MAX = 1000
const loadedMs = Date.now()
var startupLog = RELEASE ? null : []

module.exports = {
    RELEASE,
    LOG_OFF,
    LOG_BASIC,
    LOG_VERBOSE,
    LOG_PRINT_LEVEL,
    // Verbose lines are logged: check before building a costly one (e.g. a
    // hex dump of every SysEx)
    VERBOSE: LOG_PRINT_LEVEL >= LOG_VERBOSE,
    // The script log is going to MIDI (a capture is running)
    midiLogOn,

    log(string, level) {
        if (level <= LOG_PRINT_LEVEL) {
            console.log(string)
            if (midiLogOn()) {
                midiLogQueue.push(string)
            }
            else if (startupLog !== null && startupLog.length < STARTUP_LOG_MAX) {
                startupLog.push("[load +" + (Date.now() - loadedMs) + "ms] " + string)
            }
        }
    },

    // The capture tool's request to log to MIDI (see MIDI_LOG_REQUEST).
    // Returns whether msg was one.
    handleMidiLogRequest(msg) {
        for (var i=0; i<MIDI_LOG_REQUEST.length; i++) {
            if (msg[i] !== MIDI_LOG_REQUEST[i]) return false
        }
        const was = midiLogOn()
        midiLogUntilMs = msg[MIDI_LOG_REQUEST.length] ? Date.now() + MIDI_LOG_REQUEST_MS : 0
        if (midiLogOn() !== was) console.log("MIDI log " + (midiLogOn() ? "on (capture)" : "off"))
        if (midiLogOn() && startupLog !== null) {
            midiLogQueue = startupLog.concat(midiLogQueue)
            startupLog = null
        }
        return true
    },

    // Dev only: a log line that goes to the MIDI log even with LOG_TO_MIDI off
    // (used by da_probe.js).
    logToMidi(string) {
        if (RELEASE) return
        console.log(string)
        midiLogQueue.push(string)
    },

    flushMidiLog(midiOutput, context) {
        if (midiLogQueue.length == 0) return
        const lines = midiLogQueue
        midiLogQueue = []
        for (var i=0; i<lines.length; i++) {
            const text = String(lines[i]).substring(0, MIDI_LOG_MAX_CHARS)
            const msg = MIDI_LOG_HEADER.slice()
            for (var c=0; c<text.length; c++) {
                // 7-bit only
                const code = text.charCodeAt(c)
                msg.push(code < 0x80 ? code : 0x3F)
            }
            msg.push(0xF7)
            midiOutput.sendMidi(context, msg)
        }
    },

    byteArrayToHexString(byteArray) {
        return Array.prototype.map.call(byteArray, function(byte) {
            return ('0' + (byte & 0xFF).toString(16)).slice(-2)
        }).join('')
    }
}
