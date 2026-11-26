# name=Melbourne Instruments ROTO-CONTROL
# url=https://www.melbourneinstruments.com
#
# device_roto_control.py
# Copyright (c) 2026 Melbourne Instruments. All Rights Reserved.
#
# This script is provided "as is", without any warranty of any kind, express or
# implied, including but not limited to the warranties of merchantability,
# fitness for a particular purpose, and noninfringement. In no event shall the
# authors or copyright holders be liable for any claim, damages, or other
# liability, whether in an action of contract, tort, or otherwise, arising from,
# out of, or in connection with the software or the use or other dealings in the
# software.
#
# ROTO-CONTROL for FL Studio: the handshake, MIX mode (a bank of 8 mixer
# inserts: volume / pan / send knobs, mute / solo / arm buttons, meters; MIX-RTN
# = master + send targets; FUNC = the selected insert's volume, pan and routes)
# and the transport screen. Output goes to FL Studio's script console
# (View > Script output), which is also a Python prompt in this script's
# context: e.g. send_bank() or send_transport_status() by hand.
#
# Protocol: ROTO-CONTROL_SYSEX_API (see atari/Cubase/ROTO-CONTROL_SYSEX_API_v1.6_DRAFT.md).
# The firmware runs FL Studio's MIX mode as Cubase's (utils::cubase_protocol_daw),
# so the Cubase driver (atari/Cubase/midi.js, CLAUDE.md) is the reference for
# the message formats and firmware behaviour used here.
#
# FL's state is polled in OnIdle (~every 20 ms) and only changes are sent:
# OnRefresh missed record arm (capture 2026-10-23 21:51), and polling keeps
# every value in one place.

import math
import time

import channels
import device
import general
import midi
import mixer
import patterns
import plugins
import transport
import ui
import utils

import default_maps
import default_maps_data

# SysEx framing: F0 00 22 03 02 <group> <cmd> <data...> F7
SYSEX_HEADER = [0xF0, 0x00, 0x22, 0x03, 0x02]
GENERAL_COMMAND_GROUP = 0x0A
PLUGIN_COMMAND_GROUP = 0x0B
MIXER_COMMAND_GROUP = 0x0C

# GENERAL commands
DAW_STARTED = 0x01          # DAW -> ROTO: <daw type>; ROTO starts pinging
PING_DAW = 0x02             # ROTO -> DAW, until the DAW replies
DAW_PING_RESP = 0x03        # DAW -> ROTO: <daw type>
NUM_TRACKS = 0x04           # DAW -> ROTO: <count:2>
TRACK_DETAILS_END = 0x08    # DAW -> ROTO: after a block of track details
ROTO_SELECT_TRACK = 0x09    # ROTO -> DAW: <slot:2> (a knob touched in all-tracks)
REQUEST_TRANSPORT_STATUS = 0x0A  # ROTO -> DAW: on entering its transport screen
TRANSPORT_STATUS = 0x0B     # DAW -> ROTO: 8 booleans, one per transport button LED
ROTO_DAW_CONNECTED = 0x0C   # ROTO -> DAW
REQUEST_ROTO_FW_VERSION = 0x0D  # DAW -> ROTO
ROTO_FW_VERSION = 0x0E      # ROTO -> DAW: <major, minor, patch, commit[7]>
SET_TRACK_DETAILS = 0x11    # DAW -> ROTO: <slot:2, name[13], 0, 0>
RESET_TRACK_DETAILS = 0x12  # DAW -> ROTO: <slot:2> (empty slot)
SET_TRACK_COLOUR = 0x13     # DAW -> ROTO: <slot:2, r:2, g:2, b:2>
PAGE_LEFT = 0x14            # ROTO -> DAW: LEFT in all-tracks
PAGE_RIGHT = 0x15           # ROTO -> DAW: RIGHT in all-tracks
SET_CURRENT_TRACK_NAME = 0x16    # DAW -> ROTO: <name[13]> (selected track)
SET_CURRENT_TRACK_COLOUR = 0x17  # DAW -> ROTO: <r:2, g:2, b:2> (selected track)
PARAM_VALUES = 0x18         # DAW -> ROTO: <button, slot, text[13]> (undocumented, see midi.js)

# PLUGIN commands
SET_PLUGIN_MODE = 0x01      # ROTO -> DAW: PLUGIN entered

# MIX commands
SET_MIX_ALL_TRACKS_MODE = 0x01   # ROTO -> DAW: <view, knob mode, button mode, send>
SET_MIX_TRACK_FOCUS_MODE = 0x02  # ROTO -> DAW: <page 0/1> (FUNC)
NUM_SENDS = 0x03                 # DAW -> ROTO: <count>
SET_MIX_VIEW = 0x05              # ROTO -> DAW: <view> (MIX-TRACKS / MIX-RTN, LEFT+RIGHT)
REQUEST_SEND_TRACK_NAMES = 0x07  # ROTO -> DAW: <send index>
SEND_TRACK_NAMES = 0x08          # DAW -> ROTO: <first, 8 x name[13]>
DAW_SELECT_FOCUS_TRACK = 0x0A    # DAW -> ROTO: <slot:2, name[13], r:2, g:2, b:2>
SET_MIX_VU_METER_POINTS = 0x0B   # DAW -> ROTO: <yellow, red> (0..127; undocumented, as Ableton's)
SET_MIX_VU_METER_STATES = 0x0C   # DAW -> ROTO: 8 x <enabled> (greyed when 0)

# The firmware's FL Studio DAW type (DawType::FL_STUDIO, after CUBASE)
FL_STUDIO_DAW_TYPE = 0x06
# FL Studio support came with firmware 4.0.0 (branch ATARI-FL). Older firmware
# would connect FL as an unknown DAW (Ableton's transport labels, no MIX
# controls), so the script doesn't connect to it at all (as the Cubase script):
# each PING_DAW asks for the version first, and only 4.0.0 or later gets the reply
MIN_FW_VERSION = (4, 0, 0)

NUM_SLOTS = 8
MAX_NAME_CHARS = 12
FIRST_INSERT = 1            # insert 0 is the master
# The selected track's index when it isn't in the bank: the firmware ignores
# DAW_SELECT_FOCUS_TRACK for the index it has, so these alternate (as Cubase's)
OUT_OF_BANK_INDEXES = (0x3FFE, 0x3FFF)

# ROTO's controls are CCs on MIDI channel 16
ROTO_CC_STATUS = 0xB0 | 15
# MIX: knobs are 14-bit (MSB on CC 12+i, then LSB on CC 44+i), knob touch
# CC 52+i (> 0 = touched). Buttons CC 20+i: 127 on every press (firmware
# SWITCH_TOGGLE_SEND_MAX), so the script toggles; it sends 127 / 0 for on / off
# (muted is on: the firmware draws it as TRACK ON/OFF, lit while playing). The
# FL Studio firmware sends CC 64 <knob> while a volume knob sits in its 0 dB
# detent.
KNOB_CC_BASE = 12
KNOB_LSB_CC_BASE = KNOB_CC_BASE + 32
BUTTON_CC_BASE = 20
KNOB_TOUCH_CC_BASE = 52
UNITY_VOLUME_CC = 64
KNOB_MAX = 16383
# FL's value differing from what ROTO shows by this much (14-bit) isn't sent
# back: rounding, e.g. ROTO's pan centre detent is 8191, FL's 0.0 pan 8192
# (capture 2026-10-23 22:48, a motor nudge on release)
KNOB_SEND_TOLERANCE = 2
UNITY_VOLUME = 0.8          # FL's 0 dB
# FL reports a mute / solo / arm change ~100 ms late (capture 2026-10-23 22:37:
# the echo went off, then on), so a pressed button's echo waits for it
BUTTON_SETTLE_S = 0.5
# A value popup with the same text for the same knob within this long isn't sent
# again: a touch and the knob's first position both send one (capture
# 2026-10-24 14:43, "-5.8dB" twice within 2 ms)
POPUP_REPEAT_S = 0.05

KNOB_MODE_VOLUME = 0
KNOB_MODE_PAN = 1
KNOB_MODE_SEND = 2
BUTTON_MODE_MUTE = 0
BUTTON_MODE_SOLO = 1
BUTTON_MODE_ARM = 2

# MIX views (LEFT+RIGHT in all-tracks): the inserts, or MIX-RTN = the master
# plus the send targets
VIEW_TRACKS = 0
VIEW_RETURNS = 1

# Sends. FL has no send slots: any insert can route to any other at a level.
# The send targets are the inserts other inserts route to (not the master),
# in insert order, unrouted ones left out: all-tracks SEND n is the route from
# each bank insert to target n. Turning one up from 0 makes the route; let go
# at 0, it's removed (FUNC's knobs too; user 2026-10-26). FL has no return
# track type; returns are docked right by convention (FL's mixer, Novation's
# banks by dock side), so once any insert is docked right those are the
# targets, routed or not (user 2026-10-26: SEND 1 was a chain's Insert 1). FUNC shows the selected
# insert's own routes (not the one to the master) after volume and pan, as the
# Cubase script packs routed sends. The routing is scanned a few inserts per
# idle tick (FL reports no routing changes).
SCAN_INSERTS_PER_TICK = 4
DOCK_RIGHT = 2              # mixer.getTrackDockSide: 0 left, 1 centre, 2 right
MAX_FOCUS_SENDS = 8         # page 1: knobs 3..8, page 2: knobs 1..2 (firmware)
FOCUS_PAGE_1_SENDS = 6
# The firmware redraws FUNC on NUM_SENDS and on a new selection (~170 ms later,
# capture 2026-10-24 14:27), and only then sets the send knobs up; their detent
# is applied with the next knob position the DAW sends. So the knob positions
# wait this long after either, then all go again (sent before the redraw, the
# send knob stayed at 0 with no haptics).
FOCUS_REDRAW_S = 0.3

# Meters: CC 65 + slot * 2 + leg (0 = L, 1 = R), 0..127, 12 per second with
# the peak held in between (as the Ableton / Cubase scripts). All-tracks: each
# bank insert's. FUNC: the selected insert's on slot 0, which the firmware draws
# on the VOLUME screen of page 1 (as Ableton's script; Cubase's has none there).
# FL's peaks are linear (1.0 = 0 dB): METER_FLOOR_DB..METER_TOP_DB maps to 0..127,
# so the thresholds below are about -15 dB (yellow) and -1 dB (red).
METER_CC_BASE = 65
METER_PERIOD_S = 1.0 / 12
METER_FLOOR_DB = -60.0
METER_TOP_DB = 6.0
METER_LEVEL_YELLOW = 87
METER_LEVEL_RED = 113

# Transport screen: buttons 1..8 send CC 28..35, LEFT/RIGHT CC 36/37 (firmware
# TRANSPORT_SWITCH_CC_BASE). 127 on press; the push buttons send 0 on release.
# The labels are the firmware's _transport_ctl_str_fl_studio:
#   1 PLAY        play / pause
#   2 STOP        stop
#   3 RECORD      record (FL's record button)
#   4 SONG MODE   pattern / song mode (LED on = song)
#   5 LOOP REC    loop recording
#   6 METRONOME   metronome
#   7 COUNTDOWN   countdown before recording
#   8 WAIT INPUT  wait for input to start playing
#   LEFT / RIGHT  rewind / fast-forward while held
TRANSPORT_CC_BASE = 28
TRANSPORT_REWIND_CC = TRANSPORT_CC_BASE + 8
TRANSPORT_FORWARD_CC = TRANSPORT_REWIND_CC + 1
# transport.rewind / fastForward start-stop values (FL's midi.py SS_Start /
# SS_Stop, missing from the stubs)
SS_STOP = 0
SS_START = 2

# Dev only: also send log lines to ROTO as non-commercial SysEx
# (F0 7D 4D 52 <ascii> F7, as the Cubase script's utils.js) so a MIDI monitor
# on the DAW -> ROTO port records them in time order with the MIDI they
# explain. roto_midi_mon (--daw fl) turns it on while it captures by sending
# F0 7D 4D 52 'LOG' 01 F7 every few seconds; it goes off MIDI_LOG_REQUEST_S
# after the last one. LOG_TO_MIDI = True forces it on. Leave False for release.
LOG_TO_MIDI = False
MIDI_LOG_HEADER = [0xF0, 0x7D, 0x4D, 0x52]
MIDI_LOG_REQUEST = MIDI_LOG_HEADER + [0x4C, 0x4F, 0x47]    # + <on> F7
MIDI_LOG_REQUEST_S = 10.0
MIDI_LOG_MAX_CHARS = 120

roto_ready = False          # ROTO ignores the DAW until it has pinged
fw_logged = None            # the firmware version last logged (pings repeat every second)
midi_log_until = 0.0
last_transport_status = None

# MIX state. mix_mode is None outside MIX (PLUGIN, before the handshake).
mix_mode = None             # "all" (all-tracks) or "focus" (FUNC)
knob_mode = KNOB_MODE_VOLUME
button_mode = BUTTON_MODE_MUTE
send_index = 0              # all-tracks SEND n
view = VIEW_TRACKS
bank_pos = [0, 0]           # per view: the position of slot 0 in view_inserts()
focus_page = 0              # FUNC: 0 = volume / pan / sends 1..6, 1 = sends 7..8
send_targets: list = []     # the inserts other inserts route to
focus_routes: list = []     # the selected insert's route targets (FUNC)
scan_insert = FIRST_INSERT
scan_found: set = set()
knob_msb = [0] * NUM_SLOTS
knob_held = [False] * NUM_SLOTS
# What ROTO shows (None = unknown, send next time): slot names as
# (insert, name, rgb) or "" for empty, knob values (14-bit), button states
shown_slot: list = [None] * NUM_SLOTS
shown_knob: list = [None] * NUM_SLOTS
shown_button: list = [None] * NUM_SLOTS
button_pending: list = [None] * NUM_SLOTS    # (expected state, deadline) after a press
shown_popup: list = [None] * NUM_SLOTS       # (text, time) of the last value popup
shown_selected: tuple | None = None    # (index sent, insert, name, rgb)
shown_sends = None          # (count, first, names) sent with NUM_SENDS / SEND_TRACK_NAMES
shown_meter_states = None
shown_meter: list = [None] * (NUM_SLOTS * 2)
meter_hold = [0] * (NUM_SLOTS * 2)
meter_sent_at = 0.0
details_end_due = False     # a view change: TRACK_DETAILS_END even if no name changed
knobs_held_until = 0.0      # FUNC: no knob positions until the firmware's redraw
out_of_bank_toggle = 0


def midi_log_on():
    return LOG_TO_MIDI or time.monotonic() < midi_log_until


def log(text):
    print("ROTO: " + text)
    if midi_log_on() and device.isAssigned():
        # 7-bit only
        body = [ord(c) if ord(c) < 0x80 else 0x3F for c in text[:MIDI_LOG_MAX_CHARS]]
        device.midiOutSysex(bytes(MIDI_LOG_HEADER + body + [0xF7]))


def handle_midi_log_request(data):
    """The capture tool's request to log to MIDI. Returns whether data was one."""
    global midi_log_until
    if data[:len(MIDI_LOG_REQUEST)] != MIDI_LOG_REQUEST:
        return False
    was = midi_log_on()
    on = len(data) > len(MIDI_LOG_REQUEST) and data[len(MIDI_LOG_REQUEST)] != 0
    midi_log_until = time.monotonic() + MIDI_LOG_REQUEST_S if on else 0.0
    if midi_log_on() != was:
        log("MIDI log " + ("on (capture)" if midi_log_on() else "off"))
    return True


# --- Sending ----------------------------------------------------------------------

def send_sysex(group, cmd, data=()):
    # No output port linked: nothing to send to (as FL's own scripts)
    if not device.isAssigned():
        return
    msg = SYSEX_HEADER + [group, cmd] + list(data) + [0xF7]
    # SysEx data bytes are 7-bit (a byte >= 0x80 would end the message early)
    if any(b > 0x7F for b in msg[1:-1]):
        log("dropped a SysEx with an 8-bit data byte: " + bytes(msg).hex(" "))
        return
    device.midiOutSysex(bytes(msg))


def send_cc(cc, value):
    if not device.isAssigned():
        return
    device.midiOutMsg(ROTO_CC_STATUS | (cc << 8) | (value << 16))


def name_bytes(name):
    """A 13-byte NUL-terminated field, 7-bit ASCII only."""
    text = "".join(c if 0x20 <= ord(c) < 0x7F else "?" for c in name)[:MAX_NAME_CHARS]
    return [ord(c) for c in text] + [0x00] * (MAX_NAME_CHARS + 1 - len(text))


def index_bytes(index):
    return [(index >> 7) & 0x7F, index & 0x7F]


def rgb_bytes(rgb):
    return [b for c in rgb for b in (c >> 7, c & 0x7F)]


def track_rgb(insert):
    return tuple(utils.ColorToRGB(mixer.getTrackColor(insert)))


def num_inserts():
    """Inserts 1..num_inserts() (trackCount includes the master and "current")."""
    return mixer.trackCount() - 2


# --- MIX: what each control does --------------------------------------------------

def view_inserts():
    """The inserts the all-tracks view pages through."""
    if view == VIEW_RETURNS:
        return [0] + send_targets
    return list(range(FIRST_INSERT, num_inserts() + 1))


def slot_insert(slot):
    """The insert on an all-tracks slot, or None for an empty slot."""
    inserts = view_inserts()
    pos = bank_pos[view] + slot
    return inserts[pos] if pos < len(inserts) else None


def routes_from(insert):
    """The inserts `insert` routes to, other than the master."""
    return [dest for dest in range(FIRST_INSERT, num_inserts() + 1)
            if dest != insert and mixer.getRouteSendActive(insert, dest)]


def send_target(insert, dest, unrouted=False):
    """A send knob's target, or None when `insert` doesn't route to `dest`
    (unless unrouted: all-tracks knobs make the route as they leave 0)."""
    if dest is None or dest == insert or not (unrouted or mixer.getRouteSendActive(insert, dest)):
        return None
    return insert, "send", dest


def knob_target(slot):
    """(insert, "volume" | "pan") or (insert, "send", dest) for a knob, or None if
    it controls nothing."""
    if mix_mode == "all":
        insert = slot_insert(slot)
        if insert is None:
            return None
        if knob_mode == KNOB_MODE_VOLUME:
            return insert, "volume"
        if knob_mode == KNOB_MODE_PAN:
            return insert, "pan"
        return send_target(insert, send_targets[send_index] if send_index < len(send_targets) else None, True)
    if mix_mode == "focus":
        insert = mixer.trackNumber()
        if focus_page == 0 and slot == 0:
            return insert, "volume"
        if focus_page == 0 and slot == 1:
            return insert, "pan"
        route = slot - 2 if focus_page == 0 else FOCUS_PAGE_1_SENDS + slot
        if 0 <= route < len(focus_routes):
            return send_target(insert, focus_routes[route])
    return None


def send_event_id(insert, dest):
    # (FL's own midi.py at runtime: FL 2026 has REC_Mixer_Send_First =
    # REC_Plug_First + 0x2000, the stubs an older value)
    return mixer.getTrackPluginId(insert, 0) + midi.REC_Mixer_Send_First + dest  # pyright: ignore[reportAttributeAccessIssue]


def get_knob(target):
    """FL's value as 0..1."""
    insert, param = target[:2]
    if param == "volume":
        return mixer.getTrackVolume(insert)
    if param == "pan":
        return (mixer.getTrackPan(insert) + 1.0) / 2.0
    if not mixer.getRouteSendActive(insert, target[2]):
        return 0.0
    return mixer.getRouteToLevel(insert, target[2])


def set_knob(target, value):
    insert, param = target[:2]
    if param == "volume":
        mixer.setTrackVolume(insert, value)
    elif param == "pan":
        mixer.setTrackPan(insert, value * 2.0 - 1.0)
    elif mixer.getRouteSendActive(insert, target[2]):
        mixer.setRouteToLevel(insert, target[2], value)
    elif value > 0:
        # Turned up from 0 with no route: route it (FL refuses a loop, then
        # the knob is parked back at 0)
        mixer.setRouteTo(insert, target[2], True, True)
        if mixer.getRouteSendActive(insert, target[2]):
            log("route %d -> %d made" % (insert, target[2]))
            mixer.setRouteToLevel(insert, target[2], value)


def drop_route_at_zero(target):
    """A send knob let go at 0: its route goes (on release, not as it passes 0,
    so FUNC's knobs don't shift under the hand)."""
    insert, dest = target[0], target[2]
    if mixer.getRouteSendActive(insert, dest) and mixer.getRouteToLevel(insert, dest) <= 0.0:
        mixer.setRouteTo(insert, dest, False, True)
        log("route %d -> %d removed" % (insert, dest))


def knob_text(target):
    insert, param = target[:2]
    if param == "volume":
        db = mixer.getTrackVolume(insert, 1)
        # (+ 0.0: no "-0.0")
        return "-inf dB" if db < -200 else "%.1f dB" % (round(db, 1) + 0.0)
    if param == "pan":
        pan = round(mixer.getTrackPan(insert) * 100)
        return "C" if pan == 0 else "%d%% %s" % (abs(pan), "L" if pan < 0 else "R")
    # FL's own text for the send level, as its Mackie script gets it (the event's
    # own value: getEventValue's is MIDI-scaled, and gave "INFdB" / "307.6dB",
    # capture 2026-10-24 14:32), else a percentage
    if not mixer.getRouteSendActive(insert, target[2]):
        return "no route"
    event = send_event_id(insert, target[2])
    text = mixer.getEventIDValueString(event, mixer.getAutoSmoothEventValue(event))
    return text or "%d%%" % round(mixer.getRouteToLevel(insert, target[2]) * 100 / UNITY_VOLUME)


def send_popup(slot, target):
    """The knob's value popup (PARAM_VALUES), unless it was just sent."""
    text = knob_text(target)
    now = time.monotonic()
    last = shown_popup[slot]
    if last and last[0] == text and now - last[1] < POPUP_REPEAT_S:
        return
    shown_popup[slot] = (text, now)
    send_sysex(GENERAL_COMMAND_GROUP, PARAM_VALUES, [0, slot] + name_bytes(text))


def get_button(insert):
    if button_mode == BUTTON_MODE_MUTE:
        return mixer.isTrackMuted(insert)
    if button_mode == BUTTON_MODE_SOLO:
        return mixer.isTrackSolo(insert)
    if button_mode == BUTTON_MODE_ARM:
        return mixer.isTrackArmed(insert)
    return False


def set_button(insert, on):
    if button_mode == BUTTON_MODE_MUTE:
        mixer.muteTrack(insert, 1 if on else 0)
    elif button_mode == BUTTON_MODE_SOLO:
        mixer.soloTrack(insert, 1 if on else 0)
    elif button_mode == BUTTON_MODE_ARM:
        if mixer.isTrackArmed(insert) != on:
            mixer.armTrack(insert)  # toggles


def to_knob(value):
    return max(0, min(KNOB_MAX, round(value * KNOB_MAX)))


# --- MIX: keeping ROTO up to date -------------------------------------------------

def forget_shown(names=True):
    """ROTO's display is unknown: everything goes out on the next update."""
    global shown_selected, shown_sends, shown_meter_states
    for i in range(NUM_SLOTS):
        shown_knob[i] = None
        shown_button[i] = None
        button_pending[i] = None
        if names:
            shown_slot[i] = None
    for i in range(NUM_SLOTS * 2):
        shown_meter[i] = None
        meter_hold[i] = 0
    shown_sends = None
    shown_meter_states = None
    if names:
        shown_selected = None


def update_names():
    """The bank's names and colours; returns whether any were sent."""
    sent = False
    for slot in range(NUM_SLOTS):
        insert = slot_insert(slot)
        # (insert 0, the master, is in MIX-RTN)
        state = (insert, mixer.getTrackName(insert), track_rgb(insert)) if insert is not None else ""
        if state == shown_slot[slot]:
            continue
        shown_slot[slot] = state
        sent = True
        if not state:
            send_sysex(GENERAL_COMMAND_GROUP, RESET_TRACK_DETAILS, index_bytes(slot))
            continue
        _, name, rgb = state
        send_sysex(GENERAL_COMMAND_GROUP, SET_TRACK_DETAILS,
                   index_bytes(slot) + name_bytes(name) + [0x00, 0x00])
        send_sysex(GENERAL_COMMAND_GROUP, SET_TRACK_COLOUR, index_bytes(slot) + rgb_bytes(rgb))
    return sent


def hold_knobs_for_redraw():
    """FUNC: the firmware redraws, then the knob positions (and the meter: the
    redraw resets it) all go again."""
    global knobs_held_until
    if mix_mode == "focus":
        knobs_held_until = time.monotonic() + FOCUS_REDRAW_S
        for i in range(NUM_SLOTS):
            shown_knob[i] = None
        for i in range(NUM_SLOTS * 2):
            shown_meter[i] = None
            # (and the peaks held so far are another bank's: capture
            # 2026-10-24 22:27, slot 1 got insert 1's 100, then insert 2's 14)
            meter_hold[i] = 0


def update_knobs():
    if time.monotonic() < knobs_held_until:
        return
    for slot in range(NUM_SLOTS):
        if knob_held[slot]:
            continue    # don't fight the user's hand; sent on release
        target = knob_target(slot)
        # A knob with nothing to control is parked at 0 (all-tracks only:
        # focus knobs past pan are the firmware's)
        if target is None and mix_mode != "all":
            continue
        value = to_knob(get_knob(target)) if target else 0
        shown = shown_knob[slot]
        if shown is not None and abs(value - shown) <= (KNOB_SEND_TOLERANCE if target else 0):
            continue
        if value != shown:
            shown_knob[slot] = value
            send_cc(KNOB_CC_BASE + slot, value >> 7)
            send_cc(KNOB_LSB_CC_BASE + slot, value & 0x7F)


def update_buttons():
    if mix_mode != "all":
        return
    for slot in range(NUM_SLOTS):
        insert = slot_insert(slot)
        on = insert is not None and get_button(insert)
        pending = button_pending[slot]
        if pending:
            if on != pending[0] and time.monotonic() < pending[1]:
                continue    # FL hasn't reported the press yet
            button_pending[slot] = None
        if on != shown_button[slot]:
            shown_button[slot] = on
            send_cc(BUTTON_CC_BASE + slot, 127 if on else 0)


def update_selected():
    """The selected insert, as the firmware's selected track; returns whether
    it was sent."""
    global shown_selected, out_of_bank_toggle
    insert = mixer.trackNumber()
    bank = [slot_insert(slot) for slot in range(NUM_SLOTS)]
    in_bank = insert in bank
    slot = bank.index(insert) if in_bank else -1
    name, rgb = mixer.getTrackName(insert), track_rgb(insert)
    if shown_selected and shown_selected[1:] == (insert, name, rgb) and \
            (shown_selected[0] == slot if in_bank else shown_selected[0] in OUT_OF_BANK_INDEXES):
        return False
    if in_bank and shown_selected and shown_selected[0] == slot:
        # The firmware ignores DAW_SELECT_FOCUS_TRACK for the index it has:
        # same slot, new name or colour (only for a bank slot, which it looks up)
        send_sysex(GENERAL_COMMAND_GROUP, SET_CURRENT_TRACK_NAME, name_bytes(name))
        send_sysex(GENERAL_COMMAND_GROUP, SET_CURRENT_TRACK_COLOUR, rgb_bytes(rgb))
        index = slot
    else:
        if in_bank:
            index = slot
        else:
            out_of_bank_toggle ^= 1
            index = OUT_OF_BANK_INDEXES[out_of_bank_toggle]
        send_sysex(MIXER_COMMAND_GROUP, DAW_SELECT_FOCUS_TRACK,
                   index_bytes(index) + name_bytes(name) + rgb_bytes(rgb))
        hold_knobs_for_redraw()
    shown_selected = (index, insert, name, rgb)
    return True


def send_names_block(first, inserts):
    """SEND_TRACK_NAMES: 8 names from send `first` (blank past the end)."""
    data = [first]
    for i in range(NUM_SLOTS):
        data += name_bytes(mixer.getTrackName(inserts[i]) if i < len(inserts) else "")
    send_sysex(MIXER_COMMAND_GROUP, SEND_TRACK_NAMES, data)


def update_sends():
    """NUM_SENDS and SEND_TRACK_NAMES: the send targets in all-tracks (the block
    with the current send), the selected insert's routes in FUNC."""
    global shown_sends, focus_page
    if mix_mode == "all":
        first = send_index - send_index % NUM_SLOTS
        inserts = send_targets[first:first + NUM_SLOTS]
    else:
        first, inserts = 0, focus_routes
    state = (len(send_targets) if mix_mode == "all" else len(focus_routes), first,
             tuple(mixer.getTrackName(i) for i in inserts))
    if state == shown_sends:
        return
    shown_sends = state
    if mix_mode == "focus" and len(focus_routes) <= FOCUS_PAGE_1_SENDS:
        focus_page = 0      # the firmware goes back to page 1 when it redraws
    # The names first: the firmware redraws the focus screen on NUM_SENDS
    send_names_block(first, inserts)
    send_sysex(MIXER_COMMAND_GROUP, NUM_SENDS, [min(state[0], 0x7F)])
    hold_knobs_for_redraw()


def meter_insert(slot):
    """The insert whose meter a slot shows, or None."""
    if mix_mode == "all":
        return slot_insert(slot)
    if mix_mode == "focus" and slot == 0:
        return mixer.trackNumber()
    return None


def update_meter_states():
    """Greyed meters for muted inserts (FL mutes the others for a solo)."""
    global shown_meter_states
    states = []
    for slot in range(NUM_SLOTS):
        insert = meter_insert(slot)
        states.append(0 if insert is None or mixer.isTrackMuted(insert) else 1)
    if states != shown_meter_states:
        shown_meter_states = states
        send_sysex(MIXER_COMMAND_GROUP, SET_MIX_VU_METER_STATES, states)


def scan_routing():
    """A few inserts of the routing scan; a finished pass updates send_targets."""
    global scan_insert, scan_found, send_targets
    last = num_inserts()
    for _ in range(SCAN_INSERTS_PER_TICK):
        scan_found.update(routes_from(scan_insert))
        scan_insert += 1
        if scan_insert > last:
            targets = sorted(scan_found)
            docked = {i for i in range(FIRST_INSERT, last + 1) if mixer.getTrackDockSide(i) == DOCK_RIGHT}
            if docked:
                # Every return, routed or not: its knobs make the first route
                targets = sorted(docked)
            scan_insert, scan_found = FIRST_INSERT, set()
            if targets != send_targets:
                send_targets = targets
                log("send targets: " + (", ".join("%d %s" % (i, mixer.getTrackName(i)) for i in targets) or "none"))
                if view == VIEW_RETURNS:
                    bank_pos[view] = min(bank_pos[view], max(0, len(view_inserts()) - 1) // NUM_SLOTS * NUM_SLOTS)
            return


def update_mix():
    global details_end_due, focus_routes
    if mix_mode is None:
        return
    if mix_mode == "all":
        # The send names before TRACK_DETAILS_END: ATARI-FL titles the screen
        # "KNOBS-<send name>" from them
        update_sends()
        if update_names() or details_end_due:
            details_end_due = False
            send_sysex(GENERAL_COMMAND_GROUP, TRACK_DETAILS_END)
    else:
        focus_routes = routes_from(mixer.trackNumber())[:MAX_FOCUS_SENDS]
    update_meter_states()
    # The selection before the sends: NUM_SENDS last (as the Cubase script)
    update_selected()
    update_sends()
    update_knobs()
    update_buttons()


def send_bank():
    """Everything for the bank again (console helper)."""
    forget_shown()
    update_mix()


def page(direction):
    pos = bank_pos[view] + direction * NUM_SLOTS
    if pos < 0 or pos >= len(view_inserts()):
        return
    bank_pos[view] = pos
    log("bank: %s from %d" % (("MIX-TRACKS", "MIX-RTN")[view], slot_insert(0)))
    update_mix()


def set_view(new_view):
    global view, details_end_due
    new_view = VIEW_RETURNS if new_view == VIEW_RETURNS else VIEW_TRACKS
    if new_view == view:
        return
    view = new_view
    log("view: " + ("MIX-TRACKS", "MIX-RTN")[view])
    # The firmware retitles and redraws on TRACK_DETAILS_END
    details_end_due = True
    for i in range(NUM_SLOTS):
        shown_knob[i] = None
        shown_button[i] = None


# --- MIX: from ROTO ---------------------------------------------------------------

def on_mix_all_tracks(data):
    global mix_mode, knob_mode, button_mode, send_index
    new_view, knob_mode, button_mode, send_index = data[:4]
    mix_mode = "all"
    leave_plugin_mode()
    log("MIX all-tracks: knobs %s, buttons %s" %
        (("VOLUME", "PAN", "SEND %d" % (send_index + 1))[min(knob_mode, 2)],
         ("MUTE", "SOLO", "ARM", "INPUT MON")[min(button_mode, 3)]))
    set_view(new_view)
    # The firmware reconfigures the controls on entry (paging between sends
    # re-sends this message too); the names go again, as the Cubase script's
    forget_shown()
    update_mix()


def on_mix_focus(data):
    global mix_mode, focus_page
    mix_mode = "focus"
    leave_plugin_mode()
    focus_page = 1 if data[0] == 1 else 0
    log("MIX focus, page %d" % (focus_page + 1))
    forget_shown(names=False)
    update_mix()


def on_mix_cc(cc, value):
    """A MIX knob, button or touch. Returns whether cc was one."""
    if KNOB_CC_BASE <= cc < KNOB_CC_BASE + NUM_SLOTS:
        knob_msb[cc - KNOB_CC_BASE] = value
    elif KNOB_LSB_CC_BASE <= cc < KNOB_LSB_CC_BASE + NUM_SLOTS:
        # The LSB follows the MSB: the value is complete
        slot = cc - KNOB_LSB_CC_BASE
        value = (knob_msb[slot] << 7) | value
        target = knob_target(slot)
        shown_knob[slot] = value
        if target:
            set_knob(target, value / KNOB_MAX)
            send_popup(slot, target)
    elif cc == UNITY_VOLUME_CC and 0 <= value < NUM_SLOTS:
        # (Send knobs have the volume detent too)
        target = knob_target(value)
        if target and target[1] in ("volume", "send"):
            set_knob(target, UNITY_VOLUME)
            # ROTO shows the detent: leave the knob there
            shown_knob[value] = to_knob(UNITY_VOLUME)
            send_popup(value, target)
    elif KNOB_TOUCH_CC_BASE <= cc < KNOB_TOUCH_CC_BASE + NUM_SLOTS:
        slot = cc - KNOB_TOUCH_CC_BASE
        knob_held[slot] = value > 0
        target = knob_target(slot)
        if value > 0 and target:
            send_popup(slot, target)
        elif target and target[1] == "send":
            drop_route_at_zero(target)
        # On release the next update sends FL's value if it differs (or parks an
        # empty slot's knob back at 0)
    elif BUTTON_CC_BASE <= cc < BUTTON_CC_BASE + NUM_SLOTS:
        slot = cc - BUTTON_CC_BASE
        insert = slot_insert(slot) if mix_mode == "all" else None
        if insert is None:
            shown_button[slot] = None   # put it back
            return True
        if value == 0:
            return True
        # (Pressed again before FL reported the last press: toggle from that)
        pending = button_pending[slot]
        on = not (pending[0] if pending else get_button(insert))
        set_button(insert, on)
        # The firmware toggled its own state: send FL's once it has it
        shown_button[slot] = None
        button_pending[slot] = (on, time.monotonic() + BUTTON_SETTLE_S)
    else:
        return False
    return True


# --- Meters -----------------------------------------------------------------------

def meter_value(peak):
    if peak <= 0.0:
        return 0
    db = 20.0 * math.log10(peak)
    return max(0, min(127, round((db - METER_FLOOR_DB) * 127 / (METER_TOP_DB - METER_FLOOR_DB))))


def update_meters():
    global meter_sent_at
    # (FUNC: the firmware's redraw clears the meter, see hold_knobs_for_redraw)
    if mix_mode is None or time.monotonic() < knobs_held_until:
        return
    for slot in range(NUM_SLOTS):
        insert = meter_insert(slot)
        for leg in (0, 1):
            value = meter_value(mixer.getTrackPeaks(insert, leg)) if insert is not None else 0
            meter_hold[slot * 2 + leg] = max(meter_hold[slot * 2 + leg], value)
    now = time.monotonic()
    if now - meter_sent_at < METER_PERIOD_S:
        return
    meter_sent_at = now
    for i in range(NUM_SLOTS * 2):
        # ROTO decays towards the last value and holds it: repeats aren't needed
        if meter_hold[i] != shown_meter[i]:
            shown_meter[i] = meter_hold[i]
            send_cc(METER_CC_BASE + i, meter_hold[i])
        meter_hold[i] = 0


# --- Transport --------------------------------------------------------------------

def transport_states():
    """The 8 transport button LEDs (see the button list at TRANSPORT_CC_BASE)."""
    return [transport.isPlaying(), False, transport.isRecording(),
            transport.getLoopMode() == 1, ui.isLoopRecEnabled(), ui.isMetronomeEnabled(),
            ui.isPrecountEnabled(), ui.isStartOnInputEnabled()]


def send_transport_status(force=True):
    """The transport LEDs. ROTO only shows them on its transport screen, but
    they're sent on every change (OnIdle), not only when ROTO asks."""
    global last_transport_status
    states = [1 if s else 0 for s in transport_states()]
    if not force and states == last_transport_status:
        return
    last_transport_status = states
    send_sysex(GENERAL_COMMAND_GROUP, TRANSPORT_STATUS, states)


def on_transport_cc(cc, value):
    """A transport screen button. Returns whether cc was one."""
    pressed = value > 0
    if cc == TRANSPORT_REWIND_CC:
        transport.rewind(SS_START if pressed else SS_STOP)
    elif cc == TRANSPORT_FORWARD_CC:
        transport.fastForward(SS_START if pressed else SS_STOP)
    elif TRANSPORT_CC_BASE <= cc < TRANSPORT_REWIND_CC:
        if not pressed:
            return True
        button = cc - TRANSPORT_CC_BASE
        if button == 0:
            transport.start()
        elif button == 1:
            transport.stop()
        elif button == 2:
            transport.record()
        elif button == 3:
            transport.setLoopMode()
        else:
            transport.globalTransport((midi.FPT_LoopRecord, midi.FPT_Metronome,
                                       midi.FPT_CountDown, midi.FPT_WaitForInput)[button - 4], 1)
        log("transport button %d" % (button + 1))
    elif TRANSPORT_ZOOM_H_CC <= cc <= TRANSPORT_TEMPO_CC:
        endless_knob_turned(cc - TRANSPORT_ZOOM_H_CC, value)
    else:
        return False
    return True


# --- TRANSPORT knobs ----------------------------------------------------------------

# The firmware's FL TRANSPORT knobs (as Cubase's, 2026-11-06): knob 1 zooms
# horizontally, knob 2 vertically, knob 6 is the tempo (over METRONOME; knob 5
# until 2026-11-17) (7-bit endless knobs
# with 16 detents a turn, CCs 38..40 in that order: the CC is the knob's angle,
# 0..127 a turn), the others are unused. (An AI knob on knob 8, through
# device.linkToLastTweaked, was tried and dropped 2026-11-06: README.)
TRANSPORT_ZOOM_H_CC = 38
TRANSPORT_ZOOM_V_CC = 39
TRANSPORT_TEMPO_CC = 40
ENDLESS_ZOOM_H, ENDLESS_ZOOM_V, ENDLESS_TEMPO = 0, 1, 2
ENDLESS_DETENTS = 16
DETENT_WINDOW = 0.3         # an angle further than this from a detent is ignored
# One FL zoom jog step per detent, clockwise in (flip it if FL zooms out)
ZOOM_CLOCKWISE = 1
endless_detent = [None, None, None]     # the detent each knob last rested on; None = unknown
# ROTO's TRANSPORT screen is up: from REQUEST_TRANSPORT_STATUS until a mode
# message (in PLUGIN the firmware sends SET_PLUGIN_MODE again on leaving it)
transport_shown = False


def reset_endless_knobs():
    """On each transport entry: the knobs may have been turned in another mode."""
    for i in range(len(endless_detent)):
        endless_detent[i] = None


def endless_knob_turned(knob, value):
    """An endless knob's angle: one step per detent passed, clockwise up."""
    pos = value / 128 * ENDLESS_DETENTS
    detent = round(pos)
    if abs(pos - detent) > DETENT_WINDOW:
        return
    detent %= ENDLESS_DETENTS
    last = endless_detent[knob]
    endless_detent[knob] = detent
    if last is None:
        return
    # The shorter way round (it wraps at the top)
    steps = (detent - last) % ENDLESS_DETENTS
    if steps > ENDLESS_DETENTS // 2:
        steps -= ENDLESS_DETENTS
    if steps == 0:
        return
    if knob == ENDLESS_TEMPO:
        tempo_steps(steps)
        return
    command = midi.FPT_HZoomJog if knob == ENDLESS_ZOOM_H else midi.FPT_VZoomJog
    transport.globalTransport(command, steps * ZOOM_CLOCKWISE)


# The tempo knob: 1 BPM a detent, clockwise up, in FL's 10..522 BPM. Set
# through REC_Tempo (BPM x 1000), which is exact and immediate (probe
# 2026-11-06; FPT_TempoJog moves 0.1 BPM and shows ~200 ms later). The knob
# shows the tempo all the time (user request 2026-11-06: the firmware keeps the
# last one sent, no revert timer): on each transport entry and when it changes,
# while TRANSPORT is shown.
TRANSPORT_TEMPO_KNOB = 5     # knob 6, over METRONOME (firmware TRANSPORT_TEMPO_KNOB)
TEMPO_MIN_BPM = 10
TEMPO_MAX_BPM = 522
TEMPO_TURN_S = 0.3          # after a detent, the turn's own tempo shows (FL's may trail)
TEMPO_SEND_S = 0.08         # at most this often (a tempo automation can change it every tick)
tempo_target = None         # the tempo the turn is going to
tempo_turned_at = 0.0
tempo_shown = None          # the text ROTO has; None = unknown
tempo_sent_at = 0.0


def current_tempo():
    return mixer.getCurrentTempo(True)


def format_tempo(bpm):
    # (FL shows the tempo to 3 decimals)
    return "%.3f BPM" % bpm


def tempo_steps(steps):
    global tempo_target, tempo_turned_at
    now = time.monotonic()
    base = tempo_target if tempo_target is not None and now - tempo_turned_at < TEMPO_TURN_S else current_tempo()
    tempo_target = max(TEMPO_MIN_BPM, min(TEMPO_MAX_BPM, round(base) + steps))
    tempo_turned_at = now
    general.processRECEvent(midi.REC_Tempo, int(tempo_target * 1000), midi.REC_Control | midi.REC_UpdateControl)
    send_tempo(format_tempo(tempo_target), force=True)


def send_tempo(text, force=False):
    global tempo_shown, tempo_sent_at
    now = time.monotonic()
    if not transport_shown or (not force and (text == tempo_shown or now - tempo_sent_at < TEMPO_SEND_S)):
        return
    tempo_shown = text
    tempo_sent_at = now
    send_sysex(GENERAL_COMMAND_GROUP, PARAM_VALUES, [0, TRANSPORT_TEMPO_KNOB] + name_bytes(text))


def update_tempo():
    """The tempo knob on FL's tempo (not during a turn: its own value shows)."""
    if transport_shown and time.monotonic() - tempo_turned_at >= TEMPO_TURN_S:
        send_tempo(format_tempo(current_tempo()))


def on_transport_shown():
    """REQUEST_TRANSPORT_STATUS: ROTO has opened its TRANSPORT screen."""
    global transport_shown, tempo_shown
    transport_shown = True
    tempo_shown = None
    send_transport_status()
    reset_endless_knobs()
    update_tempo()


# --- PLUGIN -----------------------------------------------------------------------

# ROTO's PLUGIN mode. The firmware runs it for FL Studio on its generic path,
# as Ableton's (atari/Ableton/ROTO_CONTROL.py is the reference for the
# messages; README "PLUGIN" for the design and what FL reports).
#
# The list: the selected channel's generator (FL: one per channel), then the
# selected insert's effect slots that hold a plugin. ROTO keeps its control
# mappings per plugin hash (from the plugin's own name, so every instance of a
# plugin shares them) and per parameter hash (from the parameter's name; the
# index when a plugin repeats a name). FL reports no parameter changes, only
# that something changed (OnRefresh), so the selected plugin's parameters are
# polled: the mapped ones for feedback, all its named ones while learning.

# To decide (README, PLUGIN): these are the defaults until then
PLUGIN_NAMES_FROM_FL = True     # ROTO shows FL's names (slot / channel), else the plugins' own
PLUGIN_OPEN_WINDOW_ON_PICK = True   # a plugin picked on ROTO opens its window in FL
GENERATOR_ON_OFF = False        # no ON/OFF for generators: ROTO's switch is put back

NUM_PLUGINS_PAGE = 8
PLUGIN_SCAN_S = 0.1         # the list and the focused window are checked this often
LEARN_POLL_S = 0.1
# A parameter changing again within this long is the same gesture: offered once
LEARN_REPEAT_S = 0.75
# A CONTROL_MAPPED this long after the last starts a new set (ROTO loads a
# plugin or a controls page: it sends one per mapped control, ~1 ms apart, and
# never says which controls are unmapped; as the Cubase script's MAPPED_BURST_MS)
MAPPED_BURST_S = 0.15
# What LEARN gives a control, where a default map gives nothing (firmware
# PLUGIN_PARAM_COLOUR_SCHEME, PLUGIN_CTL_DEFAULT_LED_COLOUR, black)
MAP_DEFAULT_COLOUR = 64
MAP_DEFAULT_LED_ON = 13
MAP_DEFAULT_LED_OFF = 70
# FL's slot on/off event value (capture 2026-10-24 23:35)
SLOT_ON_VALUE = 0x40000000
NUM_FX_SLOTS = 10
VST_PARAM_SLOTS = 4096      # FL lists VSTs with 4240 parameters: 4096, then MIDI CC / aftertouch
# How a mapped control writes its parameter, to A/B by ear: set_write_mode(n)
# in FL's Script output window. setParamValue jumps to each value: the audio
# steps between ROTO's values (~10 ms apart) even where the GUI is smooth
# (FL's own plugins), while FL's controller links smooth it ("engine
# smoothing"; user, capture 2026-10-25 13:21). FL's REC event writes take a
# smoothing flag (REC_Smoothed, "smoothed up controller"); not tried yet. The
# flags (process_flags in the stubs): UpdateValue 1, UpdateControl 0x10,
# FromMIDI 0x20, InternalCtrl 0x800, Smoothed 0x2000.
REC_UPDATE_CONTROL = 0x10
REC_INTERNAL_CTRL = 0x800
REC_SMOOTHED = 0x2000
REC_FROM_INTERNAL_CTRL = 0x1 | 0x20 | REC_INTERNAL_CTRL
WRITE_MODES = (
    ("setParamValue", None),
    ("REC event, MIDI controller", midi.REC_MIDIController | REC_UPDATE_CONTROL),
    ("REC event, MIDI controller, smoothed", midi.REC_MIDIController | REC_UPDATE_CONTROL | REC_SMOOTHED),
    ("REC event, internal controller, smoothed", REC_FROM_INTERNAL_CTRL | REC_SMOOTHED | REC_UPDATE_CONTROL),
    ("mixer.automateEvent, smoothed", "smoothed"),
)
# Modes 1..3 weren't smooth (capture 2026-10-25 13:30). FL's own Mackie
# Control and SSL scripts smooth their faders and knobs with
# mixer.automateEvent(event, value, REC_MIDIController, speed), speed 469 for
# "Control smoothing" on (device_MackieCU.py, SmoothSpeed). 469 was very
# laggy on ROTO; 300 chosen (user, 2026-10-25)
SMOOTH_SPEED = 300
write_mode = 4
# After a write, its parameter's position isn't sent back for this long: a
# smoothed parameter slides to it, and ROTO's knob would follow the slide
WRITE_HOLD_S = 0.3

# FL doesn't say which parameters are stepped (CLA-76's Ratio, an EQ band's
# type), so LEARN sweeps the parameter through STEP_SAMPLES + 1 values, counts
# its texts and puts it back; ROTO gives a stepped one detents on a knob and
# cycles a switch through its steps. The sweep is heard if audio is playing.
LEARN_FIND_STEPS = True
STEP_SAMPLES = 96
MAX_STEPS = 24              # the firmware's HAPTIC_MODE_N_STEPS_MAX
MAX_STEP_NAMES = 16         # LEARN_PARAM carries this many step names (sent blank: ROTO shows FL's text)
# A VST's text doesn't follow within the sweep, nor any other way of writing
# or reading it, only on FL's next idle tick (~47 ms apart; probe_steps,
# capture 2026-10-25 12:54). So the slow sweep writes one value per tick and
# LEARN_PARAM waits for it:
# - 3 values 0.01 apart at the middle (STEP_FINE_MID), then at the bottom
#   (STEP_FINE): all different texts is more than 24 steps (a 24-step
#   parameter's end steps are 1/46 wide): continuous, ~150 ms (~300 ms when
#   only the bottom's change). The middle first: a volume's bottom values all
#   read -inf (Surge XT's Osc Volume: the full sweep, 2.5 s, capture 2026-10-26);
# - else the centres of 24 equal bands: one in every step of a parameter with
#   up to 24, whether the plugin rounds or truncates;
#   up to 24, whether the plugin rounds or truncates (~1.3 s);
# - and if the centres show more than 12 texts, the 23 band edges too: 25..28
#   values (a +-12 transpose is 25) can hide a step between two centres. All
#   the values then decide: more than 24 texts, or one in two runs, is
#   continuous (~2.4 s).
# Any time the values so far (in value order) show more than 24 texts, or a
# text back after another, the sweep stops: more values can't make it stepped.
STEP_FINE = (0.0, 0.01, 0.02)
STEP_FINE_MID = (0.5, 0.51, 0.52)
STEP_CENTRES = tuple((i + 0.5) / MAX_STEPS for i in range(MAX_STEPS))
STEP_EDGES = tuple(i / MAX_STEPS for i in range(1, MAX_STEPS))
# A tick can come straight after the write with the text not yet followed
# ("Analog": a tick 0 ms after still had the old text)
STEP_SETTLE_S = 0.02

# PLUGIN messages (PLUGIN_COMMAND_GROUP)
NUM_DEVICES = 0x02          # DAW -> ROTO: <count>
FIRST_DEVICE = 0x03         # DAW -> ROTO: <first on the page>
SET_FIRST_DEVICE = 0x04     # ROTO -> DAW: <first on the page>
PLUGIN_DETAILS = 0x05       # DAW -> ROTO: <index, hash:8, enabled, name[13], type, macro pages>
PLUGIN_DETAILS_END = 0x06   # DAW -> ROTO
ROTO_SELECT_DEVICE = 0x07   # ROTO -> DAW: <index on the page>
DAW_SELECT_PLUGIN = 0x08    # DAW -> ROTO: <index, macro page, force>
SET_DEVICE_LEARN = 0x09     # ROTO -> DAW: <learning>
# DAW -> ROTO: <index:2, hash:6, macro, centre indent, steps, position:2, name[13]>
LEARN_PARAM = 0x0A
CONTROL_MAPPED = 0x0B       # ROTO -> DAW: <index:2, hash:6, type (0 knob, 1 switch), control, macro>
SET_PLUGIN_ENABLE = 0x0C    # ROTO -> DAW: <index on the page, enabled>
SET_PLUGIN_LOCK = 0x0D      # ROTO -> DAW: <locked>
SET_TRACK_SELECT_MODE = 0x15    # ROTO -> DAW: <shown>: PLUGIN's FUNC (the insert list) shown or left
# ROTO -> DAW: after each CONTROL_MAPPED burst, even an empty one: <page, map
# empty>. Map empty: the plugin has nothing mapped on any page, so a default
# map may be sent. Firmware ATARI-FL (2026-11-09) sends it to FL as to Cubase.
# (The firmware's command values from here are its enum's order, no longer
# pinned, 2026-11-10: CONTROL_MAPPED_END was 0x20, sharing UNMAP_CTLS' value,
# and the rest one lower.)
CONTROL_MAPPED_END = 0x21
# ROTO -> DAW, no payload: drop the mapped controls (master firmware; sent before
# it reloads a plugin the configurator changed, whose burst and marker follow)
UNMAP_CTLS = 0x20
# DAW -> ROTO: one control of the selected plugin's default map (RAM only; LEARN
# drops it, CLEARing a control of it saves the rest): <plugin hash:8, type (0
# knob, 1 switch), control index (page * 8 + control), colour scheme, min:2,
# max:2, flags (1 indent 1, 2 indent 2, 4 push), indent 1, indent 2, LED on, LED
# off, then LEARN_PARAM's payload without step names>
SET_DEFAULT_CTL = 0x22
SET_DEFAULT_CTL_END = 0x23  # DAW -> ROTO: <plugin hash:8>: the map is complete, ROTO redraws

plugin_active = False
plugin_list: list = []      # entries: (index, slot): slot -1 = the channel's generator
plugin_first = 0            # the page ROTO shows
plugin_selected = None      # the entry ROTO has selected
plugin_selected_name = None     # its plugin's name (plugin_name), followed to other inserts
plugin_locked = False
plugin_learning = False
shown_plugin_list = None    # what ROTO was sent: (count, first, details)
plugin_focus = None         # the focused plugin window last seen
plugin_scanned_at = 0.0
# PLUGIN's FUNC is shown: LEFT/RIGHT page its bank of inserts (as Cubase's)
plugin_track_select = False
# An insert was picked: ROTO has dropped its plugin, so the list and the
# selection go again, whatever changed
plugin_reselect = False
# The selected plugin's named parameters ({index: name}) and their hashes
plugin_params: dict = {}
plugin_param_hashes: dict = {}
# Mapped controls: (type, control) -> parameter index; type 0 = knob, 1 = switch
mapped: dict = {}
mapped_at = 0.0
# ROTO ends each CONTROL_MAPPED burst with CONTROL_MAPPED_END (ATARI-FL
# firmware): once one has been seen, a burst is the page's whole set, with no
# timing (MAPPED_BURST_S is for firmware without it)
mapped_end_seen = False
mapped_set_open = False     # a CONTROL_MAPPED since the last marker
shown_mapped: dict = {}     # (type, control) -> (14-bit position or switch CC value, text)
plugin_knob_held = [False] * NUM_SLOTS
# LEARN
learn_values: dict = {}     # parameter index -> value at the last poll
learn_polled_at = 0.0
learn_offered = None        # (parameter index, time of its last change)
learn_crowd_logged = 0.0    # when poll_learn last logged several parameters moving
plugin_writes: dict = {}    # parameter index -> the value the script last wrote
plugin_written_at: dict = {}    # parameter index -> when
param_steps: dict = {}      # (plugin name, parameter index) -> steps LEARN found (0: continuous)
step_sweep = None           # a slow sweep: [entry, parameter, value to put back, texts, started]
text_lags: set = set()      # plugin names whose text didn't follow a sweep: straight to the slow one
step_written_at = 0.0
# A VST's text follows a write after this many idle ticks (measured on its first
# slow sweep: Surge XT's took 2, so with 1 each text read was the previous
# value's; capture 2026-10-26, A Osc 1 Formant)
sweep_lags: dict = {}       # plugin name -> idle ticks
step_sweep_probe = None     # measuring the lag: the parameter's text before the probe write
step_sweep_ticks = 0        # idle ticks since the sweep's last write
SWEEP_LAG_MAX = 4           # ticks the lag probe waits for the text to change
SWEEP_LAG_DEFAULT = 2       # ... and the lag taken when it didn't


def name_hash(text, size):
    """`size` 7-bit bytes from a 64-bit FNV-1a hash of `text`: stable across
    sessions and machines (ROTO stores mappings by it), and needs no hashlib."""
    h = 0xCBF29CE484222325
    for b in text.encode("utf-8"):
        h = ((h ^ b) * 0x100000001B3) & 0xFFFFFFFFFFFFFFFF
    return [(h >> (7 * i)) & 0x7F for i in range(size)]


def channel_has_plugin(channel):
    # (Sampler / Audio Clip channels aren't plugins to the plugins module:
    # capture 2026-10-24 23:35, the probe's calls failed on one)
    return channel >= 0 and channels.getChannelType(channel) in (midi.CT_GenPlug, midi.CT_Hybrid) and \
        plugins.isValid(channel)


# A Sampler or Audio Clip channel isn't a plugin to the plugins module, but its
# channel settings are REC events (README "Channel events"): its list entry,
# (channel, CHANNEL_SLOT), has these as parameters, indexed by event offset;
# mappings are kept per channel type ("Sampler"), as a plugin's. Only these
# offsets, and only those FL names: FL crashes reading an event a channel doesn't
# have (probe 2026-10-25). Audio Clip channels get the basics only until a probe
# has walked one.
CHANNEL_SLOT = -2
CHANNEL_TYPE_NAMES = {midi.CT_Sampler: "Sampler", midi.CT_AudioClip: "Audio Clip"}
CHANNEL_AUDIO_CLIP_END = 0x100
# FL gives the filter type no text; its order in the channel's filter menu (not checked against FL)
CHANNEL_FILTER_TYPES = ("Fast LP", "LP", "Band pass", "HP", "Band stop", "LP x2", "SVF LP", "SVF LP x2")
CHANNEL_PARAMS = {          # offset -> (name, step names or None)
    0x00: ("Volume", None), 0x01: ("Pan", None), 0x02: ("Filter cut", None), 0x03: ("Filter res", None),
    0x04: ("Pitch", None), 0x05: ("Filter type", CHANNEL_FILTER_TYPES), 0x06: ("Porta time", None),
    0x09: ("Gate", None), 0x0A: ("Crossfade", None), 0x0B: ("Time shift", None), 0x0C: ("Swing mix", None),
    0x0D: ("Sample start", None), 0x0E: ("Stretch time", None), 0x10: ("Pan offset", None),
    0x11: ("Vol multiply", None), 0x13: ("Mod X offset", None), 0x14: ("Mod Y offset", None),
    0x200: ("Dly feedback", None), 0x201: ("Dly pan", None), 0x202: ("Dly pitch", None),
    0x203: ("Dly echoes", None), 0x204: ("Dly time", None), 0x205: ("Dly mod Y", None),
    0x206: ("Dly mod X", None),
    0x300: ("Arp dir", None), 0x301: ("Arp range", None), 0x302: ("Arp chord", None), 0x303: ("Arp time", None),
    0x304: ("Arp gate", None), 0x305: ("Arp repeat", None),
    0x500: ("Vel to pan", None), 0x501: ("Vel to mod X", None), 0x502: ("Vel to mod Y", None),
}
# Envelope / LFO per target: 0x1000 + target * 0x100 (Panning, Volume, Filter
# cutoff, Filter resonance, Pitch), each laid out the same; "E" envelope, "L" LFO
for _target, _prefix in enumerate(("Pan", "Vol", "Cut", "Res", "Pitch")):
    for _offset, _name in ((0x0, "mod X"), (0x1, "mod Y"), (0x2, "E dly"), (0x3, "E att"), (0x4, "E hold"),
                           (0x5, "E dec"), (0x6, "E sus"), (0x7, "E rel"), (0x8, "E amt"), (0x9, "L dly"),
                           (0xA, "L att"), (0xB, "L amt"), (0xC, "L spd"), (0xE, "A tens"), (0xF, "D tens")):
        CHANNEL_PARAMS[0x1000 + _target * 0x100 + _offset] = ("%s %s" % (_prefix, _name), None)

# The insert's own mixer strip (as Cubase's channel strip EQ), after the
# channels routed to it, before its effects: (insert, STRIP_SLOT). Its
# parameters are the insert's REC events, getTrackPluginId(insert, 0) +
# REC_Mixer_Vol + offset, as FL's Mackie Control script reads and writes them
# (getEventValue, automateEvent); indexed by that offset (ROTO's indexes are 14
# bits). Only these events: FL crashes reading one that doesn't exist. The texts
# are the script's own (FL's EQ texts were nonsense in probe_insert_eq,
# 2026-10-25), from getEqGain / getEqFrequency in dB / Hz, except stereo
# separation's (FL's). Mappings are kept as one "plugin" for every insert.
STRIP_SLOT = -3
STRIP_NAME = "Mixer strip"
STRIP_PAN, STRIP_SEP = 0x01, 0x02
STRIP_EQ_GAIN, STRIP_EQ_FREQ, STRIP_EQ_BW = 0x10, 0x18, 0x20    # + band (REC_Mixer_EQ_Gain / Freq / Q)
STRIP_BANDS = ("low", "mid", "high")
# offset -> (name, centre detent: ROTO takes it when learning)
STRIP_PARAMS = {0x00: ("Volume", False), STRIP_PAN: ("Pan", True), STRIP_SEP: ("Stereo sep", True)}
for _band, _name in enumerate(STRIP_BANDS):
    STRIP_PARAMS[STRIP_EQ_GAIN + _band] = ("EQ %s gain" % _name, True)
    STRIP_PARAMS[STRIP_EQ_FREQ + _band] = ("EQ %s freq" % _name, False)
    STRIP_PARAMS[STRIP_EQ_BW + _band] = ("EQ %s bw" % _name, False)


def channel_settings_type(channel):
    """The channel's type when its entry is its channel settings, else None."""
    if channel < 0:
        return None
    kind = channels.getChannelType(channel)
    return kind if kind in CHANNEL_TYPE_NAMES else None


def is_channel_entry(entry):
    return entry is not None and entry[1] == CHANNEL_SLOT


def is_strip_entry(entry):
    return entry is not None and entry[1] == STRIP_SLOT


def is_event_entry(entry):
    """A channel's settings or an insert's strip: parameters are REC events."""
    return entry is not None and entry[1] in (CHANNEL_SLOT, STRIP_SLOT)


def channel_params(channel):
    """named_params for a channel entry: the table's offsets FL names."""
    started = time.monotonic()
    base = channels.getRecEventId(channel)
    audio_clip = channels.getChannelType(channel) == midi.CT_AudioClip
    names = {}
    for offset, (name, _) in CHANNEL_PARAMS.items():
        if audio_clip and offset >= CHANNEL_AUDIO_CLIP_END:
            continue
        # FL names an offset the channel doesn't have "<channel> - Unknown event (#...)"
        fl_name = mixer.getEventIDName(base + offset)
        if fl_name and "Unknown event" not in fl_name:
            names[offset] = name
    return len(CHANNEL_PARAMS), names, (time.monotonic() - started) * 1000


def build_plugin_list():
    """The channels routed to the selected insert (a generator, or a Sampler's /
    Audio Clip's channel settings), its mixer strip, then its effects: ROTO's
    track is the insert, its instruments first, then its strip (as Cubase's)."""
    insert = mixer.trackNumber()
    entries = []
    for channel in range(channels.channelCount()):
        if channels.getTargetFxTrack(channel) != insert:
            continue
        if channel_has_plugin(channel):
            entries.append((channel, -1))
        elif channel_settings_type(channel) is not None:
            entries.append((channel, CHANNEL_SLOT))
    entries.append((insert, STRIP_SLOT))
    for slot in range(NUM_FX_SLOTS):
        if mixer.isTrackPluginValid(insert, slot):
            entries.append((insert, slot))
    return entries


def slot_mute_event(entry):
    index, slot = entry
    return mixer.getTrackPluginId(index, slot) + midi.REC_Plug_Mute  # pyright: ignore[reportAttributeAccessIssue]


def plugin_enabled(entry):
    if is_strip_entry(entry):
        return True
    if entry[1] < 0:
        return not channels.isChannelMuted(entry[0]) if GENERATOR_ON_OFF else True
    return mixer.getEventValue(slot_mute_event(entry)) != 0


def named_params(index, slot):
    """The parameter count, {index: name} for the named ones (a VST lists 4240,
    few named: capture 2026-10-24 22:57), and the ms it took."""
    if slot == CHANNEL_SLOT:
        return channel_params(index)
    if slot == STRIP_SLOT:
        return len(STRIP_PARAMS), {offset: name for offset, (name, _) in STRIP_PARAMS.items()}, 0.0
    started = time.monotonic()
    count = plugins.getParamCount(index, slot)
    names = {}
    for i in range(min(count, VST_PARAM_SLOTS)):
        name = plugins.getParamName(i, index, slot)
        if name:
            names[i] = name
    return count, names, (time.monotonic() - started) * 1000


def plugin_name(entry, user=False):
    if is_strip_entry(entry):
        return STRIP_NAME
    if is_channel_entry(entry):
        return channels.getChannelName(entry[0]) if user else \
            CHANNEL_TYPE_NAMES.get(channels.getChannelType(entry[0]), "Channel")
    return plugins.getPluginName(entry[0], entry[1], user)


def plugin_display_name(entry):
    return plugin_name(entry, PLUGIN_NAMES_FROM_FL) or plugin_name(entry)


def param_display_name(name):
    """Without a "<group>/" prefix (Surge XT's "A Filters/A Filter 1 Cutoff")."""
    return name.rsplit("/", 1)[-1]


def send_plugin_list(select=True):
    """NUM_DEVICES, FIRST_DEVICE, PLUGIN_DETAILS for the page, PLUGIN_DETAILS_END,
    then DAW_SELECT_PLUGIN (as the Ableton script), when anything differs from
    what ROTO has (or always with `select`: ROTO only reloads mappings on a select)."""
    global shown_plugin_list
    page = plugin_list[plugin_first:plugin_first + NUM_PLUGINS_PAGE]
    details = [(plugin_name(e), plugin_display_name(e), plugin_enabled(e)) for e in page]
    state = (len(plugin_list), plugin_first, details)
    if state != shown_plugin_list:
        shown_plugin_list = state
        send_sysex(PLUGIN_COMMAND_GROUP, NUM_DEVICES, [len(plugin_list) & 0x7F])
        send_sysex(PLUGIN_COMMAND_GROUP, FIRST_DEVICE, [plugin_first])
        for i, (own_name, name, enabled) in enumerate(details):
            send_sysex(PLUGIN_COMMAND_GROUP, PLUGIN_DETAILS,
                       [plugin_first + i] + name_hash(own_name, 8) + [1 if enabled else 0] +
                       name_bytes(name) + [0x00, 0x00])
        send_sysex(PLUGIN_COMMAND_GROUP, PLUGIN_DETAILS_END)
    if select and plugin_selected in plugin_list:
        send_sysex(PLUGIN_COMMAND_GROUP, DAW_SELECT_PLUGIN, [plugin_list.index(plugin_selected), 0x00, 0x00])


def followed_plugin(entries):
    """On another insert (ROTO's plugin isn't in its list): the same plugin, by
    FL's plugin name (as ROTO's mappings: every instance shares them), the same
    slot first, as the Cubase script follows a plugin across tracks; else the
    first entry. The strip follows to the next insert's strip."""
    same = [e for e in entries if plugin_name(e) == plugin_selected_name]
    if same:
        return next((e for e in same if plugin_selected and e[1] == plugin_selected[1]), same[0])
    return entries[0] if entries else None


def select_plugin(entry, tell_roto=True):
    """The plugin ROTO controls; its page goes to ROTO first if needed."""
    global plugin_selected, plugin_selected_name, plugin_first, plugin_params, plugin_param_hashes
    plugin_selected = entry
    if entry is not None:
        plugin_selected_name = plugin_name(entry)
    plugin_params, plugin_param_hashes = {}, {}
    mapped.clear()
    shown_mapped.clear()
    learn_values.clear()
    if entry is not None:
        _, plugin_params, _ = named_params(*entry)
        plugin_param_hashes = {i: tuple(name_hash(name, 6)) for i, name in plugin_params.items()}
        position = plugin_list.index(entry) if entry in plugin_list else 0
        plugin_first = position - position % NUM_PLUGINS_PAGE
        log("PLUGIN: %r (%d named parameters)" % (plugin_display_name(entry), len(plugin_params)))
    if tell_roto:
        send_plugin_list()


def focused_plugin():
    """The focused plugin window as a list entry, or None."""
    if ui.getFocused(6):        # an effect
        return mixer.getActiveEffectIndex()
    if ui.getFocused(7):        # a generator: the form ID is its channel
        channel = ui.getFocusedFormID()
        if channel_has_plugin(channel):
            return (channel, -1)
        return (channel, CHANNEL_SLOT) if channel_settings_type(channel) is not None else None
    return None


def open_plugin_window(entry):
    index, slot = entry
    if slot == STRIP_SLOT:
        # The insert is FL's selected one already: its strip is in the mixer
        ui.showWindow(midi.widMixer)
    elif slot < 0:
        channels.focusEditor(index)
    else:
        mixer.focusEditor(index, slot)


def update_plugin():
    """The list, FL's selection and the focused window (every PLUGIN_SCAN_S), and
    the mapped parameters' feedback (every tick)."""
    global plugin_list, plugin_focus, plugin_scanned_at, plugin_reselect, shown_plugin_list
    if not plugin_active:
        return
    now = time.monotonic()
    if now - plugin_scanned_at >= PLUGIN_SCAN_S:
        plugin_scanned_at = now
        # Locked or learning, ROTO stays on its plugin (as the Ableton script)
        if not plugin_locked and not plugin_learning:
            entries = build_plugin_list()
            focus = focused_plugin()
            focus_changed = focus != plugin_focus
            plugin_focus = focus
            if entries != plugin_list or plugin_reselect:
                plugin_reselect = False
                plugin_list = entries
                shown_plugin_list = None
                if focus in entries:
                    select_plugin(focus)
                elif plugin_selected in entries:
                    send_plugin_list()
                else:
                    select_plugin(followed_plugin(entries))
            elif focus_changed and focus in entries and focus != plugin_selected:
                select_plugin(focus)
            else:
                send_plugin_list(select=False)     # names, on/off
        elif plugin_locked:
            plugin_focus = focused_plugin()
            plugin_reselect = False
        update_plugin_track()
    if step_sweep:
        advance_step_sweep()
        return
    if plugin_learning:
        poll_learn(now)
    update_mapped()


def update_plugin_track():
    """The selected insert as ROTO's track, as in MIX: its name titles the PLUGIN
    screen (on TRACK_DETAILS_END), and FUNC lists the bank, picked with
    ROTO_SELECT_TRACK, paged with PAGE_LEFT / RIGHT while it is shown; otherwise
    the bank follows the selected insert."""
    insert = mixer.trackNumber()
    inserts = view_inserts()
    if insert in inserts and not plugin_track_select:
        pos = inserts.index(insert)
        if not bank_pos[view] <= pos < bank_pos[view] + NUM_SLOTS:
            bank_pos[view] = pos - pos % NUM_SLOTS
    names_sent = update_names()
    if update_selected() or names_sent:
        send_sysex(GENERAL_COMMAND_GROUP, TRACK_DETAILS_END)


def plugin_page_bank(direction):
    """LEFT / RIGHT in PLUGIN's FUNC: the next bank of inserts to pick from."""
    pos = bank_pos[view] + direction * NUM_SLOTS
    if 0 <= pos < len(view_inserts()):
        bank_pos[view] = pos
        log("PLUGIN: inserts from %d" % slot_insert(0))
        update_plugin_track()


# --- PLUGIN: mapped controls ------------------------------------------------------

def resolve_mapped(index, param_hash):
    """The selected plugin's parameter for ROTO's <index, hash>: by hash, or by
    index when the plugin repeats the name (as the Ableton script). None if gone."""
    matches = [i for i, h in plugin_param_hashes.items() if h == param_hash]
    if len(matches) == 1:
        return matches[0]
    if len(matches) > 1 and plugin_param_hashes.get(index) == param_hash:
        return index
    return None


def param_value(param, entry=None):
    """0..1. A channel's or strip's from its event (0..FromMIDI_Max)."""
    entry = entry or plugin_selected
    if is_event_entry(entry):
        return mixer.getEventValue(plugin_rec_event(entry, param)) / midi.FromMIDI_Max
    return plugins.getParamValue(param, *entry)


def param_position(param):
    return max(0, min(KNOB_MAX, round(param_value(param) * KNOB_MAX)))


def strip_text(insert, param):
    """A strip parameter's text (STRIP_PARAMS)."""
    if param == 0:
        return knob_text((insert, "volume"))
    if param == STRIP_PAN:
        return knob_text((insert, "pan"))
    if param == STRIP_SEP:
        event = plugin_rec_event(plugin_selected, param)
        text = mixer.getEventIDValueString(event, mixer.getAutoSmoothEventValue(event))
        return text or "%+d%%" % round(mixer.getTrackStereoSep(insert) * 100)
    band = param & 0x07
    if param < STRIP_EQ_FREQ:
        return "%.1f dB" % (round(mixer.getEqGain(insert, band, 1), 1) + 0.0)
    if param < STRIP_EQ_BW:
        hz = mixer.getEqFrequency(insert, band, 1)
        return "%d Hz" % round(hz) if hz < 1000 else "%.2f kHz" % (hz / 1000)
    return "%d%%" % round(mixer.getEqBandwidth(insert, band) * 100)


def sweep_text(param):
    """A parameter's text for LEARN's step sweep, read twice: a VST's read can
    return the text the previous read asked for (Surge XT's sweep texts were a
    value behind, its stored lag 1 tick, capture 2026-10-26: 'A Osc 1 Solo' read
    On at 0.0, Off at 0.5). Read twice, the second is the value's own."""
    param_text(param)
    return param_text(param)


def param_text(param):
    if is_strip_entry(plugin_selected):
        return strip_text(plugin_selected[0], param)
    if not is_channel_entry(plugin_selected):
        return plugins.getParamValueString(param, *plugin_selected)
    # FL's text needs the event's own value (as Mackie Control); some have none
    event = plugin_rec_event(plugin_selected, param)
    text = mixer.getEventIDValueString(event, mixer.getAutoSmoothEventValue(event))
    if text:
        return text
    value = param_value(param)
    steps = CHANNEL_PARAMS[param][1]
    return steps[min(len(steps) - 1, int(value * len(steps)))] if steps else "%d%%" % round(value * 100)


def send_learn_param(param, index=None, steps=0):
    """LEARN_PARAM: while learning, the parameter just moved; else the reply to a
    knob's CONTROL_MAPPED (its name and position), with ROTO's own index (as the
    Ableton script). ROTO takes the steps only when learning; the step names go
    blank (as the Ableton script's), so ROTO shows FL's text."""
    position = param_position(param)
    step_names = [0x00] * (steps * (MAX_NAME_CHARS + 1)) if steps <= MAX_STEP_NAMES else []
    if steps and is_channel_entry(plugin_selected) and CHANNEL_PARAMS[param][1]:
        # FL gives these no text: the names go to ROTO
        step_names = [b for name in CHANNEL_PARAMS[param][1] for b in name_bytes(name)]
    # A centre detent for the strip's pan, separation and EQ gains, and where
    # the plugin's default map gives one
    c = map_control(param)
    centre = 1 if (is_strip_entry(plugin_selected) and STRIP_PARAMS[param][1]) or (c and c["knob"] and c.get("centre")) else 0
    send_sysex(PLUGIN_COMMAND_GROUP, LEARN_PARAM,
               index_bytes(param if index is None else index) + list(plugin_param_hashes[param]) +
               [0x00, centre, steps] + index_bytes(position) +
               name_bytes(param_display_name(plugin_params[param])) + step_names)


def on_control_mapped(data):
    global mapped_at, mapped_set_open
    now = time.monotonic()
    if (not mapped_set_open) if mapped_end_seen else (now - mapped_at > MAPPED_BURST_S):
        mapped.clear()
        shown_mapped.clear()
    mapped_at = now
    mapped_set_open = True
    if plugin_selected is None or len(data) < 10:
        return
    index = (data[0] << 7) | data[1]
    param = resolve_mapped(index, tuple(data[2:8]))
    control = (data[8], data[9])
    if param is None:
        mapped.pop(control, None)
        log("PLUGIN: mapped %s %d: no such parameter" % (("knob", "switch")[control[0]], control[1] + 1))
        return
    mapped[control] = param
    shown_mapped.pop(control, None)
    if control[0] == 0:
        send_learn_param(param, index)


def on_control_mapped_end(data):
    """ROTO's marker after a CONTROL_MAPPED burst (or UNMAP_CTLS: no payload).
    With no CONTROL_MAPPED since the last one the page has nothing mapped. With
    map empty, the selected plugin's default map goes to ROTO."""
    global mapped_end_seen, mapped_set_open
    mapped_end_seen = True
    if not mapped_set_open:
        mapped.clear()
        shown_mapped.clear()
    mapped_set_open = False
    if plugin_active and len(data) >= 2 and data[1]:
        send_default_map()


# --- Default maps (default_maps.py, hand-made, over default_maps_data.py, generated
# by roto_mapper's maps_to_fl.py)

def default_map(entry=None):
    """The selected plugin's default map (its controls), or None. Keyed by FL's
    name for the plugin (plugin_name), which ROTO's plugin hash is made from.
    A hand-made map (default_maps.py) overrides the generated one."""
    entry = entry or plugin_selected
    if entry is None:
        return None
    name = plugin_name(entry)
    return default_maps.MAPS.get(name) or default_maps_data.MAPS.get(name)


def map_control(param):
    """The selected plugin's default map control for a parameter, or None."""
    controls = default_map()
    param_hash = plugin_param_hashes.get(param)
    if not controls or param_hash is None:
        return None
    return next((c for c in controls if tuple(c["hash"]) == param_hash and
                 resolve_mapped(c["index"], param_hash) == param), None)


def map_steps(c):
    """A map control's steps: a knob's N steps (0 = continuous), a switch's
    positions (at least 2)."""
    return c.get("steps", 0) if c["knob"] else max(2, c.get("steps", 2))


def send_default_map():
    """SET_DEFAULT_CTL for each control of the selected plugin's default map
    whose parameter it has, then SET_DEFAULT_CTL_END. ROTO ignores a map for a
    plugin it has left (the plugin hash), then redraws and sends CONTROL_MAPPED
    for the page, answered as usual."""
    controls = default_map()
    if not controls:
        return
    name = plugin_name(plugin_selected)
    plugin_hash = name_hash(name, 8)
    sent = 0
    for c in controls:
        param = resolve_mapped(c["index"], tuple(c["hash"]))
        if param is None:
            log("PLUGIN: default map of %s: no parameter %s" % (name, c.get("name", c["index"])))
            continue
        knob = c["knob"]
        lo, hi = c.get("min", 0), c.get("max", KNOB_MAX if knob else 127)
        indents = [p for p in c.get("indents", ()) if 0 <= p <= 127][:2] if knob else []
        flags = (1 if len(indents) > 0 else 0) | (2 if len(indents) > 1 else 0) | (4 if c.get("push") else 0)
        indents += [0] * (2 - len(indents))
        label = c.get("name") or param_display_name(plugin_params[param])
        send_sysex(PLUGIN_COMMAND_GROUP, SET_DEFAULT_CTL,
                   plugin_hash + [0 if knob else 1, c["ctl"] & 0x7F, c.get("colour", MAP_DEFAULT_COLOUR) & 0x7F] +
                   index_bytes(lo) + index_bytes(hi) + [flags] + indents +
                   [c.get("ledOn", MAP_DEFAULT_LED_ON) & 0x7F, c.get("ledOff", MAP_DEFAULT_LED_OFF) & 0x7F] +
                   index_bytes(param) + list(plugin_param_hashes[param]) +
                   [0x00, 1 if knob and c.get("centre") else 0, map_steps(c)] +
                   index_bytes(param_position(param)) + name_bytes(label))
        sent += 1
    send_sysex(PLUGIN_COMMAND_GROUP, SET_DEFAULT_CTL_END, plugin_hash)
    log("PLUGIN: default map of %s: %d of %d controls" % (name, sent, len(controls)))


def update_mapped():
    """The mapped parameters' values to ROTO: knob positions (not while held),
    switch LEDs, and value popups when the text changes (a VST's text lags its
    value by a poll: capture 2026-10-24 23:35). A knob's first update after
    mapping has no popup (ROTO loading a plugin would pop them all up); a
    switch's has its text."""
    if plugin_selected is None:
        return
    for (kind, control), param in mapped.items():
        value = param_position(param) if kind == 0 else round(param_value(param) * 127)
        text = param_text(param)
        shown = shown_mapped.get((kind, control))
        if shown and shown == (value, text):
            continue
        if (kind == 0 and plugin_knob_held[control]) or \
                time.monotonic() - plugin_written_at.get(param, 0.0) < WRITE_HOLD_S:
            # Turning (or a smoothed write sliding): the popup follows it, the
            # position is ROTO's
            if shown is not None and text != shown[1]:
                send_sysex(GENERAL_COMMAND_GROUP, PARAM_VALUES, [kind, control] + name_bytes(text))
                shown_mapped[(kind, control)] = (shown[0], text)
            continue
        if shown is None or (kind == 0 and abs(value - shown[0]) > KNOB_SEND_TOLERANCE) or \
                (kind == 1 and value != shown[0]):
            if kind == 0:
                send_cc(KNOB_CC_BASE + control, value >> 7)
                send_cc(KNOB_LSB_CC_BASE + control, value & 0x7F)
            else:
                send_cc(BUTTON_CC_BASE + control, value)
        if (shown is None and kind == 1) or (shown is not None and text != shown[1]):
            send_sysex(GENERAL_COMMAND_GROUP, PARAM_VALUES, [kind, control] + name_bytes(text))
        shown_mapped[(kind, control)] = (value, text)


def on_plugin_cc(cc, value):
    """A mapped knob, switch or knob touch in PLUGIN. Returns whether cc was one."""
    if KNOB_CC_BASE <= cc < KNOB_CC_BASE + NUM_SLOTS:
        knob_msb[cc - KNOB_CC_BASE] = value
    elif KNOB_LSB_CC_BASE <= cc < KNOB_LSB_CC_BASE + NUM_SLOTS:
        control = cc - KNOB_LSB_CC_BASE
        param = mapped.get((0, control))
        if param is not None and plugin_selected is not None:
            position = (knob_msb[control] << 7) | value
            write_param(param, position / KNOB_MAX)
            shown = shown_mapped.get((0, control))
            shown_mapped[(0, control)] = (position, shown[1] if shown else "")
    elif BUTTON_CC_BASE <= cc < BUTTON_CC_BASE + NUM_SLOTS:
        control = cc - BUTTON_CC_BASE
        param = mapped.get((1, control))
        if param is not None and plugin_selected is not None:
            write_param(param, value / 127)
            shown = shown_mapped.get((1, control))
            shown_mapped[(1, control)] = (value, shown[1] if shown else "")
    elif KNOB_TOUCH_CC_BASE <= cc < KNOB_TOUCH_CC_BASE + NUM_SLOTS:
        control = cc - KNOB_TOUCH_CC_BASE
        plugin_knob_held[control] = value > 0
        param = mapped.get((0, control))
        if value > 0 and param is not None and plugin_selected is not None:
            text = param_text(param)
            send_sysex(GENERAL_COMMAND_GROUP, PARAM_VALUES, [0, control] + name_bytes(text))
        # On release the next update sends FL's value if it differs
    else:
        return False
    return True


def plugin_rec_event(entry, param):
    """The REC event of a plugin's parameter (from the stubs' ranges; FL's event
    value matched an effect's: probe_steps, capture 2026-10-25 12:54)."""
    index, slot = entry
    if slot == CHANNEL_SLOT:
        return channels.getRecEventId(index) + param
    if slot == STRIP_SLOT:
        return mixer.getTrackPluginId(index, 0) + midi.REC_Mixer_Vol + param  # pyright: ignore[reportAttributeAccessIssue]
    if slot < 0:
        return channels.getRecEventId(index) + midi.REC_Chan_Plugin_First + param
    return mixer.getTrackPluginId(index, slot) + midi.REC_Plug_Plugin_First + param  # pyright: ignore[reportAttributeAccessIssue]


def write_param(param, value, control=True):
    """A parameter write: a mapped control's by WRITE_MODES (`control`), else
    (the step sweeps putting a parameter back) straight."""
    global write_mode
    plugin_writes[param] = value
    plugin_written_at[param] = time.monotonic()
    if is_event_entry(plugin_selected):
        # Events only (no setParamValue for channel settings or the strip)
        mixer.automateEvent(plugin_rec_event(plugin_selected, param), round(value * midi.FromMIDI_Max),
                            midi.REC_MIDIController, SMOOTH_SPEED if control else 0)
        return
    flags = WRITE_MODES[write_mode][1] if control else None
    if flags is None:
        plugins.setParamValue(value, param, *plugin_selected)
        return
    try:
        event = plugin_rec_event(plugin_selected, param)
        if flags == "smoothed":
            mixer.automateEvent(event, round(value * midi.FromMIDI_Max), midi.REC_MIDIController, SMOOTH_SPEED)
        else:
            general.processRECEvent(event, round(value * midi.FromMIDI_Max), flags)
    except Exception as e:
        log("PLUGIN: write by REC event failed (%r): back to setParamValue" % e)
        write_mode = 0
        plugins.setParamValue(value, param, *plugin_selected)


def set_write_mode(mode):
    """Typed in FL's Script output window: how mapped controls write (WRITE_MODES)."""
    global write_mode
    write_mode = mode
    log("PLUGIN: writes by " + WRITE_MODES[mode][0])


def set_smooth_speed(speed):
    """Typed in FL's Script output window: the smoothed writes' speed (FL's
    units, undocumented; 0 is unsmoothed, Mackie's "on" is 469)."""
    global SMOOTH_SPEED
    SMOOTH_SPEED = speed
    log("PLUGIN: smooth speed %d" % speed)


# --- PLUGIN: LEARN ----------------------------------------------------------------

def poll_learn(now):
    """While learning: a parameter of the selected plugin moved in FL, alone,
    becomes a LEARN_PARAM, once per gesture. A poll where several moved (a
    Waves A/B switch, a preset) offers nothing; nor do the script's own writes."""
    global learn_polled_at, learn_offered, learn_crowd_logged
    if plugin_selected is None or now - learn_polled_at < LEARN_POLL_S:
        return
    learn_polled_at = now
    changed = []
    for param in plugin_params:
        value = param_value(param)
        last = learn_values.get(param)
        learn_values[param] = value
        if last is not None and value != last:
            changed.append((param, value))
    if len(changed) > 1 and now - learn_crowd_logged > LEARN_REPEAT_S:
        # Why nothing was offered (once a gesture): FL can move more than one
        learn_crowd_logged = now
        log("PLUGIN: learn: %d parameters moved together, none offered: %s%s" %
            (len(changed), ", ".join(repr(plugin_params[p]) for p, _ in changed[:5]),
             " ..." if len(changed) > 5 else ""))
    if len(changed) != 1:
        return
    param, value = changed[0]
    written = plugin_writes.get(param)
    if written is not None and abs(written - value) < 1.0 / KNOB_MAX:
        return
    same_gesture = learn_offered and learn_offered[0] == param and now - learn_offered[1] < LEARN_REPEAT_S
    learn_offered = (param, now)
    if not same_gesture:
        log("PLUGIN: learn %r" % plugin_params[param])
        steps = find_steps(param) if LEARN_FIND_STEPS else 0
        if steps is not None:
            send_learn_param(param, steps=steps)


def find_steps(param):
    """The selected plugin's parameter's steps, 0 if continuous: the texts over a
    sweep, when each is one run (a stepped parameter's are) and there are few
    enough. Once per plugin and parameter; the parameter is put back. None when
    the text didn't follow (a VST's: capture 2026-10-25, CLA-76): a slow sweep
    finds them and sends the LEARN_PARAM."""
    global step_sweep, step_sweep_probe, step_sweep_ticks
    if is_strip_entry(plugin_selected):
        return 0
    if is_channel_entry(plugin_selected):
        # Known: only the filter type has steps (FL gives it no text to sweep)
        steps = CHANNEL_PARAMS[param][1]
        return len(steps) if steps else 0
    name = plugin_name(plugin_selected)
    if (name, param) in param_steps:
        return param_steps[(name, param)]
    # In the plugin's default map: its steps (from roto_mapper's dump), no sweep
    c = map_control(param)
    if c is not None:
        param_steps[(name, param)] = map_steps(c)
        return param_steps[(name, param)]
    started = time.monotonic()
    value = plugins.getParamValue(param, *plugin_selected)
    entry = plugin_selected
    if entry is None:
        return 0
    if name not in text_lags:
        # The fast sweep; the values read back too (Surge XT's came back as
        # written even for a stepped one: FL's copy, capture 2026-10-26)
        texts = []
        readbacks = []
        for i in range(STEP_SAMPLES + 1):
            plugins.setParamValue(i / STEP_SAMPLES, param, *entry)
            readbacks.append(plugins.getParamValue(param, *entry))
            texts.append(sweep_text(param))
        write_param(param, value, False)
        steps = steps_from_readbacks(param, readbacks, started)
        if steps is not None:
            return steps
        if len(set(texts)) > 1:
            return steps_from(param, texts, started)
        text_lags.add(name)
    step_sweep = [plugin_selected, param, value, [], time.monotonic()]
    step_sweep_ticks = 0
    if name in sweep_lags:
        step_sweep_probe = None
        write_step_value(STEP_PLAN[0], param, plugin_selected)
    else:
        # First the lag: the far end's text must differ from the value's
        step_sweep_probe = sweep_text(param)
        write_step_value(0.0 if value > 0.5 else 1.0, param, plugin_selected)
    log("PLUGIN: %r: finding steps (slow sweep; stay in LEARN)" % plugin_params[param])
    return None


def steps_from_readbacks(param, readbacks, started):
    """The fast sweep's values read back after each write: a plugin that snaps
    a stepped parameter's value (0.37 back as 0.333) gives its steps without its
    text, in the same tick. None when they don't tell (the values come back as
    written, or didn't follow): the text decides. Logged either way, to see
    which plugins snap."""
    written = [i / STEP_SAMPLES for i in range(STEP_SAMPLES + 1)]
    snapped = any(abs(back - value) > 1e-3 for back, value in zip(readbacks, written))
    rising = all(b >= a - 1e-6 for a, b in zip(readbacks, readbacks[1:]))
    distinct = sorted(set(round(back, 4) for back in readbacks))
    steps = None
    if snapped and rising and 2 <= len(distinct) <= MAX_STEPS:
        steps = len(distinct)
    elif snapped and rising and len(distinct) > MAX_STEPS:
        steps = 0
    log("PLUGIN: %r: values read back: %d distinct, %s, %s: %s" %
        (plugin_params[param], len(distinct), "snapped" if snapped else "as written",
         "rising" if rising else "not rising",
         "undecided" if steps is None else ("%d steps" % steps if steps else "continuous") +
         " (%.0f ms)" % ((time.monotonic() - started) * 1000)))
    if steps is not None:
        param_steps[(plugin_name(plugin_selected), param)] = steps
    return steps


def steps_from(param, texts, started, stopped=False):
    runs = 1 + sum(1 for a, b in zip(texts, texts[1:]) if a != b)
    distinct = len(set(texts))
    steps = distinct if not stopped and distinct == runs and 2 <= distinct <= MAX_STEPS else 0
    log("PLUGIN: %r: %d texts in %d runs from %d values%s: %s (%.0f ms)" %
        (plugin_params[param], distinct, runs, len(texts), " (stopped)" if stopped else "",
         "%d steps" % steps if steps else "continuous", (time.monotonic() - started) * 1000))
    param_steps[(plugin_name(plugin_selected), param)] = steps
    return steps


def advance_step_sweep():
    """The slow sweep, one value per idle tick (a VST's text follows a write a
    tick later): the last value's text, then the next value. At the end the
    parameter goes back and, still learning, the LEARN_PARAM goes out. Dropped
    if LEARN ends or the plugin changes."""
    global step_sweep, step_sweep_probe, step_sweep_ticks
    entry, param, value, texts, started = step_sweep
    if not plugin_learning or entry != plugin_selected:
        step_sweep = None
        plugins.setParamValue(value, param, *entry)
        log("PLUGIN: %r: step sweep dropped (%s), not learned" %
            (plugin_params.get(param, param), "LEARN ended" if not plugin_learning else "plugin changed"))
        return
    now = time.monotonic()
    if now - step_written_at < STEP_SETTLE_S:
        return
    step_sweep_ticks += 1
    name = plugin_name(entry)
    if step_sweep_probe is not None:
        changed = sweep_text(param) != step_sweep_probe
        if not changed and step_sweep_ticks < SWEEP_LAG_MAX:
            return
        sweep_lags[name] = step_sweep_ticks if changed else SWEEP_LAG_DEFAULT
        log("PLUGIN: %r's text follows a write after %d idle tick(s)%s" %
            (name, sweep_lags[name], "" if changed else " (assumed: it didn't change)"))
        step_sweep_probe = None
        step_sweep_ticks = 0
        write_step_value(STEP_PLAN[0], param, entry)
        return
    if step_sweep_ticks < sweep_lags.get(name, 1):
        return
    step_sweep_ticks = 0
    texts.append(sweep_text(param))
    plan = step_plan(texts)
    if plan is not None:
        write_step_value(plan, param, entry)
        return
    step_sweep = None
    write_param(param, value, False)
    learn_values[param] = plugins.getParamValue(param, *entry)
    steps = steps_from_sweep(param, texts, started)
    send_learn_param(param, steps=steps)


STEP_PLAN = STEP_FINE_MID + STEP_FINE + STEP_CENTRES + STEP_EDGES


def sweep_verdict(texts):
    """The slow sweep's texts so far (STEP_PLAN's first values): None while it
    must go on, else (why, steps; 0 continuous). See STEP_FINE."""
    count, fine = len(texts), len(STEP_FINE)
    if not count:
        return None
    for start, where in ((0, "middle"), (fine, "bottom")):
        if count >= start + fine and len(set(texts[start:start + fine])) == fine:
            return "the fine values at the %s differ" % where, 0
    ordered = [t for _, t in sorted(zip(STEP_PLAN, texts))]
    runs = 1 + sum(1 for a, b in zip(ordered, ordered[1:]) if a != b)
    distinct = len(set(ordered))
    found = "%d texts in %d runs" % (distinct, runs)
    if distinct > MAX_STEPS or runs > distinct:
        return found, 0
    centres_end = 2 * fine + len(STEP_CENTRES)
    if (count == centres_end and len(set(texts[2 * fine:])) <= MAX_STEPS // 2) or count == len(STEP_PLAN):
        return found, distinct if 2 <= distinct <= MAX_STEPS else 0
    return None


def step_plan(texts):
    """The slow sweep's next value, None when done."""
    return None if sweep_verdict(texts) is not None else STEP_PLAN[len(texts)]


def write_step_value(value, param, entry):
    global step_written_at
    step_written_at = time.monotonic()
    plugins.setParamValue(value, param, *entry)


def steps_from_sweep(param, texts, started):
    """The slow sweep's verdict (sweep_verdict): continuous, or the texts in
    value order, each in one run, 2..24 of them, are the steps."""
    verdict, steps = sweep_verdict(texts) or ("stopped", 0)
    ordered = ["%.3f %s" % (v, t) for v, t in sorted(zip(STEP_PLAN, texts))]
    shown = " | ".join(ordered)
    log("PLUGIN: %r: %d values, %s: %s (%.0f ms): %s" %
        (plugin_params[param], len(texts), verdict, "%d steps" % steps if steps else "continuous",
         (time.monotonic() - started) * 1000, shown if len(shown) <= 600 else shown[:600] + " ..."))
    param_steps[(plugin_name(plugin_selected), param)] = steps
    return steps


# --- PLUGIN: from ROTO ------------------------------------------------------------

def on_plugin_mode(data):
    global plugin_active, mix_mode, plugin_list, shown_plugin_list, plugin_learning, plugin_focus
    if data and data[0] != 0:
        log("PLUGIN: mode %d not supported" % data[0])
    log("PLUGIN mode")
    mix_mode = None
    plugin_active = True
    plugin_learning = False
    shown_plugin_list = None
    for i in range(NUM_SLOTS):
        plugin_knob_held[i] = False
    if not plugin_locked:
        plugin_list = build_plugin_list()
        plugin_focus = focused_plugin()
        if plugin_focus in plugin_list:
            select_plugin(plugin_focus)
        elif plugin_selected in plugin_list:
            select_plugin(plugin_selected)
        else:
            select_plugin(followed_plugin(plugin_list))
    else:
        select_plugin(plugin_selected)


def plugin_back_from_transport():
    """Back from ROTO's TRANSPORT screen in PLUGIN: the mapped knobs are where
    TRANSPORT left them, so their positions go out again (no list or select: a
    select would make ROTO reload the plugin)."""
    log("PLUGIN: back from TRANSPORT")
    for key, (value, text) in list(shown_mapped.items()):
        if key[0] == 0:
            shown_mapped[key] = (-KNOB_MAX - 1, text)     # (any position differs)


def set_transport_closed():
    global transport_shown
    transport_shown = False


def on_plugin_track_pick():
    """An insert picked in PLUGIN's FUNC: ROTO has dropped its plugin (firmware,
    as for Bitwig), so the next scan, straight away, sends the list and a select."""
    global plugin_track_select, plugin_reselect, plugin_scanned_at
    plugin_track_select = False
    plugin_reselect = True
    plugin_scanned_at = 0.0


def leave_plugin_mode():
    global plugin_active, plugin_learning, plugin_track_select
    plugin_active = False
    plugin_learning = False
    plugin_track_select = False
    mapped.clear()
    shown_mapped.clear()


def on_plugin_sysex(cmd, data):
    """A PLUGIN message from ROTO. Returns whether it was one."""
    global plugin_first, plugin_locked, plugin_learning, shown_plugin_list, plugin_list, plugin_track_select
    # Anything else from PLUGIN means its FUNC isn't shown (as the Cubase script)
    if cmd != SET_TRACK_SELECT_MODE:
        plugin_track_select = False
    if cmd == SET_TRACK_SELECT_MODE:
        plugin_track_select = plugin_active and (data[0] != 0 if data else True)
    elif cmd == SET_PLUGIN_MODE:
        leave_step_mode()
        # The firmware sends it again on leaving TRANSPORT (2026-11-06, as for
        # Cubase): ROTO kept its plugin, only the knobs moved
        if transport_shown and plugin_active:
            plugin_back_from_transport()
        else:
            on_plugin_mode(data)
        set_transport_closed()
    elif cmd == SET_FIRST_DEVICE:
        if data and data[0] < len(plugin_list):
            plugin_first = data[0]
            send_plugin_list(select=False)
    elif cmd == ROTO_SELECT_DEVICE:
        position = plugin_first + data[0]
        if position < len(plugin_list):
            entry = plugin_list[position]
            # ROTO has selected it already: not echoed
            if entry != plugin_selected:
                select_plugin(entry, tell_roto=False)
            if PLUGIN_OPEN_WINDOW_ON_PICK:
                open_plugin_window(entry)
    elif cmd == SET_DEVICE_LEARN:
        plugin_learning = bool(data and data[0])
        learn_values.clear()
        log("PLUGIN: learn " + ("on" if plugin_learning else "off"))
    elif cmd == CONTROL_MAPPED:
        on_control_mapped(data)
    elif cmd == CONTROL_MAPPED_END:
        on_control_mapped_end(data)
    elif cmd == UNMAP_CTLS:
        # Nothing mapped: an end marker with nothing mapped, as when the two
        # shared a value
        on_control_mapped_end([])
    elif cmd == SET_PLUGIN_ENABLE:
        position = plugin_first + data[0]
        if position < len(plugin_list):
            entry = plugin_list[position]
            if entry[1] >= 0:
                general.processRECEvent(slot_mute_event(entry), SLOT_ON_VALUE if data[1] else 0,
                                        midi.REC_MIDIController)
            elif GENERATOR_ON_OFF and not is_strip_entry(entry):
                channels.muteChannel(entry[0], 0 if data[1] else 1)
            # ROTO has changed its copy: the list goes again (a generator's or
            # the strip's switch is put back), next scan
            shown_plugin_list = None
    elif cmd == SET_PLUGIN_LOCK:
        plugin_locked = bool(data and data[0])
        log("PLUGIN: lock " + ("on" if plugin_locked else "off"))
        if not plugin_locked:
            # Back to FL's selection (as the Ableton script): the next scan
            # sees a new list
            plugin_list = []
    else:
        return False
    return True


# --- STEP SEQ -------------------------------------------------------------------
#
# The selected channel rack row's steps on ROTO, drawn by the script through the
# firmware's RAW mode (README "STEP SEQ"): the 8 buttons are 8 steps (LEFT /
# RIGHT page them), lit in the channel's colour, white for the playing step.
# Tap a step to toggle it; hold one (STEP_HOLD_S) and the knobs edit its graph
# values (FL's graph editor shows the one turned). Letting go of a held step
# never toggles it: one held only to look at mustn't be deleted.
# Otherwise the knobs are the channel's own controls, ones every channel type
# has (probe_channel: a VST generator and a Sampler alike). SEL lists the
# channel rack's rows to pick from (as PLUGIN's FUNC); TRANSPORT turns the
# buttons into ROTO's transport buttons (on_transport_cc), on the screens'
# step line, lit in the firmware's transport colours (STEP_TRANSPORT_*); LEFT /
# RIGHT rewind / fast forward, as there; the knobs stay the channel's. Started from ROTO's MODE screen (CHANNEL RACK,
# the 4th slot: ATARI-FL 2026-10-26), or with step_seq() in FL's Script output.
# In RAW the top buttons are CCs too (64 + their index: MODE 0, TRANSPORT 3,
# SEL 4, LEFT 6, RIGHT 7), 127 on press and 0 on release, as the step buttons
# (CC 80 + i; capture 2026-10-26 12:50). MODE opens the script's copy of ROTO's
# MODE screen (step_menu): RAW leaves to the mode picked (SET_RAW_MODE's exit
# mode, ATARI-530 RAW API 2026-10-29).

RAW_MODE_GROUP = 0x0D
# ATARI-530's RAW API (merged into ATARI-FL 2026-10-29; test/midi/raw_mode_sysex_test.py)
SET_RAW_MODE = 0x01                 # <enter, exit mode>
SET_MAIN_SCREEN_NUM_LINES = 0x02    # <lines, refresh>
SET_MAIN_SCREEN_LINE = 0x03         # <line, text[13], black text, rgb, refresh>
SET_MAIN_SCREEN_INDICATORS = 0x04   # <left, right, refresh>
REFRESH_MAIN_SCREEN = 0x05
SET_CTL_SCREEN_NUM_LINES = 0x06     # <index, lines, refresh>
SET_CTL_SCREEN_LINE = 0x07          # <index, line, text[13], black text, rgb, refresh>
REFRESH_CTL_SCREEN = 0x08           # <index>
SET_KNOB_CTL_MODE = 0x09
SET_KNOB_CTL_HAPTIC_MODE = 0x0A
SET_SWITCH_CTL_MODE = 0x0B
SET_SWITCH_CTL_HAPTIC_MODE = 0x0C
SET_SWITCH_CTL_LED_COLOUR = 0x0D
# SET_RAW_MODE 0's exit modes: back to the mode RAW was entered from, or this one
RAW_EXIT_PREV, RAW_EXIT_MIDI, RAW_EXIT_PLUGIN, RAW_EXIT_MIX = 0, 1, 2, 3
RAW_SWITCH_CFG, RAW_SWITCH_CTL = 0, 1
RAW_KNOB_CC_BASE = 0                # the firmware's RAW defaults
RAW_SWITCH_CC_BASE = 80
RAW_CFG_SWITCH_CC_BASE = 64
RAW_KNOB_HAPTIC_NORMAL, RAW_KNOB_HAPTIC_CENTRE, RAW_KNOB_HAPTIC_STEPPED = 1, 2, 3
# Endless, 16 detents a turn (KNOB_16_STEP_ENDLESS, the firmware's menus): RAW's
# STEPPED_ENDLESS. Its friction as the firmware's table
# (mc.cpp _mc_haptic_modes): RAW's friction byte replaces it
RAW_KNOB_HAPTIC_ENDLESS_STEPS = 4
RAW_ENDLESS_FRICTION = 75
RAW_ENDLESS_DETENT = 1024   # 14-bit position per detent: 16 a turn
# The firmware's 300 degree knobs (PLUGIN / MIX: KNOB_300_DEG, ..TOP_INDENT) have
# friction 200 (mc.cpp _mc_haptic_modes); RAW's friction byte replaces it, so
# without it the knobs turned freer than in the other modes
RAW_KNOB_FRICTION = 200
TOP_MODE, TOP_FUNC, TOP_TRANSPORT, TOP_SEL, TOP_LEFT, TOP_RIGHT = 0, 2, 3, 4, 6, 7     # top buttons (firmware SystemFuncType)

STEP_HOLD_S = 0.2           # a step pressed this long is held: the knobs edit it
# Setting a knob's haptics re-initialises its motor, which sends CCs (~0.1 s;
# ~0.6 s settling into a step, capture 2026-10-26 12:48): not the user's
STEP_KNOB_SETTLE_S = 0.7
# A knob's position goes out straight after its haptics; after settling it's
# sent again only if the motor reported ending this far from it (14-bit)
STEP_KNOB_MISSED = 328
# RAW messages per idle tick. The firmware takes them one at a time (~6-9 ms
# each); screen messages go without their refresh and each screen changed is
# refreshed once at the end of the batch (REFRESH_*_SCREEN, each a whole LCD)
STEP_MSGS_PER_TICK = 96         # a whole entry: no screen split across ticks (it would refresh half drawn)
# What a batch costs the firmware (capture 2026-10-27 12:4x, debug build:
# a RAW message ~5 ms, a screen refresh ~22 ms). Nothing more is sent until it
# should be done: turning Track sel quickly drew every channel passed (the
# firmware fell 100-300 ms behind); now the selections in between are skipped
STEP_MSG_COST_S = 0.005
STEP_REFRESH_COST_S = 0.022
STEPS_PER_BEAT = 4
STEP_OFF_RGB = (24, 24, 24)
# The screen's step line in FL's channel rack scheme, a beat (4 steps) at a
# time: grey-blue, red, grey-blue, ..; on steps lit in the same group's tint,
# not the channel's colour (that's the main screen's; user 2026-10-27). The
# LEDs of on steps match (STEP_LED_ON_RGB)
STEP_GROUP_OFF_RGB = ((50, 62, 80), (90, 24, 28))
STEP_GROUP_ON_RGB = ((170, 190, 215), (225, 140, 150))
# The LEDs' versions: a pale tint lights an LED lavender / blue (capture
# 2026-10-27 12:26: E18C96 sent, the user saw blue), so saturated (confirmed
# by the user). Off steps' LEDs are off (user 2026-10-26, again 2026-10-27)
STEP_LED_ON_RGB = ((40, 90, 255), (255, 0, 10))
STEP_PLAY_RGB = (255, 255, 255)
STEP_LABEL_RGB = (40, 40, 40)
# channel_rgb's boost (vivid): saturation x this (FL's Fire script: x2 x 101/128),
# and at least this brightness (0..1)
CHANNEL_SATURATION = 1.6
CHANNEL_MIN_VALUE = 0.6
# The channel's controls: (label, event offset from getRecEventId or
# STEP_ROTATE; haptic), None for an unused knob. Knob 8 rotates the channel's
# steps (endless, a step a detent), graph values and all
STEP_GLOBAL_SWING = "swing"     # FL's main swing (REC_MainShuffle)
STEP_TRACK_SEL = "track sel"    # SEL's knob 1: FL's selected channel
# Knob 7: the channel's loop point in the pattern, in steps (0 off), with the
# undocumented patterns.setChannelLoop (probe_length 2026-10-26: read back by
# getChannelLoopStyle; no crash). Endless, a step a detent: a channel looping
# off the pattern's grid (user 2026-10-26)
STEP_LOOP = "loop"
# getChannelLoopStyle's other values (midi.ssLoop*, undocumented)
STEP_LOOP_NAMES = {0: "Off", -1: "Step", -2: "Beat", -3: "Bar"}
# Turning left past Off goes through them, as FL's mouse does (user 2026-11-18)
STEP_LOOP_MIN = min(STEP_LOOP_NAMES)
# Pitch is written as its event (smoothed) but read with getChannelPitch: its
# event's value read back as 0 after a write, though FL's pitch had moved (user
# 2026-10-26: ROTO's value jumped back to 0, the sound didn't)
STEP_PITCH_EVENT = 0x04
STEP_ROTATE = "rotate"
STEP_ROTATE_UNDO_S = 1.0    # turns this close together are one undo point
STEP_CHANNEL_KNOBS = (
    ("Vol", 0x00, RAW_KNOB_HAPTIC_NORMAL), ("Pan", 0x01, RAW_KNOB_HAPTIC_CENTRE),
    ("Pitch", STEP_PITCH_EVENT, RAW_KNOB_HAPTIC_CENTRE), ("Swing", 0x0C, RAW_KNOB_HAPTIC_NORMAL),
    ("Loop", STEP_LOOP, RAW_KNOB_HAPTIC_ENDLESS_STEPS), ("Rot", STEP_ROTATE, RAW_KNOB_HAPTIC_ENDLESS_STEPS),
    ("ModX", 0x02, RAW_KNOB_HAPTIC_NORMAL), ("ModY", 0x03, RAW_KNOB_HAPTIC_NORMAL))
# (order: user 2026-11-17)
# SEL's knobs, as STEP_CHANNEL_KNOBS: knob 1 moves FL's selection (endless, a
# channel a detent); the main swing is here as it's every channel's (user
# 2026-10-26)
STEP_SEL_KNOBS = (
    ("Track", STEP_TRACK_SEL, RAW_KNOB_HAPTIC_ENDLESS_STEPS), ("Swing", STEP_GLOBAL_SWING, RAW_KNOB_HAPTIC_NORMAL),
    None, None, None, None, None, None)
# A held step's graph values, in FL's graph editor order (note first): (label,
# step param, max, default, haptic), None for an unused knob. Note is endless, a semitone a detent. An off step reads -1: its knobs show the defaults. Mod X / Y
# read 128 by default (probe_step 2026-10-26; the stubs say 64): 0..255
# assumed. Shift reads the step's position plus its shift, in ticks: the knob
# is the shift, 0 .. a step. Release velocity is left out (user 2026-10-27).
# Ratchet is FL 26's undocumented graph value 8 (probe_ratchet 2026-10-27, FL
# 26.1.7): the graph editor's bottom writes 8, its top 14, a step never set
# reads 0 (as the bottom). The knob is its position, a stepped knob (user: a
# multi-position switch)
STEP_RATCHET = 8
STEP_RATCHET_BASE = 8
STEP_RATCHET_POSITIONS = 7
# FL's names for the positions aren't known yet: shown as numbers
STEP_RATCHET_NAMES = tuple("%d" % (i + 1) for i in range(STEP_RATCHET_POSITIONS))
# The firmware's own detent strength for a stepped knob of under 11 steps
# (mc.cpp HAPTIC_MODE_N_STEPS_DETENT_STRENGTH)
RAW_STEP_STRENGTH = 110
STEP_GRAPH_KNOBS = (
    ("Note", midi.pPitch, 127, 60, RAW_KNOB_HAPTIC_ENDLESS_STEPS),
    ("Pan", midi.pPan, 127, 64, RAW_KNOB_HAPTIC_CENTRE),
    ("Fine", midi.pFinePitch, 240, 120, RAW_KNOB_HAPTIC_CENTRE),
    ("Vel", midi.pVelocity, 127, 100, RAW_KNOB_HAPTIC_NORMAL),
    ("Shift", midi.pShift, None, 0, RAW_KNOB_HAPTIC_NORMAL),
    ("Ratch", STEP_RATCHET, STEP_RATCHET_POSITIONS - 1, 0, RAW_KNOB_HAPTIC_STEPPED),
    ("ModX", midi.pModX, 255, 128, RAW_KNOB_HAPTIC_CENTRE),
    ("ModY", midi.pModY, 255, 128, RAW_KNOB_HAPTIC_CENTRE))
# (order: user 2026-11-17)
# Every graph value FL has, knob or not: Rotate moves them all with their step
STEP_GRAPH_PARAMS = (midi.pPitch, midi.pVelocity, midi.pRelease, midi.pFinePitch, midi.pPan, midi.pModX,
                     midi.pModY, midi.pShift, STEP_RATCHET)
# TRANSPORT: the firmware's FL transport buttons (gui_manager_transport.cpp),
# in on_transport_cc's order (transport_states), lit in its LED palette
# colours when on (led_colour_palette.h), black when off. The name keeps the
# firmware's button colour (white on grey) whatever the state
STEP_TRANSPORT_BUTTONS = ("PLAY", "STOP", "RECORD", "SONG MODE", "LOOP REC", "METRONOME", "COUNTDOWN",
                          "WAIT INPUT")
STEP_PALETTE_GREEN, STEP_PALETTE_RED, STEP_PALETTE_ABLETON_YELLOW = (0x00, 0x7F, 0x00), (0xFF, 0x00, 0x00), \
    (0xFF, 0x2F, 0x04)
STEP_PALETTE_YELLOW, STEP_PALETTE_WHITE = (0xFF, 0x7F, 0x00), (0xFF, 0xBF, 0x9F)
STEP_PALETTE_CFG_OFF = (0x32, 0x19, 0x25)    # CFG_SWITCH_LED_OFF_COLOUR
STEP_TRANSPORT_LABEL_RGB = (0x69, 0x66, 0x62)  # RgbColour::AtariGrey
STEP_TRANSPORT_LED = (STEP_PALETTE_GREEN, (0, 0, 0), STEP_PALETTE_RED, STEP_PALETTE_ABLETON_YELLOW,
                      STEP_PALETTE_RED, STEP_PALETTE_ABLETON_YELLOW, STEP_PALETTE_ABLETON_YELLOW,
                      STEP_PALETTE_ABLETON_YELLOW)
# MODE: the firmware's MODE screen (gui_manager.cpp _show_select_mode_screen),
# drawn by the script: the main screen "MODE" (black on white) over "SELECT
# MODE", each entry's label on its colour scheme's background (colour_scheme.h:
# MIDI 1, PLUGIN 22, MIX 5, CHANNEL RACK 21 = PLUGIN_MACRO_PARAM). By slot: the
# exit mode it leaves RAW to, None for CHANNEL RACK (stays). SYSTEM isn't an
# exit mode, so its slot (8) is blank
STEP_MENU_ENTRIES = {
    0: ("MIDI", (0xFF, 0xA5, 0x27), RAW_EXIT_MIDI),
    1: ("PLUGIN", (0x10, 0xA4, 0xE5), RAW_EXIT_PLUGIN),
    2: ("MIX", (0x1B, 0xFF, 0x2D), RAW_EXIT_MIX),
    3: ("CHANNEL RACK", (0x19, 0xE9, 0xF6), None),
}
STEP_MENU_WHITE = (0xFF, 0xFF, 0xF6)    # RgbColour::White
STEP_MENU_BLACK = (0x10, 0x10, 0x10)    # RgbColour::BgBlack, ABLETON_BLACK_COLOUR_SCHEME
NOTE_NAMES = ("C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B")

step_requested = False      # step_seq() asked ROTO for RAW mode
step_active = False
step_channel = -1           # the channel ROTO shows (FL's selected one)
step_page = 0               # steps from step_page * 8
step_list = False           # SEL's list of channels is shown
step_list_first = 0
step_transport = False      # TRANSPORT: the buttons are the transport's
step_menu = False           # MODE: the MODE screen is shown (STEP_MENU_ENTRIES)
step_wind = None            # TRANSPORT: LEFT / RIGHT held (rewinding / fast forwarding)
step_func_held = False      # FUNC held: LEFT / RIGHT pick FL's previous / next channel
step_pressed: dict = {}     # button -> when pressed (not yet released)
step_held = None            # the step whose graph values the knobs show (the first held)
step_held_also: list = []   # more steps held with it: the knobs edit them all
step_edited = False         # the held steps were edited (one undo point a hold)
step_rotation = 0           # knob 8's rotation of the channel's steps (shown)
step_rotated_at = 0.0
# Rotate's detents since the last idle tick: rotated once there by their sum.
# Each rotation is a few hundred FL calls (every step's bit, each on step's 9
# graph values read and written), so a fast turn rotating per detent backed FL
# up 5 s, every knob frozen meanwhile (capture 2026-11-17 15:46)
step_rotate_pending = 0
step_looped_at = 0.0
step_graph_param = None     # the graph editor shows this param
step_shown: dict = {}       # RAW message key -> (cmd, data) ROTO has
step_queue: list = []       # keys whose message is still to send
step_settle_until = [0.0] * NUM_SLOTS
step_knob_shown: list = [None] * NUM_SLOTS
step_knob_turned_at = [0.0] * NUM_SLOTS
step_knob_last: list = [None] * NUM_SLOTS     # an endless knob's last position
step_knob_detents = [0] * NUM_SLOTS           # ... and its turn not yet a whole detent
step_knob_reported: list = [None] * NUM_SLOTS  # a settling knob's last position (its motor's)
step_fw_busy_until = 0.0    # when the firmware should be through what was sent (STEP_MSG_COST_S)


def raw_colour(rgb):
    return [b for c in rgb for b in ((c >> 7) & 0x01, c & 0x7F)]


def raw_ctl_line(index, line, text, rgb, black_text=False, refresh=True):
    return (RAW_MODE_GROUP, SET_CTL_SCREEN_LINE,
            [index, line] + name_bytes(text) + [1 if black_text else 0] + raw_colour(rgb) + [1 if refresh else 0])


def raw_main_line(line, text, rgb, black_text=False, refresh=True):
    return (RAW_MODE_GROUP, SET_MAIN_SCREEN_LINE,
            [line] + name_bytes(text) + [1 if black_text else 0] + raw_colour(rgb) + [1 if refresh else 0])


def light(rgb):
    """Black text reads better on it."""
    return 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2] > 150


def step_seq():
    """Typed in FL's Script output window: STEP SEQ on ROTO (RAW mode). ROTO
    answers with its own SET_RAW_MODE once RAW is shown."""
    global step_requested
    step_requested = True
    log("STEP SEQ: asking ROTO for RAW mode")
    send_sysex(RAW_MODE_GROUP, SET_RAW_MODE, [1, RAW_EXIT_PREV])


def start_step_mode():
    global step_active, step_requested, mix_mode, step_held, step_list, step_channel, step_transport, step_menu
    log("STEP SEQ mode")
    step_requested = False
    step_active = True
    mix_mode = None
    leave_plugin_mode()
    step_held = None
    step_held_also.clear()
    step_list = False
    step_transport = False
    step_menu = False
    step_channel = -1
    step_pressed.clear()
    # The firmware has just set RAW up from scratch
    step_shown.clear()
    step_queue.clear()
    for i in range(NUM_SLOTS):
        step_knob_shown[i] = None
        step_settle_until[i] = 0.0
        step_knob_last[i] = None


def leave_step_mode():
    global step_active, step_func_held
    step_func_held = False
    if not step_active:
        return
    log("STEP SEQ left")
    step_active = False
    release_held()


def held_steps():
    """The steps the knobs edit: the first held, then the others in order."""
    return [] if step_held is None else [step_held] + step_held_also


def release_held():
    """No step held: the knobs are the channel's again."""
    global step_held
    step_held = None
    step_held_also.clear()
    close_graph_editor()


def stop_step_mode(exit_mode=RAW_EXIT_PREV):
    """Out of RAW, to exit_mode (RAW_EXIT_*): the firmware shows that mode,
    which sends its own mode message as from its MODE screen."""
    leave_step_mode()
    send_sysex(RAW_MODE_GROUP, SET_RAW_MODE, [0, exit_mode])


def step_count():
    """The pattern's steps (16ths). getPatternLength is in steps on FL 26, not
    beats as the stubs say: read as beats (x4), Rotate wrote graph values past
    the pattern's end, which grows it, so it grew x4 a rotation, to 17 million
    steps and 5 s a rotation (capture 2026-11-17 16:37). (setGridBit past the
    end doesn't grow it: probe_length 2026-10-26.)"""
    return max(1, patterns.getPatternLength(patterns.patternNumber()))


def ticks_per_step():
    return max(1, general.getRecPPQ() // STEPS_PER_BEAT)


def channel_rgb(channel):
    """A channel rack colour (FL: any 24-bit RGB, 0x--RRGGBB as FL's own scripts
    read it), made vivid for ROTO's screens and LEDs."""
    return vivid(utils.ColorToRGB(channels.getChannelColor(channel)))


def vivid(rgb):
    """FL's channel colours are muted (its palette, the default grey) and look
    washed out on ROTO: saturation scaled as FL's Akai Fire script does for its
    pads (x2 x its 101/128 setting), brightness raised to at least
    CHANNEL_MIN_VALUE. Greys stay grey."""
    r, g, b = (c / 255 for c in rgb)
    top, low = max(r, g, b), min(r, g, b)
    if top == 0:
        return (0, 0, 0)
    sat = min(1.0, (top - low) / top * CHANNEL_SATURATION)
    value = max(top, CHANNEL_MIN_VALUE)
    # The same hue: each component's place between the min and max kept
    span = top - low
    return tuple(round(255 * value * (1 - sat * (1 - ((c - low) / span if span else 1.0)))) for c in (r, g, b))


# --- STEP SEQ: values -------------------------------------------------------------

def step_knobs():
    """The knobs of the current view: SEL's, a held step's or the channel's."""
    if step_list:
        return STEP_SEL_KNOBS
    return STEP_GRAPH_KNOBS if step_held is not None else STEP_CHANNEL_KNOBS


def knob_event(offset):
    """The REC event of a knob's event offset (STEP_CHANNEL_KNOBS, STEP_SEL_KNOBS)."""
    if offset is STEP_GLOBAL_SWING:
        return midi.REC_MainShuffle  # pyright: ignore[reportAttributeAccessIssue]
    return channels.getRecEventId(step_channel) + offset


def step_param(step, knob):
    """A step's graph value for a knob (STEP_GRAPH_KNOBS), None when off; the
    shift as ticks after the step's position; the ratchet as its position."""
    param = STEP_GRAPH_KNOBS[knob][1]
    value = step_value(step, param)
    if param == STEP_RATCHET and value is not None:
        # 0 (never set) is the bottom, as FL's graph editor shows it
        value = min(STEP_RATCHET_POSITIONS - 1, max(0, value - STEP_RATCHET_BASE))
    return value


def step_value(step, param):
    """A step's graph value (FL's param), None when off; the shift as ticks
    after the step's position."""
    value = channels.getCurrentStepParam(step_channel, step, param)
    if value < 0:
        return None
    if param == midi.pShift:
        value -= step * ticks_per_step()
    return value


def graph_max(knob):
    top = STEP_GRAPH_KNOBS[knob][2]
    return ticks_per_step() - 1 if top is None else top


def graph_text(knob, value):
    param = STEP_GRAPH_KNOBS[knob][1]
    if value is None:
        return "-"
    if param == midi.pPitch:
        return "%s%d" % (NOTE_NAMES[value % 12], value // 12)
    if param == midi.pFinePitch:
        return "%+dct" % (value - 120)
    if param == midi.pPan:
        return pan_text((value - 64) / 64)
    if param in (midi.pModX, midi.pModY):
        return "%+d%%" % round((value - 128) * 100 / 128)
    if param == midi.pShift:
        return "+%dt" % value
    if param == STEP_RATCHET:
        return STEP_RATCHET_NAMES[value]
    return "%d" % value


def pan_text(pan):
    """CHANNEL RACK's pan text for -1..1: 10L, C, 10R (user 2026-11-17)."""
    amount = round(pan * 100)
    return "C" if amount == 0 else "%d%s" % (abs(amount), "L" if amount < 0 else "R")


def short_value(text):
    """FL's value text compacted for a screen line shared with the label (user
    2026-11-17): -6.0 dB -> -6.0db (a decimal for dB), 78.5% -> 78%."""
    text = text.strip()
    end = 0
    while end < len(text) and text[end] in "+-.0123456789":
        end += 1
    unit = text[end:].replace(" ", "").replace("dB", "db")
    try:
        number = float(text[:end])
    except ValueError:
        return text.replace(" ", "").replace("dB", "db")
    sign = "+" if text.startswith("+") else ""
    if unit == "db":
        return "%s%.1f%s" % (sign, number, unit)
    return "%s%d%s" % (sign, round(number), unit)


def knob_line(label, value):
    """A control screen's top line: Vol -6db, or the value alone if both don't fit."""
    if not value:
        return label
    both = "%s %s" % (label, value)
    return both if len(both) <= MAX_NAME_CHARS else value


def knob_value(knob):
    """The knob's value 0..1 and text in the current view; None for an unused knob."""
    if step_held is not None:
        if STEP_GRAPH_KNOBS[knob] is None:
            return None
        value = step_param(step_held, knob)
        shown = STEP_GRAPH_KNOBS[knob][3] if value is None else value
        return shown / graph_max(knob), graph_text(knob, value)
    control = step_knobs()[knob]
    if control is None or control[1] is STEP_TRACK_SEL:
        return None
    if control[1] is STEP_ROTATE:
        return 0.0, "%+d" % step_rotation
    if control[1] is STEP_LOOP:
        loop = channel_loop()
        return 0.0, STEP_LOOP_NAMES.get(loop, "%d" % loop)
    if control[1] == STEP_PITCH_EVENT:
        # A factor of the pitch range, -1..1
        bend = channels.getChannelPitch(step_channel, 0)
        return min(1.0, max(0.0, (bend + 1) / 2)), "%+d Cents" % channels.getChannelPitch(step_channel, 1)
    event = knob_event(control[1])
    value = mixer.getEventValue(event) / midi.FromMIDI_Max
    if control[1] == 0x01:
        return value, pan_text(value * 2 - 1)
    text = mixer.getEventIDValueString(event, mixer.getAutoSmoothEventValue(event))
    return value, short_value(text) if text else "%d%%" % round(value * 100)


def write_knob(knob, value):
    """A knob turned on ROTO, 0..1: the channel's (or SEL's) control, or
    every held step's graph value set to it."""
    if step_held is None:
        control = step_knobs()[knob]
        if control is not None and control[1] not in (STEP_ROTATE, STEP_TRACK_SEL, STEP_LOOP):
            mixer.automateEvent(knob_event(control[1]), round(value * midi.FromMIDI_Max),
                                midi.REC_MIDIController, SMOOTH_SPEED)
        return
    if STEP_GRAPH_KNOBS[knob] is None:
        return
    target = round(value * graph_max(knob))
    write_steps(knob, {step: target for step in held_steps()})


def write_steps(knob, targets):
    """Held steps' graph values for a knob: {step: value}. The first edit of a
    hold saves an undo point; FL's graph editor shows the first held step."""
    global step_edited, step_graph_param
    param = STEP_GRAPH_KNOBS[knob][1]
    if not step_edited:
        steps = held_steps()
        general.saveUndo("ROTO: step %d" % (steps[0] + 1) if len(steps) == 1 else
                         "ROTO: %d steps" % len(steps), midi.UF_PR)
        step_edited = True
    index = channels.getChannelIndex(step_channel)
    for step, target in targets.items():
        if not channels.getGridBit(step_channel, step):
            # A graph value of an off step can't be set (probe_step 2026-10-26)
            channels.setGridBit(step_channel, step, True)
        if param == midi.pShift:
            target += step * ticks_per_step()
        elif param == STEP_RATCHET:
            target += STEP_RATCHET_BASE
        channels.setStepParameterByIndex(index, patterns.patternNumber(), step, param, target, True)
    channels.updateGraphEditor()
    if step_graph_param != param and step_held is not None:
        step_graph_param = param
        channels.showGraphEditor(False, param, step_held, index, True)


def rotate_steps(steps):
    """Knob 8: the channel's steps rotated by steps (+ later), graph values
    with them (a step's shift stays relative to it)."""
    global step_rotation, step_rotated_at
    count = step_count()
    now = time.monotonic()
    if now - step_rotated_at > STEP_ROTATE_UNDO_S:
        general.saveUndo("ROTO: rotate steps", midi.UF_PR)
    step_rotated_at = now
    was = []
    for step in range(count):
        if channels.getGridBit(step_channel, step):
            was.append({param: step_value(step, param) for param in STEP_GRAPH_PARAMS})
        else:
            was.append(None)
    index = channels.getChannelIndex(step_channel)
    pattern = patterns.patternNumber()
    # Only what changes is written: FL's writes are slow (a long pattern
    # rewritten in full took ~5 s a detent, every knob frozen meanwhile:
    # capture 2026-11-17 16:27). A step that was on keeps its values unless
    # they differ; one turned on gets all of them
    for to in range(count):
        values = was[(to - steps) % count]
        before = was[to]
        if (values is None) != (before is None):
            channels.setGridBit(step_channel, to, values is not None)
        if values is None:
            continue
        for param, value in values.items():
            if value is None or (before is not None and before.get(param) == value):
                continue
            if param == midi.pShift:
                value += to * ticks_per_step()
            channels.setStepParameterByIndex(index, pattern, to, param, value, True)
    step_rotation = (step_rotation + steps + count // 2) % count - count // 2


def channel_loop():
    """The channel's loop point in steps, 0 off (STEP_LOOP_NAMES' others)."""
    return patterns.getChannelLoopStyle(patterns.patternNumber(), channels.getChannelIndex(step_channel))


def move_loop(steps):
    """Knob 7: the channel's loop point moved by steps, Off at 0, then below
    it Step, Beat, Bar as FL's mouse does (STEP_LOOP_NAMES); at most the
    pattern's steps; turns close together are one undo point."""
    global step_looped_at
    loop = min(step_count(), max(STEP_LOOP_MIN, channel_loop() + steps))
    now = time.monotonic()
    if now - step_looped_at > STEP_ROTATE_UNDO_S:
        general.saveUndo("ROTO: channel loop", midi.UF_PR)
    step_looped_at = now
    patterns.setChannelLoop(channels.getChannelIndex(step_channel), loop)


def knob_endless(knob):
    """SEL's knob 1 (the channel), a held step's endless knob (its note), or
    the channel's (knob 8, rotate)."""
    control = step_knobs()[knob]
    return control is not None and control[-1] == RAW_KNOB_HAPTIC_ENDLESS_STEPS


def turn_endless(knob, position):
    """An endless knob's position (wraps each turn), a detent at a time: SEL's
    channel, the held steps' values (each from its own; the default for an off
    step), or the channel's steps rotated (at the next idle tick)."""
    global step_rotate_pending
    last = step_knob_last[knob]
    step_knob_last[knob] = position
    if last is None:
        return
    delta = (position - last + KNOB_MAX // 2 + 1) % (KNOB_MAX + 1) - (KNOB_MAX // 2 + 1)
    step_knob_detents[knob] += delta
    steps = int(step_knob_detents[knob] / RAW_ENDLESS_DETENT)
    if not steps:
        return
    step_knob_detents[knob] -= steps * RAW_ENDLESS_DETENT
    if step_list:
        # FL's selection; the list follows it a page at a time (update_step)
        channel = min(channels.channelCount() - 1, max(0, channels.selectedChannel() + steps))
        channels.selectOneChannel(channel)
        return
    if step_held is None:
        if STEP_CHANNEL_KNOBS[knob][1] is STEP_LOOP:
            move_loop(steps)
        else:
            step_rotate_pending += steps
        return
    targets = {}
    for step in held_steps():
        value = step_param(step, knob)
        if value is None:
            value = STEP_GRAPH_KNOBS[knob][3]
        targets[step] = min(graph_max(knob), max(0, value + steps))
    write_steps(knob, targets)


def close_graph_editor():
    global step_graph_param
    if step_graph_param is not None:
        step_graph_param = None
        channels.closeGraphEditor(True)


# --- STEP SEQ: ROTO's display -----------------------------------------------------

# Screen messages go unrefreshed: update_step refreshes each screen changed once

def step_line(want, i, line, text, bg, black_text=None):
    black_text = light(bg) if black_text is None else black_text
    want[("line", i, line)] = (SET_CTL_SCREEN_LINE, raw_ctl_line(i, line, text, bg, black_text, False)[2])


def step_led(want, kind, i, rgb):
    want[("led", kind, i)] = (SET_SWITCH_CTL_LED_COLOUR, [kind, i] + raw_colour(rgb))


def step_main(want, line, text, bg):
    want[("main", line)] = (SET_MAIN_SCREEN_LINE, raw_main_line(line, text, bg, light(bg), False)[2])


def step_indicators(want, left, right):
    want[("ind",)] = (SET_MAIN_SCREEN_INDICATORS, [1 if left else 0, 1 if right else 0, 0])


def step_screen_lines(want, i, lines=3):
    """A control screen's line count, keyed just before its lines: setting the
    count clears them, so each screen is cleared only as it's drawn."""
    want[("lines", i)] = (SET_CTL_SCREEN_NUM_LINES, [i, lines, 0])


def step_desired():
    """Every RAW message for what ROTO should show, by key, in the order sent:
    knob haptics first (a haptic change re-initialises the motor, which settles
    while the screens draw), then screen by screen, then the controls' CCs
    (ATARI-FL's RAW entry sets the switches to these already; older firmware
    needs them, and the knobs' CCs are the script's own)."""
    want: dict = {}
    step_screens_desired(want)
    channel_cc = ROTO_CC_STATUS & 0x0F
    for i in range(NUM_SLOTS):
        want[("swmode", RAW_SWITCH_CTL, i)] = (SET_SWITCH_CTL_MODE, [RAW_SWITCH_CTL, i, 0, channel_cc,
                                                                       RAW_SWITCH_CC_BASE + i, 0, 0, 0, 0, 0, 0])
        want[("swmode", RAW_SWITCH_CFG, i)] = (SET_SWITCH_CTL_MODE, [RAW_SWITCH_CFG, i, 0, channel_cc,
                                                                       RAW_CFG_SWITCH_CC_BASE + i, 0, 0, 0, 0, 0, 0])
        want[("knobmode", i)] = (SET_KNOB_CTL_MODE, [i, 1, channel_cc, KNOB_CC_BASE + i, 0, 0])
    return want


def step_screens_desired(want):
    """step_desired's haptics, screens and LEDs."""
    if step_menu:
        step_menu_desired(want)
        return
    knobs = step_knobs()
    for i, knob in enumerate(knobs):
        haptic = knob[-1] if knob else RAW_KNOB_HAPTIC_NORMAL
        friction = RAW_ENDLESS_FRICTION if haptic == RAW_KNOB_HAPTIC_ENDLESS_STEPS else RAW_KNOB_FRICTION
        # A stepped knob: its positions (a graph knob's max + 1) and detent strength
        steps = knob[2] + 1 if haptic == RAW_KNOB_HAPTIC_STEPPED else 0
        strength = RAW_STEP_STRENGTH if steps else 0
        want[("haptic", i)] = (SET_KNOB_CTL_HAPTIC_MODE,
                               [i, haptic, friction >> 7, friction & 0x7F, steps, strength >> 7, strength & 0x7F,
                                0, 0, 0, 0, 0])
    if step_list:
        count = channels.channelCount()
        last = min(count, step_list_first + NUM_SLOTS)
        step_main(want, 0, "CHANNELS", (0, 0, 0))
        step_main(want, 1, "%d-%d of %d" % (step_list_first + 1, last, count), (0, 0, 0))
        step_indicators(want, step_list_first > 0, last < count)
        for i in range(NUM_SLOTS):
            channel = step_list_first + i
            knob = knobs[i]
            value = knob_value(i)
            step_screen_lines(want, i, 2)
            # The whole screen in the channel's colour; the selected one's
            # bottom line white (user 2026-10-27). 2 lines (user 2026-11-17):
            # the knob's label with its value (Swing 50%), then the name
            top = knob_line(knob[0] if knob else "", value[1] if value else "")
            if channel < count:
                rgb = channel_rgb(channel)
                picked = channel == step_channel
                bottom = STEP_PLAY_RGB if picked else rgb
                step_line(want, i, 0, top, rgb)
                step_line(want, i, 1, channels.getChannelName(channel), bottom)
                step_led(want, RAW_SWITCH_CTL, i, STEP_PLAY_RGB if picked else rgb)
            else:
                step_line(want, i, 0, top, STEP_LABEL_RGB)
                step_line(want, i, 1, "", (0, 0, 0))
                step_led(want, RAW_SWITCH_CTL, i, (0, 0, 0))
        step_top_leds(want, step_list_first > 0, last < count)
        return
    rgb = channel_rgb(step_channel)
    steps = step_count()
    first = step_page * NUM_SLOTS
    # The main screen in the channel's colour; the control screens stay black
    # (user 2026-10-27)
    step_main(want, 0, channels.getChannelName(step_channel), rgb)
    if step_transport:
        step_main(want, 1, "TRANSPORT", rgb)
    elif step_held is None:
        step_main(want, 1, "STEP %d-%d" % (first + 1, min(steps, first + NUM_SLOTS)), rgb)
    else:
        step_main(want, 1, held_text(), rgb)
    held = held_steps()
    paged = not step_transport
    step_indicators(want, paged and first > 0, paged and first + NUM_SLOTS < steps)
    playing = mixer.getSongStepPos() % steps if transport.isPlaying() else None
    states = transport_states() if step_transport else None
    for i in range(NUM_SLOTS):
        knob = knobs[i]
        value = knob_value(i)
        # 2 lines (user 2026-11-17): the knob's label with its value (Vol
        # -6db), then the step / transport button
        step_screen_lines(want, i, 2)
        step_line(want, i, 0, knob_line(knob[0] if knob else "", value[1] if value else ""), STEP_LABEL_RGB)
        step = first + i
        if states is not None:
            lit = STEP_TRANSPORT_LED[i] if states[i] else (0, 0, 0)
            step_line(want, i, 1, STEP_TRANSPORT_BUTTONS[i], STEP_TRANSPORT_LABEL_RGB)
            step_led(want, RAW_SWITCH_CTL, i, lit)
        elif step < steps:
            on = channels.getGridBit(step_channel, step)
            group = (step // STEPS_PER_BEAT) % 2
            step_line(want, i, 1, "%d" % (step + 1),
                      STEP_PLAY_RGB if step in held else (STEP_GROUP_ON_RGB if on else STEP_GROUP_OFF_RGB)[group])
            # The LED in the step line's group colour; off steps' off
            step_led(want, RAW_SWITCH_CTL, i, STEP_PLAY_RGB if step == playing or step in held else
                     (STEP_LED_ON_RGB[group] if on else (0, 0, 0)))
        else:
            step_line(want, i, 1, "", (0, 0, 0))
            step_led(want, RAW_SWITCH_CTL, i, (0, 0, 0))
    if step_transport:
        step_top_leds(want, True, True)
    else:
        step_top_leds(want, step_held is None and first > 0, step_held is None and first + NUM_SLOTS < steps)
    return


def step_menu_desired(want):
    """MODE's screens, as the firmware's MODE screen. The knobs keep their
    haptics (a change would re-initialise the motors on the way back), and do
    nothing here. Only MODE is lit among the top buttons, white: the firmware's
    MODE screen disables the others."""
    step_main(want, 0, "MODE", STEP_MENU_WHITE)
    step_main(want, 1, "SELECT MODE", STEP_MENU_BLACK)
    step_indicators(want, False, False)
    for i in range(NUM_SLOTS):
        entry = STEP_MENU_ENTRIES.get(i)
        step_screen_lines(want, i, 2)
        step_line(want, i, 0, entry[0] if entry else "", entry[1] if entry else STEP_MENU_BLACK, entry is not None)
        step_line(want, i, 1, "", STEP_MENU_BLACK)
        step_led(want, RAW_SWITCH_CTL, i, (0, 0, 0))
    step_led(want, RAW_SWITCH_CFG, TOP_MODE, STEP_PALETTE_WHITE)
    for button in (TOP_FUNC, TOP_SEL, TOP_TRANSPORT, TOP_LEFT, TOP_RIGHT):
        step_led(want, RAW_SWITCH_CFG, button, (0, 0, 0))


def held_text():
    """The main screen's 2nd line while steps are held: STEP 3, STEPS 3,5,8, or
    STEP 3 +4 when the list doesn't fit."""
    steps = held_steps()
    if len(steps) == 1:
        return "STEP %d" % (steps[0] + 1)
    text = "STEPS " + ",".join("%d" % (step + 1) for step in sorted(steps))
    return text if len(text) <= MAX_NAME_CHARS else "STEP %d +%d" % (steps[0] + 1, len(steps) - 1)


def step_top_leds(want, left, right):
    """The top buttons that can be pressed lit as the firmware lights its own
    (CFG_SWITCH_LED_OFF_COLOUR), on ones white; LEFT / RIGHT when there's a page
    that way (TRANSPORT: rewind / fast forward, yellow while held). FUNC held:
    LEFT / RIGHT when there's a channel that way."""
    step_led(want, RAW_SWITCH_CFG, TOP_MODE, STEP_PALETTE_CFG_OFF)
    step_led(want, RAW_SWITCH_CFG, TOP_FUNC, STEP_PALETTE_WHITE if step_func_held else STEP_PALETTE_CFG_OFF)
    if step_func_held:
        channel = channels.selectedChannel()
        left, right = channel > 0, 0 <= channel < channels.channelCount() - 1
    step_led(want, RAW_SWITCH_CFG, TOP_SEL, STEP_PALETTE_WHITE if step_list else STEP_PALETTE_CFG_OFF)
    step_led(want, RAW_SWITCH_CFG, TOP_TRANSPORT, STEP_PALETTE_WHITE if step_transport else STEP_PALETTE_CFG_OFF)
    for button, can in ((TOP_LEFT, left), (TOP_RIGHT, right)):
        step_led(want, RAW_SWITCH_CFG, button, STEP_PALETTE_YELLOW if step_transport and step_wind == button else
                 (STEP_PALETTE_CFG_OFF if can else (0, 0, 0)))


def update_step_knobs(now):
    """Knob positions to ROTO: FL's values, not while turning or settling, nor
    before the knob's haptics are set (their motor re-initialising would undo it)."""
    for i in range(NUM_SLOTS):
        value = knob_value(i)
        if value is None or knob_endless(i) or now - step_knob_turned_at[i] < WRITE_HOLD_S or \
                ("haptic", i) in step_queue:
            continue
        position = to_knob(value[0])
        shown = step_knob_shown[i]
        if now < step_settle_until[i]:
            # Straight after its haptics: the re-initialising motor goes there
            # (sent before, the knob moved twice: capture 2026-10-26 14:51)
            if shown is None:
                step_knob_shown[i] = position
                send_cc(KNOB_CC_BASE + i, position >> 7)
                send_cc(KNOB_LSB_CC_BASE + i, position & 0x7F)
            continue
        reported, step_knob_reported[i] = step_knob_reported[i], None
        if reported is not None and shown is not None and abs(reported - shown) > STEP_KNOB_MISSED:
            shown = None    # the motor ended elsewhere: send it again
        if shown is None or abs(position - shown) > KNOB_SEND_TOLERANCE:
            step_knob_shown[i] = position
            send_cc(KNOB_CC_BASE + i, position >> 7)
            send_cc(KNOB_LSB_CC_BASE + i, position & 0x7F)


def update_step():
    """Every idle tick in STEP SEQ: FL's selection, a step held, ROTO's display
    (only what differs from what ROTO has, STEP_MSGS_PER_TICK at a time)."""
    global step_channel, step_page, step_held, step_edited, step_list_first, step_rotation, step_fw_busy_until,         step_rotate_pending
    now = time.monotonic()
    channel = channels.selectedChannel()
    if channel != step_channel and channel >= 0:
        step_channel = channel
        step_rotation = 0
        step_rotate_pending = 0
        release_held()
        step_list_first = channel - channel % NUM_SLOTS
    if step_channel < 0:
        return
    if step_rotate_pending:
        steps, step_rotate_pending = step_rotate_pending, 0
        if step_held is None and not step_list:
            rotate_steps(steps)
    pages = (step_count() + NUM_SLOTS - 1) // NUM_SLOTS
    step_page = min(step_page, pages - 1)
    if step_held is None and not step_list and not step_transport:
        for button, pressed_at in step_pressed.items():
            if now - pressed_at >= STEP_HOLD_S:
                step_held = step_page * NUM_SLOTS + button
                step_edited = False
                # Steps pressed with it are held with it
                step_held_also[:] = [step_page * NUM_SLOTS + other for other in step_pressed if other != button]
                log("STEP SEQ: %s held" % held_text())
                break
    want = step_desired()
    for key, message in want.items():
        if step_shown.get(key) != message and key not in step_queue:
            step_queue.append(key)
    if now < step_fw_busy_until:
        # The firmware is still drawing: the latest state goes once it's done
        update_step_knobs(now)
        return
    sent = 0
    screens = set()
    while step_queue and sent < STEP_MSGS_PER_TICK:
        key = step_queue.pop(0)
        message = want.get(key)
        if message is None or step_shown.get(key) == message:
            continue
        send_sysex(RAW_MODE_GROUP, *message)
        step_shown[key] = message
        sent += 1
        if key[0] in ("line", "lines"):
            screens.add(key[1] + 1)
        elif key[0] in ("main", "ind"):
            screens.add(0)
        if key[0] == "lines":
            # The firmware clears a screen's lines when setting their count
            for line in range(3):
                step_shown.pop(("line", key[1], line), None)
        elif key[0] == "haptic":
            # The motor re-initialises: its CCs aren't the user's, and it
            # needs its position again
            step_settle_until[key[1]] = now + STEP_KNOB_SETTLE_S
            step_knob_shown[key[1]] = None
            step_knob_last[key[1]] = None
            step_knob_detents[key[1]] = 0
            step_knob_reported[key[1]] = None
    # This batch's screen changes, refreshed once a screen
    for screen in sorted(screens):
        if screen == 0:
            send_sysex(RAW_MODE_GROUP, REFRESH_MAIN_SCREEN, [])
        else:
            send_sysex(RAW_MODE_GROUP, REFRESH_CTL_SCREEN, [screen - 1])
    if sent:
        step_fw_busy_until = now + sent * STEP_MSG_COST_S + len(screens) * STEP_REFRESH_COST_S
    update_step_knobs(now)


# --- STEP SEQ: from ROTO ----------------------------------------------------------

def on_step_button(button, pressed):
    global step_held, step_edited, step_list, step_menu
    if step_menu:
        entry = STEP_MENU_ENTRIES.get(button)
        if pressed and entry is not None:
            step_menu = False
            if entry[2] is not None:
                log("STEP SEQ: MODE -> %s" % entry[0])
                stop_step_mode(entry[2])
        return
    if step_list:
        if pressed and step_list_first + button < channels.channelCount():
            channels.selectOneChannel(step_list_first + button)
            step_list = False
        return
    if step_transport:
        if pressed:
            on_transport_cc(TRANSPORT_CC_BASE + button, 127)
        return
    step = step_page * NUM_SLOTS + button
    now = time.monotonic()
    if pressed:
        if step < step_count():
            step_pressed[button] = now
            if step_held is not None and step not in held_steps():
                # Pressed while a step is held: held with it at once
                step_held_also.append(step)
                log("STEP SEQ: %s held" % held_text())
        return
    pressed_at = step_pressed.pop(button, None)
    if pressed_at is None:
        return
    if step in held_steps():
        # Let go of a held step: the others stay held (the next shown first)
        if step == step_held:
            step_held = step_held_also.pop(0) if step_held_also else None
        else:
            step_held_also.remove(step)
        if step_held is None:
            release_held()
        return
    # Only a tap toggles: a held step (looked at or edited) stays as it is
    if now - pressed_at < STEP_HOLD_S:
        channels.setGridBit(step_channel, step, not channels.getGridBit(step_channel, step))


def on_step_top(button):
    global step_list, step_page, step_list_first, step_transport, step_menu
    if button == TOP_MODE:
        # The MODE screen; MODE again closes it, as the firmware's
        step_menu = not step_menu
        if step_wind is not None:
            on_step_wind(step_wind, False)
        step_pressed.clear()
        release_held()
        for i in range(NUM_SLOTS):
            # An endless knob turned meanwhile starts afresh
            step_knob_last[i] = None
            step_knob_detents[i] = 0
    elif step_menu:
        return      # the firmware's MODE screen disables the other top buttons
    elif button in (TOP_LEFT, TOP_RIGHT) and step_func_held:
        # FUNC + LEFT / RIGHT: FL's previous / next channel, in any view (as
        # SEL's Track knob: no wrap); ROTO follows FL's selection (update_step)
        channel = channels.selectedChannel() + (-1 if button == TOP_LEFT else 1)
        if 0 <= channel < channels.channelCount():
            channels.selectOneChannel(channel)
    elif button in (TOP_SEL, TOP_TRANSPORT):
        if button == TOP_SEL:
            step_list, step_transport = not step_list, False
        else:
            step_transport, step_list = not step_transport, False
        if step_wind is not None:
            on_step_wind(step_wind, False)
        step_pressed.clear()
        release_held()
    elif button in (TOP_LEFT, TOP_RIGHT) and step_transport:
        on_step_wind(button, True)
    elif button in (TOP_LEFT, TOP_RIGHT) and step_held is None:
        direction = -1 if button == TOP_LEFT else 1
        if step_list:
            first = step_list_first + direction * NUM_SLOTS
            if 0 <= first < channels.channelCount():
                step_list_first = first
        else:
            page = step_page + direction
            if 0 <= page * NUM_SLOTS < step_count():
                step_page = page


def on_step_wind(button, pressed):
    """TRANSPORT's LEFT / RIGHT: rewind / fast forward while held."""
    global step_wind
    if pressed == (step_wind == button):
        return
    step_wind = button if pressed else None
    on_transport_cc(TRANSPORT_REWIND_CC if button == TOP_LEFT else TRANSPORT_FORWARD_CC, 127 if pressed else 0)


def on_step_cc(cc, value):
    global step_func_held
    now = time.monotonic()
    if step_menu and (KNOB_CC_BASE <= cc < KNOB_CC_BASE + NUM_SLOTS or
                      KNOB_LSB_CC_BASE <= cc < KNOB_LSB_CC_BASE + NUM_SLOTS):
        return      # the knobs do nothing on the MODE screen
    if KNOB_CC_BASE <= cc < KNOB_CC_BASE + NUM_SLOTS:
        knob_msb[cc - KNOB_CC_BASE] = value
    elif KNOB_LSB_CC_BASE <= cc < KNOB_LSB_CC_BASE + NUM_SLOTS:
        knob = cc - KNOB_LSB_CC_BASE
        position = (knob_msb[knob] << 7) | value
        if knob_endless(knob):
            # The settling motor's CCs only set where a turn starts from
            if now < step_settle_until[knob]:
                step_knob_last[knob] = position
                return
            step_knob_turned_at[knob] = now
            turn_endless(knob, position)
            return
        if now < step_settle_until[knob]:
            step_knob_reported[knob] = position
            return
        step_knob_turned_at[knob] = now
        step_knob_shown[knob] = position
        write_knob(knob, position / KNOB_MAX)
    elif RAW_SWITCH_CC_BASE <= cc < RAW_SWITCH_CC_BASE + NUM_SLOTS:
        on_step_button(cc - RAW_SWITCH_CC_BASE, value > 0)
        update_step()       # drawn now, not on the next idle tick
    elif RAW_CFG_SWITCH_CC_BASE <= cc < RAW_CFG_SWITCH_CC_BASE + NUM_SLOTS:
        if cc - RAW_CFG_SWITCH_CC_BASE == TOP_FUNC:
            # (its release counts on the MODE screen too: not left held)
            step_func_held = value > 0 and not step_menu
        elif value > 0:
            on_step_top(cc - RAW_CFG_SWITCH_CC_BASE)
        elif cc - RAW_CFG_SWITCH_CC_BASE in (TOP_LEFT, TOP_RIGHT):
            on_step_wind(cc - RAW_CFG_SWITCH_CC_BASE, False)
        if step_active:
            update_step()


def on_raw_sysex(cmd, data):
    """A RAW_MODE message from ROTO: SET_RAW_MODE 1 once RAW is shown (step_seq(),
    or CHANNEL RACK on its MODE screen). Leaving RAW (stop_step_mode) ROTO sends
    the new mode's own message instead; SET_RAW_MODE 0 is only handled in case."""
    if probe_raw_until:
        probe_raw_sysex(cmd, data)
    elif cmd == SET_RAW_MODE and data and data[0]:
        start_step_mode()
    elif cmd == SET_RAW_MODE:
        leave_step_mode()
    else:
        log("RAW from ROTO: cmd %d %s" % (cmd, data))


# --- Probes (dev only) -------------------------------------------------------------

# probe_plugins(seconds), typed in FL's Script output window: what FL tells a
# script about plugins, before PLUGIN mode is built on it. It logs ("probe: ..."
# lines, also in a capture) the selected insert's effect slots and the selected
# channel's generator (names, parameter counts, how many parameters have names
# and how long reading them takes, the slot mute / mix level events), then for
# `seconds` logs changes to: the focused window / plugin, FL's hint bar, the
# OnRefresh flags (counted per second), the selected insert's slot mute / mix
# level, and the focused plugin's parameter values (polled, to find which one
# moved: LEARN needs that). Use it: open plugin windows (an effect, a generator),
# move parameters with the mouse, switch a slot off and on, select other
# inserts and channels.
PROBE_POLL_S = 0.1
PROBE_PARAMS_SHOWN = 5
PROBE_CHANGES_PER_POLL = 3
REFRESH_FLAG_NAMES = {
    midi.HW_Dirty_Mixer_Sel: "Mixer_Sel", midi.HW_Dirty_Mixer_Display: "Mixer_Display",
    midi.HW_Dirty_Mixer_Controls: "Mixer_Controls", midi.HW_Dirty_RemoteLinks: "RemoteLinks",
    midi.HW_Dirty_FocusedWindow: "FocusedWindow", midi.HW_Dirty_Performance: "Performance",
    midi.HW_Dirty_LEDs: "LEDs", midi.HW_Dirty_RemoteLinkValues: "RemoteLinkValues",
    midi.HW_Dirty_Patterns: "Patterns", midi.HW_Dirty_Tracks: "Tracks",
    midi.HW_Dirty_ControlValues: "ControlValues", midi.HW_Dirty_Colors: "Colors",
    midi.HW_Dirty_Names: "Names", midi.HW_Dirty_ChannelRackGroup: "ChannelRackGroup",
    midi.HW_ChannelEvent: "ChannelEvent",
}
probe_until = 0.0
probe_polled_at = 0.0
probe_counted_at = 0.0
probe_shown: dict = {}      # what was last logged, by kind
probe_refresh_counts: dict = {}
probe_target = None         # (index, slot) of the plugin whose parameters are polled
probe_params: dict = {}     # its named parameters: index -> (name, value)


def probe_named_params(index, slot):
    return named_params(index, slot)


def probe_plugin(label, index, slot):
    count, names, ms = probe_named_params(index, slot)
    log("probe: %s %r (user name %r): %d parameters, %d named (%.0f ms)" %
        (label, plugins.getPluginName(index, slot), plugins.getPluginName(index, slot, True),
         count, len(names), ms))
    for i in list(names)[:PROBE_PARAMS_SHOWN]:
        log("probe:   %d %r = %.3f %r" % (i, names[i], plugins.getParamValue(i, index, slot),
                                       plugins.getParamValueString(i, index, slot)))


def probe_slot_events(insert):
    """The slots' mute and mix level events, (value, text) by (slot, name)."""
    # (FL's own midi.py at runtime, as send_event_id: the stubs don't export these)
    recs = [(name, getattr(midi, attr)) for name, attr in
            (("mute", "REC_Plug_Mute"), ("mix", "REC_Plug_MixLevel")) if hasattr(midi, attr)]
    events = {}
    for slot in range(NUM_FX_SLOTS):
        if mixer.isTrackPluginValid(insert, slot):
            plugin_id = mixer.getTrackPluginId(insert, slot)
            for name, rec in recs:
                value = mixer.getEventValue(plugin_id + rec)
                events[(slot, name)] = (value, mixer.getEventIDValueString(plugin_id + rec, value))
    return events


def probe_inventory():
    insert = mixer.trackNumber()
    log("probe: insert %d %r, effect slots enabled %s" %
        (insert, mixer.getTrackName(insert), mixer.isTrackSlotsEnabled(insert)))
    log("probe: REC_Plug_Mute %s, REC_Plug_MixLevel %s, plugin ID of slot 1 %d" %
        (getattr(midi, "REC_Plug_Mute", "missing"), getattr(midi, "REC_Plug_MixLevel", "missing"),
         mixer.getTrackPluginId(insert, 0)))
    for slot in range(NUM_FX_SLOTS):
        if mixer.isTrackPluginValid(insert, slot):
            probe_plugin("slot %d" % (slot + 1), insert, slot)
    for (slot, name), (value, text) in probe_slot_events(insert).items():
        log("probe: slot %d %s event = %d %r" % (slot + 1, name, value, text))
    channel = channels.selectedChannel()
    log("probe: channel %d %r, plugin valid %s" %
        (channel, channels.getChannelName(channel), plugins.isValid(channel)))
    if plugins.isValid(channel):
        probe_plugin("generator", channel, -1)


# Dev only: dump every plugin's parameters for roto_mapper (param_dump.py,
# roto_mapper's make_fl_reference.py / extract_fl_dumps.py). In Script output:
# dump_params(); dump_params(sweep=False) skips the step sweeps; dump_stop().
param_dump = None


def dump_params(sweep=True):
    global param_dump
    if param_dump is None:
        try:
            import param_dump as module
        except ImportError as e:
            log("dump: param_dump.py not found next to the script (%r)" % e)
            return
        param_dump = module
    param_dump.start(log, sweep)


def dump_stop():
    if param_dump is not None:
        param_dump.stop()


def param_dump_tick():
    """From OnIdle: True while a dump runs."""
    if param_dump is None or not param_dump.running():
        return False
    param_dump.tick()
    return True


def probe_plugins(seconds=60):
    global probe_until, probe_target
    probe_inventory()
    probe_shown.clear()
    probe_refresh_counts.clear()
    probe_target = None
    probe_until = time.monotonic() + seconds
    log("probe: watching for %d s" % seconds)


def probe_focused_plugin():
    """(index, slot) of the focused plugin window, or None."""
    if ui.getFocused(6):        # effect
        return mixer.getActiveEffectIndex()
    if ui.getFocused(7):        # generator: the form ID is its channel
        return ui.getFocusedFormID(), -1
    return None


def probe_changed(kind, value):
    if kind in probe_shown and probe_shown[kind] == value:
        return False
    probe_shown[kind] = value
    return True


def probe_poll_params():
    global probe_target, probe_params
    target = probe_focused_plugin()
    if target != probe_target:
        probe_target = target
        probe_params = {}
        if target:
            _, names, ms = probe_named_params(*target)
            probe_params = {i: (name, None) for i, name in names.items()}
            log("probe: polling %r (%d named parameters, names read in %.0f ms)" %
                (plugins.getPluginName(*target), len(names), ms))
    if not probe_target:
        return
    started = time.monotonic()
    changes = []
    for i, (name, last) in probe_params.items():
        value = plugins.getParamValue(i, *probe_target)
        if value != last:
            probe_params[i] = (name, value)
            if last is not None:
                changes.append((i, name, last, value))
    ms = (time.monotonic() - started) * 1000
    for i, name, last, value in changes[:PROBE_CHANGES_PER_POLL]:
        log("probe: param %d %r %.3f -> %.3f %r (poll %.1f ms)" %
            (i, name, last, value, plugins.getParamValueString(i, *probe_target), ms))
    if len(changes) > PROBE_CHANGES_PER_POLL:
        log("probe: ... and %d more parameters changed" % (len(changes) - PROBE_CHANGES_PER_POLL))


# probe_steps(param), typed in FL's Script output window with PLUGIN on a
# plugin (a VST is the interesting case): ways to find a parameter's steps
# faster, or without moving it. Default: the last parameter LEARN offered. It
# logs ("probe: steps ..." lines): the parameter's REC event (does FL's event
# value match it?), the event's text at 9 values without writing
# (getEventIDValueString), the text right after a write by each of
# setParamValue, getName(FPN_ParamValue) and a REC event write with FL's
# label-update flags, then over the next idle ticks: how many ticks and ms a
# write's text takes to follow, and the idle tick interval. It moves the
# parameter (end to end), then puts it back.
PROBE_STEP_VALUES = (0.0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1.0)
PROBE_LAG_TICKS = 10
probe_lag = None            # [entry, param, value to put back, text before, tick, started, ticks seen]


def probe_steps(param=None):
    global probe_lag
    entry = plugin_selected
    if param is None and learn_offered:
        param = learn_offered[0]
    if entry is None or param is None:
        log("probe: steps: no plugin / parameter (PLUGIN on a plugin, LEARN one first)")
        return
    value = plugins.getParamValue(param, *entry)
    text = param_text(param)
    log("probe: steps %r param %d %r: value %.6f %r" %
        (plugin_display_name(entry), param, plugins.getParamName(param, *entry), value, text))
    event = plugin_rec_event(entry, param)
    try:
        log("probe: steps event 0x%X: getEventValue %d (value x FromMIDI_Max = %d)" %
            (event, mixer.getEventValue(event), round(value * midi.FromMIDI_Max)))
        log("probe: steps getEventIDValueString (no write): " + ", ".join(
            "%.3f %r" % (v, mixer.getEventIDValueString(event, round(v * midi.FromMIDI_Max)))
            for v in PROBE_STEP_VALUES))
    except Exception as e:
        log("probe: steps event failed: %r" % e)
    for label, write, read in (
            ("setParamValue -> getParamValueString",
             lambda v: plugins.setParamValue(v, param, *entry), lambda: param_text(param)),
            ("setParamValue -> getName(FPN_ParamValue)",
             lambda v: plugins.setParamValue(v, param, *entry),
             lambda: plugins.getName(entry[0], entry[1], midi.FPN_ParamValue, param)),
            ("processRECEvent(REC_Control) -> getParamValueString",
             lambda v: general.processRECEvent(event, round(v * midi.FromMIDI_Max), midi.REC_Control),
             lambda: param_text(param)),
            ("setParamValue, processRECEvent(REC_Visual) -> getParamValueString",
             lambda v: (plugins.setParamValue(v, param, *entry),
                        general.processRECEvent(event, -1, midi.REC_Visual)),
             lambda: param_text(param))):
        try:
            texts = []
            for v in PROBE_STEP_VALUES:
                write(v)
                texts.append("%.3f %r" % (v, read()))
            log("probe: steps %s: %s" % (label, ", ".join(texts)))
        except Exception as e:
            log("probe: steps %s failed: %r" % (label, e))
        plugins.setParamValue(value, param, *entry)
    # The lag: one write to the far end, then the ticks until the text follows
    target = 0.0 if value > 0.5 else 1.0
    plugins.setParamValue(target, param, *entry)
    probe_lag = [entry, param, value, param_text(param), 0, time.monotonic(), []]
    log("probe: steps lag: wrote %.1f, text now %r" % (target, probe_lag[3]))


def probe_lag_tick():
    """probe_steps' lag: each idle tick's ms and the text, then the parameter goes back."""
    global probe_lag
    entry, param, value, before, tick, started, seen = probe_lag
    tick += 1
    probe_lag[4] = tick
    seen.append("%d %.0fms %r" % (tick, (time.monotonic() - started) * 1000, param_text(param)))
    if tick < PROBE_LAG_TICKS:
        return
    probe_lag = None
    plugins.setParamValue(value, param, *entry)
    log("probe: steps lag, per idle tick: " + ", ".join(seen))


# probe_insert_eq(), typed in FL's Script output window: the selected insert's
# built-in EQ (for a PLUGIN entry): per band, gain / frequency / bandwidth
# normalised and in dB / Hz (API 35), and its REC events' values and texts.
# Run it, change the EQ in FL's mixer, run it again.
def probe_insert_eq():
    insert = mixer.trackNumber()
    try:
        bands = mixer.getEqBandCount()
        log("probe: eq insert %d %r: %d bands" % (insert, mixer.getTrackName(insert), bands))
        base = mixer.getTrackPluginId(insert, 0)
        for band in range(bands):
            events = [base + first + band for first in
                      (midi.REC_Mixer_EQ_Gain, midi.REC_Mixer_EQ_Freq, midi.REC_Mixer_EQ_Q)]  # pyright: ignore[reportAttributeAccessIssue]
            log("probe: eq band %d: gain %.4f (%.2f dB), freq %.4f (%.1f Hz), bandwidth %.4f; events %s" %
                (band, mixer.getEqGain(insert, band), mixer.getEqGain(insert, band, 1),
                 mixer.getEqFrequency(insert, band), mixer.getEqFrequency(insert, band, 1),
                 mixer.getEqBandwidth(insert, band),
                 ", ".join("%d %r" % (mixer.getEventValue(e), mixer.getEventIDValueString(e, mixer.getEventValue(e)))
                           for e in events)))
    except Exception as e:
        log("probe: eq failed: %r" % e)


# probe_channel(seconds), typed in FL's Script output window: the selected
# channel's own REC events (a Sampler isn't a plugin to the plugins module, but
# its channel settings are events). The first run (capture 2026-10-25, a
# Sampler) crashed FL inside an event call (access violation, no log of which),
# so the walk goes one event per idle tick and logs each call before making it:
# after a crash the capture's last "probe: channel try" line names it. It walks
# the offsets midi.py names (PROBE_CHANNEL_OFFSETS), or with `ranges` also every
# offset of PROBE_CHANNEL_RANGES (the envelope / LFO layout isn't documented).
# Then for `seconds` it logs the events that change. Use it: select a Sampler
# channel, run it, wait for "watching", move each knob of its channel settings
# (filter, envelopes, LFOs, time / pitch, arp, delay) once.
# probe_channel_write(offset, value) writes one (0..1, smoothed).
PROBE_CHANNEL_OFFSETS = (
    [("basics", o) for o in range(0, 21) if o != 15] +
    [("delay", 0x200 + o) for o in range(0, 8)] +
    [("arp", 0x300 + o) for o in range(0, 8)] +
    [("misc", 0x400)] +
    [("tracking", 0x500 + o) for o in range(0, 3)] +
    [("envelope", 0x1000 + o) for o in range(0, 16)])
# Beyond the documented offsets a name proves nothing: FL names any offset
# from its tables and the value is whatever memory is there (capture
# 2026-10-25 21:55: arp 0x0308.. "Attack time", "LFO speed", raw 1068973056;
# a crash at 21:53 read 0x100E4). So `ranges` only tries the other envelope
# targets, guessed at 0x100 apart (midi.py: 0x800 of envelope events, the
# Panning one's 16 at 0x1000), and a name must be one target's envelope / LFO.
# Found (capture 2026-10-25 22:03): 0x1100 Volume, 0x1200 Filter cutoff,
# 0x1300 Filter resonance, 0x1400 Pitch, each laid out as Panning's; the name
# call for 0x1500 (no 6th target) crashed FL, so only these
PROBE_CHANNEL_RANGES = tuple(("envelope %d" % target, 0x1000 + target * 0x100, 16) for target in range(1, 5))
probe_channel_until = 0.0
probe_channel_seconds = 0
probe_channel_walk: list = []       # (label, offset) still to try
probe_channel_events: dict = {}     # offset -> (name, value) of the named events


def probe_channel(seconds=60, ranges=False):
    global probe_channel_seconds, probe_channel_walk
    # Each call logged before it's made (the second run crashed FL too, no
    # capture: the start's calls are as suspect as the walk's)
    log("probe: channel try selectedChannel")
    channel = channels.selectedChannel()
    log("probe: channel try %d getChannelType" % channel)
    kind = channels.getChannelType(channel)
    log("probe: channel try %d (type %d) getChannelName" % (channel, kind))
    name = channels.getChannelName(channel)
    log("probe: channel try %d %r getRecEventId" % (channel, name))
    log("probe: channel %d %r type %d, REC base %d" % (channel, name, kind, channels.getRecEventId(channel)))
    probe_channel_events.clear()
    probe_channel_unnamed.clear()
    probe_channel_targets.clear()
    probe_channel_targets["envelope"] = "Panning"     # 0x1000 (capture 2026-10-25 21:51)
    probe_channel_walk = list(PROBE_CHANNEL_OFFSETS)
    if ranges:
        known = {o for _, o in probe_channel_walk}
        probe_channel_walk += [(label, o) for label, first, count in PROBE_CHANNEL_RANGES
                               for o in range(first, first + count) if o not in known]
    probe_channel_seconds = seconds
    log("probe: channel walking %d offsets, one per tick" % len(probe_channel_walk))


PROBE_CHANNEL_NAMES_PER_TICK = 64
probe_channel_unnamed: dict = {}    # label -> unnamed offsets skipped
probe_channel_targets: dict = {}    # envelope label -> the target its first name gave


def probe_channel_name_fits(label, name):
    """Not a stray: an envelope target's offsets are named as one target's."""
    if not label.startswith("envelope "):
        return True
    parts = name.split(" - ")
    if len(parts) < 3 or not (parts[-2].endswith(" envelope") or parts[-2].endswith(" LFO")):
        return False
    # one target per block, and not one another block has (a repeat is a stray)
    target = parts[-2].rsplit(" ", 1)[0]
    if label not in probe_channel_targets and target in probe_channel_targets.values():
        return False
    return probe_channel_targets.setdefault(label, target) == target


def probe_channel_step():
    """The walk up to its next named offset (names are safe to ask, many a
    tick), whose value calls are each logged before they're made."""
    global probe_channel_until
    base = channels.getRecEventId(channels.selectedChannel())
    name = None
    for _ in range(PROBE_CHANNEL_NAMES_PER_TICK):
        if not probe_channel_walk:
            break
        label, offset = probe_channel_walk.pop(0)
        event = base + offset
        # getEventValue on an event the channel doesn't have crashes FL
        # (capture 2026-10-25 21:38: delay 0x0207); FL names one "<channel> -
        # Unknown event (#00000207)", and that call is safe (capture 21:42)
        name = mixer.getEventIDName(event)
        if name and "Unknown event" not in name and probe_channel_name_fits(label, name):
            break
        probe_channel_unnamed[label] = probe_channel_unnamed.get(label, 0) + 1
        name = None
    if name:
        log("probe: channel try %s 0x%04X getEventValue (%r)" % (label, offset, name))
        value = mixer.getEventValue(event)
        log("probe: channel try %s 0x%04X getAutoSmoothEventValue" % (label, offset))
        raw = mixer.getAutoSmoothEventValue(event)
        log("probe: channel try %s 0x%04X getEventIDValueString" % (label, offset))
        text = mixer.getEventIDValueString(event, raw)
        log("probe: channel %s 0x%04X %r = %.4f (raw %d) %r" % (label, offset, name, value / midi.FromMIDI_Max, raw, text))
        probe_channel_events[offset] = (name, value)
    if not probe_channel_walk:
        log("probe: channel unnamed, skipped: " + ", ".join("%s %d" % kv for kv in probe_channel_unnamed.items()))
        log("probe: channel %d named; watching %d s" % (len(probe_channel_events), probe_channel_seconds))
        probe_channel_until = time.monotonic() + probe_channel_seconds


def probe_channel_tick():
    global probe_channel_until
    if probe_channel_walk:
        probe_channel_step()
        return
    if not probe_channel_until:
        return
    if time.monotonic() > probe_channel_until:
        probe_channel_until = 0.0
        log("probe: channel done")
        return
    base = channels.getRecEventId(channels.selectedChannel())
    changes = 0
    for offset, (name, last) in probe_channel_events.items():
        value = mixer.getEventValue(base + offset)
        if value != last:
            probe_channel_events[offset] = (name, value)
            if changes < PROBE_CHANGES_PER_POLL:
                log("probe: channel 0x%04X %r %.4f -> %.4f %r" %
                    (offset, name, last / midi.FromMIDI_Max, value / midi.FromMIDI_Max,
                     mixer.getEventIDValueString(base + offset, mixer.getAutoSmoothEventValue(base + offset))))
            changes += 1
    if changes > PROBE_CHANGES_PER_POLL:
        log("probe: channel ... %d changed" % changes)


# probe_step(seconds), typed in FL's Script output window: what a STEP SEQ mode
# would build on (README "STEP SEQ"). It logs the pattern (number, length), the
# selected channel's steps (32 grid bits) and the 8 graph values of its first
# set steps, global swing (REC_MainShuffle) and the channel's swing mix / time
# shift, then writes a velocity on an empty step twice (without, then with its
# grid bit set: FL's Fire script says the first "won't work") and reads it back
# on the next tick, and puts the step back. Then for `seconds` it logs changes:
# the steps (click some in FL), the graph values, global swing, swing mix and
# shift (turn them to both ends in FL), and FL's playing step
# (getSongStepPos, play the pattern). Every FL call is logged before it's made.
# Use it on a Sampler channel, then on one with piano-roll notes.
PROBE_STEP_COUNT = 32
PROBE_STEP_PARAMS = ("note", "vel", "release", "fine", "pan", "mod X", "mod Y", "shift")
PROBE_STEP_SHOWN = 4
PROBE_STEP_LOGGED_POSITIONS = 24    # playing step changes logged (16ths come fast)
probe_step_until = 0.0
probe_step_seconds = 0
probe_step_plan: list = []          # the write test, one action per tick
probe_step_shown: dict = {}         # what was last seen, to log changes
probe_step_positions = 0


def probe_step_channel():
    return channels.selectedChannel()


def probe_step_events(channel):
    """(label, event) of the global swing and the channel's swing mix / shift."""
    base = channels.getRecEventId(channel)
    return (("global swing", midi.REC_MainShuffle),     # pyright: ignore[reportAttributeAccessIssue]
            ("swing mix", base + midi.REC_Chan_SwingMix),  # pyright: ignore[reportAttributeAccessIssue]
            ("time shift", base + midi.REC_Chan_TimeOfs))  # pyright: ignore[reportAttributeAccessIssue]


def probe_step_event_text(label, event):
    log("probe: step try %s getEventIDName" % label)
    name = mixer.getEventIDName(event)
    if not name or "Unknown event" in name:
        return name, None, ""
    log("probe: step try %s getEventValue (%r)" % (label, name))
    value = mixer.getEventValue(event)
    log("probe: step try %s getEventIDValueString" % label)
    return name, value, mixer.getEventIDValueString(event, mixer.getAutoSmoothEventValue(event))


def probe_step(seconds=60):
    global probe_step_seconds, probe_step_plan, probe_step_positions
    log("probe: step try patternNumber / getPatternLength")
    pattern = patterns.patternNumber()
    log("probe: step pattern %d %r, %d beats" % (pattern, patterns.getPatternName(pattern),
                                                  patterns.getPatternLength(pattern)))
    channel = probe_step_channel()
    log("probe: step try channel %d getChannelType / getChannelIndex" % channel)
    log("probe: step channel %d %r type %d, global index %d, isGridBitAssigned %r" %
        (channel, channels.getChannelName(channel), channels.getChannelType(channel),
         channels.getChannelIndex(channel), channels.isGridBitAssigned(channel)))
    log("probe: step try getGridBit x %d" % PROBE_STEP_COUNT)
    bits = [channels.getGridBit(channel, i) for i in range(PROBE_STEP_COUNT)]
    log("probe: step grid " + "".join("x" if b else "." for b in bits))
    for step in [i for i, b in enumerate(bits) if b][:PROBE_STEP_SHOWN]:
        log("probe: step try getCurrentStepParam step %d" % step)
        log("probe: step %d: %s" % (step, ", ".join(
            "%s %d" % (n, channels.getCurrentStepParam(channel, step, p)) for p, n in enumerate(PROBE_STEP_PARAMS))))
    for label, event in probe_step_events(channel):
        name, value, text = probe_step_event_text(label, event)
        log("probe: step %s %r = %s %r" % (label, name, "%.4f" % (value / midi.FromMIDI_Max)
                                            if value is not None else "-", text))
    empty = next((i for i, b in enumerate(bits[:16]) if not b), None)
    probe_step_plan = []
    if empty is not None:
        g = channels.getChannelIndex(channel)
        # (Fire's call: global index, flag 1)
        probe_step_plan = [
            ("write vel 50 on empty step %d" % empty,
             lambda: channels.setStepParameterByIndex(g, pattern, empty, midi.pVelocity, 50, True)),
            ("read back", lambda: None),
            ("set grid bit %d, write vel 50" % empty,
             lambda: (channels.setGridBit(channel, empty, True),
                      channels.setStepParameterByIndex(g, pattern, empty, midi.pVelocity, 50, True))),
            ("read back", lambda: None),
            ("put back: vel 100, grid bit off",
             lambda: (channels.setStepParameterByIndex(g, pattern, empty, midi.pVelocity, 100, True),
                      channels.setGridBit(channel, empty, False))),
            ("read back", lambda: None),
        ]
        probe_step_plan = [(label, action, empty) for label, action in probe_step_plan]
    else:
        log("probe: step no empty step in 1..16: no write test")
    probe_step_shown.clear()
    probe_step_positions = 0
    probe_step_seconds = seconds
    log("probe: step write test, then watching %d s" % seconds)


def probe_step_tick():
    global probe_step_until, probe_step_positions
    channel = probe_step_channel()
    if probe_step_plan:
        label, action, step = probe_step_plan.pop(0)
        log("probe: step try " + label)
        action()
        channels.updateGraphEditor()
        log("probe: step %s: grid %r, vel %d" % (label, channels.getGridBit(channel, step),
                                                 channels.getCurrentStepParam(channel, step, midi.pVelocity)))
        if not probe_step_plan:
            probe_step_until = time.monotonic() + probe_step_seconds
        return
    if time.monotonic() > probe_step_until:
        probe_step_until = 0.0
        log("probe: step done")
        return
    bits = "".join("x" if channels.getGridBit(channel, i) else "." for i in range(PROBE_STEP_COUNT))
    if probe_changed_step("grid", (channel, bits)):
        log("probe: step channel %d grid %s" % (channel, bits))
    for step in [i for i, b in enumerate(bits) if b == "x"][:PROBE_STEP_SHOWN * 2]:
        values = tuple(channels.getCurrentStepParam(channel, step, p) for p in range(len(PROBE_STEP_PARAMS)))
        if probe_changed_step(("step", channel, step), values):
            log("probe: step %d: %s" % (step, ", ".join("%s %d" % kv for kv in zip(PROBE_STEP_PARAMS, values))))
    for label, event in probe_step_events(channel):
        name = mixer.getEventIDName(event)
        if not name or "Unknown event" in name:
            continue
        value = mixer.getEventValue(event)
        if probe_changed_step(label, (channel, value)):
            log("probe: step %s %.4f %r" % (label, value / midi.FromMIDI_Max,
                                             mixer.getEventIDValueString(event, mixer.getAutoSmoothEventValue(event))))
    position = mixer.getSongStepPos()
    if probe_changed_step("position", position) and probe_step_positions < PROBE_STEP_LOGGED_POSITIONS:
        probe_step_positions += 1
        log("probe: step playing step %d (playing %r)" % (position, transport.isPlaying()))


def probe_changed_step(key, value):
    if probe_step_shown.get(key) == value:
        return False
    first = key not in probe_step_shown
    probe_step_shown[key] = value
    return not first or key == "grid"


# probe_length(seconds), typed in FL's Script output window: how a script could
# set the pattern's length (SEL's pattern length knob; FL's API only reads it,
# getPatternLength). On FL's selected channel it saves an undo point and, a
# tick each: sets the channel's loop point with the
# undocumented patterns.setChannelLoop (8 steps, then off; its stubs warn bad
# arguments crash FL), sets the first step past the pattern's end (does the
# pattern grow?), clears it again (does it shrink back?), and puts the loop
# point back, logging the length and loop point after each. Then for `seconds`
# it logs changes to both: set the pattern's length from FL's pattern menu and
# a channel's loop from the channel rack. Every FL call is logged before it's
# made: if FL crashes, the last "try" line names the call.
probe_length_until = 0.0
probe_length_seconds = 0
probe_length_plan: list = []        # one action per tick
probe_length_shown = None           # (length, loop point) last logged


def probe_length_state():
    """(pattern length in beats, the selected channel's loop point)."""
    pattern = patterns.patternNumber()
    channel = channels.getChannelIndex(channels.selectedChannel())
    return patterns.getPatternLength(pattern), patterns.getChannelLoopStyle(pattern, channel)


def probe_length(seconds=60):
    global probe_length_seconds, probe_length_plan, probe_length_shown
    pattern = patterns.patternNumber()
    channel = channels.selectedChannel()
    g = channels.getChannelIndex(channel)
    log("probe: length try getPatternLength / getChannelLoopStyle (pattern %d, channel %d, global %d)" %
        (pattern, channel, g))
    length, loop = probe_length_state()
    log("probe: length pattern %d %r: %d beats, channel %r loop point %d" %
        (pattern, patterns.getPatternName(pattern), length, channels.getChannelName(channel), loop))
    past = length * STEPS_PER_BEAT
    general.saveUndo("ROTO: probe_length", midi.UF_PR)
    probe_length_plan = [
        ("setChannelLoop(%d, 8)" % g, lambda: log("probe: length returned %r" % patterns.setChannelLoop(g, 8))),
        ("setChannelLoop(%d, 0)" % g, lambda: log("probe: length returned %r" % patterns.setChannelLoop(g, 0))),
        ("setGridBit step %d (first past the end)" % (past + 1), lambda: channels.setGridBit(channel, past, True)),
        ("getGridBit step %d" % (past + 1), lambda: log("probe: length grid bit %r" %
                                                        channels.getGridBit(channel, past))),
        ("clear step %d" % (past + 1), lambda: channels.setGridBit(channel, past, False)),
        ("setChannelLoop(%d, %d) (put back)" % (g, loop),
         lambda: log("probe: length returned %r" % patterns.setChannelLoop(g, loop))),
    ]
    probe_length_shown = None
    probe_length_seconds = seconds
    log("probe: length write test, then watching %d s" % seconds)


def probe_length_tick():
    global probe_length_until, probe_length_shown
    if probe_length_plan:
        label, action = probe_length_plan.pop(0)
        log("probe: length try " + label)
        action()
        log("probe: length after %s: %d beats, loop point %d" % ((label,) + probe_length_state()))
        if not probe_length_plan:
            probe_length_until = time.monotonic() + probe_length_seconds
        return
    if time.monotonic() > probe_length_until:
        probe_length_until = 0.0
        log("probe: length done")
        return
    state = probe_length_state()
    if state != probe_length_shown:
        probe_length_shown = state
        log("probe: length pattern %d: %d beats, channel %d loop point %d" %
            ((patterns.patternNumber(), state[0], channels.selectedChannel(), state[1])))


# probe_ratchet(seconds), typed in FL's Script output window: is there a step
# graph value past the documented 8 (pPitch .. pShift) that could be a ratchet
# / repeat (user 2026-10-27: a held step's Ratchet knob)? On FL's selected
# channel's first set step it reads graph values 8 .. PROBE_RATCHET_LAST, one a
# tick, each "try" logged first: if FL crashes (as reading a missing channel
# event did), the last "try" line names the param, and the probe stops at the
# first that raises. Then for `seconds` it logs changes to every param that
# read: edit the step in FL's graph editor (any repeat / ratchet tab), and in
# the piano roll. Run it with a step set on the selected channel.
PROBE_RATCHET_LAST = 11
probe_ratchet_until = 0.0
probe_ratchet_seconds = 0
probe_ratchet_plan: list = []       # params still to try, one a tick
probe_ratchet_params: list = []     # params that read
probe_ratchet_step = -1
probe_ratchet_shown = None


def probe_ratchet(seconds=60):
    global probe_ratchet_seconds, probe_ratchet_plan, probe_ratchet_step, probe_ratchet_shown
    channel = channels.selectedChannel()
    log("probe: ratchet FL %r, API %d" % (ui.getVersion(), general.getVersion()))
    log("probe: ratchet try getGridBit x %d (channel %d %r)" % (PROBE_STEP_COUNT, channel,
                                                                channels.getChannelName(channel)))
    probe_ratchet_step = next((i for i in range(PROBE_STEP_COUNT) if channels.getGridBit(channel, i)), -1)
    if probe_ratchet_step < 0:
        log("probe: ratchet no set step in 1..%d: set one and run it again" % PROBE_STEP_COUNT)
        return
    probe_ratchet_params[:] = list(range(len(PROBE_STEP_PARAMS)))
    log("probe: ratchet step %d: %s" % (probe_ratchet_step + 1, ", ".join(
        "%s %d" % (n, channels.getCurrentStepParam(channel, probe_ratchet_step, p))
        for p, n in enumerate(PROBE_STEP_PARAMS))))
    probe_ratchet_plan = list(range(len(PROBE_STEP_PARAMS), PROBE_RATCHET_LAST + 1))
    probe_ratchet_shown = None
    probe_ratchet_seconds = seconds
    log("probe: ratchet reading params %d..%d, then watching %d s" %
        (len(PROBE_STEP_PARAMS), PROBE_RATCHET_LAST, seconds))


def probe_ratchet_tick():
    global probe_ratchet_until, probe_ratchet_shown
    channel = channels.selectedChannel()
    if probe_ratchet_plan:
        param = probe_ratchet_plan.pop(0)
        log("probe: ratchet try getCurrentStepParam(%d, %d, %d)" % (channel, probe_ratchet_step, param))
        try:
            value = channels.getCurrentStepParam(channel, probe_ratchet_step, param)
        except Exception as e:  # noqa: BLE001 (FL raises its own types)
            log("probe: ratchet param %d raised %r: stopping there" % (param, e))
            probe_ratchet_plan.clear()
        else:
            log("probe: ratchet param %d = %r" % (param, value))
            probe_ratchet_params.append(param)
        if not probe_ratchet_plan:
            probe_ratchet_until = time.monotonic() + probe_ratchet_seconds
        return
    if time.monotonic() > probe_ratchet_until:
        probe_ratchet_until = 0.0
        log("probe: ratchet done")
        return
    # Every set step (a ratchet changed on any of them shows), each logged as it changes
    steps = [s for s in range(PROBE_STEP_COUNT) if channels.getGridBit(channel, s)]
    values = {(channel, s): tuple(channels.getCurrentStepParam(channel, s, p) for p in probe_ratchet_params)
              for s in steps}
    shown = probe_ratchet_shown or {}
    for key, step_values in values.items():
        if shown.get(key) != step_values:
            log("probe: ratchet channel %d step %d: %s" % (key[0], key[1] + 1, ", ".join(
                "%d=%d" % pv for pv in zip(probe_ratchet_params, step_values))))
    probe_ratchet_shown = values


# probe_raw(seconds), typed in FL's Script output window: the firmware's RAW
# mode, which a STEP SEQ mode would draw on (README "STEP SEQ"). It sends
# SET_RAW_MODE 1 and waits for ROTO's own SET_RAW_MODE (the firmware sends it
# once RAW is shown; screen lines before that could block its MIDI task, which
# draws each under a mutex), then:
# - phase 1, the firmware's RAW setup as it is: the screens say "phase 1";
#   press each of the 8 buttons and the 8 top buttons (MODE .. RIGHT), turn
#   each knob. Every CC from ROTO is logged (number, value: a push switch's
#   press and release?). Knob 1 is sent to 0 / max / middle on its RAW CCs (0 /
#   32) every 2 s: does it move?
# - phase 2 (after half the time), the script's own setup, one message per tick:
#   buttons CC 80+i, top buttons CC 64+i, all push; LEDs coloured; knobs on
#   MIX's CCs (12+i / 44+i), knob 2 with a centre detent, knob 3 with 8 steps;
#   screens "phase 2". Press and turn everything again; knob 1 is sent
#   positions on CC 12 / 44.
# Then SET_RAW_MODE 0 (ROTO goes back to its previous mode). probe_raw_stop()
# ends it early. The firmware's _show_raw_mode_screen sets the 8 buttons up
# with _set_cfg_switch_mode (the top buttons' call): phase 1 shows whether
# that's a bug.
PROBE_RAW_KNOB_PERIOD_S = 2.0
probe_raw_until = 0.0
probe_raw_phase = 0                 # 0: waiting for ROTO, 1, 2
probe_raw_phase_2_at = 0.0
probe_raw_queue: list = []          # (group, cmd, data) to send, one per tick
probe_raw_knob_at = 0.0
probe_raw_knob_step = 0


def probe_raw_screens(phase):
    queue: list = [raw_main_line(0, "RAW probe", (0, 0, 0)), raw_main_line(1, "phase %d" % phase, (0, 0, 120))]
    for i in range(NUM_SLOTS):
        queue.append(raw_ctl_line(i, 0, "STEP %d" % (i + 1), (40, 40, 40)))
        queue.append(raw_ctl_line(i, 1, "phase %d" % phase, (0, 90 if i % 2 else 0, 0 if i % 2 else 90)))
    return queue


def probe_raw(seconds=40):
    global probe_raw_until, probe_raw_phase, probe_raw_phase_2_at
    probe_raw_queue.clear()
    probe_raw_phase = 0
    probe_raw_until = time.monotonic() + seconds
    probe_raw_phase_2_at = time.monotonic() + seconds / 2
    log("probe: raw SET_RAW_MODE 1, waiting for ROTO's")
    send_sysex(RAW_MODE_GROUP, SET_RAW_MODE, [1, RAW_EXIT_PREV])


def probe_raw_stop():
    global probe_raw_until, probe_raw_phase
    probe_raw_until = 0.0
    probe_raw_phase = 0
    probe_raw_queue.clear()
    log("probe: raw done: SET_RAW_MODE 0")
    send_sysex(RAW_MODE_GROUP, SET_RAW_MODE, [0, RAW_EXIT_PREV])


def probe_raw_sysex(cmd, data):
    """A RAW_MODE message from ROTO."""
    global probe_raw_phase
    log("probe: raw from ROTO: cmd %d %s" % (cmd, data))
    if cmd == SET_RAW_MODE and data and data[0] and probe_raw_until and probe_raw_phase == 0:
        probe_raw_phase = 1
        probe_raw_queue.extend(probe_raw_screens(1))
        log("probe: raw phase 1 (the firmware's setup): press every button, turn every knob")


def probe_raw_phase_2():
    queue = []
    for i in range(NUM_SLOTS):
        queue.append((RAW_MODE_GROUP, SET_SWITCH_CTL_MODE,
                      [RAW_SWITCH_CTL, i, 0, ROTO_CC_STATUS & 0x0F, RAW_SWITCH_CC_BASE + i, 0, 0, 0, 0, 0, 0]))
        queue.append((RAW_MODE_GROUP, SET_SWITCH_CTL_HAPTIC_MODE, [RAW_SWITCH_CTL, i, 0, 2]))
        queue.append((RAW_MODE_GROUP, SET_SWITCH_CTL_LED_COLOUR,
                      [RAW_SWITCH_CTL, i] + raw_colour((255, 0, 0) if i % 2 else (0, 255, 0))))
        queue.append((RAW_MODE_GROUP, SET_SWITCH_CTL_MODE,
                      [RAW_SWITCH_CFG, i, 0, ROTO_CC_STATUS & 0x0F, RAW_CFG_SWITCH_CC_BASE + i, 0, 0, 0, 0, 0, 0]))
        queue.append((RAW_MODE_GROUP, SET_SWITCH_CTL_HAPTIC_MODE, [RAW_SWITCH_CFG, i, 0, 2]))
        queue.append((RAW_MODE_GROUP, SET_KNOB_CTL_MODE, [i, 1, ROTO_CC_STATUS & 0x0F, KNOB_CC_BASE + i, 0, 0]))
    queue.append((RAW_MODE_GROUP, SET_KNOB_CTL_HAPTIC_MODE, [0, RAW_KNOB_HAPTIC_NORMAL, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))
    queue.append((RAW_MODE_GROUP, SET_KNOB_CTL_HAPTIC_MODE, [1, RAW_KNOB_HAPTIC_CENTRE, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))
    queue.append((RAW_MODE_GROUP, SET_KNOB_CTL_HAPTIC_MODE, [2, RAW_KNOB_HAPTIC_STEPPED, 0, 0, 8, 0, 64, 0, 0, 0, 0, 0]))
    return queue + probe_raw_screens(2)


def probe_raw_tick():
    global probe_raw_phase, probe_raw_knob_at, probe_raw_knob_step
    now = time.monotonic()
    if now > probe_raw_until:
        probe_raw_stop()
        return
    if probe_raw_phase == 1 and now > probe_raw_phase_2_at:
        probe_raw_phase = 2
        probe_raw_queue.extend(probe_raw_phase_2())
        log("probe: raw phase 2 (the script's setup, %d messages): press every button, turn every knob" %
            len(probe_raw_queue))
    if probe_raw_queue:
        send_sysex(*probe_raw_queue.pop(0))
        return
    if probe_raw_phase and now - probe_raw_knob_at > PROBE_RAW_KNOB_PERIOD_S:
        probe_raw_knob_at = now
        position = (0, KNOB_MAX, KNOB_MAX // 2)[probe_raw_knob_step % 3]
        probe_raw_knob_step += 1
        cc = RAW_KNOB_CC_BASE if probe_raw_phase == 1 else KNOB_CC_BASE
        log("probe: raw knob 1 to %d on CC %d / %d" % (position, cc, cc + 32))
        send_cc(cc, position >> 7)
        send_cc(cc + 32, position & 0x7F)


# probe_tweaked(), typed in FL's Script output window right after moving one
# control in FL: that control's event, by linking a spare MIDI control to the
# last tweaked parameter (device.linkToLastTweaked, as FL's "Link to
# controller") and asking FL which event the link is to (device.findEventID,
# as the SSL / Fire scripts). For events no table names (a Sampler's sample end
# offset, loop points: probing offsets blind crashes FL). It leaves the link in
# the project (channel 14, CC PROBE_TWEAKED_CC_FIRST up; ROTO sends none
# there); remove it in FL (the parameter's menu, "Unlink from controller").
PROBE_TWEAKED_CHANNEL = 13          # 0-based: MIDI channel 14
PROBE_TWEAKED_CC_FIRST = 100
probe_tweaked_cc = PROBE_TWEAKED_CC_FIRST


def probe_tweaked():
    global probe_tweaked_cc
    if probe_tweaked_cc > 127:
        log("probe: tweaked: no spare CCs left")
        return
    cc = probe_tweaked_cc
    probe_tweaked_cc += 1
    # linkToLastTweaked takes a control index and a channel apart: an encoded
    # ID there linked, but findEventID found nothing for it (-1: capture
    # 2026-10-25 22:30), so the CC alone, and the IDs it could be found by
    port = device.getPortNumber()
    result = device.linkToLastTweaked(cc, PROBE_TWEAKED_CHANNEL, False)
    if result != 0:
        log("probe: tweaked: link of CC %d failed (%d: %s)" %
            (cc, result, {1: "nothing tweaked", 2: "control taken"}.get(result, "?")))
        return
    candidates = (("port, channel, CC", midi.EncodeRemoteControlID(port, PROBE_TWEAKED_CHANNEL, cc)),
                  ("port, CC", midi.EncodeRemoteControlID(port, 0, cc)),
                  ("channel, CC", midi.EncodeRemoteControlID(-1, PROBE_TWEAKED_CHANNEL, cc)),
                  ("CC", cc))
    found = [(label, device.findEventID(control, 0)) for label, control in candidates]
    log("probe: tweaked CC %d linked; findEventID: %s" % (cc, ", ".join("%s %d" % f for f in found)))
    event = next((e for _, e in found if 0 <= e < midi.MaxInt), None)
    if event is None:
        return
    channel = channels.selectedChannel()
    base = channels.getRecEventId(channel)
    # An event FL just linked is real: its value and text are safe to read
    value = mixer.getEventValue(event)
    log("probe: tweaked event %d (0x%X; selected channel %d: base %d, offset 0x%X) %r = %.4f %r" %
        (event, event, channel, base, event - base, mixer.getEventIDName(event), value / midi.FromMIDI_Max,
         mixer.getEventIDValueString(event, mixer.getAutoSmoothEventValue(event))))


def probe_channel_write(offset, value):
    event = channels.getRecEventId(channels.selectedChannel()) + offset
    mixer.automateEvent(event, round(value * midi.FromMIDI_Max), midi.REC_MIDIController, SMOOTH_SPEED)
    log("probe: channel wrote 0x%04X %r = %.3f" % (offset, mixer.getEventIDName(event), value))


# --- TRANSPORT knob probes (2026-11-06) ---------------------------------------------
# For the TRANSPORT knobs Cubase has (zoom, tempo, AI knob), typed in FL's Script
# output window:
#   probe_transport_api()   what FL offers: matching functions, tempo, last tweaked
#   probe_zoom("h", 1)      one horizontal zoom jog step ("v": vertical, -1: out)
#   probe_tempo_jog(1)      one FPT_TempoJog step (how far does it move?)
#   probe_tempo_set(121.5)  set the tempo through REC_Tempo (as Novation's script)
#   probe_last_tweaked(60)  for 60 s, log what the "last tweaked" IDs and FL's hint
#                           bar give as you tweak controls in FL
# (Results in README "FL Studio behaviour seen".)
PROBE_WORDS = ("tweak", "link", "hint", "zoom", "tempo", "focus", "last")
PROBE_AFTER_S = 0.2         # a change is read back this long after the call
probe_after: list = []      # (when, label, read): logged on the tick after `when`
probe_tweak_until = 0.0
probe_tweak_shown = None


def probe_try(label, fn, *args):
    """fn(*args), or the exception's text: FL may not have it."""
    try:
        return fn(*args)
    except Exception as e:     # noqa: BLE001 (a probe: log whatever FL raises)
        return "%s failed: %s" % (label, e)


def probe_event(event):
    """What FL gives for an event ID: value (raw and 0..1), name, value text."""
    value = probe_try("getEventValue", mixer.getEventValue, event)
    norm = value / midi.FromMIDI_Max if isinstance(value, int) else None
    return {
        "value": value,
        "norm": None if norm is None else round(norm, 4),
        "name": probe_try("getEventIDName", mixer.getEventIDName, event),
        "text": probe_try("getEventIDValueString", mixer.getEventIDValueString, event,
                          value if isinstance(value, int) else 0),
        "rec_get": probe_try("processRECEvent", general.processRECEvent, event, 0,
                             midi.REC_GetValue),
    }


def probe_tempo():
    return "getCurrentTempo(True) %r, (False) %r" % (
        probe_try("getCurrentTempo", mixer.getCurrentTempo, True),
        probe_try("getCurrentTempo", mixer.getCurrentTempo, False))


def probe_focused_windows():
    names = ("mixer", "channel rack", "playlist", "piano roll", "browser", "plugin",
             "effect", "generator")
    focused = [n for i, n in enumerate(names) if probe_try("getFocused", ui.getFocused, i) in (True, 1)]
    return ", ".join(focused) or "none"


def probe_transport_api():
    for label, module in (("device", device), ("ui", ui), ("general", general),
                          ("transport", transport), ("mixer", mixer), ("plugins", plugins)):
        found = [n for n in dir(module) if any(w in n.lower() for w in PROBE_WORDS)]
        log("probe: %s: %s" % (label, ", ".join(found) or "-"))
    log("probe: API version %r" % probe_try("getVersion", general.getVersion))
    log("probe: tempo " + probe_tempo())
    log("probe: REC_Tempo %r" % probe_event(midi.REC_Tempo))
    log("probe: REC_LastTweakedFirst %r" % probe_event(midi.REC_LastTweakedFirst))
    log("probe: REC_LastTweakedLast %r" % probe_event(midi.REC_LastTweakedLast))
    log("probe: hint %r" % probe_try("getHintMsg", ui.getHintMsg))
    log("probe: focused %s" % probe_focused_windows())


def probe_zoom(axis="h", steps=1):
    command = midi.FPT_HZoomJog if axis == "h" else midi.FPT_VZoomJog
    result = probe_try("globalTransport", transport.globalTransport, command, steps)
    log("probe: zoom %s %+d -> %r (focused %s)" % (axis, steps, result, probe_focused_windows()))
    probe_after.append((time.monotonic() + PROBE_AFTER_S, "zoom %s hint" % axis,
                        lambda: probe_try("getHintMsg", ui.getHintMsg)))


def probe_tempo_jog(steps=1):
    log("probe: tempo jog %+d: before %s" % (steps, probe_tempo()))
    result = probe_try("globalTransport", transport.globalTransport, midi.FPT_TempoJog, steps)
    log("probe: tempo jog -> %r, now %s" % (result, probe_tempo()))
    probe_after.append((time.monotonic() + PROBE_AFTER_S, "tempo jog", probe_tempo))


def probe_tempo_set(bpm):
    log("probe: tempo set %r: before %s" % (bpm, probe_tempo()))
    result = probe_try("processRECEvent", general.processRECEvent, midi.REC_Tempo, int(bpm * 1000),
                       midi.REC_Control | midi.REC_UpdateControl)
    log("probe: tempo set -> %r, now %s" % (result, probe_tempo()))
    probe_after.append((time.monotonic() + PROBE_AFTER_S, "tempo set", probe_tempo))


def probe_tweak_state():
    return (probe_event(midi.REC_LastTweakedFirst), probe_event(midi.REC_LastTweakedLast),
            probe_try("getHintMsg", ui.getHintMsg))


def probe_last_tweaked(seconds=60):
    global probe_tweak_until, probe_tweak_shown
    probe_tweak_shown = None
    probe_tweak_until = time.monotonic() + seconds
    log("probe: last tweaked, watching for %d s: tweak controls in FL (a plugin knob, a "
        "mixer fader, a channel's volume)" % seconds)


def probe_transport_tick():
    global probe_tweak_until, probe_tweak_shown
    now = time.monotonic()
    while probe_after and now >= probe_after[0][0]:
        _, label, read = probe_after.pop(0)
        log("probe: %s, %.0f ms later: %r" % (label, PROBE_AFTER_S * 1000, read()))
    if probe_tweak_until:
        if now > probe_tweak_until:
            probe_tweak_until = 0.0
            log("probe: last tweaked, done")
        else:
            state = probe_tweak_state()
            if state != probe_tweak_shown:
                probe_tweak_shown = state
                first, last, hint = state
                log("probe: tweaked first %r | last %r | hint %r" % (first, last, hint))


def probe_tick():
    global probe_until, probe_polled_at, probe_counted_at
    probe_transport_tick()
    if probe_lag:
        probe_lag_tick()
    if probe_channel_walk or probe_channel_until:
        probe_channel_tick()
    if probe_step_plan or probe_step_until:
        probe_step_tick()
    if probe_length_plan or probe_length_until:
        probe_length_tick()
    if probe_ratchet_plan or probe_ratchet_until:
        probe_ratchet_tick()
    if probe_raw_until:
        probe_raw_tick()
    if not probe_until:
        return
    now = time.monotonic()
    if now > probe_until:
        probe_until = 0.0
        log("probe: done")
        return
    if now - probe_polled_at < PROBE_POLL_S:
        return
    probe_polled_at = now
    focus = (ui.getFocusedFormID(), ui.getFocusedPluginName(), ui.getFocused(5), ui.getFocused(6),
             ui.getFocused(7), mixer.getActiveEffectIndex(), mixer.trackNumber(),
             channels.selectedChannel())
    if probe_changed("focus", focus):
        log("probe: focus form %d %r, plugin/effect/generator window %s/%s/%s, "
            "active effect %s, insert %d, channel %d" % focus)
    hint = ui.getHintMsg()
    if probe_changed("hint", hint):
        log("probe: hint %r" % hint)
    events = probe_slot_events(mixer.trackNumber())
    last = probe_shown.get("slots")
    if probe_changed("slots", events) and last is not None:
        for key, value in events.items():
            if last.get(key) != value:
                log("probe: slot %d %s event %s -> %s" % (key[0] + 1, key[1], last.get(key), value))
    probe_poll_params()
    if now - probe_counted_at >= 1.0:
        probe_counted_at = now
        if probe_refresh_counts:
            log("probe: OnRefresh " + ", ".join(
                "%s x%d" % (name, n) for name, n in sorted(probe_refresh_counts.items())))
            probe_refresh_counts.clear()


def probe_refresh(flags):
    if not probe_until:
        return
    for bit, name in REFRESH_FLAG_NAMES.items():
        if flags & bit:
            probe_refresh_counts[name] = probe_refresh_counts.get(name, 0) + 1


# --- FL Studio callbacks ---------------------------------------------------------

def OnInit():
    global roto_ready, last_transport_status, mix_mode, transport_shown, mapped_end_seen, \
        step_menu, probe_raw_until, midi_log_until
    # A re-init (ROTO unplugged and back, MIDI settings changed) may keep this
    # module's state: start from nothing, as FL's Fire script does
    roto_ready = False
    last_transport_status = None
    mix_mode = None
    transport_shown = False
    mapped_end_seen = False
    step_menu = False
    probe_raw_until = 0.0
    midi_log_until = 0.0
    leave_step_mode()
    leave_plugin_mode()
    forget_shown()
    log("hello from FL Studio %s (MIDI scripting API %d), port %d" %
        (ui.getVersion(), general.getVersion(), device.getPortNumber()))
    if not device.isAssigned():
        log("no output port linked: set this device's port number in MIDI settings")
    device.setHasMeters()
    # Tell ROTO a DAW is here; it answers with PING_DAW
    send_sysex(GENERAL_COMMAND_GROUP, DAW_STARTED, [FL_STUDIO_DAW_TYPE])


def OnDeInit():
    log("goodbye")


def on_fw_version(payload):
    """ROTO's answer to REQUEST_ROTO_FW_VERSION, after a PING_DAW: 4.0.0 or later
    gets the DAW_PING_RESP (ROTO then connects), older firmware a warning."""
    global roto_ready, fw_logged
    version = tuple(payload[:3])
    commit = "".join(chr(b) for b in payload[3:] if 0x20 <= b < 0x7F)
    too_old = version < MIN_FW_VERSION
    if fw_logged != (version, commit):
        fw_logged = (version, commit)
        log("ROTO firmware %d.%d.%d%s" % (version + (" (%s)" % commit if commit else "",)))
        if too_old:
            log("WARNING: ROTO firmware %d.%d.%d doesn't support FL Studio, so ROTO isn't connected: "
                "update it to %d.%d.%d or later with ROTO-SETUP" % (version + MIN_FW_VERSION))
    if too_old:
        return
    if not roto_ready:
        log("ROTO pinged")
    roto_ready = True
    send_sysex(GENERAL_COMMAND_GROUP, DAW_PING_RESP, [FL_STUDIO_DAW_TYPE])


def OnSysEx(msg):
    global mix_mode, transport_shown, mapped_end_seen
    data = list(msg.sysex)
    if handle_midi_log_request(data):
        msg.handled = True
        return
    if data[:5] != SYSEX_HEADER or len(data) < 8:
        return
    group, cmd, payload = data[5], data[6], data[7:-1]
    msg.handled = True
    # TRANSPORT closed: a MIX or RAW mode, or a connect (PLUGIN's SET_PLUGIN_MODE
    # is on_plugin_sysex's: there it can mean back from TRANSPORT)
    if (group == MIXER_COMMAND_GROUP and cmd in (SET_MIX_ALL_TRACKS_MODE, SET_MIX_TRACK_FOCUS_MODE)) or \
            group == RAW_MODE_GROUP or (group == GENERAL_COMMAND_GROUP and cmd == ROTO_DAW_CONNECTED):
        transport_shown = False
    if group == GENERAL_COMMAND_GROUP:
        if cmd == PING_DAW:
            # The firmware first: the reply (ROTO_FW_VERSION) connects, or not.
            # Every ping asks again, so updated firmware connects
            send_sysex(GENERAL_COMMAND_GROUP, REQUEST_ROTO_FW_VERSION)
        elif cmd == ROTO_FW_VERSION and len(payload) >= 3:
            on_fw_version(payload)
        elif cmd == ROTO_DAW_CONNECTED:
            log("ROTO connected")
            # (ROTO may have been updated: older firmware sends no marker)
            mapped_end_seen = False
            leave_step_mode()
            mix_mode = None
            leave_plugin_mode()
            forget_shown()
            # Always a bank of 8: the script pages it (PAGE_LEFT/RIGHT)
            send_sysex(GENERAL_COMMAND_GROUP, NUM_TRACKS, index_bytes(NUM_SLOTS))
            send_sysex(MIXER_COMMAND_GROUP, SET_MIX_VU_METER_POINTS, [METER_LEVEL_YELLOW, METER_LEVEL_RED])
            # The send targets before MIX starts: a whole routing scan (timed,
            # to see what FL's routing calls cost)
            started = time.monotonic()
            for _ in range(0, num_inserts() + 1, SCAN_INSERTS_PER_TICK):
                scan_routing()
            log("routing scan: %.0f ms" % ((time.monotonic() - started) * 1000))
            # A reconnect (script reloaded) in CHANNEL RACK: the firmware stays in
            # RAW and sends no mode message (it does for MIX / PLUGIN), so ROTO kept
            # the old screens with nothing answering MODE. Out of RAW to the mode
            # it was entered from, as a power cycle would (RAW isn't saved); that
            # mode's message follows. The firmware ignores this outside RAW
            send_sysex(RAW_MODE_GROUP, SET_RAW_MODE, [0, RAW_EXIT_PREV])
        elif cmd == REQUEST_TRANSPORT_STATUS:
            on_transport_shown()
        elif cmd == PAGE_LEFT and mix_mode == "all":
            page(-1)
        elif cmd == PAGE_RIGHT and mix_mode == "all":
            page(1)
        elif cmd in (PAGE_LEFT, PAGE_RIGHT) and plugin_active and plugin_track_select:
            plugin_page_bank(-1 if cmd == PAGE_LEFT else 1)
        elif cmd in (PAGE_LEFT, PAGE_RIGHT) and plugin_active:
            # Another page of mapped controls: ROTO sends its CONTROL_MAPPEDs,
            # none for an empty page (as the Ableton script)
            mapped.clear()
            shown_mapped.clear()
        elif cmd == ROTO_SELECT_TRACK:
            slot = (payload[0] << 7) | payload[1]
            insert = slot_insert(slot) if slot < NUM_SLOTS else None
            if insert is not None:
                mixer.setActiveTrack(insert)
                if plugin_active:
                    on_plugin_track_pick()
        else:
            log("unhandled SysEx: " + bytes(data).hex(" "))
    elif group == MIXER_COMMAND_GROUP and cmd == SET_MIX_ALL_TRACKS_MODE:
        leave_step_mode()
        on_mix_all_tracks(payload)
    elif group == MIXER_COMMAND_GROUP and cmd == SET_MIX_TRACK_FOCUS_MODE:
        leave_step_mode()
        on_mix_focus(payload)
    elif group == MIXER_COMMAND_GROUP and cmd == SET_MIX_VIEW:
        set_view(payload[0])
        update_mix()
    elif group == MIXER_COMMAND_GROUP and cmd == REQUEST_SEND_TRACK_NAMES:
        first = payload[0] - payload[0] % NUM_SLOTS
        send_names_block(first, send_targets[first:first + NUM_SLOTS])
    elif group == PLUGIN_COMMAND_GROUP and on_plugin_sysex(cmd, payload):
        pass
    elif group == RAW_MODE_GROUP:
        on_raw_sysex(cmd, payload)
    else:
        log("unhandled SysEx: " + bytes(data).hex(" "))


def OnMidiMsg(msg):
    msg.handled = True
    if probe_raw_until:
        log("probe: raw CC status=0x%02X %d = %d" % (msg.status, msg.data1, msg.data2))
        return
    if step_active and msg.status == ROTO_CC_STATUS:
        on_step_cc(msg.data1, msg.data2)
        return
    if not roto_ready:
        log("ignored (no PING_DAW from ROTO yet) status=0x%02X data1=%d data2=%d" %
            (msg.status, msg.data1, msg.data2))
        return
    if msg.status == ROTO_CC_STATUS:
        if on_transport_cc(msg.data1, msg.data2):
            return
        if mix_mode and on_mix_cc(msg.data1, msg.data2):
            return
        if plugin_active and on_plugin_cc(msg.data1, msg.data2):
            return
    log("MIDI status=0x%02X data1=%d data2=%d" % (msg.status, msg.data1, msg.data2))


def OnIdle():
    probe_tick()
    if param_dump_tick():
        return      # (the sweeps would send ROTO feedback)
    # (probe_raw: ROTO is in RAW mode, the modes' updates would fight it)
    if roto_ready and step_active and not probe_raw_until:
        update_step()
    elif roto_ready and not probe_raw_until:
        send_transport_status(force=False)
        update_tempo()
        scan_routing()
        update_mix()
        update_plugin()


def OnRefresh(flags):
    probe_refresh(flags)


def OnUpdateMeters():
    if roto_ready and not probe_raw_until and not step_active:
        update_meters()
