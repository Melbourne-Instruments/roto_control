-- config.lua
--
-- Melbourne Instruments Roto Conrol
--
-- Copyright (c) 2025 Melbourne Instruments. All Rights Reserved.
--
-- This script is provided 'as is', without any warranty of any kind, express or
-- implied, including but not limited to the warranties of merchantability,
-- fitness for a particular purpose, and noninfringement. In no event shall the
-- authors or copyright holders be liable for any claim, damages, or other
-- liability, whether in an action of contract, tort, or otherwise, arising from,
-- out of, or in connection with the software or the use or other dealings in the
-- software.

-- Constants
VERSION = '3.2.10'
DEBUG_MODE = 0

-- Sysex
MIDI_SYSEX_HEADER = 0xf0
MIDI_SYSEX_END = 0xf7
MI_MANUFACTURER_ID = { 0x0, 0x22, 0x3 }
ROTO_CONTROL_DEVICE_ID = 0x2

-- Command groups
GENERAL_COMMAND_GROUP = 0xa
PLUGIN_COMMAND_GROUP = 0xb
MIXER_COMMAND_GROUP = 0xc

-- General commands
DAW_STARTED = 0x1
PING_DAW = 0x2
DAW_PING_RESP = 0x3
NUM_TRACKS = 0x4
FIRST_TRACK = 0x5
SELECT_TRACK = 0x9
REQUEST_TRANSPORT_STATUS = 0xA
ROTO_DAW_CONNECTED = 0xC
SET_TRACK_DETAILS = 0x11
RESET_TRACK_DETAILS = 0x12
SET_TRACK_COLOR = 0x13  
LEFT_ARROW = 0x14
RIGHT_ARROW = 0x15
SET_CURRENT_TRACK_NAME = 0x16
SET_CURRENT_TRACK_COLOR = 0x17
PARAM_VALUES = 0x18

-- Plugin commands
SET_PLUGIN_MODE = 0x1
NUM_DEVICES = 0x2
FIRST_DEVICE = 0x3
PLUGIN_DETAILS = 0x5
ROTO_CONTROL_SELECT_DEVICE = 0x7
DAW_SELECT_PLUGIN = 0x8
SET_DEVICE_LEARN = 0x9
LEARN_PARAM = 0xA
SET_PLUGIN_ENABLE = 0xC
SET_PLUGIN_LOCK = 0xD
SET_PLUGIN_CTL_DETAILS = 0x13
SET_TRACK_SELECT_MODE = 0x15
SET_PLUGIN_ENABLE_MODE = 0x16
SET_PLUGIN_SELECT_MODE = 0x17
PLUGIN_PARAM_SWEEP = 0x19
PLUGIN_PARAM_SWEEP_VALUE = 0x1A
PLUGIN_LEARN_COMPLETE = 0x1C
PLUGIN_LEARN_RESTART= 0x1D
REQUEST_SWITCH_PARAM_VALUE = 0x1E

-- Mixer commands
SET_MIXER_ALL_MODE = 0x1
SET_MIXER_SELECTED_MODE = 0x2
NUM_SENDS = 0x3
TOGGLE_GROUP_TRACK = 0x6
DAW_SELECT_FOCUS_TRACK = 0x0A
SET_MIX_VU_METER_POINTS = 0xB

-- Constants
NUM_CHANNELS = 8
MAX_QUANTISED_STEPS = 24
MAX_QUANTISED_STRING_STEPS = 16
MAX_STRING_LENGTH = 12
MAX_HASH_STRING_LENGTH = 64
MAX_TRACK_STRING_LENGTH = MAX_STRING_LENGTH + 4
LOGIC_PRO_DAW = 3
CLEAR_TRACK_STRING = '            '
CLEAR_PLUGIN_STRING = '                                                                                '
CLEAR_INSTRUMENT_STRING='                                                                '
NO_STRING = '-'
NO_PLUGIN = '--'
NO_INSTRUMENT=''
NO_PLUGIN_PARAM = '                                                                                '
NO_SMART_PARAM = '            '
NO_PARAM_VALUES = string.rep(string.char(0), MAX_STRING_LENGTH + 1)
CLEAR_PLUGIN_PARAM = ''
MAX_SENDS = 12
MAX_KNOBS_PER_CHANNEL = 32
MAX_PLUGIN_PARAMETERS = 256

MODE_START = 0
MODE_MIX = 1
MODE_MIX_FOCUSED = 2
MODE_MIX_FOCUSED_2 = 3
MODE_PLUGIN = 4
MODE_TRACK_SELECT = 5
MODE_PLUGIN_ENABLE = 6
MODE_SMART = 7
MODE_PLUGIN_SELECT = 8
MODE_SWEEP = 9
MODE_TRANSPORT = 10

LEARN_MODE_DISABLED = 0
LEARN_MODE_ENABLED = 1
LEARN_MODE_END = 2

SWEEP_WAITING = 0
SWEEP_SYNC_1 = 1
SWEEP_SYNC_2 = 2
SWEEP_RUNNING_PENDING = 3
SWEEP_RUNNING = 4
SWEEP_COMPLETE = 5

NUM_PLUGIN_NAME_SLOTS = 15
SMART_MODE_PARAMS = 16

METER_LEVEL_YELLOW = 106
METER_LEVEL_RED = 120

-- controlID values
CONTROL_ID_KNOB_0 = 0
CONTROL_ID_KNOB_1 = CONTROL_ID_KNOB_0 + 1
CONTROL_ID_KNOB_2 = CONTROL_ID_KNOB_1 + 1
CONTROL_ID_KNOB_3 = CONTROL_ID_KNOB_2 + 1
CONTROL_ID_KNOB_4 = CONTROL_ID_KNOB_3 + 1
CONTROL_ID_KNOB_5 = CONTROL_ID_KNOB_4 + 1
CONTROL_ID_KNOB_6 = CONTROL_ID_KNOB_5 + 1
CONTROL_ID_KNOB_7 = CONTROL_ID_KNOB_6 + 1
CONTROL_ID_BUTTON_0 = CONTROL_ID_KNOB_7 + 1
CONTROL_ID_BUTTON_1 = CONTROL_ID_BUTTON_0 + 1
CONTROL_ID_BUTTON_2 = CONTROL_ID_BUTTON_1 + 1
CONTROL_ID_BUTTON_3 = CONTROL_ID_BUTTON_2 + 1
CONTROL_ID_BUTTON_4 = CONTROL_ID_BUTTON_3 + 1
CONTROL_ID_BUTTON_5 = CONTROL_ID_BUTTON_4 + 1
CONTROL_ID_BUTTON_6 = CONTROL_ID_BUTTON_5 + 1
CONTROL_ID_BUTTON_7 = CONTROL_ID_BUTTON_6 + 1
CONTROL_ID_BUTTON_8 = CONTROL_ID_BUTTON_7 + 1
CONTROL_ID_BUTTON_9 = CONTROL_ID_BUTTON_8 + 1
CONTROL_ID_BUTTON_10 = CONTROL_ID_BUTTON_9 + 1
CONTROL_ID_BUTTON_11 = CONTROL_ID_BUTTON_10 + 1
CONTROL_ID_BUTTON_12 = CONTROL_ID_BUTTON_11 + 1
CONTROL_ID_BUTTON_13 = CONTROL_ID_BUTTON_12 + 1
CONTROL_ID_BUTTON_14 = CONTROL_ID_BUTTON_13 + 1
CONTROL_ID_BUTTON_15 = CONTROL_ID_BUTTON_14 + 1
CONTROL_ID_PREV_PAGE = CONTROL_ID_BUTTON_15 + 1
CONTROL_ID_NEXT_PAGE = CONTROL_ID_PREV_PAGE + 1
CONTROL_ID_PLAY = CONTROL_ID_NEXT_PAGE + 1
CONTROL_ID_STOP = CONTROL_ID_PLAY + 1
CONTROL_ID_RECORD = CONTROL_ID_STOP + 1
CONTROL_ID_LOOP = CONTROL_ID_RECORD + 1
CONTROL_ID_PUNCH = CONTROL_ID_LOOP + 1
CONTROL_ID_REWIND = CONTROL_ID_PUNCH + 1
CONTROL_ID_FORWARD = CONTROL_ID_REWIND + 1
CONTROL_ID_SEL_VOLUME = CONTROL_ID_FORWARD + 1
CONTROL_ID_SEL_PAN = CONTROL_ID_SEL_VOLUME + 1
CONTROL_ID_SEL_SEND_0 = CONTROL_ID_SEL_PAN + 1
CONTROL_ID_SEL_SEND_1 = CONTROL_ID_SEL_SEND_0 + 1
CONTROL_ID_SEL_SEND_2 = CONTROL_ID_SEL_SEND_1 + 1
CONTROL_ID_SEL_SEND_3 = CONTROL_ID_SEL_SEND_2 + 1
CONTROL_ID_SEL_SEND_4 = CONTROL_ID_SEL_SEND_3 + 1
CONTROL_ID_SEL_SEND_5 = CONTROL_ID_SEL_SEND_4 + 1
CONTROL_ID_SEL_SEND_6 = CONTROL_ID_SEL_SEND_5 + 1
CONTROL_ID_SEL_SEND_7 = CONTROL_ID_SEL_SEND_6 + 1
CONTROL_ID_SEL_SEND_8 = CONTROL_ID_SEL_SEND_7 + 1
CONTROL_ID_SEL_SEND_9 = CONTROL_ID_SEL_SEND_8 + 1
CONTROL_ID_SEL_SEND_10 = CONTROL_ID_SEL_SEND_9 + 1
CONTROL_ID_SEL_SEND_11 = CONTROL_ID_SEL_SEND_10 + 1
CONTROL_ID_SEL_MUTE = CONTROL_ID_SEL_SEND_11 + 1
CONTROL_ID_SEL_SOLO = CONTROL_ID_SEL_MUTE + 1
CONTROL_ID_SEL_ARM_REC = CONTROL_ID_SEL_SOLO + 1
CONTROL_ID_SEL_IMPUT_MON = CONTROL_ID_SEL_ARM_REC + 1
CONTROL_ID_SEL_FOCUS = CONTROL_ID_SEL_IMPUT_MON + 1
CONTROL_ID_SEL_FOCUS_2 = CONTROL_ID_SEL_FOCUS + 1
CONTROL_ID_SEL_SMART = CONTROL_ID_SEL_FOCUS_2 + 1
CONTROL_ID_SEL_INSTRUMENT = CONTROL_ID_SEL_SMART + 1
CONTROL_ID_SEL_PLUGIN = CONTROL_ID_SEL_INSTRUMENT + 1
CONTROL_ID_SEL_INSTRUMENT_PARAMS = CONTROL_ID_SEL_PLUGIN + 1
CONTROL_ID_SEL_PLUGIN_PARAMS= CONTROL_ID_SEL_INSTRUMENT_PARAMS+ 1
CONTROL_ID_SEL_PLUGIN_EN = CONTROL_ID_SEL_PLUGIN_PARAMS + 1
CONTROL_ID_SEL_PLUGIN_SEL = CONTROL_ID_SEL_PLUGIN_EN + 1
CONTROL_ID_SEL_TRANSPORT = CONTROL_ID_SEL_PLUGIN_SEL + 1
CONTROL_ID_SEL_INSTRUMENT_SWEEP = CONTROL_ID_SEL_TRANSPORT + 1
CONTROL_ID_SEL_PLUGIN_SWEEP = CONTROL_ID_SEL_INSTRUMENT_SWEEP + 1
CONTROL_ID_SEL_PING = CONTROL_ID_SEL_PLUGIN_SWEEP + 1
CONTROL_ID_SEL_GLOBAL = CONTROL_ID_SEL_PING + 1
CONTROL_ID_TRACK_SEL_1 = CONTROL_ID_SEL_GLOBAL + 1
CONTROL_ID_TRACK_SEL_2 = CONTROL_ID_TRACK_SEL_1 + 1
CONTROL_ID_TRACK_SEL_3 = CONTROL_ID_TRACK_SEL_2 + 1
CONTROL_ID_TRACK_SEL_4 = CONTROL_ID_TRACK_SEL_3 + 1
CONTROL_ID_TRACK_SEL_5 = CONTROL_ID_TRACK_SEL_4 + 1
CONTROL_ID_TRACK_SEL_6 = CONTROL_ID_TRACK_SEL_5 + 1
CONTROL_ID_TRACK_SEL_7 = CONTROL_ID_TRACK_SEL_6 + 1
CONTROL_ID_TRACK_SEL_8 = CONTROL_ID_TRACK_SEL_7 + 1
CONTROL_ID_TRACK_TOGGLE = CONTROL_ID_TRACK_SEL_8 + 1
CONTROL_ID_PLUGIN_SLOT = CONTROL_ID_TRACK_TOGGLE + 1
CONTROL_ID_TOUCH_VALUE = CONTROL_ID_PLUGIN_SLOT + 1
CONTROL_ID_COLOR_0 = CONTROL_ID_TOUCH_VALUE + 1
CONTROL_ID_COLOR_1 = CONTROL_ID_COLOR_0 + 1
CONTROL_ID_COLOR_2 = CONTROL_ID_COLOR_1 + 1
CONTROL_ID_COLOR_3 = CONTROL_ID_COLOR_2 + 1
CONTROL_ID_COLOR_4 = CONTROL_ID_COLOR_3 + 1
CONTROL_ID_COLOR_5 = CONTROL_ID_COLOR_4 + 1
CONTROL_ID_COLOR_6 = CONTROL_ID_COLOR_5 + 1
CONTROL_ID_COLOR_7 = CONTROL_ID_COLOR_6 + 1
CONTROL_ID_SELECTED_TRACK = CONTROL_ID_COLOR_7 + 1
CONTROL_ID_PING_RESPONSE = CONTROL_ID_SELECTED_TRACK + 1
CONTROL_ID_PLUGIN_NAME = CONTROL_ID_PING_RESPONSE + 1
CONTROL_ID_PLUGIN_PARAMETER_COUNT = CONTROL_ID_PLUGIN_NAME + 1
CONTROL_ID_INSTRUMENT_NAME = CONTROL_ID_PLUGIN_PARAMETER_COUNT + 1
CONTROL_ID_INSTRUMENT_PARAMETER_COUNT = CONTROL_ID_INSTRUMENT_NAME + 1
CONTROL_ID_SEL_NULL_KNOBS = CONTROL_ID_INSTRUMENT_PARAMETER_COUNT+ 1
CONTROL_ID_SEL_NULL_BUTTONS = CONTROL_ID_SEL_NULL_KNOBS+ 1
CONTROL_ID_SEL_TOUCH_VALUE = CONTROL_ID_SEL_NULL_BUTTONS + 1
CONTROL_ID_METER_0 = CONTROL_ID_SEL_TOUCH_VALUE + 1
CONTROL_ID_METER_1 = CONTROL_ID_METER_0 + 1
CONTROL_ID_METER_2 = CONTROL_ID_METER_1 + 1
CONTROL_ID_METER_3 = CONTROL_ID_METER_2 + 1
CONTROL_ID_METER_4 = CONTROL_ID_METER_3 + 1
CONTROL_ID_METER_5 = CONTROL_ID_METER_4 + 1
CONTROL_ID_METER_6 = CONTROL_ID_METER_5 + 1
CONTROL_ID_METER_7 = CONTROL_ID_METER_6 + 1
CONTROL_ID_METER_8 = CONTROL_ID_METER_7 + 1
CONTROL_ID_METER_9 = CONTROL_ID_METER_8 + 1
CONTROL_ID_METER_10 = CONTROL_ID_METER_9 + 1
CONTROL_ID_METER_11 = CONTROL_ID_METER_10 + 1
CONTROL_ID_METER_12 = CONTROL_ID_METER_11 + 1
CONTROL_ID_METER_13 = CONTROL_ID_METER_12 + 1
CONTROL_ID_METER_14 = CONTROL_ID_METER_13 + 1
CONTROL_ID_METER_15 = CONTROL_ID_METER_14 + 1
CONTROL_ID_PLUGIN_NAME_0 = CONTROL_ID_METER_15 + 1

-- NOTE: CONTROL_ID_PLUGIN_0 must be the last control ID so we can dynamically build
-- the controls table when initialising.
CONTROL_ID_PLUGIN_0 = CONTROL_ID_PLUGIN_NAME_0 + NUM_PLUGIN_NAME_SLOTS

-- Colours:
COLOR_TRACK_LABEL = 22
COLOR_PLUGIN_LABEL = 21

-- Globals
midi_out_enabled = false
current_mode = MODE_START
cached_color = 0
selected_plugin = 0
slected_plugin_parameter_count = 0
learn_mode = LEARN_MODE_DISABLED
plugin_parameter_names = {}
last_learned_plugin_parameter_name = ''
last_learned_param_index = 0
parameter_sweep_count = 0
last_parameter_sweep_value = ''
parameter_sweep_table = {}
parameter_sweep_state = SWEEP_WAITING
parameter_sweep_complete = false
parameter_sweep_start = false
parameter_sweep_respond = false
parameter_sweep_value = -1
prev_current_value = 0
cached_current_value = 0
plugin_learn_restart = false
parameter_sweep_value_change= -1
small_step_counter = 0
cached_param_sweep_current_value = 0
filter_plugin_pos = false
filter_instrument_name = false
filter_track_name = true
plugin_position_filter = {}
plugin_value_filter = {}
instrument_mode = true
popup_lock = false
plugin_name_cached = nil
selected_track_index_cached = nil
selected_track_name_cached = nil
track_names_cached = {}
display_color_cached = {}
display_color_filter = {}
plaugin_values_cached = {}
mix_values_cached = {}
plugin_last_touched_index = nil
plugin_last_button_index = nil

-- MIDI Mapping
MIDI_CHANNELS = {
    DEFAULT = 0xBF,
    PLUGIN_END = 0xBE,
    PLUGIN_START = 0xB7,
    COMMAND = 0xB6,
}

MIDI_CC = {
    KNOB_0 = 0x0C,
    MIX_TOUCH_0 = 0x34,
    PLUGIN_TOUCH_0 = 0x40,
    BUTTON_0 = 0x14,
    BUTTON_8 = 0x3E,
    BUTTON_LEFT = 0x3C,
    TRANSPORT_0 = 0x1C,
    METERS_0 = 0x41,
}

MIXER_VOLUME_COMMAND = 0x51
MIXER_PAN_COMMAND = MIXER_VOLUME_COMMAND + 1
MIXER_SEND_0_COMMAND = MIXER_PAN_COMMAND + 1
MIXER_MUTE_COMMAND = MIXER_SEND_0_COMMAND + MAX_SENDS
MIXER_SOLO_COMMAND = MIXER_MUTE_COMMAND + 1
MIXER_ARM_COMMAND = MIXER_SOLO_COMMAND + 1
MIXER_INPUT_MON_COMMAND = MIXER_ARM_COMMAND + 1
FOCUS_COMMAND = MIXER_INPUT_MON_COMMAND + 1
SMART_COMMAND = FOCUS_COMMAND + 1
PLUGIN_COMMAND = SMART_COMMAND + 1
PLUGIN_SLOT_COMMAND = PLUGIN_COMMAND + 1
INSTRUMENT_COMMAND = PLUGIN_SLOT_COMMAND + 1
PLUGIN_ENABLE_COMMAND = INSTRUMENT_COMMAND + 1
PLUGIN_SELECT_COMMAND = PLUGIN_ENABLE_COMMAND + 1
INSTRUMENT_PARAMS_COMMAND = PLUGIN_SELECT_COMMAND + 1
PLUGIN_PARAMS_COMMAND = INSTRUMENT_PARAMS_COMMAND + 1
TRANSPORT_COMMAND = PLUGIN_PARAMS_COMMAND  + 1
TRACK_1_SELECT_COMMAND = TRANSPORT_COMMAND + 1
TRACK_2_SELECT_COMMAND = TRACK_1_SELECT_COMMAND + 1
TRACK_3_SELECT_COMMAND = TRACK_2_SELECT_COMMAND + 1
TRACK_4_SELECT_COMMAND = TRACK_3_SELECT_COMMAND + 1
TRACK_5_SELECT_COMMAND = TRACK_4_SELECT_COMMAND + 1
TRACK_6_SELECT_COMMAND = TRACK_5_SELECT_COMMAND + 1
TRACK_7_SELECT_COMMAND = TRACK_6_SELECT_COMMAND + 1
TRACK_8_SELECT_COMMAND = TRACK_7_SELECT_COMMAND + 1
TRACK_TOGGLE_COMMAND = TRACK_8_SELECT_COMMAND + 1
FOCUS_2_COMMAND = TRACK_TOGGLE_COMMAND + 1
INSTRUMENT_SWEEP_COMMAND = FOCUS_2_COMMAND + 1
PLUGIN_SWEEP_COMMAND = INSTRUMENT_SWEEP_COMMAND + 1
PING_COMMAND = PLUGIN_SWEEP_COMMAND + 1
GLOBAL_COMMAND = PING_COMMAND + 1
NULL_KNOB_COMMAND = GLOBAL_COMMAND + 1
NULL_BUTTON_COMMAND = NULL_KNOB_COMMAND + 1
TOUCH_VALUE_COMMAND = NULL_BUTTON_COMMAND + 1


controls = {
    [CONTROL_ID_KNOB_0] = { name='Knob 1', controlID=CONTROL_ID_KNOB_0, label='Knob 1', objectType='Knob', midi={MIDI_CHANNELS.DEFAULT,MIDI_CC.KNOB_0,MIDI_MSB,MIDI_CHANNELS.DEFAULT,MIDI_CC.KNOB_0 + 0x20,MIDI_LSB}, midiTouched={MIDI_CHANNELS.DEFAULT,MIDI_CC.MIX_TOUCH_0,MIDI_LSB}, inport='Roto-Control', outport='Roto-Control', textFeedback=true, selfFeedback=true },
    [CONTROL_ID_KNOB_1] = { name='Knob 2', controlID=CONTROL_ID_KNOB_1, label='Knob 2', objectType='Knob', midi={MIDI_CHANNELS.DEFAULT,MIDI_CC.KNOB_0 + 1,MIDI_MSB,MIDI_CHANNELS.DEFAULT,MIDI_CC.KNOB_0 + 0x20 + 1,MIDI_LSB}, midiTouched={MIDI_CHANNELS.DEFAULT,MIDI_CC.MIX_TOUCH_0 + 1,MIDI_LSB}, inport='Roto-Control', outport='Roto-Control', textFeedback=true, selfFeedback=true },
    [CONTROL_ID_KNOB_2] = { name='Knob 3', controlID=CONTROL_ID_KNOB_2, label='Knob 3', objectType='Knob', midi={MIDI_CHANNELS.DEFAULT,MIDI_CC.KNOB_0 + 2,MIDI_MSB,MIDI_CHANNELS.DEFAULT,MIDI_CC.KNOB_0 + 0x20 + 2,MIDI_LSB}, midiTouched={MIDI_CHANNELS.DEFAULT,MIDI_CC.MIX_TOUCH_0 + 2,MIDI_LSB}, inport='Roto-Control', outport='Roto-Control', textFeedback=true, selfFeedback=true },
    [CONTROL_ID_KNOB_3] = { name='Knob 4', controlID=CONTROL_ID_KNOB_3, label='Knob 4', objectType='Knob', midi={MIDI_CHANNELS.DEFAULT,MIDI_CC.KNOB_0 + 3,MIDI_MSB,MIDI_CHANNELS.DEFAULT,MIDI_CC.KNOB_0 + 0x20 + 3,MIDI_LSB}, midiTouched={MIDI_CHANNELS.DEFAULT,MIDI_CC.MIX_TOUCH_0 + 3,MIDI_LSB}, inport='Roto-Control', outport='Roto-Control', textFeedback=true, selfFeedback=true },
    [CONTROL_ID_KNOB_4] = { name='Knob 5', controlID=CONTROL_ID_KNOB_4, label='Knob 5', objectType='Knob', midi={MIDI_CHANNELS.DEFAULT,MIDI_CC.KNOB_0 + 4,MIDI_MSB,MIDI_CHANNELS.DEFAULT,MIDI_CC.KNOB_0 + 0x20 + 4,MIDI_LSB}, midiTouched={MIDI_CHANNELS.DEFAULT,MIDI_CC.MIX_TOUCH_0 + 4,MIDI_LSB}, inport='Roto-Control', outport='Roto-Control', textFeedback=true, selfFeedback=true },
    [CONTROL_ID_KNOB_5] = { name='Knob 6', controlID=CONTROL_ID_KNOB_5, label='Knob 6', objectType='Knob', midi={MIDI_CHANNELS.DEFAULT,MIDI_CC.KNOB_0 + 5,MIDI_MSB,MIDI_CHANNELS.DEFAULT,MIDI_CC.KNOB_0 + 0x20 + 5,MIDI_LSB}, midiTouched={MIDI_CHANNELS.DEFAULT,MIDI_CC.MIX_TOUCH_0 + 5,MIDI_LSB}, inport='Roto-Control', outport='Roto-Control', textFeedback=true, selfFeedback=true },
    [CONTROL_ID_KNOB_6] = { name='Knob 7', controlID=CONTROL_ID_KNOB_6, label='Knob 7', objectType='Knob', midi={MIDI_CHANNELS.DEFAULT,MIDI_CC.KNOB_0 + 6,MIDI_MSB,MIDI_CHANNELS.DEFAULT,MIDI_CC.KNOB_0 + 0x20 + 6,MIDI_LSB}, midiTouched={MIDI_CHANNELS.DEFAULT,MIDI_CC.MIX_TOUCH_0 + 6,MIDI_LSB}, inport='Roto-Control', outport='Roto-Control', textFeedback=true, selfFeedback=true },
    [CONTROL_ID_KNOB_7] = { name='Knob 8', controlID=CONTROL_ID_KNOB_7, label='Knob 8', objectType='Knob', midi={MIDI_CHANNELS.DEFAULT,MIDI_CC.KNOB_0 + 7,MIDI_MSB,MIDI_CHANNELS.DEFAULT,MIDI_CC.KNOB_0 + 0x20 + 7,MIDI_LSB}, midiTouched={MIDI_CHANNELS.DEFAULT,MIDI_CC.MIX_TOUCH_0 + 7,MIDI_LSB}, inport='Roto-Control', outport='Roto-Control', textFeedback=true, selfFeedback=true },
    [CONTROL_ID_BUTTON_0] = { name='Button 1', controlID=CONTROL_ID_BUTTON_0, label='Button 1', objectType='Button', midi={MIDI_CHANNELS.DEFAULT,MIDI_CC.BUTTON_0,MIDI_LSB}, inport='Roto-Control', outport='Roto-Control', textFeedback=true, selfFeedback=true },
    [CONTROL_ID_BUTTON_1] = { name='Button 2', controlID=CONTROL_ID_BUTTON_1, label='Button 2', objectType='Button', midi={MIDI_CHANNELS.DEFAULT,MIDI_CC.BUTTON_0 + 1,MIDI_LSB}, inport='Roto-Control', outport='Roto-Control', textFeedback=true, selfFeedback=true },
    [CONTROL_ID_BUTTON_2] = { name='Button 3', controlID=CONTROL_ID_BUTTON_2, label='Button 3', objectType='Button', midi={MIDI_CHANNELS.DEFAULT,MIDI_CC.BUTTON_0 + 2,MIDI_LSB}, inport='Roto-Control', outport='Roto-Control', textFeedback=true, selfFeedback=true },
    [CONTROL_ID_BUTTON_3] = { name='Button 4', controlID=CONTROL_ID_BUTTON_3, label='Button 4', objectType='Button', midi={MIDI_CHANNELS.DEFAULT,MIDI_CC.BUTTON_0 + 3,MIDI_LSB}, inport='Roto-Control', outport='Roto-Control', textFeedback=true, selfFeedback=true },
    [CONTROL_ID_BUTTON_4] = { name='Button 5', controlID=CONTROL_ID_BUTTON_4, label='Button 5', objectType='Button', midi={MIDI_CHANNELS.DEFAULT,MIDI_CC.BUTTON_0 + 4,MIDI_LSB}, inport='Roto-Control', outport='Roto-Control', textFeedback=true, selfFeedback=true },
    [CONTROL_ID_BUTTON_5] = { name='Button 6', controlID=CONTROL_ID_BUTTON_5, label='Button 6', objectType='Button', midi={MIDI_CHANNELS.DEFAULT,MIDI_CC.BUTTON_0 + 5,MIDI_LSB}, inport='Roto-Control', outport='Roto-Control', textFeedback=true, selfFeedback=true },
    [CONTROL_ID_BUTTON_6] = { name='Button 7', controlID=CONTROL_ID_BUTTON_6, label='Button 7', objectType='Button', midi={MIDI_CHANNELS.DEFAULT,MIDI_CC.BUTTON_0 + 6,MIDI_LSB}, inport='Roto-Control', outport='Roto-Control', textFeedback=true, selfFeedback=true },
    [CONTROL_ID_BUTTON_7] = { name='Button 8', controlID=CONTROL_ID_BUTTON_7, label='Button 8', objectType='Button', midi={MIDI_CHANNELS.DEFAULT,MIDI_CC.BUTTON_0 + 7,MIDI_LSB}, inport='Roto-Control', outport='Roto-Control', textFeedback=true, selfFeedback=true },
    [CONTROL_ID_BUTTON_8] = { name='Button 9', controlID=CONTROL_ID_BUTTON_8, label='Button 9', objectType='Button', midi={MIDI_CHANNELS.DEFAULT,MIDI_CC.BUTTON_8,MIDI_LSB}, inport='Roto-Control', outport='Roto-Control', textFeedback=true, selfFeedback=true },
    [CONTROL_ID_BUTTON_9] = { name='Button 10', controlID=CONTROL_ID_BUTTON_9, label='Button 10', objectType='Button', midi={MIDI_CHANNELS.DEFAULT,MIDI_CC.BUTTON_8 + 1,MIDI_LSB}, inport='Roto-Control', outport='Roto-Control', textFeedback=true, selfFeedback=true },
    [CONTROL_ID_BUTTON_10] = { name='Button 11', controlID=CONTROL_ID_BUTTON_10, label='Button 11', objectType='Button', midi={MIDI_CHANNELS.DEFAULT,MIDI_CC.BUTTON_8 + 2,MIDI_LSB}, inport='Roto-Control', outport='Roto-Control', textFeedback=true, selfFeedback=true },
    [CONTROL_ID_BUTTON_11] = { name='Button 12', controlID=CONTROL_ID_BUTTON_11, label='Button 12', objectType='Button', midi={MIDI_CHANNELS.DEFAULT,MIDI_CC.BUTTON_8 + 3,MIDI_LSB}, inport='Roto-Control', outport='Roto-Control', textFeedback=true, selfFeedback=true },
    [CONTROL_ID_BUTTON_12] = { name='Button 13', controlID=CONTROL_ID_BUTTON_12, label='Button 13', objectType='Button', midi={MIDI_CHANNELS.DEFAULT,MIDI_CC.BUTTON_8 + 4,MIDI_LSB}, inport='Roto-Control', outport='Roto-Control', textFeedback=true, selfFeedback=true },
    [CONTROL_ID_BUTTON_13] = { name='Button 14', controlID=CONTROL_ID_BUTTON_13, label='Button 14', objectType='Button', midi={MIDI_CHANNELS.DEFAULT,MIDI_CC.BUTTON_8 + 5,MIDI_LSB}, inport='Roto-Control', outport='Roto-Control', textFeedback=true, selfFeedback=true },
    [CONTROL_ID_BUTTON_14] = { name='Button 15', controlID=CONTROL_ID_BUTTON_14, label='Button 15', objectType='Button', midi={MIDI_CHANNELS.DEFAULT,MIDI_CC.BUTTON_8 + 6,MIDI_LSB}, inport='Roto-Control', outport='Roto-Control', textFeedback=true, selfFeedback=true },
    [CONTROL_ID_BUTTON_15] = { name='Button 16', controlID=CONTROL_ID_BUTTON_15, label='Button 16', objectType='Button', midi={MIDI_CHANNELS.DEFAULT,MIDI_CC.BUTTON_8 + 7,MIDI_LSB}, inport='Roto-Control', outport='Roto-Control', textFeedback=true, selfFeedback=true },
    [CONTROL_ID_PREV_PAGE] = { name='Prev Page', label='Prev Page', objectType='Button', midi={MIDI_CHANNELS.DEFAULT,MIDI_CC.BUTTON_LEFT,MIDI_LSB}, inport='Roto-Control', outport='Roto-Control', textFeedback=false, selfFeedback=false },
    [CONTROL_ID_NEXT_PAGE] = { name='Next Page', label='Next Page', objectType='Button', midi={MIDI_CHANNELS.DEFAULT,MIDI_CC.BUTTON_LEFT + 1,MIDI_LSB}, inport='Roto-Control', outport='Roto-Control', textFeedback=false, selfFeedback=false },
    [CONTROL_ID_PLAY] = { name='Play', controlID=CONTROL_ID_PLAY, label='Play', objectType='Button', midi={MIDI_CHANNELS.DEFAULT,MIDI_CC.TRANSPORT_0,MIDI_LSB}, inport='Roto-Control', outport='Roto-Control', textFeedback=false, selfFeedback=true },
    [CONTROL_ID_STOP] = { name='Stop', controlID=CONTROL_ID_STOP, label='Stop', objectType='Button', midi={MIDI_CHANNELS.DEFAULT,MIDI_CC.TRANSPORT_0 + 1,MIDI_LSB}, inport='Roto-Control', outport='Roto-Control', textFeedback=false, selfFeedback=true },
    [CONTROL_ID_RECORD] = { name='Record', controlID=CONTROL_ID_RECORD, label='Record', objectType='Button', midi={MIDI_CHANNELS.DEFAULT,MIDI_CC.TRANSPORT_0 + 2,MIDI_LSB}, inport='Roto-Control', outport='Roto-Control', textFeedback=false, selfFeedback=true },
    [CONTROL_ID_LOOP] = { name='Loop', controlID=CONTROL_ID_LOOP, label='Loop', objectType='Button', midi={MIDI_CHANNELS.DEFAULT,MIDI_CC.TRANSPORT_0 + 3,MIDI_LSB}, inport='Roto-Control', outport='Roto-Control', textFeedback=false, selfFeedback=true },
    [CONTROL_ID_PUNCH] = { name='Punch', controlID=CONTROL_ID_PUNCH, label='Punch', objectType='Button', midi={MIDI_CHANNELS.DEFAULT,MIDI_CC.TRANSPORT_0 + 4,MIDI_LSB}, inport='Roto-Control', outport='Roto-Control', textFeedback=false, selfFeedback=true },
    [CONTROL_ID_REWIND] = { name='Rewind', label='Rewind', objectType='Button', midi={MIDI_CHANNELS.DEFAULT,MIDI_CC.TRANSPORT_0 + 8,MIDI_LSB}, inport='Roto-Control', outport='Roto-Control', textFeedback=false, selfFeedback=false },
    [CONTROL_ID_FORWARD] = { name='Forward', label='Forward', objectType='Button', midi={MIDI_CHANNELS.DEFAULT,MIDI_CC.TRANSPORT_0 + 9,MIDI_LSB}, inport='Roto-Control', outport='Roto-Control', textFeedback=false, selfFeedback=false },
    [CONTROL_ID_METER_0] = { name='Meter 1 Left', controlID=CONTROL_ID_METER_0, midi={MIDI_CHANNELS.DEFAULT,MIDI_CC.METERS_0 + 0,MIDI_LSB}, inport='Roto-Control', outport='Roto-Control' },
    [CONTROL_ID_METER_1] = { name='Meter 1 Right', controlID=CONTROL_ID_METER_1, midi={MIDI_CHANNELS.DEFAULT,MIDI_CC.METERS_0 + 1,MIDI_LSB}, inport='Roto-Control', outport='Roto-Control' },
    [CONTROL_ID_METER_2] = { name='Meter 2 Left', controlID=CONTROL_ID_METER_2, midi={MIDI_CHANNELS.DEFAULT,MIDI_CC.METERS_0 + 2,MIDI_LSB}, inport='Roto-Control', outport='Roto-Control' },
    [CONTROL_ID_METER_3] = { name='Meter 2 Right', controlID=CONTROL_ID_METER_3, midi={MIDI_CHANNELS.DEFAULT,MIDI_CC.METERS_0 + 3,MIDI_LSB}, inport='Roto-Control', outport='Roto-Control' },
    [CONTROL_ID_METER_4] = { name='Meter 3 Left', controlID=CONTROL_ID_METER_4, midi={MIDI_CHANNELS.DEFAULT,MIDI_CC.METERS_0 + 4,MIDI_LSB}, inport='Roto-Control', outport='Roto-Control' },
    [CONTROL_ID_METER_5] = { name='Meter 3 Right', controlID=CONTROL_ID_METER_5, midi={MIDI_CHANNELS.DEFAULT,MIDI_CC.METERS_0 + 5,MIDI_LSB}, inport='Roto-Control', outport='Roto-Control' },
    [CONTROL_ID_METER_6] = { name='Meter 4 Left', controlID=CONTROL_ID_METER_6, midi={MIDI_CHANNELS.DEFAULT,MIDI_CC.METERS_0 + 6,MIDI_LSB}, inport='Roto-Control', outport='Roto-Control' },
    [CONTROL_ID_METER_7] = { name='Meter 4 Right', controlID=CONTROL_ID_METER_7, midi={MIDI_CHANNELS.DEFAULT,MIDI_CC.METERS_0 + 7,MIDI_LSB}, inport='Roto-Control', outport='Roto-Control' },
    [CONTROL_ID_METER_8] = { name='Meter 5 Left', controlID=CONTROL_ID_METER_8, midi={MIDI_CHANNELS.DEFAULT,MIDI_CC.METERS_0 + 8,MIDI_LSB}, inport='Roto-Control', outport='Roto-Control' },
    [CONTROL_ID_METER_9] = { name='Meter 5 Right', controlID=CONTROL_ID_METER_9, midi={MIDI_CHANNELS.DEFAULT,MIDI_CC.METERS_0 + 9,MIDI_LSB}, inport='Roto-Control', outport='Roto-Control' },
    [CONTROL_ID_METER_10] = { name='Meter 6 Left', controlID=CONTROL_ID_METER_10, midi={MIDI_CHANNELS.DEFAULT,MIDI_CC.METERS_0 + 10,MIDI_LSB}, inport='Roto-Control', outport='Roto-Control' },
    [CONTROL_ID_METER_11] = { name='Meter 6 Right', controlID=CONTROL_ID_METER_11, midi={MIDI_CHANNELS.DEFAULT,MIDI_CC.METERS_0 + 11,MIDI_LSB}, inport='Roto-Control', outport='Roto-Control' },
    [CONTROL_ID_METER_12] = { name='Meter 7 Left', controlID=CONTROL_ID_METER_12, midi={MIDI_CHANNELS.DEFAULT,MIDI_CC.METERS_0 + 12,MIDI_LSB}, inport='Roto-Control', outport='Roto-Control' },
    [CONTROL_ID_METER_13] = { name='Meter 7 Right', controlID=CONTROL_ID_METER_13, midi={MIDI_CHANNELS.DEFAULT,MIDI_CC.METERS_0 + 13,MIDI_LSB}, inport='Roto-Control', outport='Roto-Control' },
    [CONTROL_ID_METER_14] = { name='Meter 8 Left', controlID=CONTROL_ID_METER_14, midi={MIDI_CHANNELS.DEFAULT,MIDI_CC.METERS_0 + 14,MIDI_LSB}, inport='Roto-Control', outport='Roto-Control' },
    [CONTROL_ID_METER_15] = { name='Meter 8 Right', controlID=CONTROL_ID_METER_15, midi={MIDI_CHANNELS.DEFAULT,MIDI_CC.METERS_0 + 15,MIDI_LSB}, inport='Roto-Control', outport='Roto-Control' },
    [CONTROL_ID_SEL_VOLUME] = { name='SEL Volume', label='Mixer Volume', midi={MIDI_CHANNELS.COMMAND,MIXER_VOLUME_COMMAND,0x01}, inport='Roto-Control', outport='Roto-Control', textFeedback=false, selfFeedback=false },
    [CONTROL_ID_SEL_PAN] = { name='SEL Pan', label='Mixer Pan', midi={MIDI_CHANNELS.COMMAND,MIXER_PAN_COMMAND,0x01}, inport='Roto-Control', outport='Roto-Control', textFeedback=false, selfFeedback=false },
    [CONTROL_ID_SEL_MUTE] = { name='SEL Mute', label='Mute', midi={MIDI_CHANNELS.COMMAND,MIXER_MUTE_COMMAND,0x01}, inport='Roto-Control', outport='Roto-Control', textFeedback=false, selfFeedback=false },
    [CONTROL_ID_SEL_SOLO] = { name='SEL Solo', label='Solo', midi={MIDI_CHANNELS.COMMAND,MIXER_SOLO_COMMAND,0x01}, inport='Roto-Control', outport='Roto-Control', textFeedback=false, selfFeedback=false },
    [CONTROL_ID_SEL_ARM_REC] = { name='SEL Arm Rec', label='Record Enable', midi={MIDI_CHANNELS.COMMAND,MIXER_ARM_COMMAND,0x01}, inport='Roto-Control', outport='Roto-Control', textFeedback=false, selfFeedback=false },
    [CONTROL_ID_SEL_IMPUT_MON] = { name='SEL Input Mon', label='Input Monitoring', midi={MIDI_CHANNELS.COMMAND,MIXER_INPUT_MON_COMMAND,0x01}, inport='Roto-Control', outport='Roto-Control', textFeedback=false, selfFeedback=false },
    [CONTROL_ID_SEL_FOCUS] = { name='SEL Focus', label='Focus', midi={MIDI_CHANNELS.COMMAND,FOCUS_COMMAND,0x01}, inport='Roto-Control', outport='Roto-Control', textFeedback=false, selfFeedback=false },
    [CONTROL_ID_SEL_FOCUS_2] = { name='SEL Focus 2', label='Focus 2', midi={MIDI_CHANNELS.COMMAND,FOCUS_2_COMMAND,0x01}, inport='Roto-Control', outport='Roto-Control', textFeedback=false, selfFeedback=false },
    [CONTROL_ID_SEL_SMART] = { name='SEL Smart', label='Smart', midi={MIDI_CHANNELS.COMMAND,SMART_COMMAND,0x01}, inport='Roto-Control', outport='Roto-Control', textFeedback=false, selfFeedback=false },
    [CONTROL_ID_SEL_INSTRUMENT] = { name='SEL Instrument', label='Instrument', midi={MIDI_CHANNELS.COMMAND,INSTRUMENT_COMMAND,0x01}, inport='Roto-Control', outport='Roto-Control', textFeedback=false, selfFeedback=false },
    [CONTROL_ID_SEL_PLUGIN] = { name='SEL Plugin', label='Plugin', midi={MIDI_CHANNELS.COMMAND,PLUGIN_COMMAND,0x01}, inport='Roto-Control', outport='Roto-Control', textFeedback=false, selfFeedback=false },
    [CONTROL_ID_SEL_INSTRUMENT_PARAMS] = { name='SEL Instrument Params', label='Instrument Params', midi={MIDI_CHANNELS.COMMAND,INSTRUMENT_PARAMS_COMMAND,0x01}, inport='Roto-Control', outport='Roto-Control', textFeedback=false, selfFeedback=false },
    [CONTROL_ID_SEL_PLUGIN_PARAMS] = { name='SEL Plugin Params', label='Plugin Params', midi={MIDI_CHANNELS.COMMAND,PLUGIN_PARAMS_COMMAND,0x01}, inport='Roto-Control', outport='Roto-Control', textFeedback=false, selfFeedback=false },
    [CONTROL_ID_SEL_PLUGIN_EN] = { name='SEL Plugin Enable', label='Plugin Enable', midi={MIDI_CHANNELS.COMMAND,PLUGIN_ENABLE_COMMAND,0x01}, inport='Roto-Control', outport='Roto-Control', textFeedback=false, selfFeedback=false },
    [CONTROL_ID_SEL_PLUGIN_SEL] = { name='SEL Plugin Select', label='Plugin Select', midi={MIDI_CHANNELS.COMMAND,PLUGIN_SELECT_COMMAND,0x01}, inport='Roto-Control', outport='Roto-Control', textFeedback=false, selfFeedback=false },
    [CONTROL_ID_SEL_TRANSPORT] = { name='SEL Transport', label='Transport Select', midi={MIDI_CHANNELS.COMMAND,TRANSPORT_COMMAND,0x01}, inport='Roto-Control', outport='Roto-Control', textFeedback=false, selfFeedback=false },
    [CONTROL_ID_SEL_INSTRUMENT_SWEEP] = { name='SEL Instrument Sweep', label='Instrument Sweep Select', midi={MIDI_CHANNELS.COMMAND,INSTRUMENT_SWEEP_COMMAND,0x01}, inport='Roto-Control', outport='Roto-Control', textFeedback=false, selfFeedback=false },
    [CONTROL_ID_SEL_PLUGIN_SWEEP] = { name='SEL Plugin Sweep', label='Plugin Sweep Select', midi={MIDI_CHANNELS.COMMAND,PLUGIN_SWEEP_COMMAND,0x01}, inport='Roto-Control', outport='Roto-Control', textFeedback=false, selfFeedback=false },
    [CONTROL_ID_SEL_PING] = { name='SEL Ping', label='Roto Aux', midi={MIDI_CHANNELS.COMMAND,PING_COMMAND,0x01}, inport='Roto-Control', outport='Roto-Control', textFeedback=false, selfFeedback=false },
    [CONTROL_ID_SEL_GLOBAL] = { name='SEL Global', label='Roto Aux', midi={MIDI_CHANNELS.COMMAND,GLOBAL_COMMAND,0x01}, inport='Roto-Control', outport='Roto-Control', textFeedback=false, selfFeedback=false },
    [CONTROL_ID_TRACK_SEL_1] = { name='Track Select 1', label='Track Select 1', midi={MIDI_CHANNELS.COMMAND,TRACK_1_SELECT_COMMAND,0x01}, inport='Roto-Control', outport='Roto-Control', textFeedback=false, selfFeedback=false },
    [CONTROL_ID_TRACK_SEL_2] = { name='Track Select 2', label='Track Select 2', midi={MIDI_CHANNELS.COMMAND,TRACK_2_SELECT_COMMAND,0x01}, inport='Roto-Control', outport='Roto-Control', textFeedback=false, selfFeedback=false },
    [CONTROL_ID_TRACK_SEL_3] = { name='Track Select 3', label='Track Select 3', midi={MIDI_CHANNELS.COMMAND,TRACK_3_SELECT_COMMAND,0x01}, inport='Roto-Control', outport='Roto-Control', textFeedback=false, selfFeedback=false },
    [CONTROL_ID_TRACK_SEL_4] = { name='Track Select 4', label='Track Select 4', midi={MIDI_CHANNELS.COMMAND,TRACK_4_SELECT_COMMAND,0x01}, inport='Roto-Control', outport='Roto-Control', textFeedback=false, selfFeedback=false },
    [CONTROL_ID_TRACK_SEL_5] = { name='Track Select 5', label='Track Select 5', midi={MIDI_CHANNELS.COMMAND,TRACK_5_SELECT_COMMAND,0x01}, inport='Roto-Control', outport='Roto-Control', textFeedback=false, selfFeedback=false },
    [CONTROL_ID_TRACK_SEL_6] = { name='Track Select 6', label='Track Select 6', midi={MIDI_CHANNELS.COMMAND,TRACK_6_SELECT_COMMAND,0x01}, inport='Roto-Control', outport='Roto-Control', textFeedback=false, selfFeedback=false },
    [CONTROL_ID_TRACK_SEL_7] = { name='Track Select 7', label='Track Select 7', midi={MIDI_CHANNELS.COMMAND,TRACK_7_SELECT_COMMAND,0x01}, inport='Roto-Control', outport='Roto-Control', textFeedback=false, selfFeedback=false },
    [CONTROL_ID_TRACK_SEL_8] = { name='Track Select 8', label='Track Select 8', midi={MIDI_CHANNELS.COMMAND,TRACK_8_SELECT_COMMAND,0x01}, inport='Roto-Control', outport='Roto-Control', textFeedback=false, selfFeedback=false },
    [CONTROL_ID_TRACK_TOGGLE] = { name='Track Stack', label='Track Stack', midi={MIDI_CHANNELS.COMMAND,TRACK_TOGGLE_COMMAND,0x01}, inport='Roto-Control', outport='Roto-Control', textFeedback=false, selfFeedback=false },
    [CONTROL_ID_PLUGIN_SLOT] = { name='Plugin Slot', label='Plugin Slot',controlID=CONTROL_ID_PLUGIN_SLOT, midi={MIDI_CHANNELS.COMMAND,PLUGIN_SLOT_COMMAND,MIDI_LSB} },
    [CONTROL_ID_SEL_TOUCH_VALUE] = { name='SEL Touch Value', label='Touch Value', midi={MIDI_CHANNELS.COMMAND,TOUCH_VALUE_COMMAND,0x01}, inport='Roto-Control', outport='Roto-Control', textFeedback=false, selfFeedback=false },
    [CONTROL_ID_SEL_NULL_KNOBS] = { name='SEL Unmapped Knob', label='Unmapped Knob', midi={MIDI_CHANNELS.COMMAND,NULL_KNOB_COMMAND,0x01}, textFeedback=false, selfFeedback=false },
    [CONTROL_ID_SEL_NULL_BUTTONS] = { name='SEL Unmapped Button', label='Unmapped Button', midi={MIDI_CHANNELS.COMMAND,NULL_BUTTON_COMMAND,0x01}, textFeedback=false, selfFeedback=false },
    -- Dummy controls
    [CONTROL_ID_COLOR_0] = { name='Display Color 1', controlID=CONTROL_ID_COLOR_0, label='Display Color 1', inport='Roto-Control', outport='Roto-Control' },
    [CONTROL_ID_COLOR_1] = { name='Display Color 2', controlID=CONTROL_ID_COLOR_1, label='Display Color 2', inport='Roto-Control', outport='Roto-Control' },
    [CONTROL_ID_COLOR_2] = { name='Display Color 3', controlID=CONTROL_ID_COLOR_2, label='Display Color 3', inport='Roto-Control', outport='Roto-Control' },
    [CONTROL_ID_COLOR_3] = { name='Display Color 4', controlID=CONTROL_ID_COLOR_3, label='Display Color 4', inport='Roto-Control', outport='Roto-Control' },
    [CONTROL_ID_COLOR_4] = { name='Display Color 5', controlID=CONTROL_ID_COLOR_4, label='Display Color 5', inport='Roto-Control', outport='Roto-Control' },
    [CONTROL_ID_COLOR_5] = { name='Display Color 6', controlID=CONTROL_ID_COLOR_5, label='Display Color 6', inport='Roto-Control', outport='Roto-Control' },
    [CONTROL_ID_COLOR_6] = { name='Display Color 7', controlID=CONTROL_ID_COLOR_6, label='Display Color 7', inport='Roto-Control', outport='Roto-Control' },
    [CONTROL_ID_COLOR_7] = { name='Display Color 8', controlID=CONTROL_ID_COLOR_7, label='Display Color 8', inport='Roto-Control', outport='Roto-Control' },
    [CONTROL_ID_SELECTED_TRACK] = { name='Selected Track', label='Selected Track', controlID=CONTROL_ID_SELECTED_TRACK, inport='Roto-Control', outport='Roto-Control', textFeedback=true },
    [CONTROL_ID_PING_RESPONSE] = { name='Ping Response', label='Roto Aux', controlID=CONTROL_ID_PING_RESPONSE, inport='Roto-Control', outport='Roto-Control' },
    [CONTROL_ID_INSTRUMENT_NAME] = { name='Instrument Name', label='Instrument Name', controlID=CONTROL_ID_INSTRUMENT_NAME, inport='Roto-Control', outport='Roto-Control' },
    [CONTROL_ID_PLUGIN_NAME] = { name='Plugin Name', label='Plugin Name', controlID=CONTROL_ID_PLUGIN_NAME, inport='Roto-Control', outport='Roto-Control' },
    [CONTROL_ID_INSTRUMENT_PARAMETER_COUNT] = { name='Instrument Parameter Count', label='Instrument Parameter Count', controlID=CONTROL_ID_INSTRUMENT_PARAMETER_COUNT, inport='Roto-Control', outport='Roto-Control' },
    [CONTROL_ID_PLUGIN_PARAMETER_COUNT] = { name='Plugin Parameter Count', label='Plugin Parameter Count', controlID=CONTROL_ID_PLUGIN_PARAMETER_COUNT, inport='Roto-Control', outport='Roto-Control' },
    [CONTROL_ID_TOUCH_VALUE] = { name='Touch Value', label='Touch Value Display', controlID=CONTROL_ID_TOUCH_VALUE, inport='Roto-Control', outport='Roto-Control' },
}

roto_control_mapping = {
    { zone='Global' },
    { mode='Global' },
    { control='SEL Volume', setMode='Volume' },
    { control='SEL Pan', setMode='Pan' },
    { control='SEL Send 1', setMode='Send 1' },
    { control='SEL Send 2', setMode='Send 2' },
    { control='SEL Send 3', setMode='Send 3' },
    { control='SEL Send 4', setMode='Send 4' },
    { control='SEL Send 5', setMode='Send 5' },
    { control='SEL Send 6', setMode='Send 6' },
    { control='SEL Send 7', setMode='Send 7' },
    { control='SEL Send 8', setMode='Send 8' },
    { control='SEL Send 9', setMode='Send 9' },
    { control='SEL Send 10', setMode='Send 10' },
    { control='SEL Send 11', setMode='Send 11' },
    { control='SEL Send 12', setMode='Send 12' },
    { control='SEL Mute', setMode='Mute' },
    { control='SEL Solo', setMode='Solo' },
    { control='SEL Arm Rec', setMode='Arm Rec' },
    { control='SEL Input Mon', setMode='Input Mon' },
    { control='SEL Smart', setMode='Smart' },
    { control='SEL Focus', setMode='Focus' },
    { control='SEL Focus 2', setMode='Focus 2' },
    { control='SEL Instrument', setMode='Instrument' },
    { control='SEL Plugin', setMode='Plugin' },
    { control='SEL Unmapped Knob', setMode='Unmapped Knob' },
    { control='SEL Unmapped Button', setMode='Unmapped Button' },
    { control='SEL Instrument Params', setMode='Instrument Params' },
    { control='SEL Plugin Params', setMode='Plugin Params' },
    { control='SEL Plugin Enable', setMode='Plugin Enable' },
    { control='SEL Plugin Select', setMode='Plugin Select' },
    { control='SEL Transport', setMode='Transport' },
    { control='SEL Instrument Sweep', setMode='Instrument Sweep' },
    { control='SEL Plugin Sweep', setMode='Plugin Sweep' },
    { control='SEL Ping', setMode='Ping' },
    { control='SEL Touch Value', setMode='Value Display' },
    { control='Track Select 1', faderBankTrack=0, trackParam=CS_SELECT },
    { control='Track Select 2', faderBankTrack=1, trackParam=CS_SELECT },
    { control='Track Select 3', faderBankTrack=2, trackParam=CS_SELECT },
    { control='Track Select 4', faderBankTrack=3, trackParam=CS_SELECT },
    { control='Track Select 5', faderBankTrack=4, trackParam=CS_SELECT },
    { control='Track Select 6', faderBankTrack=5, trackParam=CS_SELECT },
    { control='Track Select 7', faderBankTrack=6, trackParam=CS_SELECT },
    { control='Track Select 8', faderBankTrack=7, trackParam=CS_SELECT },
    { control='Track Stack', keyCmd=2279 },
    { control='Prev Page', CSGroupObj=ACS_CURMODEFADERBANK, valueMode=kAssignRelative, bankType=ABT_BYONE, multiply=-8 },
    { control='Next Page', CSGroupObj=ACS_CURMODEFADERBANK, valueMode=kAssignRelative, bankType=ABT_BYONE, multiply=8 },

    { mode='Ping' },
    { control='Ping Response' },
    { control='SEL Global', setMode='Global' },

    { mode='Value Display' },
    { control='Touch Value' },
    { control='SEL Global', setMode='Global' },    
    { control='SEL Volume', setMode='Volume' },
    { control='SEL Pan', setMode='Pan' },
    { control='SEL Send 1', setMode='Send 1' },
    { control='SEL Send 2', setMode='Send 2' },
    { control='SEL Send 3', setMode='Send 3' },
    { control='SEL Send 4', setMode='Send 4' },
    { control='SEL Send 5', setMode='Send 5' },
    { control='SEL Send 6', setMode='Send 6' },
    { control='SEL Send 7', setMode='Send 7' },
    { control='SEL Send 8', setMode='Send 8' },
    { control='SEL Send 9', setMode='Send 9' },
    { control='SEL Send 10', setMode='Send 10' },
    { control='SEL Send 11', setMode='Send 11' },
    { control='SEL Send 12', setMode='Send 12' },
    { control='SEL Mute', setMode='Mute' },
    { control='SEL Solo', setMode='Solo' },
    { control='SEL Arm Rec', setMode='Arm Rec' },
    { control='SEL Input Mon', setMode='Input Mon' },
    { control='SEL Smart', setMode='Smart' },
    { control='SEL Focus', setMode='Focus' },
    { control='SEL Focus 2', setMode='Focus 2' },
    { control='SEL Instrument', setMode='Instrument' },
    { control='SEL Plugin', setMode='Plugin' },
    { control='SEL Unmapped Knob', setMode='Unmapped Knob' },
    { control='SEL Unmapped Button', setMode='Unmapped Button' },
    { control='SEL Instrument Params', setMode='Instrument Params' },
    { control='SEL Plugin Params', setMode='Plugin Params' },
    { control='SEL Plugin Enable', setMode='Plugin Enable' },
    { control='SEL Plugin Select', setMode='Plugin Select' },
    { control='SEL Transport', setMode='Transport' },
    { control='SEL Instrument Sweep', setMode='Instrument Sweep' },
    { control='SEL Plugin Sweep', setMode='Plugin Sweep' },
    { control='SEL Ping', setMode='Ping' },
    { control='SEL Touch Value', setMode='Value Display' },
    { control='Track Select 1', faderBankTrack=0, trackParam=CS_SELECT },
    { control='Track Select 2', faderBankTrack=1, trackParam=CS_SELECT },
    { control='Track Select 3', faderBankTrack=2, trackParam=CS_SELECT },
    { control='Track Select 4', faderBankTrack=3, trackParam=CS_SELECT },
    { control='Track Select 5', faderBankTrack=4, trackParam=CS_SELECT },
    { control='Track Select 6', faderBankTrack=5, trackParam=CS_SELECT },
    { control='Track Select 7', faderBankTrack=6, trackParam=CS_SELECT },
    { control='Track Select 8', faderBankTrack=7, trackParam=CS_SELECT },
    { control='Track Stack', keyCmd=2279 },
    { control='Prev Page', CSGroupObj=ACS_CURMODEFADERBANK, valueMode=kAssignRelative, bankType=ABT_BYONE, multiply=-8 },
    { control='Next Page', CSGroupObj=ACS_CURMODEFADERBANK, valueMode=kAssignRelative, bankType=ABT_BYONE, multiply=8 },

    { zone='Buttons' },
    { mode='Mute' },
    { control='Button 1', faderBankTrack=0, trackParam=AUMUTE },
    { control='Button 2', faderBankTrack=1, trackParam=AUMUTE },
    { control='Button 3', faderBankTrack=2, trackParam=AUMUTE },
    { control='Button 4', faderBankTrack=3, trackParam=AUMUTE },
    { control='Button 5', faderBankTrack=4, trackParam=AUMUTE },
    { control='Button 6', faderBankTrack=5, trackParam=AUMUTE },
    { control='Button 7', faderBankTrack=6, trackParam=AUMUTE },
    { control='Button 8', faderBankTrack=7, trackParam=AUMUTE },

    { mode='Solo' },
    { control='Button 1', faderBankTrack=0, trackParam=AUSOLO },
    { control='Button 2', faderBankTrack=1, trackParam=AUSOLO },
    { control='Button 3', faderBankTrack=2, trackParam=AUSOLO },
    { control='Button 4', faderBankTrack=3, trackParam=AUSOLO },
    { control='Button 5', faderBankTrack=4, trackParam=AUSOLO },
    { control='Button 6', faderBankTrack=5, trackParam=AUSOLO },
    { control='Button 7', faderBankTrack=6, trackParam=AUSOLO },
    { control='Button 8', faderBankTrack=7, trackParam=AUSOLO },

    { mode='Arm Rec' },
    { control='Button 1', faderBankTrack=0, trackParam=CS_RECRDY },
    { control='Button 2', faderBankTrack=1, trackParam=CS_RECRDY },
    { control='Button 3', faderBankTrack=2, trackParam=CS_RECRDY },
    { control='Button 4', faderBankTrack=3, trackParam=CS_RECRDY },
    { control='Button 5', faderBankTrack=4, trackParam=CS_RECRDY },
    { control='Button 6', faderBankTrack=5, trackParam=CS_RECRDY },
    { control='Button 7', faderBankTrack=6, trackParam=CS_RECRDY },
    { control='Button 8', faderBankTrack=7, trackParam=CS_RECRDY },

    { mode='Input Mon' },
    { control='Button 1', faderBankTrack=0, trackParam=CS_INPUTMONITORING },
    { control='Button 2', faderBankTrack=1, trackParam=CS_INPUTMONITORING },
    { control='Button 3', faderBankTrack=2, trackParam=CS_INPUTMONITORING },
    { control='Button 4', faderBankTrack=3, trackParam=CS_INPUTMONITORING },
    { control='Button 5', faderBankTrack=4, trackParam=CS_INPUTMONITORING },
    { control='Button 6', faderBankTrack=5, trackParam=CS_INPUTMONITORING },
    { control='Button 7', faderBankTrack=6, trackParam=CS_INPUTMONITORING },
    { control='Button 8', faderBankTrack=7, trackParam=CS_INPUTMONITORING },

    { mode='Plugin Enable' },
    { control='Instrument Name', CSTrack=true, trackParam=CS_INSTRUMENT, paramName='@in' },
    { control='Insert 1 Name', CSTrack=true,trackParam=CS_INSERT1PLUGIN, paramOffset=0, paramName='@tp' },
    { control='Insert 2 Name', CSTrack=true,trackParam=CS_INSERT1PLUGIN, paramOffset=1, paramName='@tp' },
    { control='Insert 3 Name', CSTrack=true,trackParam=CS_INSERT1PLUGIN, paramOffset=2, paramName='@tp' },
    { control='Insert 4 Name', CSTrack=true,trackParam=CS_INSERT1PLUGIN, paramOffset=3, paramName='@tp' },
    { control='Insert 5 Name', CSTrack=true,trackParam=CS_INSERT1PLUGIN, paramOffset=4, paramName='@tp' },
    { control='Insert 6 Name', CSTrack=true,trackParam=CS_INSERT1PLUGIN, paramOffset=5, paramName='@tp' },
    { control='Insert 7 Name', CSTrack=true,trackParam=CS_INSERT1PLUGIN, paramOffset=6, paramName='@tp' },
    { control='Insert 8 Name', CSTrack=true,trackParam=CS_INSERT1PLUGIN, paramOffset=7,  paramName='@tp' },
    { control='Insert 9 Name', CSTrack=true,trackParam=CS_INSERT1PLUGIN, paramOffset=8,  paramName='@tp' },
    { control='Insert 10 Name', CSTrack=true,trackParam=CS_INSERT1PLUGIN, paramOffset=9,  paramName='@tp' },
    { control='Insert 11 Name', CSTrack=true,trackParam=CS_INSERT1PLUGIN, paramOffset=10,  paramName='@tp' },
    { control='Insert 12 Name', CSTrack=true,trackParam=CS_INSERT1PLUGIN, paramOffset=11,  paramName='@tp' },
    { control='Insert 13 Name', CSTrack=true,trackParam=CS_INSERT1PLUGIN, paramOffset=12,  paramName='@tp' },
    { control='Insert 14 Name', CSTrack=true,trackParam=CS_INSERT1PLUGIN, paramOffset=13,  paramName='@tp' },
    { control='Insert 15 Name', CSTrack=true,trackParam=CS_INSERT1PLUGIN, paramOffset=14,  paramName='@tp' },
    { control='Button 1', CSTrack=true, trackParam=CS_INSTBYPASS },
    { control='Button 2', CSTrack=true, trackParam=AUBYPASSPLUG1, paramOffset=0 },
    { control='Button 3', CSTrack=true, trackParam=AUBYPASSPLUG1, paramOffset=1 },
    { control='Button 4', CSTrack=true, trackParam=AUBYPASSPLUG1, paramOffset=2 },
    { control='Button 5', CSTrack=true, trackParam=AUBYPASSPLUG1, paramOffset=3 },
    { control='Button 6', CSTrack=true, trackParam=AUBYPASSPLUG1, paramOffset=4 },
    { control='Button 7', CSTrack=true, trackParam=AUBYPASSPLUG1, paramOffset=5 },
    { control='Button 8', CSTrack=true, trackParam=AUBYPASSPLUG1, paramOffset=6 },
    { control='Button 9', CSTrack=true, trackParam=AUBYPASSPLUG1, paramOffset=7 },
    { control='Button 10', CSTrack=true, trackParam=AUBYPASSPLUG1, paramOffset=8 },
    { control='Button 11', CSTrack=true, trackParam=AUBYPASSPLUG1, paramOffset=9 },
    { control='Button 12', CSTrack=true, trackParam=AUBYPASSPLUG1, paramOffset=10 },
    { control='Button 13', CSTrack=true, trackParam=AUBYPASSPLUG1, paramOffset=11 },
    { control='Button 14', CSTrack=true, trackParam=AUBYPASSPLUG1, paramOffset=12 },
    { control='Button 15', CSTrack=true, trackParam=AUBYPASSPLUG1, paramOffset=13 },
    { control='Button 16', CSTrack=true, trackParam=AUBYPASSPLUG1, paramOffset=14 },

    { mode='Plugin Select' },
    { control='Plugin Slot', CSGroupObj=ACS_PLUGINSLOT, valueMode=kAssignDirect, paramName = '@pn' },
    { control='Instrument Name', CSTrack=true, trackParam=CS_INSTRUMENT, paramName='@in' },
    { control='Insert 1 Name', CSTrack=true, trackParam=CS_INSERT1PLUGIN,  paramName='@tp' },
    { control='Insert 2 Name', CSTrack=true, trackParam=CS_INSERT1PLUGIN, paramOffset=1,  paramName='@tp' },
    { control='Insert 3 Name', CSTrack=true, trackParam=CS_INSERT1PLUGIN, paramOffset=2,  paramName='@tp' },
    { control='Insert 4 Name', CSTrack=true, trackParam=CS_INSERT1PLUGIN, paramOffset=3,  paramName='@tp' },
    { control='Insert 5 Name', CSTrack=true, trackParam=CS_INSERT1PLUGIN, paramOffset=4,  paramName='@tp' },
    { control='Insert 6 Name', CSTrack=true, trackParam=CS_INSERT1PLUGIN, paramOffset=5,  paramName='@tp' },
    { control='Insert 7 Name', CSTrack=true, trackParam=CS_INSERT1PLUGIN, paramOffset=6,  paramName='@tp' },
    { control='Insert 8 Name', CSTrack=true, trackParam=CS_INSERT1PLUGIN, paramOffset=7,  paramName='@tp' },
    { control='Insert 9 Name', CSTrack=true, trackParam=CS_INSERT1PLUGIN, paramOffset=8,  paramName='@tp' },
    { control='Insert 10 Name', CSTrack=true, trackParam=CS_INSERT1PLUGIN, paramOffset=9,  paramName='@tp' },
    { control='Insert 11 Name', CSTrack=true, trackParam=CS_INSERT1PLUGIN, paramOffset=10,  paramName='@tp' },
    { control='Insert 12 Name', CSTrack=true, trackParam=CS_INSERT1PLUGIN, paramOffset=11,  paramName='@tp' },
    { control='Insert 13 Name', CSTrack=true, trackParam=CS_INSERT1PLUGIN, paramOffset=12,  paramName='@tp' },
    { control='Insert 14 Name', CSTrack=true, trackParam=CS_INSERT1PLUGIN, paramOffset=13,  paramName='@tp' },
    { control='Insert 15 Name', CSTrack=true, trackParam=CS_INSERT1PLUGIN, paramOffset=14,  paramName='@tp' },
    { control='Button 1', CSTrack=true, trackParam=CS_INSTOPEN },
    { control='Button 2', CSTrack=true, trackParam=CS_INSERT1OPEN, paramOffset=0 },
    { control='Button 3', CSTrack=true, trackParam=CS_INSERT1OPEN, paramOffset=1 },
    { control='Button 4', CSTrack=true, trackParam=CS_INSERT1OPEN, paramOffset=2 },
    { control='Button 5', CSTrack=true, trackParam=CS_INSERT1OPEN, paramOffset=3 },
    { control='Button 6', CSTrack=true, trackParam=CS_INSERT1OPEN, paramOffset=4 },
    { control='Button 7', CSTrack=true, trackParam=CS_INSERT1OPEN, paramOffset=5 },
    { control='Button 8', CSTrack=true, trackParam=CS_INSERT1OPEN, paramOffset=6 },
    { control='Button 9', CSTrack=true, trackParam=CS_INSERT1OPEN, paramOffset=7 },
    { control='Button 10', CSTrack=true, trackParam=CS_INSERT1OPEN, paramOffset=8 },
    { control='Button 11', CSTrack=true, trackParam=CS_INSERT1OPEN, paramOffset=9 },
    { control='Button 12', CSTrack=true, trackParam=CS_INSERT1OPEN, paramOffset=10 },
    { control='Button 13', CSTrack=true, trackParam=CS_INSERT1OPEN, paramOffset=11 },
    { control='Button 14', CSTrack=true, trackParam=CS_INSERT1OPEN, paramOffset=12 },
    { control='Button 15', CSTrack=true, trackParam=CS_INSERT1OPEN, paramOffset=13 },
    { control='Button 16', CSTrack=true, trackParam=CS_INSERT1OPEN, paramOffset=14 },

    { mode='Transport' },
    { control='Play' },
    { control='Stop' },
    { control='Record' },
    { control='Loop' },
    { control='Punch' },
    { control='Rewind' },
    { control='Forward' },

    { mode='Unmapped Button' },

    { zone='Knobs' },
    { mode='Volume' },
    { control='Knob 1', faderBankTrack=0, trackParam=AUVOLUME, paramName='@tn' },
    { control='Knob 2', faderBankTrack=1, trackParam=AUVOLUME, paramName='@tn' },
    { control='Knob 3', faderBankTrack=2, trackParam=AUVOLUME, paramName='@tn' },
    { control='Knob 4', faderBankTrack=3, trackParam=AUVOLUME, paramName='@tn' },
    { control='Knob 5', faderBankTrack=4, trackParam=AUVOLUME, paramName='@tn' },
    { control='Knob 6', faderBankTrack=5, trackParam=AUVOLUME, paramName='@tn' },
    { control='Knob 7', faderBankTrack=6, trackParam=AUVOLUME, paramName='@tn' },
    { control='Knob 8', faderBankTrack=7, trackParam=AUVOLUME, paramName='@tn' },
    { control='Display Color 1', faderBankTrack=0, trackParam=CS_COLOR },
    { control='Display Color 2', faderBankTrack=1, trackParam=CS_COLOR },
    { control='Display Color 3', faderBankTrack=2, trackParam=CS_COLOR },
    { control='Display Color 4', faderBankTrack=3, trackParam=CS_COLOR },
    { control='Display Color 5', faderBankTrack=4, trackParam=CS_COLOR },
    { control='Display Color 6', faderBankTrack=5, trackParam=CS_COLOR },
    { control='Display Color 7', faderBankTrack=6, trackParam=CS_COLOR },
    { control='Display Color 8', faderBankTrack=7, trackParam=CS_COLOR },
    { control='Meter 1 Left', faderBankTrack=0, paramOffset=1, trackParam=CS_LEVEL0 },
    { control='Meter 1 Right', faderBankTrack=0, paramOffset=0, trackParam=CS_LEVEL0 },
    { control='Meter 2 Left', faderBankTrack=1, paramOffset=1, trackParam=CS_LEVEL0 },
    { control='Meter 2 Right', faderBankTrack=1, paramOffset=0, trackParam=CS_LEVEL0 },
    { control='Meter 3 Left', faderBankTrack=2, paramOffset=1, trackParam=CS_LEVEL0 },
    { control='Meter 3 Right', faderBankTrack=2, paramOffset=0, trackParam=CS_LEVEL0 },
    { control='Meter 4 Left', faderBankTrack=3, paramOffset=1, trackParam=CS_LEVEL0 },
    { control='Meter 4 Right', faderBankTrack=3, paramOffset=0, trackParam=CS_LEVEL0 },
    { control='Meter 5 Left', faderBankTrack=4, paramOffset=1, trackParam=CS_LEVEL0 },
    { control='Meter 5 Right', faderBankTrack=4, paramOffset=0, trackParam=CS_LEVEL0 },
    { control='Meter 6 Left', faderBankTrack=5, paramOffset=1, trackParam=CS_LEVEL0 },
    { control='Meter 6 Right', faderBankTrack=5, paramOffset=0, trackParam=CS_LEVEL0 },
    { control='Meter 7 Left', faderBankTrack=6, paramOffset=1, trackParam=CS_LEVEL0 },
    { control='Meter 7 Right', faderBankTrack=6, paramOffset=0, trackParam=CS_LEVEL0 },
    { control='Meter 8 Left', faderBankTrack=7, paramOffset=1, trackParam=CS_LEVEL0 },
    { control='Meter 8 Right', faderBankTrack=7, paramOffset=0, trackParam=CS_LEVEL0 },

    { mode='Pan' },
    { control='Knob 1', faderBankTrack=0, trackParam=AUPAN, paramName='@tn' },
    { control='Knob 2', faderBankTrack=1, trackParam=AUPAN, paramName='@tn' },
    { control='Knob 3', faderBankTrack=2, trackParam=AUPAN, paramName='@tn' },
    { control='Knob 4', faderBankTrack=3, trackParam=AUPAN, paramName='@tn' },
    { control='Knob 5', faderBankTrack=4, trackParam=AUPAN, paramName='@tn' },
    { control='Knob 6', faderBankTrack=5, trackParam=AUPAN, paramName='@tn' },
    { control='Knob 7', faderBankTrack=6, trackParam=AUPAN, paramName='@tn' },
    { control='Knob 8', faderBankTrack=7, trackParam=AUPAN, paramName='@tn' },
    { control='Display Color 1', faderBankTrack=0, trackParam=CS_COLOR },
    { control='Display Color 2', faderBankTrack=1, trackParam=CS_COLOR },
    { control='Display Color 3', faderBankTrack=2, trackParam=CS_COLOR },
    { control='Display Color 4', faderBankTrack=3, trackParam=CS_COLOR },
    { control='Display Color 5', faderBankTrack=4, trackParam=CS_COLOR },
    { control='Display Color 6', faderBankTrack=5, trackParam=CS_COLOR },
    { control='Display Color 7', faderBankTrack=6, trackParam=CS_COLOR },
    { control='Display Color 8', faderBankTrack=7, trackParam=CS_COLOR },
    { control='Meter 1 Left', faderBankTrack=0, paramOffset=1, trackParam=CS_LEVEL0 },
    { control='Meter 1 Right', faderBankTrack=0, paramOffset=0, trackParam=CS_LEVEL0 },
    { control='Meter 2 Left', faderBankTrack=1, paramOffset=1, trackParam=CS_LEVEL0 },
    { control='Meter 2 Right', faderBankTrack=1, paramOffset=0, trackParam=CS_LEVEL0 },
    { control='Meter 3 Left', faderBankTrack=2, paramOffset=1, trackParam=CS_LEVEL0 },
    { control='Meter 3 Right', faderBankTrack=2, paramOffset=0, trackParam=CS_LEVEL0 },
    { control='Meter 4 Left', faderBankTrack=3, paramOffset=1, trackParam=CS_LEVEL0 },
    { control='Meter 4 Right', faderBankTrack=3, paramOffset=0, trackParam=CS_LEVEL0 },
    { control='Meter 5 Left', faderBankTrack=4, paramOffset=1, trackParam=CS_LEVEL0 },
    { control='Meter 5 Right', faderBankTrack=4, paramOffset=0, trackParam=CS_LEVEL0 },
    { control='Meter 6 Left', faderBankTrack=5, paramOffset=1, trackParam=CS_LEVEL0 },
    { control='Meter 6 Right', faderBankTrack=5, paramOffset=0, trackParam=CS_LEVEL0 },
    { control='Meter 7 Left', faderBankTrack=6, paramOffset=1, trackParam=CS_LEVEL0 },
    { control='Meter 7 Right', faderBankTrack=6, paramOffset=0, trackParam=CS_LEVEL0 },
    { control='Meter 8 Left', faderBankTrack=7, paramOffset=1, trackParam=CS_LEVEL0 },
    { control='Meter 8 Right', faderBankTrack=7, paramOffset=0, trackParam=CS_LEVEL0 },

    { mode='Focus' },
    { control='Knob 1', CSTrack=true, trackParam=AUVOLUME },
    { control='Knob 2', CSTrack=true, trackParam=AUPAN },
    { control='Knob 3', CSTrack=true, trackParam=AUSEND1, paramOffset=0 },
    { control='Knob 4', CSTrack=true, trackParam=AUSEND1, paramOffset=1 },
    { control='Knob 5', CSTrack=true, trackParam=AUSEND1, paramOffset=2 },
    { control='Knob 6', CSTrack=true, trackParam=AUSEND1, paramOffset=3 },
    { control='Knob 7', CSTrack=true, trackParam=AUSEND1, paramOffset=4 },
    { control='Knob 8', CSTrack=true, trackParam=AUSEND1, paramOffset=5 },
    { control='Selected Track', CSTrack=true, trackParam=CS_NAME, paramName='@t#-@tn'},
    { control='Display Color 1', CSTrack=true, trackParam=CS_COLOR },
    { control='Display Color 2', CSTrack=true, trackParam=CS_COLOR },
    { control='Display Color 3', CSTrack=true, trackParam=CS_COLOR },
    { control='Display Color 4', CSTrack=true, trackParam=CS_COLOR },
    { control='Display Color 5', CSTrack=true, trackParam=CS_COLOR },
    { control='Display Color 6', CSTrack=true, trackParam=CS_COLOR },
    { control='Display Color 7', CSTrack=true, trackParam=CS_COLOR },
    { control='Display Color 8', CSTrack=true, trackParam=CS_COLOR },
    { control='Meter 1 Left', CSTrack=true, paramOffset=1, trackParam=CS_LEVEL0 },
    { control='Meter 1 Right', CSTrack=true, paramOffset=0, trackParam=CS_LEVEL0 },
    
    { mode='Focus 2' },
    { control='Knob 1', CSTrack=true, trackParam=AUVOLUME },
    { control='Knob 2', CSTrack=true, trackParam=AUPAN },
    { control='Knob 3', CSTrack=true, trackParam=AUSEND1, paramOffset=6 },
    { control='Knob 4', CSTrack=true, trackParam=AUSEND1, paramOffset=7 },
    { control='Knob 5', CSTrack=true, trackParam=AUSEND1, paramOffset=8 },
    { control='Knob 6', CSTrack=true, trackParam=AUSEND1, paramOffset=9 },
    { control='Knob 7', CSTrack=true, trackParam=AUSEND1, paramOffset=10 },
    { control='Knob 8', CSTrack=true, trackParam=AUSEND1, paramOffset=11 },
    { control='Selected Track', CSTrack=true, trackParam=CS_NAME, paramName='@t#-@tn'},
    { control='Display Color 1', CSTrack=true, trackParam=CS_COLOR },
    { control='Display Color 2', CSTrack=true, trackParam=CS_COLOR },
    { control='Display Color 3', CSTrack=true, trackParam=CS_COLOR },
    { control='Display Color 4', CSTrack=true, trackParam=CS_COLOR },
    { control='Display Color 5', CSTrack=true, trackParam=CS_COLOR },
    { control='Display Color 6', CSTrack=true, trackParam=CS_COLOR },
    { control='Display Color 7', CSTrack=true, trackParam=CS_COLOR },
    { control='Display Color 8', CSTrack=true, trackParam=CS_COLOR },
    { control='Meter 1 Left', CSTrack=true, paramOffset=1, trackParam=CS_LEVEL0 },
    { control='Meter 1 Right', CSTrack=true, paramOffset=0, trackParam=CS_LEVEL0 },

    { mode='Smart' },
    { control='Plugin 1', CSTrack=true, trackParam=CS_SMARTCONTROL1, paramOffset=0, paramName='@tp' },
    { control='Plugin 2', CSTrack=true, trackParam=CS_SMARTCONTROL1, paramOffset=1, paramName='@tp' },
    { control='Plugin 3', CSTrack=true, trackParam=CS_SMARTCONTROL1, paramOffset=2, paramName='@tp' },
    { control='Plugin 4', CSTrack=true, trackParam=CS_SMARTCONTROL1, paramOffset=3, paramName='@tp' },
    { control='Plugin 5', CSTrack=true, trackParam=CS_SMARTCONTROL1, paramOffset=4, paramName='@tp' },
    { control='Plugin 6', CSTrack=true, trackParam=CS_SMARTCONTROL1, paramOffset=5, paramName='@tp' },
    { control='Plugin 7', CSTrack=true, trackParam=CS_SMARTCONTROL1, paramOffset=6, paramName='@tp' },
    { control='Plugin 8', CSTrack=true, trackParam=CS_SMARTCONTROL1, paramOffset=7, paramName='@tp' },
    { control='Plugin 9', CSTrack=true, trackParam=CS_SMARTCONTROL1, paramOffset=8, paramName='@tp' },
    { control='Plugin 10', CSTrack=true, trackParam=CS_SMARTCONTROL1, paramOffset=9, paramName='@tp' },
    { control='Plugin 11', CSTrack=true, trackParam=CS_SMARTCONTROL1, paramOffset=10, paramName='@tp' },
    { control='Plugin 12', CSTrack=true, trackParam=CS_SMARTCONTROL1, paramOffset=11, paramName='@tp' },
    { control='Plugin 13', CSTrack=true, trackParam=CS_SMARTCONTROL1, paramOffset=12, paramName='@tp' },
    { control='Plugin 14', CSTrack=true, trackParam=CS_SMARTCONTROL1, paramOffset=13, paramName='@tp' },
    { control='Plugin 15', CSTrack=true, trackParam=CS_SMARTCONTROL1, paramOffset=14, paramName='@tp' },
    { control='Plugin 16', CSTrack=true, trackParam=CS_SMARTCONTROL1, paramOffset=15, paramName='@tp' },
    { control='Selected Track', CSTrack=true, trackParam=CS_NAME, paramName='@t#-@tn'},
    { control='Display Color 1', CSTrack=true, trackParam=CS_COLOR },

    { mode='Unmapped Knob' },

    -- The remainder of this table is build dynamically
}

function debug_print(string, hex_data)
    if DEBUG_MODE == 1 then
        print(string)
        local parts = {}
        if type(hex_data) == 'table' and next(hex_data) then
            for _, v in ipairs(hex_data) do
                if v >= 0 then
                    table.insert(parts, string.format('0x%X', v))
                end
            end
        end

        print(table.concat(parts, ' '))
    end
end

-- Send sysex function
function generate_sysex(sub_id_1, sub_id_2, data)
    if (midi_out_enabled == true) then
        local sysex_msg = {MIDI_SYSEX_HEADER, MI_MANUFACTURER_ID[1], MI_MANUFACTURER_ID[2], MI_MANUFACTURER_ID[3], ROTO_CONTROL_DEVICE_ID, sub_id_1, sub_id_2}
        if type(data) == 'table' and next(data) then
            for _, v in ipairs(data) do
                table.insert(sysex_msg, v)
            end
        end
        table.insert(sysex_msg, MIDI_SYSEX_END)
        debug_print('Sysex Tx:', sysex_msg)
        -- End with a 5ms delay
        table.insert(sysex_msg, -5)

        return sysex_msg
    else
        return {}
    end
end

function generate_plugin_details(plugin_index, plugin_name)
    local plugin_details = { plugin_index }
    bytestring_append(plugin_details, get_hash(plugin_name, 8))
    plugin_details[#plugin_details + 1] = 1
    bytestring_append(plugin_details, string_normalise(plugin_name))
    plugin_details[#plugin_details + 1] = 0
    plugin_details[#plugin_details + 1] = 0
    local msg = generate_sysex(PLUGIN_COMMAND_GROUP, PLUGIN_DETAILS, plugin_details)

    return msg
end

-- Every MIDI event from this device is filtered through this function
function controller_midi_in(midiEvent,portName)
    -- Check for non zero midievent count first to filter out clock pulses
    if (type(midiEvent) == 'table') and (#midiEvent >= 7) then
        -- debug_print(string.format('MIDI received - %d bytes', #midiEvent))
    elseif (type(midiEvent) == 'table') and midiEvent[0] and midiEvent[1] and midiEvent[2] then
        -- debug_print(string.format('MIDI received - %02x %02x %02x', midiEvent[0], midiEvent[1], midiEvent[2]))

        -- For plugin mode grab the touch events, generate a values command and pass the touch event through.
        if (current_mode == MODE_PLUGIN) or (current_mode == MODE_SMART) then
            if ((midiEvent[0] >= MIDI_CHANNELS.PLUGIN_START) and (midiEvent[0] <= MIDI_CHANNELS.PLUGIN_END)) and (midiEvent[1] >= MIDI_CC.PLUGIN_TOUCH_0) and (midiEvent[1] <= (MIDI_CC.PLUGIN_TOUCH_0 + MAX_KNOBS_PER_CHANNEL)) then
                if (midiEvent[2] == 0x7F) then
                    -- Calculate and store the plugin index
                    plugin_last_touched_index = (MIDI_CHANNELS.PLUGIN_END - midiEvent[0]) * MAX_KNOBS_PER_CHANNEL + midiEvent[1] - MIDI_CC.PLUGIN_TOUCH_0

                    -- Grab the touch events and trigger a value command
                    local midi_msg = {{midiEvent[0], midiEvent[1], midiEvent[2]},{MIDI_CHANNELS.COMMAND, TOUCH_VALUE_COMMAND, 1}}

                    return { midi = midi_msg }
                else
                    plugin_last_touched_index = nil
                    plugin_last_button_index = nil
                    -- Reset back to the global context
                    local midi_msg = {{midiEvent[0], midiEvent[1], midiEvent[2]},{MIDI_CHANNELS.COMMAND, GLOBAL_COMMAND, 1}}
                    return { midi = midi_msg }
                end
            else
                return nil
            end
        else
            return nil
        end
    else
        return nil
    end

    -- Process Melbourne instruments Sysex messages
    -- Format:
    --    0xf0 <Manufacturer ID> <Device ID> <Sub ID 1> <Sub ID 2> <Command> 0xf7
    --    0xf0   0x00 0x22 0x03     0x02        0x??       0x??     0x??...  0xf7
    if (bit32.band(midiEvent[0], 0xf0) == MIDI_SYSEX_HEADER) then
        -- Check length for a valid command
        if type(midiEvent) == 'table' then
            -- Confirm manufacturer and device ID
            if (midiEvent[1] == MI_MANUFACTURER_ID[1]) and (midiEvent[2] == MI_MANUFACTURER_ID[2]) and 
                (midiEvent[3] == MI_MANUFACTURER_ID[3]) and (midiEvent[4] == ROTO_CONTROL_DEVICE_ID) then
                debug_print(string.format('Sysex received - sub_id 1: %02X sub_id 2: %02X', midiEvent[5], midiEvent[6]))
                -- Create a data table with midi bytes 7 onwards (optional data bytes)
                local data = {}
                for i = 7, (#midiEvent - 1) do
                    table.insert(data, midiEvent[i])
                end
                local midi_msg = process_sysex_command(midiEvent[5], midiEvent[6], data)
                
                if midi_msg then
                    return {midi = midi_msg}
                end
            end
        end
    end

    -- Pass through remaining MIDI messages to Logic Pro
    return nil
end

function process_sysex_command(command_group, command_id, data)
    local midi_msg = {}
    debug_print('process sysex command ' .. command_id)
    if (command_group == GENERAL_COMMAND_GROUP) then
        if (command_id == PING_DAW) then
            sysex_append(midi_msg, {MIDI_CHANNELS.COMMAND,PING_COMMAND,0x01}, 5)
        elseif (command_id == ROTO_DAW_CONNECTED) then
            -- Roto Control is ready to receive sysex now
            midi_out_enabled = true
            sysex_append(midi_msg, {MIDI_CHANNELS.COMMAND,GLOBAL_COMMAND,0x01}, 5)
            select_plugin(midi_msg, 0)
        elseif (command_id == SELECT_TRACK) then
            local track_index = bit32.bor(bit32.lshift(data[1], 7), data[2])
            debug_print(string.format('Select track %d', track_index))
            if (current_mode == MODE_TRACK_SELECT) then
                current_mode = MODE_START
            end
            local track_cc = TRACK_1_SELECT_COMMAND + track_index
            sysex_append(midi_msg, {MIDI_CHANNELS.COMMAND,track_cc,0x01}, 5)
        elseif (command_id == REQUEST_TRANSPORT_STATUS) then
            debug_print('Transport mode')
            current_mode = MODE_TRANSPORT
            sysex_append(midi_msg, {MIDI_CHANNELS.COMMAND,TRANSPORT_COMMAND,0x01}, 5)
        elseif (command_id == RIGHT_ARROW) then
            track_names_cached = {}
            display_color_cached = {}
            display_color_filter = {}
            mix_values_cached = {}
            if (current_mode == MODE_MIX_FOCUSED) then
                debug_print('Focus 2 Mode')
                current_mode = MODE_MIX_FOCUSED_2
                sysex_append(midi_msg, {MIDI_CHANNELS.COMMAND,FOCUS_2_COMMAND,0x01}, 5)
            end
        elseif (command_id == LEFT_ARROW) then
            track_names_cached = {}
            display_color_cached = {}
            display_color_filter = {}
            mix_values_cached = {}
            if (current_mode == MODE_MIX_FOCUSED_2) then
                debug_print('Focus 1 Mode')
                current_mode = MODE_MIX_FOCUSED
                sysex_append(midi_msg, {MIDI_CHANNELS.COMMAND,FOCUS_COMMAND,0x01}, 5)
            end
        end
    elseif (command_group == MIXER_COMMAND_GROUP) then
        if (command_id == SET_MIXER_ALL_MODE) then
            debug_print('Mix mode')
            current_mode = MODE_MIX
            mix_values_cached = {}
            display_color_filter = {}
            track_names_cached = {}
            -- Set the knob mode
            if (data[2] == 0x0) then
                debug_print('Set Knob - VOLUME')
                sysex_append(midi_msg, {MIDI_CHANNELS.COMMAND,MIXER_VOLUME_COMMAND,0x01}, 5)
            elseif (data[2] == 0x1) then
                debug_print('Set Knob - PAN')
                sysex_append(midi_msg, {MIDI_CHANNELS.COMMAND,MIXER_PAN_COMMAND,0x01}, 5)
            elseif (data[2] == 0x2) then
                debug_print('Set Knob - SEND', midi_msg)
                local send_cc = MIXER_SEND_0_COMMAND + data[4]
                sysex_append(midi_msg, {MIDI_CHANNELS.COMMAND,send_cc,0x01}, 5)
            end

            -- Set the switch mode
            if  (data[3] == 0x0) then
                debug_print('Set Button - MUTE')
                sysex_append(midi_msg, {MIDI_CHANNELS.COMMAND,MIXER_MUTE_COMMAND,0x01}, 5)
            elseif (data[3] == 0x1) then
                debug_print('Set Button - SOLO')
                sysex_append(midi_msg, {MIDI_CHANNELS.COMMAND,MIXER_SOLO_COMMAND,0x01}, 5)
            elseif (data[3] == 0x2) then
                debug_print('Set Button - ARM_RECORDING')
                sysex_append(midi_msg, {MIDI_CHANNELS.COMMAND,MIXER_ARM_COMMAND,0x01}, 5)
            elseif (data[3] == 0x3) then
                debug_print('Set Button - INPUT_MONITORING')
                sysex_append(midi_msg, {MIDI_CHANNELS.COMMAND,MIXER_INPUT_MON_COMMAND,0x01}, 5)
            end
        elseif (command_id == SET_MIXER_SELECTED_MODE) then
            debug_print('Focus Mode')
            mix_values_cached = {}
            track_names_cached = {}
            display_color_cached = {}
            display_color_filter = {}
            current_mode = MODE_MIX_FOCUSED
            sysex_append(midi_msg, {MIDI_CHANNELS.COMMAND,FOCUS_COMMAND,0x01}, 5)
        elseif (command_id == TOGGLE_GROUP_TRACK) then
            -- The toggle command is a global command, so we need to select the track first
            local track_index = bit32.bor(bit32.lshift(data[1], 7), data[2])
            local track_cc = TRACK_1_SELECT_COMMAND + track_index
            sysex_append(midi_msg, {MIDI_CHANNELS.COMMAND,track_cc,0x01}, 25)
            sysex_append(midi_msg, {MIDI_CHANNELS.COMMAND,TRACK_TOGGLE_COMMAND,0x01}, 5)
        end
    elseif (command_group == PLUGIN_COMMAND_GROUP) then
        if (command_id == SET_PLUGIN_MODE) then
            track_names_cached = {}
            plugin_name_cached = nil
            selected_track_index_cached = nil
            selected_track_name_cached = nil
            filter_track_name = true
            plugin_last_touched_index = nil
            plugin_last_button_index = nil
            if (current_mode == MODE_PLUGIN_ENABLE) or (current_mode == MODE_PLUGIN_SELECT) or (current_mode == MODE_TRANSPORT) then
                if (instrument_mode == true) then
                    filter_instrument_name = true
                end
                filter_plugin_pos = true
                plugin_position_filter = {}
            elseif (current_mode == MODE_PLUGIN) then
                if (instrument_mode == true) and (data[1] == 0) then
                    filter_instrument_name = true
                end
                filter_plugin_pos = true
                plugin_position_filter = {}
            elseif (current_mode == MODE_SMART) and (data[1] == 1) then
                filter_plugin_pos = true
                plugin_position_filter = {}
            end

            if (current_mode ~= MODE_PLUGIN_ENABLE) and (current_mode ~= MODE_PLUGIN_SELECT) then
                plaugin_values_cached = {}
             end

            if (data[1] == 0) then
                current_mode = MODE_PLUGIN
            else
                current_mode = MODE_SMART
                slected_plugin_parameter_count = SMART_MODE_PARAMS
            end

            sysex_append(midi_msg, {MIDI_CHANNELS.COMMAND,NULL_BUTTON_COMMAND,0x01}, 5)
            set_plugin_mode(midi_msg, current_mode)
        elseif (command_id == SET_TRACK_SELECT_MODE) then
            current_mode = MODE_TRACK_SELECT
            sysex_append(midi_msg, {MIDI_CHANNELS.COMMAND,MIXER_VOLUME_COMMAND,0x01}, 5)
        elseif (command_id == SET_PLUGIN_ENABLE_MODE) then
            debug_print('PLUGIN Enable Mode')
            current_mode = MODE_PLUGIN_ENABLE
            sysex_append(midi_msg, {MIDI_CHANNELS.COMMAND,NULL_KNOB_COMMAND,0x01}, 5)
            sysex_append(midi_msg, {MIDI_CHANNELS.COMMAND,PLUGIN_ENABLE_COMMAND,0x01}, 5)
        elseif (command_id == SET_PLUGIN_SELECT_MODE) then
            debug_print('PLUGIN Select Mode')
            current_mode = MODE_PLUGIN_SELECT
            
            --enter another mode so that the knobs are unmapped while we are selecting a new plugin
            sysex_append(midi_msg, {MIDI_CHANNELS.COMMAND,NULL_KNOB_COMMAND,0x01}, 5)
            sysex_append(midi_msg, {MIDI_CHANNELS.COMMAND,PLUGIN_SELECT_COMMAND,0x01}, 5)
        elseif (command_id == SET_DEVICE_LEARN) then
            learn_mode = data[1]
            debug_print(string.format('Learn Mode: %d', learn_mode))
            last_learned_plugin_parameter_name = ''
            last_learned_param_index = 0
        elseif (command_id == ROTO_CONTROL_SELECT_DEVICE) then
            selected_plugin = data[1]
            -- debug_print(string.format('set selected plugin 1 (%d)', selected_plugin))
            -- Select a quiet mode to prevent unwanted feedback
            current_mode = MODE_START
            if selected_plugin == 0 then
                filter_instrument_name = true
            end
            select_plugin(midi_msg, selected_plugin)
            -- Open the plugin window if popup is not locked
            if (popup_lock == false) then
                if (selected_plugin < 8) then
                    sysex_append(midi_msg, {MIDI_CHANNELS.DEFAULT,MIDI_CC.BUTTON_0 + selected_plugin,0x01}, 5)
                else
                    sysex_append(midi_msg, {MIDI_CHANNELS.DEFAULT,MIDI_CC.BUTTON_8 + selected_plugin - 8,0x01}, 5)
                end
            end
        elseif (command_id == PLUGIN_PARAM_SWEEP_VALUE) then
            current_mode = MODE_SWEEP
            sysex_append(midi_msg, {0xB0 + data[1],data[3],data[5]}, 5)
            sysex_append(midi_msg, {0xB0 + data[1],data[2],data[4]}, 5)

            -- Ensure an update is sent when the parameter value does not change.
            if (instrument_mode == true) then
                sysex_append(midi_msg, {MIDI_CHANNELS.COMMAND,INSTRUMENT_SWEEP_COMMAND,0x01}, 5)
            else
                sysex_append(midi_msg, {MIDI_CHANNELS.COMMAND,PLUGIN_SWEEP_COMMAND,0x01}, 5)
            end                

            parameter_sweep_respond = true
            parameter_sweep_value = data[5]

            if (parameter_sweep_state == SWEEP_RUNNING_PENDING) then
                parameter_sweep_state = SWEEP_RUNNING
            elseif (parameter_sweep_state == SWEEP_RUNNING) and (data[5] == 0x7f) then
                parameter_sweep_complete = true
            end
        elseif (command_id == PLUGIN_LEARN_COMPLETE) then
            local midi_table = controls[CONTROL_ID_PLUGIN_0 + last_learned_param_index].midi
            local cached_7bit_msb = bit32.rshift(cached_param_sweep_current_value, 7)
            local cached_7bit_lsb = bit32.band(cached_param_sweep_current_value, 0x7F)
            sysex_append(midi_msg, {midi_table[1],midi_table[2],cached_7bit_msb}, 5)
            sysex_append(midi_msg, {midi_table[4],midi_table[5],cached_7bit_lsb}, 5)
        elseif (command_id == SET_PLUGIN_LOCK) then
            if (data[1] == 1) then
                popup_lock = true
            else
                popup_lock = false
            end
        elseif (command_id == REQUEST_SWITCH_PARAM_VALUE) then
            plugin_last_button_index = bit32.bor(bit32.lshift(data[1], 7), data[2])
        end
    end

    if (midi_msg == {}) then
        return nil
    else
        return midi_msg
    end
end

function set_plugin_mode(midi_msg, plugin_mode)
    if (plugin_mode == MODE_PLUGIN) then
        if (instrument_mode == true) then
            debug_print('INSTRUMENT mode')
            sysex_append(midi_msg, {MIDI_CHANNELS.COMMAND,INSTRUMENT_COMMAND,0x01}, 5)
        else
            debug_print('PLUGIN mode')
            sysex_append(midi_msg, {MIDI_CHANNELS.COMMAND,PLUGIN_COMMAND,0x01}, 5)
        end
    else
        debug_print('SMART mode')
        sysex_append(midi_msg, {MIDI_CHANNELS.COMMAND,SMART_COMMAND,0x01}, 5)
        plaugin_values_cached = {}
    end

    return midi_msg
end

function select_plugin(midi_msg, plugin_index)
    debug_print(string.format('Selected plugin: %d', plugin_index))
    -- Clear the parameter names so the table can be re-populated
    plugin_parameter_names = {}

    last_learned_plugin_parameter_name = ''
    last_learned_param_index = 0
    slected_plugin_parameter_count = 0

    -- The plugin in slot 0 is always the instrument - the rest are plugin slots
    if plugin_index == 0 then
        instrument_mode = true
    else
        sysex_append(midi_msg, {MIDI_CHANNELS.COMMAND,PLUGIN_SLOT_COMMAND,plugin_index - 1}, 5)
        instrument_mode = false
    end
end    

-- Append a MIDI message to an existing table of messages with an optional delay
function sysex_append(midi_msg, midi_msg_append, delay)
    for _, v in ipairs(midi_msg_append) do table.insert(midi_msg, v) end
    if (delay > 0) then
        table.insert(midi_msg, -delay)
    end
end

-- Append a string as a byte string to a table
function bytestring_append(bytestring_table, text_string)
    for i = 1, #text_string do
        bytestring_table[#bytestring_table + 1] = string.byte(text_string, i)
    end
end

-- Pad the given string to the required number of characters
function string_pad(text_string)
-- Mask this to valid characters only
    -- Ensure base string is not longer than max
    local base = text_string:sub(1, MAX_STRING_LENGTH)

    -- Add required padding
    local padding = MAX_STRING_LENGTH - #base
    return base .. string.rep("\0", padding) .. "\0"
end

function string_normalise(text_string)
    if (#text_string > MAX_STRING_LENGTH) then
        text_string = string.crunch(text_string, MAX_STRING_LENGTH)
    end
    return string_pad(text_string)
end

function get_index_and_string(text_string)
    local index_string, disp_name = string.match(text_string, "([^%-]+)%-(.+)")
    if (index_string and disp_name) then
        local index = tonumber(index_string)
        if index then
            return index, disp_name
        end
    end
    return 0, ''
end

function get_hash(input_string, num_bytes)
    if (input_string == '') then
        local hash = {}
        for i = 1, num_bytes do
            hash[#hash + 1] = 0
        end
        return string.char(table.unpack(hash))
    else
        local hash_1 = 0
        
        --Iterate though each character and generate a 4 byte hash
        for i = 1, #input_string do
            local ch = string.byte(input_string, i)
            hash_1 = bit32.band(bit32.bxor(bit32.lshift(hash_1, 5), ch + hash_1), 0xFFFFFFFF)
        end
        
        --generate the next 4 byte hash, starting from the first 4 byte hash, and continue the xor/add loop
        local hash_2 = hash_1
        for i = 1, #input_string do
            local ch = string.byte(input_string, i)
            hash_2 = bit32.band(bit32.bxor(bit32.lshift(hash_2, 7), ch + hash_2), 0xFFFFFFFF)
        end

        local bytes = {}
        local loops = (num_bytes / 2) - 1
        for i = 0, loops do
            table.insert(bytes, string.char(bit32.band(bit32.rshift(hash_1, i*8), 0x7F)))
        end
        for i = 0, loops do
            table.insert(bytes, string.char(bit32.band(bit32.rshift(hash_2, i*8), 0x7F)))
        end

        return table.concat(bytes)
    end
end

-- Debug only
local function printTable(tbl, minControlID, indent)
    indent = indent or ""
    for k, v in pairs(tbl) do
        if type(v) == "table" then
            -- Check for controlID only if minControlID is given
            if not minControlID or (type(v.controlID) == "number" and v.controlID > minControlID) then
                debug_print(indent .. "[" .. tostring(k) .. "] = {")
                for subKey, subVal in pairs(v) do
                    if type(subVal) == "table" then
                        debug_print(indent .. "  [" .. subKey .. "] = {")
                        for i, val in ipairs(subVal) do
                            debug_print(indent .. "    [" .. i .. "] = " .. tostring(val))
                        end
                        debug_print(indent .. "  }")
                    else
                        local formattedVal = type(subVal) == "string" and "\"" .. subVal .. "\"" or tostring(subVal)
                        debug_print(indent .. "  [" .. subKey .. "] = " .. formattedVal)
                    end
                end
                debug_print(indent .. "}")
            end
        end
    end
end-- Debug only end

function controller_info()
    -- Build plugin mappings into the controls tables

    -- Build the list of sends programatically 
    for s = 0, MAX_SENDS-1,1 do
        local controlID = CONTROL_ID_SEL_SEND_0 + s
        controls[controlID] = {
            name = 'SEL Send ' .. (s + 1),
            controlID = controlID,
            label= 'Mixer Send ' ..(s + 1),
            midi={MIDI_CHANNELS.COMMAND, MIXER_SEND_0_COMMAND + s,0x01},
            inport='Roto-Control',
            outport='Roto-Control',
            textFeedback=false,
            selfFeedback=false
        }
    end

    for s = 0, NUM_PLUGIN_NAME_SLOTS -1,1 do
        local controlID = CONTROL_ID_PLUGIN_NAME_0 + s
        controls[controlID] = {
            name = 'Insert ' .. (s + 1).. ' Name',
            controlID = controlID,
            label= 'Insert ' ..(s + 1) .. ' Name',
        }
    end

    -- Add the for loop to build each channel mathematically
    param_index = 0
    for c = MIDI_CHANNELS.PLUGIN_END, MIDI_CHANNELS.PLUGIN_START, -1 do
        for i = 0, (MAX_KNOBS_PER_CHANNEL - 1) do
            local controlID = CONTROL_ID_PLUGIN_0 + param_index
            controls[controlID] = {
                name='Plugin ' .. (param_index + 1), 
                controlID = controlID, 
                objectType='Knob', 
                midi={ c, 0x00 + i, MIDI_MSB, c, 0x20 + i, MIDI_LSB }, 
                midiTouched={ c, MIDI_CC.PLUGIN_TOUCH_0 + i, MIDI_LSB }
            }
            param_index = param_index + 1
        end
    end

-- Debug only
    -- printTable(controls, CONTROL_ID_PLUGIN_0 - 1)
-- Debug only end

    -- Add plugin and instrument parameter mappting to the roto_control_mapping table.
    roto_control_mapping[#roto_control_mapping + 1] = { mode='Plugin' }
    roto_control_mapping[#roto_control_mapping + 1] = { control='Plugin Name', CSTrack=true, trackParam=CS_CURINSERTPLUGIN, paramName='@p#-@pn' }
    roto_control_mapping[#roto_control_mapping + 1] = { control='Selected Track', CSTrack=true, trackParam=CS_NAME, paramName='@t#-@tn'}
    roto_control_mapping[#roto_control_mapping + 1] = { control='Plugin Parameter Count', CSTrack=true, trackParam=CS_CURINSERTNPARAMS, paramName='@pO' }
    roto_control_mapping[#roto_control_mapping + 1] = { control='Display Color 1', CSTrack=true, trackParam=CS_COLOR }
    for i = 0, MAX_PLUGIN_PARAMETERS - 1 do
        roto_control_mapping[#roto_control_mapping + 1] = {
            control='Plugin ' .. i + 1, 
            CSTrack=true, 
            trackParam=CS_PLUGINPAR1, 
            paramOffset=i, 
            paramName='@tp' 
        }
    end

    roto_control_mapping[#roto_control_mapping + 1] = { mode='Instrument' }
    roto_control_mapping[#roto_control_mapping + 1] = { control='Instrument Name', CSTrack=true, trackParam=CS_INSTRUMENT, paramName='@in' }
    roto_control_mapping[#roto_control_mapping + 1] = { control='Selected Track', CSTrack=true, trackParam=CS_NAME, paramName='@t#-@tn'}
    roto_control_mapping[#roto_control_mapping + 1] = { control='Instrument Parameter Count', CSTrack=true, trackParam=CS_INSTNPARAMS, paramName='@iO' }
    roto_control_mapping[#roto_control_mapping + 1] = { control='Display Color 1', CSTrack=true, trackParam=CS_COLOR }
    for i = 0, MAX_PLUGIN_PARAMETERS - 1 do
        roto_control_mapping[#roto_control_mapping + 1] = {
            control="Plugin " .. i + 1, 
            CSTrack=true, 
            trackParam=CS_INSTRUMENTPAR1,
            paramOffset=i, 
            paramName='@tp' 
        }
    end

    -- Add roto control mapping send controls programatically
    for s = 0, MAX_SENDS - 1, 1 do
        roto_control_mapping[#roto_control_mapping + 1] = {
            mode='Send ' .. (s + 1)
        }
        for knob_n = 0, NUM_CHANNELS - 1, 1 do
            roto_control_mapping[#roto_control_mapping + 1] = {
                control='Knob ' .. (knob_n+1),
                faderBankTrack = knob_n,
                trackParam = AUSEND1,
                paramOffset = s,
                paramName = '@tn'
            }
        end
        for i = 0, NUM_CHANNELS - 1 do
            roto_control_mapping[#roto_control_mapping + 1] = {
                    control = "Display Color " .. (i + 1),
                    faderBankTrack = i,
                    trackParam = CS_COLOR
                }
        end
        for i = 0, NUM_CHANNELS - 1 do
            roto_control_mapping[#roto_control_mapping + 1] = {
                    control='Meter ' .. (i + 1) .. ' Left', 
                    faderBankTrack=i, 
                    paramOffset=1, 
                    trackParam=CS_LEVEL0
                }
            roto_control_mapping[#roto_control_mapping + 1] = {
                    control='Meter ' .. (i + 1) .. ' Right', 
                    faderBankTrack=i, 
                    paramOffset=0, 
                    trackParam=CS_LEVEL0
                }
        end
    end 

    -- Add the instrument and plugin sweep mapping parameters
    roto_control_mapping[#roto_control_mapping + 1] = { mode='Plugin Sweep' }
    for i = 0, MAX_PLUGIN_PARAMETERS - 1 do
        roto_control_mapping[#roto_control_mapping + 1] = {
            control='Plugin ' .. i + 1, 
            CSTrack=true, 
            trackParam=CS_PLUGINPAR1, 
            paramOffset=i, 
            paramName='@tp' 
        }
    end

    roto_control_mapping[#roto_control_mapping + 1] = { mode='Instrument Sweep' }
    for i = 0, MAX_PLUGIN_PARAMETERS - 1 do
        roto_control_mapping[#roto_control_mapping + 1] = {
            control='Plugin ' .. i + 1, 
            CSTrack=true, 
            trackParam=CS_INSTRUMENTPAR1, 
            paramOffset=i, 
            paramName='@tp' 
        }
    end

-- Debug only
    -- printTable(roto_control_mapping)
-- Debug only end

    return {
        model = 'Roto-Control',
        manufacturer = 'Melbourne Instruments',
        version = VERSION,
        copyright = [[Copyright (c) 2025 Melbourne Instruments. All Rights Reserved.]],

        items = controls,
        assignments = roto_control_mapping,
    }
end

function controller_initialize(applicationName)
    print(string.format('Melbourne Instruments Roto-Control Version: %s - %s', VERSION, applicationName))

    local midi_msg = {}
    -- Allow sysex to be sent in this function
    midi_out_enabled = true

    -- Say Hello
    local msg = generate_sysex(GENERAL_COMMAND_GROUP, DAW_STARTED, {})
    sysex_append(midi_msg, msg, 500)

    -- Configure Roto Control
    msg = generate_sysex(MIXER_COMMAND_GROUP, NUM_SENDS, { MAX_SENDS })
    sysex_append(midi_msg, msg, 5)
    msg = generate_sysex(GENERAL_COMMAND_GROUP, NUM_TRACKS, { 0, NUM_CHANNELS })
    sysex_append(midi_msg, msg, 5)
    msg = generate_sysex(GENERAL_COMMAND_GROUP, FIRST_TRACK, { 0, 0 })
    sysex_append(midi_msg, msg, 5)
    msg = generate_sysex(PLUGIN_COMMAND_GROUP, NUM_DEVICES, { NUM_CHANNELS })
    sysex_append(midi_msg, msg, 5)
    msg = generate_sysex(PLUGIN_COMMAND_GROUP, FIRST_DEVICE, { 0 })
    sysex_append(midi_msg, msg, 5)
    msg = generate_sysex(MIXER_COMMAND_GROUP, SET_MIX_VU_METER_POINTS, { METER_LEVEL_YELLOW, METER_LEVEL_RED })
    sysex_append(midi_msg, msg, 5)

    -- Prevent any functions other than this one from sending any further MIDI to Roto Control before it is ready.
    midi_out_enabled = false

    return {midi = midi_msg}
end

-- Return the maximum text length supported by Roto Control
function CSLabelSize(controlID)
    if controlID == CONTROL_ID_SELECTED_TRACK then
        return MAX_TRACK_STRING_LENGTH
    elseif (controlID == CONTROL_ID_PLUGIN_NAME) or (controlID == CONTROL_ID_INSTRUMENT_NAME) then
        return MAX_HASH_STRING_LENGTH
    else
        return MAX_STRING_LENGTH
    end
end 

function CSLabel(controlID, pText, textLength, labelLine, nSubsequentControls)
    local midi_msg = {}
    pText = pText:sub(1, textLength)

    -- Ignore controls that we don't want labels for
    if (controlID == -1) then
        return nil
    elseif (controlID >= CONTROL_ID_KNOB_0) and (controlID <= CONTROL_ID_KNOB_7) then
        local index = controlID - CONTROL_ID_KNOB_0
        debug_print(string.format('Label (%d): %s', controlID, pText))
        local sub_string = pText:sub(1,MAX_STRING_LENGTH)
        if not (((current_mode == MODE_MIX_FOCUSED) or (current_mode == MODE_MIX_FOCUSED_2)) and (sub_string == CLEAR_TRACK_STRING)) then
            if (sub_string == CLEAR_TRACK_STRING) or (#pText == 0) or (((current_mode == MODE_MIX_FOCUSED) or (current_mode == MODE_MIX_FOCUSED_2)) and (sub_string == NO_STRING)) then
                -- If logic attempts to clear the screens reset the track details - the knob is unmapped.
                if ( current_mode == MODE_MIX) or (((current_mode == MODE_MIX_FOCUSED) or (current_mode == MODE_MIX_FOCUSED_2)) and (track_names_cached[index] ~= pText)) then 
                    track_names_cached[index] = pText
                    local msg = generate_sysex(GENERAL_COMMAND_GROUP, RESET_TRACK_DETAILS, { 0, index })
                    sysex_append(midi_msg, msg, 5)
                    mix_values_cached[controlID] = nil
                end 
            else
                local disp_name = string_normalise(pText)
                if (current_mode == MODE_MIX) or (((current_mode == MODE_MIX_FOCUSED) or (current_mode == MODE_MIX_FOCUSED_2)) and (track_names_cached[index] ~= pText)) or (current_mode == MODE_TRACK_SELECT) then
                    -- Don't send repeat track names
                    if track_names_cached[index] == pText then
                        return nil
                    end
                    track_names_cached[index] = pText
                    local color = COLOR_TRACK_LABEL

                    -- Build the SET_TRACK_DETAILS command
                    local track_details = {0}
                    track_details[#track_details + 1] = index
                    bytestring_append(track_details, disp_name)

                    -- Set the color
                    track_details[#track_details + 1] = color
                    track_details[#track_details + 1] = 0

                    local msg = generate_sysex(GENERAL_COMMAND_GROUP, SET_TRACK_DETAILS, track_details)
                    sysex_append(midi_msg, msg, 5)
                end
            end
        else
            mix_values_cached[controlID] = nil
        end
    elseif (controlID == CONTROL_ID_SELECTED_TRACK) then
        if (current_mode ~= MODE_PLUGIN_ENABLE) and (current_mode ~= MODE_PLUGIN_SELECT) then
            local index, disp_name = get_index_and_string(pText)
            if (index ~= 0) and ((current_mode ~= MODE_PLUGIN) or ((current_mode == MODE_PLUGIN) and (selected_track_index_cached ~= index))) then
                selected_track_index_cached = index
                disp_name = string_normalise(disp_name)
                local track_index =  math.fmod(index - 1, NUM_CHANNELS)
                debug_print(string.format('Track index (%d): %d', controlID, track_index))
                debug_print(string.format('Track name (%d): %s', controlID, disp_name))

                local red, green, blue = IntegerToRGB(cached_color)
                debug_print(string.format('Focused Display Color (%d): %d %d %d', track_index, red, green, blue))
                local track_details = {0}
                track_details[#track_details + 1] = track_index
                bytestring_append(track_details, disp_name)
                track_details[#track_details + 1] = bit32.rshift(bit32.band(red, 0x80), 7)
                track_details[#track_details + 1] = bit32.band(red, 0x7F)
                track_details[#track_details + 1] = bit32.rshift(bit32.band(green, 0x80), 7)
                track_details[#track_details + 1] = bit32.band(green, 0x7F)
                track_details[#track_details + 1] = bit32.rshift(bit32.band(blue, 0x80), 7)
                track_details[#track_details + 1] = bit32.band(blue, 0x7F)

                local msg = generate_sysex(MIXER_COMMAND_GROUP, DAW_SELECT_FOCUS_TRACK, track_details)
                sysex_append(midi_msg, msg, 5)

                -- Once we set up the track name and color we can allow track name updates via feedback
                filter_track_name = false
            end
        end
    elseif (controlID == CONTROL_ID_PLUGIN_NAME) then
        local plugin_index, plugin_name = get_index_and_string(pText)
        if (plugin_index ~= 0) and (current_mode == MODE_PLUGIN) and (instrument_mode == false) then
            local display_index =  math.fmod(plugin_index, NUM_CHANNELS)
            if (plugin_name == NO_PLUGIN) then
                plugin_name_cached = nil
                debug_print(string.format('Plugin name (%d): NO PLUGIN', controlID, pText))
                --Send an empty plugin details message if there is no plugin on this slot
                local msg = generate_plugin_details(plugin_index, '')
                sysex_append(midi_msg, msg, 5)
            elseif (plugin_name_cached ~= plugin_name) then
                -- Update the cached selected plugin in case it needs to be restored later
                selected_plugin = plugin_index
                plugin_name_cached = plugin_name

                debug_print(string.format('Plugin index (%d): %d', controlID, plugin_index))
                debug_print(string.format('Plugin name (%d): %s', controlID, plugin_name))
                local msg = generate_plugin_details(plugin_index, plugin_name)
                sysex_append(midi_msg, msg, 5)
            end
        end
    elseif (controlID == CONTROL_ID_INSTRUMENT_PARAMETER_COUNT) then
        if (current_mode == MODE_PLUGIN) then
            debug_print(string.format('Instrument parameter count: %s', string_normalise(pText)))
            local count = tonumber(pText)
            if count then
                slected_plugin_parameter_count = count
            end
        end
    elseif (controlID == CONTROL_ID_PLUGIN_PARAMETER_COUNT) then
        if (current_mode == MODE_PLUGIN) then
            debug_print(string.format('Plugin parameter count: %s', string_normalise(pText)))
            local count = tonumber(pText)
            if count then
                slected_plugin_parameter_count = count
            end
            -- Special case - send the name for empty plugins
            if (count == 1) and (instrument_mode == false) then
                local plugin_name = ''
                local plugin_index = 1
                local msg = generate_plugin_details(plugin_index, plugin_name)
                sysex_append(midi_msg, msg, 5)
            end
        end
    elseif (controlID >= CONTROL_ID_PLUGIN_0) and (controlID <= CONTROL_ID_PLUGIN_0 + slected_plugin_parameter_count) then
        if (current_mode == MODE_PLUGIN) or (current_mode == MODE_SMART) then
            -- debug_print(string.format('Plugin Parameter (%d): %s', controlID, string_normalise(pText)))
            plugin_parameter_names[controlID] = pText

            if (current_mode == MODE_SMART) and (pText ~= NO_SMART_PARAM) then
                color = COLOR_PLUGIN_LABEL
                local disp_name = string_normalise(pText)

                -- Build the SET_PLUGIN_CTL_DETAILS command
                local index = controlID - CONTROL_ID_PLUGIN_0
                local disp_details = {0}
                disp_details[#disp_details + 1] = index
                bytestring_append(disp_details, disp_name)

                -- Set the color
                disp_details[#disp_details + 1] = color

                debug_print(string.format('Smart Param (%d): %s', controlID, disp_name))
                local msg = generate_sysex(PLUGIN_COMMAND_GROUP, SET_PLUGIN_CTL_DETAILS, disp_details)
                sysex_append(midi_msg, msg, 5)
            end
        end
    elseif (controlID == CONTROL_ID_TOUCH_VALUE) then
        if plugin_last_touched_index then
            if (current_mode == MODE_PLUGIN) or (current_mode == MODE_SMART) then
                disp_value = plaugin_values_cached[plugin_last_touched_index]
                if disp_value and (disp_value ~= NO_PARAM_VALUES) then
                    local index_msb = bit32.rshift(bit32.band(plugin_last_touched_index, 0x80), 7)
                    local index_lsb = bit32.band(plugin_last_touched_index, 0x7F)
                    local value_details = {index_msb}
                    value_details[#value_details + 1] = index_lsb
                    bytestring_append(value_details, disp_value)

                    local msg = generate_sysex(GENERAL_COMMAND_GROUP, PARAM_VALUES, value_details)
                    sysex_append(midi_msg, msg, 0)
                end
            end
            plugin_last_touched_index = nil
        end
        if plugin_last_button_index then
            if (current_mode == MODE_PLUGIN) or (current_mode == MODE_SMART) then
                disp_value = plaugin_values_cached[plugin_last_button_index]
                if disp_value and (disp_value ~= NO_PARAM_VALUES) then
                    local index_msb = bit32.rshift(bit32.band(plugin_last_button_index, 0x80), 7)
                    local index_lsb = bit32.band(plugin_last_button_index, 0x7F)
                    local value_details = {index_msb}
                    value_details[#value_details + 1] = index_lsb
                    bytestring_append(value_details, disp_value)

                    local msg = generate_sysex(GENERAL_COMMAND_GROUP, PARAM_VALUES, value_details)
                    sysex_append(midi_msg, msg, 0)
                end
            end
            plugin_last_button_index = nil
        end
    end

    if next(midi_msg) then
        return {midi = midi_msg}
    else
        return nil
    end
end

function CSLongLabel(controlID, pText, textLength)
    return CSLabel(controlID, pText, textLength, 0, 1)
end

function CSFeedback(controlID, currentValue, minValue, maxValue, nSubSequentControls, centerValue, assignment)
    if (controlID >= CONTROL_ID_COLOR_0) and (controlID <= CONTROL_ID_COLOR_7) and (currentValue ~= 0) then
        local index = controlID - CONTROL_ID_COLOR_0
        if (current_mode == MODE_MIX) or (((current_mode == MODE_MIX_FOCUSED) or (current_mode == MODE_MIX_FOCUSED_2)) and (display_color_cached[index] ~= currentValue)) or (current_mode == MODE_TRACK_SELECT) then
            -- Cache the color for later use
            if ((current_mode == MODE_MIX_FOCUSED) or (current_mode == MODE_MIX_FOCUSED_2)) then
                cached_color = currentValue
                display_color_cached[index] = currentValue
            end

            if display_color_filter[index] == currentValue then
                return nil
            end
            display_color_filter[index] = currentValue

            local red, green, blue = IntegerToRGB(currentValue)
            debug_print(string.format('Display Color (%d): %d %d %d', index, red, green, blue))
            local color_details = {0}
            color_details[#color_details + 1] = index
            color_details[#color_details + 1] = bit32.rshift(bit32.band(red, 0x80), 7)
            color_details[#color_details + 1] = bit32.band(red, 0x7F)
            color_details[#color_details + 1] = bit32.rshift(bit32.band(green, 0x80), 7)
            color_details[#color_details + 1] = bit32.band(green, 0x7F)
            color_details[#color_details + 1] = bit32.rshift(bit32.band(blue, 0x80), 7)
            color_details[#color_details + 1] = bit32.band(blue, 0x7F)

            local midi_msg = {}
            local msg = generate_sysex(GENERAL_COMMAND_GROUP, SET_TRACK_COLOR, color_details)
            sysex_append(midi_msg, msg, 5)
            return { midi = midi_msg, ret = 0 }
        elseif (controlID == CONTROL_ID_COLOR_0) and ((current_mode == MODE_SMART) or (current_mode == MODE_PLUGIN)) then
            -- Cache the color for later use
            cached_color = currentValue

            local red, green, blue = IntegerToRGB(currentValue)
            debug_print(string.format('Display Color: %d %d %d', red, green, blue))
            local color_details = {}
            color_details[#color_details + 1] = bit32.rshift(bit32.band(red, 0x80), 7)
            color_details[#color_details + 1] = bit32.band(red, 0x7F)
            color_details[#color_details + 1] = bit32.rshift(bit32.band(green, 0x80), 7)
            color_details[#color_details + 1] = bit32.band(green, 0x7F)
            color_details[#color_details + 1] = bit32.rshift(bit32.band(blue, 0x80), 7)
            color_details[#color_details + 1] = bit32.band(blue, 0x7F)

            local midi_msg = {}
            local msg = generate_sysex(GENERAL_COMMAND_GROUP, SET_CURRENT_TRACK_COLOR, color_details)
            sysex_append(midi_msg, msg, 5)
            return { midi = midi_msg, ret = 0 }
        end
    elseif (controlID >= CONTROL_ID_PLUGIN_NAME_0) and (controlID <= (CONTROL_ID_PLUGIN_NAME_0 + NUM_PLUGIN_NAME_SLOTS - 1)) then
            return { ret = MAX_HASH_STRING_LENGTH }
    elseif (controlID == CONTROL_ID_INSTRUMENT_NAME) then
            return { ret = MAX_HASH_STRING_LENGTH }
    elseif (controlID >= CONTROL_ID_METER_0) and (controlID <= CONTROL_ID_METER_15) then
        if midi_out_enabled == false then
            return {}
        end
        if controls and controls[controlID] and controls[controlID].midi then
            local msg = controls[controlID].midi
            if msg[3] then
                local value_7_bit = 0
                if currentValue > 0 then
                    -- Convert the amplitude into linear
                    local meter_level = 47 * math.log(currentValue/maxValue, 10) + 127

                    -- Clamp and round
                    meter_level = math.min(127, math.max(meter_level, 0))
                    value_7_bit = math.floor(meter_level + 0.5)
                end

                local midi_msg = { msg[1], msg[2], bit32.band(value_7_bit, 0x7F) }
                return { midi = midi_msg, ret = 0 }
            end
        end
    elseif (controlID >= CONTROL_ID_KNOB_0) and (controlID <= CONTROL_ID_KNOB_7) then
        -- Feed back 14 bit MIDI value for knobs
        if ((current_mode == MODE_MIX) or (current_mode == MODE_MIX_FOCUSED) or (current_mode == MODE_MIX_FOCUSED_2)) and controls and controls[controlID] and controls[controlID].midi then
            local msg = controls[controlID].midi
            -- Filter out knob zeroing on control clear
            if msg[5] and maxValue ~= 1 then
                local value_14_bit = math.floor((((currentValue - minValue) / (maxValue - minValue)) * 16383.0) + 0.5)
                -- debug_print(string.format('Control (%s): %x %d %d', controls[controlID].name, value_14_bit, bit32.rshift(value_14_bit, 7), bit32.band(value_14_bit, 0x7F)))
                local midi_msg = { msg[1], msg[2], bit32.rshift(value_14_bit, 7), msg[4], msg[5], bit32.band(value_14_bit, 0x7F) }
                return { midi = midi_msg, ret = MAX_STRING_LENGTH }
            end
        end
    elseif ((controlID >= CONTROL_ID_BUTTON_0) and (controlID <= CONTROL_ID_BUTTON_14)) or ((controlID >= CONTROL_ID_PLAY) and (controlID <= CONTROL_ID_PUNCH)) then
        -- Invert the LED value for plugin enable - for all other controls pass through the value
        if controls and controls[controlID] and controls[controlID].midi then
            local msg = controls[controlID].midi
            if msg[3] then
                local value_7_bit = math.floor((((currentValue - minValue) / (maxValue - minValue)) * 127.0) + 0.5)
                if current_mode == MODE_PLUGIN_ENABLE then
                    if (value_7_bit == 0) then
                        value_7_bit = 127
                    else
                        value_7_bit = 0
                    end
                end
                -- debug_print(string.format('Control (%s): %x %d', controls[controlID].name, value_7_bit, bit32.band(value_7_bit, 0x7F)))
                local midi_msg = { msg[1], msg[2], bit32.band(value_7_bit, 0x7F) }
                return { midi = midi_msg, ret = 0 }
            end
        end
    elseif (controlID >= CONTROL_ID_PLUGIN_0) and (controlID <= CONTROL_ID_PLUGIN_0 + slected_plugin_parameter_count) then
        local plugin_index = controlID - CONTROL_ID_PLUGIN_0
        if (learn_mode == LEARN_MODE_ENABLED) then
            if current_mode == MODE_SWEEP then
                local msg = controls[controlID].midi
                if msg[5] and (plugin_index == last_learned_param_index) then
                    -- Respond once per request
                    if (parameter_sweep_respond == true) then
                        parameter_sweep_respond = false
                        local normalised_value = (currentValue - minValue) / (maxValue - minValue)
                    else
                        return { ret = 0 }
                    end
                else
                    -- No need to respond to updates for parameters not being learnt
                    return { ret = 0 }
                end
            end

            if plugin_parameter_names[controlID] then
                if (plugin_parameter_names[controlID] ~= last_learned_plugin_parameter_name) and (plugin_index <= slected_plugin_parameter_count) then
                    --cache the current value so we can restore it after sweeping
                    local normalised_value = (currentValue - minValue) / (maxValue - minValue)
                    local value_14_bit = math.floor(normalised_value* 16383.0)

                    cached_param_sweep_current_value = value_14_bit
                    debug_print(string.format('LEARN: Plugin Parameter (%d): %s', controlID, plugin_parameter_names[controlID]))
                    last_learned_plugin_parameter_name = plugin_parameter_names[controlID]

                    -- Reset the parameter sweep settings
                    parameter_sweep_count = 0
                    last_parameter_sweep_value = ''
                    last_learned_param_index = plugin_index
                    parameter_sweep_table = {}
                    parameter_sweep_state = SWEEP_SYNC_1
                    parameter_sweep_complete = false
                    parameter_sweep_value = -1
                    parameter_sweep_value_change = -1
                    small_step_counter = 0

                    -- Request a parameter sweep from Roto Control
                    local midi_msg = {}
                    local index_msb = bit32.rshift(bit32.band(plugin_index, 0x80), 7)
                    local index_lsb = bit32.band(plugin_index, 0x7F)
                    local data = {index_msb}
                    data[#data + 1] = index_lsb
                    local msg = generate_sysex(PLUGIN_COMMAND_GROUP, PLUGIN_PARAM_SWEEP, data)
                    sysex_append(midi_msg, msg, 5)
                    return { midi = midi_msg, ret = 0 }
                else
                    -- The paramater sweep runs a simple state machine

                    -- We are in the parameter sweep - send the learn command when we reach the end.
                    local normalised_value = (currentValue - minValue) / (maxValue - minValue)

                    if parameter_sweep_state == SWEEP_SYNC_1 then
                        debug_print('** Parameter SWEEP_SYNC_1')
                        -- debug_print(normalised_value)
                        if parameter_sweep_value == 0x00 then
                            parameter_sweep_state = SWEEP_SYNC_2
                        end
                        return nil 
                    elseif parameter_sweep_state == SWEEP_SYNC_2 then
                        debug_print('** Parameter SWEEP_SYNC_2')
                        -- debug_print(normalised_value)
                        if parameter_sweep_value == 0x7f then
                            parameter_sweep_state = SWEEP_RUNNING_PENDING
                            prev_current_value = 0
                        else
                            parameter_sweep_state = SWEEP_SYNC_1
                        end
                        return nil 
                    elseif parameter_sweep_state == SWEEP_RUNNING then
                        debug_print('* Parameter SWEEP_RUNNING')
                        debug_print(small_step_counter)
                        if(small_step_counter > 4) then
                            parameter_sweep_value = 0x7f
                            parameter_sweep_state = SWEEP_COMPLETE
                            parameter_sweep_count = MAX_QUANTISED_STEPS + 1
                        end
                        cached_normalised_value = normalised_value
                        -- debug_print(normalised_value)
                        if parameter_sweep_value == 0x7f then
                            parameter_sweep_state = SWEEP_COMPLETE
                        end
                        if (plugin_learn_restart) then
                            debug_print("Plugin learn restart")

                            -- Reset the parameter sweep settings
                            parameter_sweep_count = 0
                            last_parameter_sweep_value = ''
                            last_learned_param_index = plugin_index
                            parameter_sweep_table = {}
                            parameter_sweep_state = SWEEP_SYNC_1
                            parameter_sweep_complete = false
                            parameter_sweep_value = -1
                            parameter_sweep_value_change = -1
                            small_step_counter = 0
                            plugin_learn_restart = false
                            local msg = generate_sysex(PLUGIN_COMMAND_GROUP, PLUGIN_LEARN_RESTART, 0)
                            parameter_sweep_state = SWEEP_SYNC_1
                            sysex_append(midi_msg, msg, 5)
                            return {midi = midi_msg, ret = 0}
                        end
                        local midi_msg = {}
                        local index_msb = bit32.rshift(bit32.band(plugin_index, 0x80), 7)
                        local index_lsb = bit32.band(plugin_index, 0x7F)
                        local data = {index_msb}
                        data[#data + 1] = index_lsb
                        local msg = generate_sysex(PLUGIN_COMMAND_GROUP, PLUGIN_PARAM_SWEEP, data)
                        sysex_append(midi_msg, msg, 5)
                        return { midi = midi_msg, ret = MAX_STRING_LENGTH }
                    elseif parameter_sweep_state == SWEEP_COMPLETE then
                        debug_print('* Parameter SWEEP_COMPLETE')
                        debug_print(string.format('Sweep count: %d', parameter_sweep_count))
                        parameter_sweep_state = SWEEP_WAITING

                        for _, v in ipairs(parameter_sweep_table) do
                            debug_print(v)
                        end

                        -- Build LEARN_PARAM command
                        local index_msb = bit32.rshift(bit32.band(plugin_index, 0x80), 7)
                        local index_lsb = bit32.band(plugin_index, 0x7F)
                        local plugin_digest = get_hash(last_learned_plugin_parameter_name, 6)
                        local macro_byte = 0
                        local centre_indent = 0
                        local quantised_steps = 0
                        local param_position = 0 -- Calculate this from the value
                        local param_name = string_normalise(last_learned_plugin_parameter_name)
                        last_learned_plugin_parameter_name = ''
                        learn_mode = LEARN_MODE_END
                        if parameter_sweep_count <= MAX_QUANTISED_STEPS then
                            quantised_steps = parameter_sweep_count
                        end

                        local data = {index_msb}
                        data[#data + 1] = index_lsb
                        bytestring_append(data, plugin_digest)
                        data[#data + 1] = macro_byte
                        data[#data + 1] = centre_indent
                        data[#data + 1] = quantised_steps
                        data[#data + 1]  = 0x0
                        data[#data + 1] = 0x0
                        
                        bytestring_append(data, param_name)
                        if parameter_sweep_count <= MAX_QUANTISED_STRING_STEPS then
                            -- Zero fill the table so live values are used instead
                            local zero_bytes = string.rep(string.char(0), MAX_STRING_LENGTH + 1)
                            for _, _ in ipairs(parameter_sweep_table) do
                                bytestring_append(data, zero_bytes)
                            end
                        end

                        local midi_msg = {}
                        local msg = generate_sysex(PLUGIN_COMMAND_GROUP, LEARN_PARAM, data)
                        sysex_append(midi_msg, msg, 5)
                        -- Now send the cached value so that we return to the previously correct value before learning the param
                        return { midi = midi_msg, ret = 0 }
                    end
                end
            end
        elseif learn_mode == LEARN_MODE_DISABLED then
            -- Feed back 14 bit MIDI value
            if ((current_mode == MODE_PLUGIN) or (current_mode == MODE_SMART)) and controls and controls[controlID] and controls[controlID].midi and plugin_index < slected_plugin_parameter_count then
                -- When a filter has been requested filter out the first position sent for each control.
                -- When a second position for any specific control is sent we can disable the filter.
                if (filter_plugin_pos == true) then
                    if plugin_position_filter[controlID] == nil then
                        plugin_position_filter[controlID] = true
                        return { ret = 0 }
                    else
                        filter_plugin_pos = false
                        plugin_position_filter = {}
                    end
                end

                local msg = controls[controlID].midi
                if msg[5] then
                    local value_14_bit = math.floor((((currentValue - minValue) / (maxValue - minValue)) * 16383.0) + 0.5)
                    -- debug_print(string.format('Control (%s): %x %d %d', controls[controlID].name, value_14_bit, bit32.rshift(value_14_bit, 7), bit32.band(value_14_bit, 0x7F)))
                    local midi_msg = { msg[1], msg[2], bit32.rshift(value_14_bit, 7), msg[4], msg[5], bit32.band(value_14_bit, 0x7F) }
                    return { midi = midi_msg, ret = MAX_STRING_LENGTH }
                end
            end
        end
    elseif (controlID == CONTROL_ID_SELECTED_TRACK) then
        if (current_mode == MODE_PLUGIN) or (current_mode == MODE_SMART) or (current_mode == MODE_TRACK_SELECT) then
            return {ret = MAX_STRING_LENGTH }
        end
    elseif (controlID == CONTROL_ID_PING_RESPONSE) then
        local midi_msg = {}
        midi_out_enabled = true
        local msg = generate_sysex(GENERAL_COMMAND_GROUP, DAW_PING_RESP, {LOGIC_PRO_DAW} )
        midi_out_enabled = false
        sysex_append(midi_msg, msg, 5)
        return { midi = midi_msg, ret = 0 }
    end

    return { ret = 0 }
end

function CSFeedbackText(controlID, pText, textLength, nSubSequentControls)
    local midi_msg = {}
    pText = pText:sub(1, textLength)

    if (controlID >= CONTROL_ID_PLUGIN_0) and (controlID <= CONTROL_ID_PLUGIN_0 + slected_plugin_parameter_count) then
        local plugin_index = controlID - CONTROL_ID_PLUGIN_0
        if plugin_parameter_names[controlID] and pText and (pText ~= NO_PLUGIN_PARAM) and (pText ~= CLEAR_PLUGIN_PARAM) then
            debug_print(string.format('Feedback(%s): %s', controls[controlID].name, pText))
            -- debug_print(string.format('val %d', parameter_sweep_value))
            if parameter_sweep_state == SWEEP_RUNNING then
                if (last_parameter_sweep_value ~= pText) then
                    local delta_step = parameter_sweep_value - parameter_sweep_value_change
                    parameter_sweep_value_change = parameter_sweep_value
                    if (delta_step <= 4) then
                        small_step_counter  = small_step_counter + 1
                    else
                        small_step_counter = 0
                    end

                    -- Check if we have recieved a value below what we previously saw. this means the knob has traveled backwards, 
                    -- and the user is probably still holding the knob. sweep is indicated to start again
                    if (cached_current_value  < prev_current_value) then 
                        debug_print("RESTART LEARN")
                        plugin_learn_restart = true
                    end
                    prev_current_value = cached_current_value
                    last_parameter_sweep_value = pText
                    parameter_sweep_count = parameter_sweep_count + 1
                    if (parameter_sweep_count <= MAX_QUANTISED_STRING_STEPS) then
                        parameter_sweep_table[#parameter_sweep_table + 1] = pText
                    end
                end
            elseif learn_mode == LEARN_MODE_DISABLED then
                -- Filter out any repeat values to prevent unneccesary sends
                local disp_value = string_normalise(pText)
                last_value = plaugin_values_cached[plugin_index]
                plaugin_values_cached[plugin_index] = disp_value
                if (last_value == nil) or (last_value == disp_value) then
                    return nil
                end

                -- Don't send empty strings
                if (disp_value == NO_PARAM_VALUES) or (disp_value == nil) then
                    return nil
                end

                local index_msb = bit32.rshift(bit32.band(plugin_index, 0x80), 7)
                local index_lsb = bit32.band(plugin_index, 0x7F)
                local value_details = {index_msb}
                value_details[#value_details + 1] = index_lsb
                bytestring_append(value_details, disp_value)

                local msg = generate_sysex(GENERAL_COMMAND_GROUP, PARAM_VALUES, value_details)
                sysex_append(midi_msg, msg, 0)
                return { midi = midi_msg }
            end
        end
    elseif (controlID >= CONTROL_ID_KNOB_0) and (controlID <= CONTROL_ID_KNOB_7) then
        debug_print(string.format('Feedback(%s): %s', controls[controlID].name, pText))
        local disp_value = string_normalise(pText)
        local cached_disp_value = mix_values_cached[controlID]
        mix_values_cached[controlID] = disp_value
        if (cached_disp_value == nil) then
            return nil
        end

        -- Don't send empty strings
        if (disp_value == NO_PARAM_VALUES) or (disp_value == nil) then
            return nil
        end

        local value_details = {0} -- button / knob
        local index = (controlID - CONTROL_ID_KNOB_0)
        value_details[#value_details + 1] = index
        bytestring_append(value_details, disp_value)

        local msg = generate_sysex(GENERAL_COMMAND_GROUP, PARAM_VALUES, value_details)
        sysex_append(midi_msg, msg, 0)

        return { midi = midi_msg }
    elseif (controlID >= CONTROL_ID_PLUGIN_NAME_0) and (controlID <= CONTROL_ID_PLUGIN_NAME_0 + NUM_PLUGIN_NAME_SLOTS-1) then
        if((current_mode == MODE_PLUGIN_SELECT) or (current_mode == MODE_PLUGIN_ENABLE)) then
            local plugin_name = pText
            -- Strip * char which is used to indicate if a plugin is bypassed
            if (string.sub(plugin_name, 1, 1) == "*") then
                plugin_name = string.sub(plugin_name, 2)
            end
            
            -- Check for screen clear string
            if (plugin_name == NO_PLUGIN) then
                plugin_name = ''
            end

            if (plugin_name ~= NO_PLUGIN_PARAM) then
                debug_print(string.format('plugin name (%s): %s', controls[controlID].name, plugin_name))
                local plugin_index = controlID - CONTROL_ID_PLUGIN_NAME_0 + 1
                local msg = generate_plugin_details(plugin_index, plugin_name)
                sysex_append(midi_msg, msg, 5)
                return { midi = midi_msg }
            end
        end
    elseif (controlID == CONTROL_ID_INSTRUMENT_NAME) then
        if (current_mode == MODE_PLUGIN) and (instrument_mode == true) and (filter_instrument_name == true) then
            filter_instrument_name = false
            return { ret = 0 }
        end

        if (current_mode == MODE_PLUGIN_SELECT) or (current_mode == MODE_PLUGIN_ENABLE) or ((current_mode == MODE_PLUGIN) and instrument_mode == true) then
            local plugin_name = pText
            -- Strip * char which is used to indicate if a plugin is bypassed
            if (string.sub(plugin_name, 1, 1) == "*") then
                plugin_name = string.sub(plugin_name, 2)
            end
            -- Strip -- chars, so empty slots have an empty string
            if (plugin_name == '--') or (plugin_name == NO_INSTRUMENT) then 
                plugin_name = ''
            end

            local plugin_index = 0
            if (plugin_name ~= CLEAR_INSTRUMENT_STRING) then
                if (current_mode ~= MODE_PLUGIN) or ((current_mode == MODE_PLUGIN) and (plugin_name_cached ~= pText)) then
                    plugin_name_cached = pText
                    debug_print(string.format('Instrument name (%s): %s', controls[controlID].name, plugin_name))
                    local msg = generate_plugin_details(plugin_index, plugin_name)
                    sysex_append(midi_msg, msg, 5)
                    return { midi = midi_msg }
                end
            end
        end
    elseif (controlID == CONTROL_ID_SELECTED_TRACK) then
        if (filter_track_name == false) and (pText ~= CLEAR_PLUGIN_PARAM) and ((current_mode ~= MODE_PLUGIN) or ((current_mode == MODE_PLUGIN) and (selected_track_name_cached ~= pText))) then
            selected_track_name_cached = pText
            disp_name = string_normalise(pText)
            debug_print(string.format('Track name (%d): %s', controlID, disp_name))

            local track_details = {}
            bytestring_append(track_details, disp_name)

            local msg = generate_sysex(GENERAL_COMMAND_GROUP, SET_CURRENT_TRACK_NAME, track_details)
            sysex_append(midi_msg, msg, 5)
            return { midi = midi_msg }
        end
    end
end

function CSLongFeedbackText(controlID, pText, textLength)
    return CSFeedbackText(controlID, pText, textLength, 1)
end

function controller_finalize()
    debug_print('Controller_finalize()')
    -- Needs more work to unmap all buttons and not show labels
    local midi_msg = {}

    -- Always allow the controller to be closed gracefully
    midi_out_enabled = true

    local msg = generate_sysex(MIXER_COMMAND_GROUP, NUM_SENDS, { 0 })
    sysex_append(midi_msg, msg, 5)
    msg = generate_sysex(GENERAL_COMMAND_GROUP, NUM_TRACKS, { 0, 0 })
    sysex_append(midi_msg, msg, 5)
    msg = generate_sysex(PLUGIN_COMMAND_GROUP, NUM_DEVICES, { 0 })
    sysex_append(midi_msg, msg, 5)

    return ({ midi = midi_msg })
end
