# ROTO_CONTROL.py 
# Copyright (c) 2025 Melbourne Instruments. All Rights Reserved.
#
# This script is provided "as is", without any warranty of any kind, express or
# implied, including but not limited to the warranties of merchantability,
# fitness for a particular purpose, and noninfringement. In no event shall the
# authors or copyright holders be liable for any claim, damages, or other
# liability, whether in an action of contract, tort, or otherwise, arising from,
# out of, or in connection with the software or the use or other dealings in the
# software.

from __future__ import absolute_import, print_function, unicode_literals
import Live
from _Framework.ControlSurface import ControlSurface
from _Framework.InputControlElement import *
from _Framework.ButtonElement import *
from _Framework.TransportComponent import *
from _Framework.MixerComponent import *
from _Framework.EncoderElement import *
from _Framework.Layer import *
from ableton.v2.base import listens, listens_group, liveobj_valid
import hashlib
import sys
from time import sleep, time

VERSION = '2.1.0'

# Log output control
LOG_OFF = 1000
LOG_BASIC = 1
LOG_VERBOSE = 2
LOG_PRINT_LEVEL = LOG_BASIC

# System constants
MIDI_CHANNEL = 15
MIDI_FIRST_CC = 12
MIDI_CC_MSG = 0xB0 + MIDI_CHANNEL
NUM_ENCODERS = 8

ENCODER_7_bit = (Live.MidiMap.MapMode.absolute)
ENCODER_14_bit = (Live.MidiMap.MapMode.absolute_14_bit)

# Sysex
MIDI_SYSEX_HEADER = 0xf0
MIDI_SYSEX_END = 0xf7
MI_MANUFACTURER_ID = (0x0, 0x22, 0x3)
ROTO_CONTROL_DEVICE_ID = 0x2

# Command groups
GENERAL_COMMAND_GROUP = 0xa
PLUGIN_COMMAND_GROUP = 0xb
MIXER_COMMAND_GROUP = 0xc

# General commands
DAW_STARTED = 0x1
PING_DAW = 0x2
DAW_PING_RESP = 0x3
NUM_TRACKS = 0x4
FIRST_TRACK = 0x5
SET_FIRST_TRACK = 0x6
TRACK_DETAILS = 0x7
TRACK_DETAILS_END = 0x8
SELECT_TRACK = 0x9
REQUEST_TRANSPORT_STATUS = 0xA
TRANSPORT_STATUS = 0xB
ROTO_DAW_CONNECTED = 0xC

# Plugin commands
SET_PLUGIN_MODE = 0x1
NUM_DEVICES = 0x2
FIRST_DEVICE = 0x3
SET_FIRST_DEVICE = 0x4
PLUGIN_DETAILS = 0x5
PLUGIN_DETAILS_END = 0x6
ROTO_CONTROL_SELECT_DEVICE = 0x7
DAW_SELECT_PLUGIN = 0x8
SET_DEVICE_LEARN = 0x9
LEARN_PARAM = 0xA
CONTROL_MAPPED = 0xB
SET_PLUGIN_ENABLE = 0xC
SET_PLUGIN_LOCK = 0xD
UNMAP_CTL = 0xE
SET_MAPPED_CTL_NAME = 0xF

# Mixer commands
SET_MIXER_ALL_MODE = 0x1
SET_MIXER_SELECTED_MODE = 0x2
NUM_SENDS = 0x3
DAW_SELECT_TRACK = 0x4
SET_MIXER_CHANNEL_MODE = 0x5
TOGGLE_GROUP_TRACK = 0x6

# Constants
MAX_QUANTISED_STEPS = 24
MAX_QUANTISED_STRING_STEPS = 16
MAX_STRING_LENGTH = 13
PLUGIN_CLASS_NAME_INDEX = 0
PLUGIN_NAME_INDEX = 1
ABLETON_LIVE_DAW = 1
PARAM_INDEX_NO_OVERRIDE = 0xFFFF
PARAM_HASH_NO_OVERRIDE = 0xFFFFFFFF
MACRO_PLUGIN_PAGES = 0
MACRO_FORCE_PLUGIN = 0
HAPTIC_CENTER_INDENT = 0

UNIQUE_DEVICE_CLASS_NAMES = [
 'InstrumentGroupDevice',
 'DrumGroupDevice',
 'AudioEffectGroupDevice',
 'MidiEffectGroupDevice',
 'ProxyInstrumentDevice',
 'ProxyAudioEffectDevice',
 'PluginDevice',
 'AuPluginDevice',
 'MxDeviceInstrument',
 'MxDeviceAudioEffect',
 'MxDeviceMidiEffect']

MACRO_DEVICE_CLASS_NAMES = [
 'InstrumentGroupDevice',
 'AudioEffectGroupDevice',
 'MidiEffectGroupDevice',
 'DrumGroupDevice']

MACRO_PLUGIN_W_LIST = [
'InstrumentMeld'
]

MACRO_DEFAULT_NAMES = [
'Instrument Rack',
'Audio Effect Rack',
'MIDI Effect Rack',
'Drum Rack' ]

MACRO_DEVICE_NAME = 'MIMacroDefaultDevice'

class RotoControl(ControlSurface):
    def __init__(self, c_instance):
        ControlSurface.__init__(self, c_instance)
        with self.component_guard():
            self._log_print('Melbourne Instruments Roto-Control Version: {}'.format(VERSION))
            self._encoder_resolution = ENCODER_14_bit
            self._midi_channel = MIDI_CHANNEL
            self._midi_first_cc = MIDI_FIRST_CC
            self._encoder_cc_list = []
            self ._button_cc_list = []
            self._button_list = []
            self._encoder_list = []
            self._transport_button_cc_list = []
            # Variables to be set by sysex messages sent from device
            self._plugin_first_device = 0
            self._mixer_audio_first_track = 0
            self._mixer_master_return_first_track = 0
            self._mixer_encoder_mode = 'LEVEL'
            self._mixer_button_mode = 'MUTE'
            self._mixer_send_index = 0
            self._mixer_selected_mode_page_index = 0
            self._selected_device_index = 0
            self._selected_track_index = 0
            self._selected_plugin_class_name = ''
            self._selected_plugin_name = ''
            self._learn_mode_enabled = False
            self._selected_device_learn_mode = None
            self._plugin_lock = False
            self._locked_device = None
            self._locked_track = None
            self._active_mode = 'MIXER'     # MIDI/MIXER/PLUGIN
            self._restore_plugin_map = None
            self._device_selected_via_roto_control = False
            self._track_selected_via_roto_control = False
            self._mixer_mode = 'MODE_ALL'   # MODE_ALL/MODE_SELECTED
            self._channel_mode = 'AUDIO'    # AUDIO/MASTER_RETURN
            self._selected_track_mode = 'AUDIO'
            self._is_active_start_time = 0
            self._select_device_start_time = 0
            self._expanded_devices_list = []
            self._mute_value_listener_list = {}
            self._mute_listener_list = []
            self._solo_value_listener_list = {}
            self._solo_listener_list = []
            self._arm_value_listener_list = {}
            self._arm_listener_list = []
            self._update_listener_track_list = []
            self._last_detail_change_track_list = []
            self._detail_change_device_list = []
            self._timer_interval = 5        # Set timer interval (5 ticks = 0.5 second)
            self._visible_track_mask = 0
            self._current_track_mask = 0
            self._touch_override = False
            self._setup_control_surface()
            self._setup_buttons()
            self._setup_encoders()
            self._setup_mixer()
        self._RotoControl__on_selected_track_changed.subject = self.song().view
        self._RotoControl__on_selected_parameter_changed.subject = self.song().view
        self._RotoControl__on_re_enable_automation_enabled_changed.subject = self.song()
        self._RotoControl__on_session_record_changed.subject = self.song()
        self._RotoControl__on_tracks_changed_in_live.subject = self.song()

        # Let Roto know we're alive
        self._send_sysex(GENERAL_COMMAND_GROUP, DAW_STARTED, [])

    def _setup_control_surface(self):
        # Set up fixed CCs for encoders and buttons
        for ix in range(NUM_ENCODERS):
            self._encoder_cc_list.append(self._midi_first_cc + ix)
            self._button_cc_list.append(self._midi_first_cc + NUM_ENCODERS + ix)
            self._transport_button_cc_list.append(self._midi_first_cc + (NUM_ENCODERS*2) + ix)
            self._log_print('_encoder_cc_list[{}]: {}'.format(ix, self._encoder_cc_list[ix]), LOG_VERBOSE)
            self._log_print('_button_cc_list[{}]: {}'.format(ix, self._button_cc_list[ix]), LOG_VERBOSE)
            self._log_print('_transport_button_cc_list[{}]: {}'.format(ix, self._transport_button_cc_list[ix]), LOG_VERBOSE)
        
        # Add 2 additional transport controls for arrow keys
        ix = NUM_ENCODERS
        while ix < (NUM_ENCODERS + 2):
            self._transport_button_cc_list.append(self._midi_first_cc + (NUM_ENCODERS*2) + ix)
            self._log_print('_transport_button_cc_list[{}]: {}'.format(ix, self._transport_button_cc_list[ix]), LOG_VERBOSE)
            ix += 1

        # Set up fixed CCs for transport and other fixed button definitions
        self._play_button_cc = self._transport_button_cc_list[0]
        self._stop_button_cc = self._transport_button_cc_list[1]
        self._rec_button_cc = self._transport_button_cc_list[2]
        self._session_record_button_cc = self._transport_button_cc_list[3]
        self._loop_button_cc = self._transport_button_cc_list[4]
        self._punch_in_button_cc = self._transport_button_cc_list[5]
        self._punch_out_button_cc = self._transport_button_cc_list[6]
        self._re_enable_automation_button_cc = self._transport_button_cc_list[7]
        self._rw_button_cc = self._transport_button_cc_list[8]
        self._ff_button_cc = self._transport_button_cc_list[9]

    def _setup_buttons(self):
        # Create button elements for assignable buttons
        for ix in range(NUM_ENCODERS):
            self._button_list.append(ButtonElement(True, MIDI_CC_TYPE, self._midi_channel, self._button_cc_list[ix]))

        # Create button elements for static buttons
        self._play_button = ButtonElement(True, MIDI_CC_TYPE, self._midi_channel, self._play_button_cc)
        self._stop_button = ButtonElement(True, MIDI_CC_TYPE, self._midi_channel, self._stop_button_cc)
        self._rec_button = ButtonElement(True, MIDI_CC_TYPE, self._midi_channel, self._rec_button_cc)
        self._session_record_button = ButtonElement(True, MIDI_CC_TYPE, self._midi_channel, self._session_record_button_cc)
        self._loop_button = ButtonElement(False, MIDI_CC_TYPE, self._midi_channel, self._loop_button_cc)
        self._punch_in_button = ButtonElement(True, MIDI_CC_TYPE, self._midi_channel, self._punch_in_button_cc)
        self._punch_out_button = ButtonElement(True, MIDI_CC_TYPE, self._midi_channel, self._punch_out_button_cc)
        self._re_enable_automation_button = ButtonElement(True, MIDI_CC_TYPE, self._midi_channel, self._re_enable_automation_button_cc)
        self._ff_button = ButtonElement(True, MIDI_CC_TYPE, self._midi_channel, self._ff_button_cc)
        self._rw_button = ButtonElement(True, MIDI_CC_TYPE, self._midi_channel, self._rw_button_cc)

        # Set up Transport object and controls.
        self._transport = TransportComponent()
        self._transport.set_play_button(self._play_button)
        self._transport.set_stop_button(self._stop_button)
        self._transport.set_record_button(self._rec_button)
        self._session_record_button.add_value_listener(self._toggle_session_record)
        self._transport.set_loop_button(self._loop_button)
        self._transport.set_punch_in_button(self._punch_in_button)
        self._transport.set_punch_out_button(self._punch_out_button)
        self._re_enable_automation_button.add_value_listener(self._reenable_automation)
        self._transport.set_seek_buttons(self._ff_button, self._rw_button)

    def _setup_encoders(self):
        # Create encoder elements for assignable encoders.
        for ix in range(NUM_ENCODERS):
            self._encoder_list.append(EncoderElement(MIDI_CC_TYPE, self._midi_channel, self._encoder_cc_list[ix], self._encoder_resolution))

    def _setup_mixer(self):
        self._log_print('Setup Mixer...')
        self._mixer = MixerComponent(
            name='Mixer',
            num_tracks=NUM_ENCODERS,
            num_returns = 0,
            is_enabled=False,
        )
        self._mixer.master_track = self.song().master_track
        self._mixer.return_tracks = self.song().return_tracks

    def _schedule_timer(self):
        self._update_foldable_tracks()
        self.schedule_message(self._timer_interval, self._schedule_timer)

    def _update_mixer(self):
        if self._active_mode == 'MIXER':
            track_list = self._get_track_list()
            total_tracks = len(track_list)
            self._log_print('Total tracks: {}'.format(total_tracks))

            if (self._mixer_mode == 'MODE_ALL'):
                self._mixer.set_enabled(False)
                self._mixer.set_track_offset(self._get_mixer_first_track())

                # Return list of track names, first track and track colour
                num_sends = len(self.song().return_tracks)
                self._send_sysex(MIXER_COMMAND_GROUP, NUM_SENDS, bytearray([num_sends]))
                self._return_tracks()

                self._clear_mixer_params()

                for ix in range(NUM_ENCODERS):
                    current_track = self._get_mixer_first_track() + ix 
                    if current_track < total_tracks:
                        self._log_print('Track: {}, Offset: {}'.format(current_track, ix), LOG_VERBOSE)
                        mixer_device = track_list[current_track].mixer_device

                        # Set the knob mode
                        if (self._mixer_encoder_mode == 'LEVEL'):
                            self._log_print('Set LEVEL', LOG_VERBOSE)
                            self._encoder_list[ix].connect_to(mixer_device.volume)
                        elif (self._mixer_encoder_mode == 'PAN'):
                            self._log_print('Set PAN', LOG_VERBOSE)
                            self._encoder_list[ix].connect_to(mixer_device.panning)
                        elif (self._mixer_encoder_mode == 'SEND'):
                            self._log_print('Set SEND', LOG_VERBOSE)
                            if self._mixer_send_index < len(mixer_device.sends):
                                self._encoder_list[ix].connect_to(mixer_device.sends[self._mixer_send_index])
                            else:
                                # Do nothing if the current track has no sends
                                self._encoder_list[ix].release_parameter()
                        else:
                            self._log_print('Invalid mixer encoder mode: {}'.format(self._mixer_encoder_mode))

                        # Set the button mode
                        if track_list[current_track] != self.song().master_track:
                            if (self._mixer_button_mode == 'MUTE'):
                                self._log_print('Set MUTE', LOG_VERBOSE)
                                value_listener = self._get_mute_toggle_listener(ix)
                                self._button_list[ix].add_value_listener(value_listener)
                                self._mute_value_listener_list[ix] = value_listener
                                listener = self._get_mute_state_listener(ix)
                                track_list[current_track].add_mute_listener(listener)
                                self._mute_listener_list.append((track_list[current_track], listener))
                                if track_list[current_track].mute:
                                    data = bytearray([MIDI_CC_MSG, self._button_cc_list[ix], 127])
                                    self._send_midi(tuple(data))
                                else:
                                    data = bytearray([MIDI_CC_MSG, self._button_cc_list[ix], 0])
                                    self._send_midi(tuple(data))
                            elif (self._mixer_button_mode == 'SOLO'):
                                self._log_print('Set SOLO', LOG_VERBOSE)
                                value_listener = self._get_solo_toggle_listener(ix)
                                self._button_list[ix].add_value_listener(value_listener)
                                self._solo_value_listener_list[ix] = value_listener
                                listener = self._get_solo_state_listener(ix)
                                track_list[current_track].add_solo_listener(listener)
                                self._solo_listener_list.append((track_list[current_track], listener))
                                if track_list[current_track].solo:
                                    data = bytearray([MIDI_CC_MSG, self._button_cc_list[ix], 127])
                                    self._send_midi(tuple(data))
                                else:
                                    data = bytearray([MIDI_CC_MSG, self._button_cc_list[ix], 0])
                                    self._send_midi(tuple(data))
                            elif (self._mixer_button_mode == 'ARM_RECORDING'):
                                if (self._channel_mode == 'AUDIO') and (track_list[current_track].can_be_armed):
                                    self._log_print('Set ARM RECORDING', LOG_VERBOSE)
                                    value_listener = self._get_arm_toggle_listener(ix)
                                    self._button_list[ix].add_value_listener(value_listener)
                                    self._arm_value_listener_list[ix] = value_listener
                                    listener = self._get_arm_state_listener(ix)
                                    track_list[current_track].add_arm_listener(listener)
                                    self._arm_listener_list.append((track_list[current_track], listener))
                                    if track_list[current_track].arm:
                                        data = bytearray([MIDI_CC_MSG, self._button_cc_list[ix], 127])
                                        self._send_midi(tuple(data))
                                    else:
                                        data = bytearray([MIDI_CC_MSG, self._button_cc_list[ix], 0])
                                        self._send_midi(tuple(data))
                                else:
                                    data = bytearray([MIDI_CC_MSG, self._button_cc_list[ix], 0])
                                    self._send_midi(tuple(data))
                            else:
                                self._log_print('Invalid mixer button mode: {}'.format(self._mixer_button_mode))
                        else:
                            # Clear the master LED
                            if (self._mixer_button_mode == 'MUTE'):
                                data = bytearray([MIDI_CC_MSG, self._button_cc_list[ix], 0])
                                self._send_midi(tuple(data))
                            elif (self._mixer_button_mode == 'SOLO'):
                                data = bytearray([MIDI_CC_MSG, self._button_cc_list[ix], 0])
                                self._send_midi(tuple(data))
                            elif (self._mixer_button_mode == 'ARM_RECORDING'):
                                data = bytearray([MIDI_CC_MSG, self._button_cc_list[ix], 0])
                                self._send_midi(tuple(data))
                    else:
                        # Clear all remaining LEDs
                        if (self._mixer_button_mode == 'MUTE'):
                            data = bytearray([MIDI_CC_MSG, self._button_cc_list[ix], 127])
                            self._send_midi(tuple(data))
                        elif (self._mixer_button_mode == 'SOLO'):
                            data = bytearray([MIDI_CC_MSG, self._button_cc_list[ix], 0])
                            self._send_midi(tuple(data))
                        elif (self._mixer_button_mode == 'ARM_RECORDING'):
                            data = bytearray([MIDI_CC_MSG, self._button_cc_list[ix], 0])
                            self._send_midi(tuple(data))
                self._mixer.set_enabled(True)

            elif (self._mixer_mode == 'MODE_SELECTED'):
                self._log_print('Changing MIXER mode focus on track: {}'.format(self._selected_track_index))
                self._mixer.set_enabled(False)
                self._clear_mixer_params()

                # Assign controls to to the selected track
                ix = 0
                first_send = 0
                mixer_device = None
                master_return_track_list = self._get_track_list('MASTER_RETURN')
                audio_track_list = self._get_track_list('AUDIO')
                if self.song().view.selected_track in master_return_track_list:
                    mixer_device = master_return_track_list[self._selected_track_index].mixer_device
                else:
                    mixer_device = audio_track_list[self._selected_track_index].mixer_device

                if self._mixer_selected_mode_page_index == 0:
                    self._encoder_list[0].connect_to(mixer_device.volume)
                    self._encoder_list[1].connect_to(mixer_device.panning)
                    ix = 2
                else:
                    first_send = 6 + (self._mixer_selected_mode_page_index - 1) * 8
                num_sends = len(self.song().view.selected_track.mixer_device.sends)
                for jx in range(num_sends):
                    if jx >= first_send:
                        if ix < NUM_ENCODERS:
                            self._encoder_list[ix].connect_to(mixer_device.sends[jx])
                        ix += 1
                self._mixer.set_enabled(True)
                self._send_sysex(MIXER_COMMAND_GROUP, NUM_SENDS, bytearray([num_sends]))
                self._return_tracks()

    def _clear_mixer_params(self):
        for ix in range(NUM_ENCODERS):
            self._encoder_list[ix].release_parameter()

            if ix in self._mute_value_listener_list:
                self._button_list[ix].remove_value_listener(self._mute_value_listener_list[ix])
                del self._mute_value_listener_list[ix]

            if ix in self._solo_value_listener_list:
                self._button_list[ix].remove_value_listener(self._solo_value_listener_list[ix])
                del self._solo_value_listener_list[ix]

            if ix in self._arm_value_listener_list:
                self._button_list[ix].remove_value_listener(self._arm_value_listener_list[ix])
                del self._arm_value_listener_list[ix]

        track_list = self._get_track_list()
        for track, listener in self._mute_listener_list:
            if track in track_list:
                track.remove_mute_listener(listener)
        self._mute_listener_list = []

        for track, listener in self._solo_listener_list:
            if track in track_list:
                track.remove_solo_listener(listener)
        self._solo_listener_list = []

        for track, listener in self._arm_listener_list:
            if track in track_list:
                track.remove_arm_listener(listener)
        self._arm_listener_list = []

    def _update_devices(self):
        # Show the selected device, if any
        selected_device = self.song().view.selected_track.view.selected_device
        if selected_device != None:
            self._log_print('Selected device: ' + str((selected_device.class_name, selected_device.name)))
        else:
            self._log_print('No device selected')

        # Return the track details
        self._return_tracks()

        # Return the Plugin details
        plugin_names = self._get_plugin_names()
        self._send_sysex(PLUGIN_COMMAND_GROUP, NUM_DEVICES, bytearray([len(self.get_expanded_device_list())]))
        self._send_sysex(PLUGIN_COMMAND_GROUP, FIRST_DEVICE, bytearray([self._plugin_first_device]))
        self._process_return_plugin_names(plugin_names)

        # Walk the list of devices - add listeners if they doesnt exist
        devices = self.get_expanded_device_list()
        if not self._is_live_v10():
            for device in devices:
                if not device.name_has_listener(self._on_device_name_changed):
                    device.add_name_listener(self._on_device_name_changed)
                if not device.is_active_has_listener(self._on_device_is_active_changed):
                    device.add_is_active_listener(self._on_device_is_active_changed)
                if not device.parameters_has_listener(self._on_parameters_changed):
                    device.add_parameters_listener(self._on_parameters_changed)
                if self._device_is_macro_rack(device.class_name):
                    if not device.macros_mapped_has_listener(self._on_macro_map_changed):
                        device.add_macros_mapped_listener(self._on_macro_map_changed)
        else:
            for device in devices:
                if device not in self._detail_change_device_list:
                    self._detail_change_device_list.append(device)
                    device.add_name_listener(self._on_device_name_changed)
                    device.add_is_active_listener(self._on_device_is_active_changed)
                    device.add_parameters_listener(self._on_parameters_changed)

    def get_expanded_device_list(self):
        # Get the list of devices on the selected track including all chained and nested devices
        self._expanded_devices_list = []
        selected_track = self.song().view.selected_track
        if self._plugin_lock == True:
            selected_track = self._locked_track
        devices = selected_track.devices
        for device in devices:
            self.traverse_chains(device)
        return self._expanded_devices_list

    def traverse_chains(self, device):
        # Recursively search for devices nested in any number of sub chains
        if device.can_have_chains:
            self._expanded_devices_list.append(device)
            chains = device.chains
            if chains:
                for chain in chains:
                    devices_in_chain = chain.devices
                    if devices_in_chain:
                        for nested_device in devices_in_chain:
                            self.traverse_chains(nested_device)
        else:
            self._expanded_devices_list.append(device)

    # Returns a function to toggle the mute state of a specific track based on the button index.
    def _get_mute_toggle_listener(self, index):
        def _on_mute_button_pressed(value):
            # Only toggle if the button is pressed (value > 0)
            if value > 0:
                track_list = self._get_track_list()
                track = track_list[self._get_mixer_first_track() + index]
                current_state = track.mute
                track.mute = not current_state

        return _on_mute_button_pressed

    # Listener to send MIDI feedback when the mute state changes for a track.
    def _get_mute_state_listener(self, index):
        def _on_mute_state_changed():
            track_list = self._get_track_list()
            if track_list[self._get_mixer_first_track() + index].mute:
                data = bytearray([MIDI_CC_MSG, self._button_cc_list[index], 127])
                self._send_midi(tuple(data))
            else:
                data = bytearray([MIDI_CC_MSG, self._button_cc_list[index], 0])
                self._send_midi(tuple(data))

        return _on_mute_state_changed

    # Returns a function to toggle the solo state of a specific track based on the button index.
    def _get_solo_toggle_listener(self, index):
        def _on_solo_button_pressed(value):
            if value > 0:
                # Toggle the selected solo
                track_list = self._get_track_list()
                track = track_list[self._get_mixer_first_track() + index]
                current_state = track.solo
                track.solo = not current_state

                # If multiple channels are selected allow group solo by skipping the clear step
                other_buttons_held = False
                for ix in range(NUM_ENCODERS):
                    if (ix != index) and (self._button_list[ix].is_pressed()):
                        other_buttons_held = True

                if ((not other_buttons_held) and (self.song().exclusive_solo == True)):
                    # Clear all other solos on the same track list
                    for ix in range(len(track_list)):
                        if (ix != (self._get_mixer_first_track() + index)) and (track_list[ix] != self.song().master_track):
                            track_list[ix].solo = False

                    # Clear all solos on the alternate track list
                    alt_track_list = []
                    if self._channel_mode == 'MASTER_RETURN':
                        alt_track_list = self._get_track_list('AUDIO')
                    else:
                        alt_track_list = self._get_track_list('MASTER_RETURN')
                    for ix in range(len(alt_track_list)):
                        if (alt_track_list[ix] != self.song().master_track):
                            alt_track_list[ix].solo = False

        return _on_solo_button_pressed

    # Listener to send MIDI feedback when the solo state changes for a track.
    def _get_solo_state_listener(self, index):
        def _on_solo_state_changed():
            track_list = self._get_track_list()
            if track_list[self._get_mixer_first_track() + index].solo:
                data = bytearray([MIDI_CC_MSG, self._button_cc_list[index], 127])
                self._send_midi(tuple(data))
            else:
                data = bytearray([MIDI_CC_MSG, self._button_cc_list[index], 0])
                self._send_midi(tuple(data))
        
        return _on_solo_state_changed

    # Returns a function to toggle the arm state of a specific track based on the button index.
    def _get_arm_toggle_listener(self, index):
        def _on_arm_button_pressed(value):
            if (value > 0) and (self._channel_mode == 'AUDIO'):
                # Toggle the selected arm
                track_list = self._get_track_list()
                track = track_list[self._get_mixer_first_track() + index]
                current_state = track.arm
                track.arm = not current_state

                # If multiple channels are selected allow group arm by skipping the clear step
                other_buttons_held = False
                for ix in range(NUM_ENCODERS):
                    if (ix != index) and (self._button_list[ix].is_pressed()):
                        other_buttons_held = True

                if ((not other_buttons_held) and (self.song().exclusive_arm == True) and track.arm == True):
                    # Clear all other arms
                    for ix in range(len(track_list)):
                        if (ix != (self._get_mixer_first_track() + index)):
                            if track_list[ix].can_be_armed == True:
                                track_list[ix].arm = False

        return _on_arm_button_pressed

    # Listener to send MIDI feedback when the arm state changes for a track.
    def _get_arm_state_listener(self, index):
        def _on_arm_state_changed():
            track_list = self._get_track_list()
            if track_list[self._get_mixer_first_track() + index].arm:
                data = bytearray([MIDI_CC_MSG, self._button_cc_list[index], 127])
                self._send_midi(tuple(data))
            else:
                data = bytearray([MIDI_CC_MSG, self._button_cc_list[index], 0])
                self._send_midi(tuple(data))

        return _on_arm_state_changed

    def _toggle_session_record(self, value):
        if value > 0:
            current_state = self.song().session_record
            self.song().session_record = not current_state

    def _update_selected_track(self):
        audio_track_list = self._get_track_list('AUDIO')
        master_return_track_list = self._get_track_list('MASTER_RETURN')
        selected_track = self.song().view.selected_track
        if selected_track in audio_track_list:
            self._selected_track_index = audio_track_list.index(selected_track)
        elif selected_track in master_return_track_list:
            self._selected_track_index = master_return_track_list.index(selected_track)
        else:
            self._selected_track_index = 0
        self._selected_track_mode = self._channel_mode

    def _update_selected_device(self):
        if self._plugin_lock == False and self._learn_mode_enabled == False:
            # If a device is selected, send to Roto
            selected_device = self.song().view.selected_track.view.selected_device
            device_list = self.get_expanded_device_list()
            update_selected_device = True
            if (selected_device == None) and (len(device_list) != 0):
                # Select the first device if no device is currently selected
                self.song().view.select_device(device_list[0])
                selected_device = self.song().view.selected_track.view.selected_device
            elif selected_device == None:
                update_selected_device = False

            if update_selected_device:
                self._send_selected_device_update(device_list, selected_device)

    def _send_selected_device_update(self, device_list, selected_device):
        # Update self._plugin_first_device if the user has selected a device outside of the current page
        if selected_device in device_list:
            self._selected_device_index = device_list.index(selected_device)
        if (self._selected_device_index < self._plugin_first_device) or (self._selected_device_index >= (self._plugin_first_device + NUM_ENCODERS)):
            self._plugin_first_device = int(self._selected_device_index / NUM_ENCODERS) * NUM_ENCODERS
            # Run _update_devices() again to refresh page data
            self._update_devices()
        data = bytearray([self._selected_device_index])
        data.append(MACRO_PLUGIN_PAGES)
        data.append(MACRO_FORCE_PLUGIN)
        self._send_sysex(PLUGIN_COMMAND_GROUP, DAW_SELECT_PLUGIN, data)

    def _get_selected_device(self):
        if self._plugin_lock == True:
            return self._locked_device
        else:
            return self.song().view.selected_track.view.selected_device

    def _is_macro(self, param):
        if (self._device_is_macro_rack(self._get_selected_device().class_name) or self._device_is_macro_plugin(self._get_selected_device().class_name)) and ('Macro' in param.original_name):
            return True
        else:
            return False

    def _get_learn_name(self, param, device_is_learnt_rack = False):
        if self._is_macro(param) and (device_is_learnt_rack == False):
            return param.original_name
        else:
            return param.name

    def _update_foldable_tracks(self):
        full_track_list = list(self.song().tracks)
        self._current_track_mask = self._get_visible_track_mask(full_track_list)
        # Change in track mask means tracks were wither hidden or shown so run an update
        if (self._visible_track_mask != self._current_track_mask):
            self._touch_override = True
            mixer_updated = self._update_tracks_page_index()
            if self._active_mode == 'MIXER':
                if mixer_updated == False:
                    self._update_mixer()
            else:
                self._return_tracks()
            self._visible_track_mask = self._current_track_mask

    @subject_slot('session_record')
    def __on_session_record_changed(self):
        if self.song().session_record:
            data = bytearray([MIDI_CC_MSG, self._session_record_button_cc, 127])
            self._send_midi(tuple(data))
        else:
            data = bytearray([MIDI_CC_MSG, self._session_record_button_cc, 0])
            self._send_midi(tuple(data))

    def _reenable_automation(self, value):
        if value > 0:
            self.song().re_enable_automation()

    @subject_slot('re_enable_automation_enabled')
    def __on_re_enable_automation_enabled_changed(self):
        if self.song().re_enable_automation_enabled:
            data = bytearray([MIDI_CC_MSG, self._re_enable_automation_button_cc, 127])
            self._send_midi(tuple(data))
        else:
            data = bytearray([MIDI_CC_MSG, self._re_enable_automation_button_cc, 0])
            self._send_midi(tuple(data))

    @subject_slot('selected_track')
    def __on_selected_track_changed(self):
        self._RotoControl__on_selected_device_changed.subject = self.song().view.selected_track.view
        mixer_updated = False
        self._update_selected_track()
        selected_track = self.song().view.selected_track
        self._log_print('Track Change: {}'.format(self._selected_track_index))

        if self._track_selected_via_roto_control == False:
            # Update the selected track
            track_index_lsb = self._selected_track_index & 0x7F
            track_index_msb = self._selected_track_index >> 7
            track_name = selected_track.name[:(MAX_STRING_LENGTH - 1)].ljust(MAX_STRING_LENGTH, '\x00')
            is_foldable = 0
            if selected_track.is_foldable:
                is_foldable = 1
            data = bytearray([track_index_msb, track_index_lsb])
            data.extend(track_name.encode('utf-8'))
            data.append(selected_track.color_index)
            data.append(is_foldable)
            self._send_sysex(MIXER_COMMAND_GROUP, DAW_SELECT_TRACK, data)

            # Update the selected mode page index when master track is selected/deselected
            if (self._mixer_mode == 'MODE_SELECTED'):
                if selected_track == self.song().master_track:
                    if self._mixer_selected_mode_page_index != 0:
                        self._mixer_selected_mode_page_index = 0
            else:
                # Update the page index and return all names when the page changes
                mixer_first_track = int(self._selected_track_index / NUM_ENCODERS) * NUM_ENCODERS
                if (self._channel_mode == 'AUDIO') and (selected_track in self._get_track_list('AUDIO')):
                    if mixer_first_track != self._mixer_audio_first_track:
                        self._mixer_audio_first_track = mixer_first_track
                        first_track_lsb = mixer_first_track & 0x7F
                        first_track_msb = mixer_first_track >> 7
                        self._send_sysex(GENERAL_COMMAND_GROUP, FIRST_TRACK, bytearray([first_track_msb, first_track_lsb]))
                        mixer_updated = True
                elif (self._channel_mode == 'MASTER_RETURN') and (selected_track in self._get_track_list('MASTER_RETURN')):
                    if mixer_first_track != self._mixer_master_return_first_track:
                        self._mixer_master_return_first_track = mixer_first_track
                        first_track_lsb = mixer_first_track & 0x7F
                        first_track_msb = mixer_first_track >> 7
                        self._send_sysex(GENERAL_COMMAND_GROUP, FIRST_TRACK, bytearray([first_track_msb, first_track_lsb]))
                        mixer_updated = True

        self._track_selected_via_roto_control = False

        if (self._active_mode == 'PLUGIN') and (self._learn_mode_enabled == False):
            self._update_devices()
            self._update_selected_device()
        elif (self._active_mode == 'MIXER') and ((self._mixer_mode == 'MODE_SELECTED') or (mixer_updated == True)):
            self._update_mixer()

    @subject_slot('selected_device')
    def __on_selected_device_changed(self):
        # Throttle this listener to avoid a storm of updates on some third party plugins.
        current_time = time()
        if current_time > (self._select_device_start_time + 0.15):
            if self._active_mode == 'PLUGIN':
                # If selected via Roto
                if self._device_selected_via_roto_control == True:
                    # Reset the param mapping
                    for ix in range(NUM_ENCODERS):
                        self._encoder_list[ix].release_parameter()
                        self._button_list[ix].release_parameter()

                self._update_devices()

                # If device select was performed via the DAW
                if self._device_selected_via_roto_control == False:
                    # Send the selected device to Roto
                    selected_device = self.song().view.selected_track.view.selected_device
                    if selected_device != None:
                        # Walk the chain of devices and build a new list
                        device_list = self.get_expanded_device_list()
                        self._send_selected_device_update(device_list, selected_device)
                self._device_selected_via_roto_control = False

            # Reset the filter timer only for third party plugins
            if self._is_3rd_party_plugin():
                self._select_device_start_time = time()

    @subject_slot('selected_parameter')
    def __on_selected_parameter_changed(self):
        # Only act if learn mode is enabled
        if (self._active_mode == 'PLUGIN') and (self._learn_mode_enabled):
            parameter = self.song().view.selected_parameter
            if parameter != None:
                param_hash = PARAM_HASH_NO_OVERRIDE
                # When learning a param from a macro rack enforce the use of the required name type
                if self._device_is_macro_rack(self._selected_device_learn_mode.class_name):
                    param_hash = self._get_param_hash(self._get_learn_name(parameter, True))
                self._learn_parameter(parameter, self._selected_device_learn_mode, PARAM_INDEX_NO_OVERRIDE, False, param_hash)

            # Reselect the device - this will clear the selected parameter
            self.song().view.select_device(self.song().view.selected_track.view.selected_device)

    def _learn_parameter(self, parameter, selected_device, index_override = PARAM_INDEX_NO_OVERRIDE, param_mapped = False, param_hash = PARAM_HASH_NO_OVERRIDE):
        if (parameter != None) and (selected_device != None):
            # Search for the parameter in the current device. This sanity checks that the
            # parameter is in the selected device. Store the index of the device.
            found = False
            index = 0
            for param in selected_device.parameters:
                if parameter == param:
                    self._log_print('Parameter matched: {}'.format(parameter.name), LOG_VERBOSE)
                    found = True
                    break
                index += 1

            if index_override != PARAM_INDEX_NO_OVERRIDE:
                index = index_override

            if not found:
                self._log_print('Parameter: {} not found in device: {}'.format(parameter.name, selected_device.name))
                return

            # Create the data structure to return to the device
            # Form strings into the format to send back:
            #   Up to MAX_QUANTISED_STRING_STEPS strings can be sent back
            #   Unused strings, or steps greater than MAX_QUANTISED_STRING_STEPS are sent back as an empty string
            quantised_strings = ''
            quantised_steps = 0
            if parameter.is_quantized:
                quantised_steps = min([len(parameter.value_items), MAX_QUANTISED_STEPS])

                if quantised_steps <= MAX_QUANTISED_STRING_STEPS:
                    for item in parameter.value_items:
                        modified_string = ''.join(chr(ord(ch) & 0x7F) for ch in item[:(MAX_STRING_LENGTH - 1)].ljust(MAX_STRING_LENGTH, '\x00'))
                        quantised_strings = quantised_strings + modified_string

                self._log_print(bytearray(quantised_strings, 'utf-8'), LOG_VERBOSE)

            # Truncate the parameter name if needed
            param_name = parameter.name[:(MAX_STRING_LENGTH - 1)].ljust(MAX_STRING_LENGTH, '\x00')
            # Get a hash (6 bytes) of the original name
            index_msb = (index & 0x3f80) >> 7
            index_lsb = index & 0x7f

            param_learn_name = self._get_learn_name(parameter)

            macro_byte = 0
            param_value_14b = int(16383 * ((parameter.value - parameter.min) / (parameter.max - parameter.min)))
            param_value_lsb = param_value_14b & 0x7f
            param_value_msb = (param_value_14b >> 7)
            if (self._device_is_macro_plugin(selected_device.class_name) and self._is_macro(parameter)) or (param_mapped == True):
                macro_byte = 1
            plugin_digest = bytearray()
            if param_hash == PARAM_HASH_NO_OVERRIDE:
                plugin_digest = self._get_param_hash(param_learn_name)
            else:
                plugin_digest = param_hash
            data = bytearray([index_msb, index_lsb])
            data.extend(plugin_digest)
            data.append(macro_byte)
            data.append(HAPTIC_CENTER_INDENT)
            data.append(quantised_steps)
            data.append(param_value_msb)
            data.append(param_value_lsb)
            data.extend(param_name.encode('utf-8'))
            data.extend(bytearray(quantised_strings, 'utf-8'))
            self._send_sysex(PLUGIN_COMMAND_GROUP, LEARN_PARAM, data)
        else:
            self._log_print('No parameter selected')

    def _set_mapped_control_name(self, parameter, selected_device):
        if (parameter != None) and (selected_device != None):
            # Search for the parameter in the current device. This sanity checks that the
            # parameter is in the selected device. Store the index of the device.
            found = False
            index = 0
            for param in selected_device.parameters:
                if parameter == param:
                    self._log_print('Parameter matched: {}'.format(parameter.name), LOG_VERBOSE)
                    found = True
                    break
                index += 1

            if not found:
                self._log_print('Parameter: {} not found in device: {}'.format(parameter.name, selected_device.name))
                return

            # Create the data structure to return to the device
            param_name = parameter.name[:(MAX_STRING_LENGTH - 1)].ljust(MAX_STRING_LENGTH, '\x00')
            # Get a hash (6 bytes) of the original name
            index_msb = (index & 0x3f80) >> 7
            index_lsb = index & 0x7f

            param_learn_name = self._get_learn_name(parameter)

            plugin_digest = self._get_param_hash(param_learn_name)
            data = bytearray([index_msb, index_lsb])
            data.extend(plugin_digest)
            data.extend(param_name.encode('utf-8'))
            self._send_sysex(PLUGIN_COMMAND_GROUP, SET_MAPPED_CTL_NAME, data)
        else:
            self._log_print('No parameter selected')

    def _update_macro_parameters(self):
        for encoder in self._encoder_list:
            mapped_parameter = encoder.mapped_parameter()
            device_parameters = self._get_selected_device().parameters
            if (encoder != None) and (mapped_parameter != None) and (mapped_parameter in device_parameters):
                if self._is_macro(mapped_parameter):
                    self._set_mapped_control_name(mapped_parameter, self._get_selected_device())

    @subject_slot('tracks')
    def __on_tracks_changed_in_live(self):
        if self._active_mode == 'MIXER':
            self._update_selected_track()
            # Update the track mask here to avoid an extra call to update_mixer()
            if (self._channel_mode == 'AUDIO'):
                full_track_list = list(self.song().tracks)
                self._visible_track_mask = self._get_visible_track_mask(full_track_list)
                self._current_track_mask = self._visible_track_mask
            self._update_mixer()

            # Add color and name listeners to each track if they don't already exist
            track_list = self._get_track_list('AUDIO', True)
            track_list.extend(self._get_track_list('MASTER_RETURN'))
            for track in track_list:
                if track not in self._update_listener_track_list:
                    track.add_color_index_listener(self._on_track_detail_changed)
                    track.add_name_listener(self._on_track_detail_changed)
                    self._update_listener_track_list.append(track)

            track_clean_up_list = []
            for track in self._update_listener_track_list:
                if track not in track_list:
                    track_clean_up_list.append(track)

            for track in track_clean_up_list:
                self._update_listener_track_list.remove(track)

            # Keep track of color index and name details which have been sent to Roto-Control to prevent
            # a storm of automatic updates every time a track is added
            self._last_detail_change_track_list = []
            for track in self._update_listener_track_list:
                self._last_detail_change_track_list.append((track, track.name, track.color_index))
        elif self._active_mode == 'PLUGIN':
            self._update_devices()

        self._update_tracks_page_index()

    def _update_tracks_page_index(self):
        mixer_update = False
        # Check if we need to update the page index
        if self._mixer_mode == 'MODE_SELECTED':
            num_tracks_displayed = len(self.song().return_tracks) + 2
            if num_tracks_displayed <= (self._mixer_selected_mode_page_index * NUM_ENCODERS):
                self._mixer_selected_mode_page_index = int((num_tracks_displayed - 1) / NUM_ENCODERS)
                mixer_update = True
        else:
            if self._channel_mode == 'AUDIO':
                num_tracks = len(self._get_track_list('AUDIO'))
                if num_tracks <= self._mixer_audio_first_track:
                    self._mixer_audio_first_track = int((num_tracks - 1) / NUM_ENCODERS) * NUM_ENCODERS
                    first_track_lsb = self._mixer_audio_first_track & 0x7F
                    first_track_msb = self._mixer_audio_first_track >> 7
                    self._send_sysex(GENERAL_COMMAND_GROUP, FIRST_TRACK, bytearray([first_track_msb, first_track_lsb]))
                    mixer_update = True
            else:
                num_tracks = len(self._get_track_list('MASTER_RETURN'))
                if num_tracks <= self._mixer_master_return_first_track:
                    self._mixer_master_return_first_track = int((num_tracks - 1) / NUM_ENCODERS) * NUM_ENCODERS
                    first_track_lsb = self._mixer_master_return_first_track & 0x7F
                    first_track_msb = self._mixer_master_return_first_track >> 7
                    self._send_sysex(GENERAL_COMMAND_GROUP, FIRST_TRACK, bytearray([first_track_msb, first_track_lsb]))
                    mixer_update = True

        if mixer_update and (self._channel_mode == 'AUDIO'):
            self._update_mixer()

        return mixer_update

    def _on_track_detail_changed(self):
        update_tracks = False
        for ix, (track, track_name, color_index) in enumerate(self._last_detail_change_track_list):
            if track != None:
                if (track.name != track_name) or (track.color_index != color_index):
                    update_tracks = True
                    self._last_detail_change_track_list[ix] = (track, track.name, track.color_index)

        if update_tracks == True:
            self._return_tracks()

    def _on_device_name_changed(self):
        self._update_devices()
        self._update_selected_device()

    def _on_param_name_changed(self):
        self._update_macro_parameters()

    def _on_device_is_active_changed(self):
        # Throttle this listener to avoid a storm of updates when racks are enabled/disabled.
        current_time = time()
        if current_time > (self._is_active_start_time + 0.2):
            self._update_devices()
            self._is_active_start_time = time()

    def _on_parameters_changed(self):
        self._RotoControl__on_selected_device_changed()

    def _on_macro_map_changed(self):
        # Only run this if the selected device is a rack to avoid unneccessary updates
        if self._device_is_macro_rack(self._get_selected_device().class_name):
            self.__on_selected_device_changed()

    # MIDI receiver - process MIDI commands we are interested in intercepting and pass on
    # the rest to Ableton Live.
    def receive_midi(self, midi_bytes):
        self._log_print('MIDI RX: {}'.format(list(map(hex, midi_bytes))), LOG_VERBOSE)

        # Process Melbourne instruments Sysex messages
        # Format:
        #    0xf0 <Manufacturer ID> <Device ID> <Sub ID 1> <Sub ID 2> <Command> 0xf7
        #    0xf0   0x00 0x22 0x03     0x02        0x??       0x??     0x??...  0xf7
        if (midi_bytes[0] & 0xf0 == MIDI_SYSEX_HEADER):
            # Check length for a valid command
            if (len(midi_bytes) >= 8):
                # Confirm manufacturer and device ID
                if (midi_bytes[1:4] == MI_MANUFACTURER_ID) and (midi_bytes[4] == ROTO_CONTROL_DEVICE_ID):
                    self._log_print('Sysex received - sub_id 1: {} sub_id 2: {}'.format(midi_bytes[5], midi_bytes[6]), LOG_VERBOSE)
                    self._process_sysex_command(midi_bytes[5], midi_bytes[6], midi_bytes[7:-1])
            return

        # Pass through remaining MIDI messages to Ableton Live
        if not self._is_live_v10():
            super().receive_midi(midi_bytes)
        else:
            super(RotoControl, self).receive_midi(midi_bytes)

    def _process_sysex_command(self, command_group, command_id, data):
        if (command_group == GENERAL_COMMAND_GROUP):
            if (command_id == PING_DAW):
                # The DAW has been pinged, so send back a ping response
                self._send_sysex(GENERAL_COMMAND_GROUP, DAW_PING_RESP, bytearray([ABLETON_LIVE_DAW]))

            if (command_id == ROTO_DAW_CONNECTED):
                # Run any initialiser functions that need sysex here
                self._schedule_timer()
                self._RotoControl__on_selected_track_changed()
                self._RotoControl__on_tracks_changed_in_live()

            elif (command_id == SET_FIRST_TRACK):
                # Set the mixer first track index
                track_list = self._get_track_list()
                track_index = (data[0] << 7) | data[1]
                if (track_index < len(track_list)):
                    if self._channel_mode == 'MASTER_RETURN':
                        self._mixer_master_return_first_track = track_index
                    else:
                        self._mixer_audio_first_track = track_index

                    if self._active_mode == 'MIXER':
                        self._update_mixer()
                    else:
                        self._return_tracks()
                    self._log_print('Set Mixer First Track - {}'.format(data[0]), LOG_VERBOSE)

            elif (command_id == SELECT_TRACK):
                # If the selected track is valid
                track_list = self._get_track_list()
                track_index = (data[0] << 7) | data[1]
                if (track_index < len(track_list)):
                    # Ensure the selected track mode is up to date
                    if self.song().view.selected_track in self._get_track_list('AUDIO'):
                        self._selected_track_mode = 'AUDIO'
                    else:
                        self._selected_track_mode = 'MASTER_RETURN'

                    # If the selected track or grouped tracks have changed
                    if (self._selected_track_index != track_index) or (self._selected_track_mode != self._channel_mode) or (self._touch_override == True):
                        # Select the track - note this will cause _RotoControl__on_selected_track_changed
                        # to be called
                        self._touch_override = False
                        self._selected_track_index = track_index
                        selected_track = track_list[self._selected_track_index]
                        self._track_selected_via_roto_control = True
                        self.song().view.selected_track = selected_track
                        self._log_print('Select track {}'.format(track_index))
                        self._selected_track_mode = self._channel_mode

            elif (command_id == REQUEST_TRANSPORT_STATUS):
                # Send the status of each transport control. Stop, rewind and fast forward do not have status access.
                play_status = 0
                record_status = 0
                session_record_status = 0
                loop_status = 0
                punch_in_status = 0
                punch_out_status = 0
                re_enable_automation_status = 0

                if self.song().is_playing:
                    play_status = 1
                if self.song().record_mode:
                    record_status = 1
                if self.song().session_record:
                    session_record_status = 1
                if self.song().loop:
                    loop_status = 1
                if self.song().punch_in:
                    punch_in_status = 1
                if self.song().punch_out:
                    punch_out_status = 1
                if self.song().re_enable_automation_enabled:
                    re_enable_automation_status = 1

                self._send_sysex(GENERAL_COMMAND_GROUP, TRANSPORT_STATUS, bytearray([play_status, 0, record_status, session_record_status, loop_status, punch_in_status, punch_out_status, re_enable_automation_status]))

        elif (command_group == PLUGIN_COMMAND_GROUP):
            if (command_id == SET_PLUGIN_MODE):
                # Reset Plugin and Mix mappings
                self._log_print('Set Plugin mode')
                self._active_mode = 'PLUGIN'

                self._clear_mixer_params()
                
                # If learning
                if self._learn_mode_enabled == True:
                    # Turn device learn mode OFF
                    self._learn_mode_enabled = False
                    self._selected_device_learn_mode = None

                    # Make sure all previous param mappings are reset
                    for ix in range(NUM_ENCODERS):
                        self._encoder_list[ix].release_parameter()
                        self._button_list[ix].release_parameter()

                # Update the devices - always do this in case Roto doesn't have this info
                self._update_devices()
                self._update_selected_device()

            elif (command_id == SET_FIRST_DEVICE):
                # Set the plugin first device index
                if (data[0] < len(self.get_expanded_device_list())):
                    self._plugin_first_device = data[0]
                    self._update_devices()
                    self._log_print('Set Plugin First Device - {}'.format(self._plugin_first_device), LOG_VERBOSE)

            elif (command_id == ROTO_CONTROL_SELECT_DEVICE):
                # Build the list of selected devices
                device_list = self.get_expanded_device_list()
                # If the selected device is valid
                if (data[0] < len(device_list)):
                    # If the selected device has changed
                    if self._selected_device_index != self._plugin_first_device + data[0]:
                        # Select the device - note this will cause __on_selected_device_changed
                        # to be called
                        self._selected_device_index = self._plugin_first_device + data[0]
                        self._device_selected_via_roto_control = True
                        selected_device = device_list[self._selected_device_index]
                        if self._plugin_lock == True:
                            self._locked_device = selected_device
                        self.song().view.select_device(selected_device)
                        self._log_print('Select plugin device {}'.format(self._selected_device_index), LOG_VERBOSE)

            elif (command_id == SET_DEVICE_LEARN):
                self._log_print('SET_DEVICE_LEARN {}'.format(data[0]), LOG_VERBOSE)
                selected_device = self._get_selected_device()
                if selected_device != None:
                    # Reselect the device - this will clear the selected parameter
                    self.song().view.select_device(selected_device)

                if (data[0]):
                    # Turn device learn mode ON
                    self._learn_mode_enabled = True
                    self._selected_device_learn_mode = selected_device
                else:
                    # Turn device learn mode OFF
                    self._learn_mode_enabled = False
                    # Update to the currently selected device in case the user has changed it
                    if self._get_selected_device() != self._selected_device_learn_mode:
                        self._update_selected_device()
                        self._RotoControl__on_selected_device_changed()
                    self._selected_device_learn_mode = None

                    # Make sure all previous param mappings are reset
                    for ix in range(NUM_ENCODERS):
                        self._encoder_list[ix].release_parameter()
                        self._button_list[ix].release_parameter()

            elif (command_id == CONTROL_MAPPED):
                # Get the selected device, if any
                selected_device = self._get_selected_device()

                # If the selected device is valid
                param_valid = True
                if selected_device != None:
                    # Get the param index
                    param_index = ((data[0] & 0x7f) << 7) + (data[1] & 0x7f)
                    param_index_original = param_index
                    param_hash = bytearray()
                    for ix in range(2, 8):
                        param_hash.append(data[ix])

                    device_is_learnt_rack = False
                    if self._device_is_macro_rack(selected_device.class_name) and (data[10] == 0): # (data[10] == 0) ==> Current param is not a macro
                        device_is_learnt_rack = True

                    param_hash_list = []
                    for ix in range(len(selected_device.parameters)):
                        param_learn_name = self._get_learn_name(selected_device.parameters[ix], device_is_learnt_rack)
                        plugin_digest = self._get_param_hash(param_learn_name)
                        param_hash_list.append(plugin_digest)

                    # For all plugins use the hash to find the correct param, unless the parameter
                    # is repeated in the plugin, in which case use the index.
                    # Macros always use index to find the correct param.
                    param_mapped = True
                    param = None
                    param_is_macro = False
                    if self._device_is_macro_plugin(selected_device.class_name):
                        if param_index < len(selected_device.parameters):
                            if self._is_macro(selected_device.parameters[param_index]):
                                param_is_macro = True
                    elif self._device_is_macro_rack(selected_device.class_name) and (data[10] == 1): # (data[10] == 1) ==> Current param is a macro
                        param_is_macro = True
                    elif self._is_3rd_party_plugin() and (data[10] == 1):
                        param_is_macro = True

                    if not param_is_macro:
                        # Find the param in the hash list here. If there are no repeats use the hash only. If there
                        # are repeats then use the index only
                        if param_hash_list.count(param_hash) > 1:
                            if param_index < len(selected_device.parameters):
                                # When using index, sanity check the name
                                if param_hash == param_hash_list[param_index]:
                                    param = selected_device.parameters[param_index]
                                    # Send the position data for knobs
                                    if (param != None) and (data[8] == 0):
                                        self._learn_parameter(param, selected_device, param_index)
                                else:
                                    param_index = None
                            else:
                                param_index = None
                        elif param_hash in param_hash_list:
                            param_index = param_hash_list.index(param_hash)
                            param = selected_device.parameters[param_index]

                            # Send the position data for knobs
                            if (param != None) and (data[8] == 0):
                                self._learn_parameter(param, selected_device, param_index_original, False, param_hash)
                        else:
                            param_index = None
                    else:
                        param = selected_device.parameters[param_index]
                        # Update the name of each macro as they are discovered if the macro is mapped.
                        if self._device_is_macro_rack(selected_device.class_name):
                            page_offset = 0
                            macro_index = int(param.original_name.split()[-1])
                            if macro_index > 8:
                                page_offset = 8

                            if selected_device.macros_mapped[page_offset + data[9]] == False:
                                param_mapped = False

                        if param_mapped:
                            self._learn_parameter(param, selected_device, PARAM_INDEX_NO_OVERRIDE, param_mapped, param_hash)
                            if not self._is_live_v10():
                                if not param.name_has_listener(self._on_param_name_changed):
                                    param.add_name_listener(self._on_param_name_changed)

                    if (param_index != None):
                        # Knob = 0, Switch = 1
                        param = selected_device.parameters[param_index]
                        if (data[8] == 0):
                            # Param -> knob control learned
                            self._encoder_list[data[9]].release_parameter()
                            if param_mapped:
                                self._encoder_list[data[9]].connect_to(param)
                        elif (data[8] == 1):
                                # Param -> switch control learned
                            self._button_list[data[9]].release_parameter()
                            if param_mapped:
                                self._button_list[data[9]].connect_to(param)
                    else:
                        param_valid = False
                else:
                    param_valid = False

                if param_valid == False:
                    # Notify the device that the parameter is invalid
                    self._log_print('Parameter invalid - disable control', LOG_VERBOSE)
                    if (data[8] == 0):
                        self._encoder_list[data[9]].release_parameter()
                    elif (data[8] == 1):
                        self._button_list[data[9]].release_parameter()

            elif (command_id == SET_PLUGIN_ENABLE):
                # Find the device enable parameter - its normally the first one.
                found = False
                devices = self.get_expanded_device_list()
                device = devices[self._plugin_first_device + data[0]]
                for parameter in device.parameters:
                    if (parameter.name == 'Device On') and (parameter.is_enabled == True):
                        found = True
                        break

                if not found:
                    self._log_print('Device: {} does not support activation'.format(device.name))
                    return

                if (data[1]):
                    self._log_print('Enable plugin: {}'.format(device.name), LOG_VERBOSE)
                    parameter.value = 1.0
                else:
                    self._log_print('Disable plugin: {}'.format(device.name), LOG_VERBOSE)
                    parameter.value = 0.0

            elif (command_id == SET_PLUGIN_LOCK):
                if (data[0]):
                    # Turn plugin lock ON
                    self._locked_device = self.song().view.selected_track.view.selected_device
                    self._locked_track = self.song().view.selected_track
                    self._plugin_lock = True
                else:
                    # Turn plugin lock OFF
                    self._locked_device = None
                    self._locked_track = None
                    self._plugin_lock = False
                    # Update to the currently selected device in case the user has changed it
                    self._RotoControl__on_selected_device_changed()

        elif (command_group == MIXER_COMMAND_GROUP):
            mixer_update = False
            if (command_id == SET_MIXER_ALL_MODE):
                # If entering MIX mode
                if self._active_mode != 'MIXER':
                    # Reset Plugin and Mix mappings
                    for ix in range(NUM_ENCODERS):
                        self._encoder_list[ix].release_parameter()
                        self._button_list[ix].release_parameter()
                    self._clear_mixer_params()
                self._active_mode = 'MIXER'

                # Set the Track mode
                self._mixer_mode = 'MODE_ALL'

                # Set the mixer/audio mode
                if (data[0] == 0x1):
                    self._channel_mode = 'MASTER_RETURN'
                else:
                    self._channel_mode = 'AUDIO'

                # Set the knob mode
                if (data[1] == 0x0):
                    self._mixer_encoder_mode = 'LEVEL'
                    self._log_print('Change Knob - {}'.format(self._mixer_encoder_mode), LOG_VERBOSE)
                elif (data[1] == 0x1):
                    self._mixer_encoder_mode = 'PAN'
                    self._log_print('Change Knob - {}'.format(self._mixer_encoder_mode), LOG_VERBOSE)
                elif (data[1] == 0x2):
                    self._mixer_encoder_mode = 'SEND'
                    self._mixer_send_index = data[3]

                # Set the switch mode
                if (data[2] == 0x0):
                    self._mixer_button_mode = 'MUTE'
                    self._log_print('Change Button - {}'.format(self._mixer_button_mode), LOG_VERBOSE)
                elif (data[2] == 0x1):
                    self._mixer_button_mode = 'SOLO'
                    self._log_print('Change Button - {}'.format(self._mixer_button_mode), LOG_VERBOSE)
                elif (data[2] == 0x2):
                    self._mixer_button_mode = 'ARM_RECORDING'
                    self._log_print('Change Button - {}'.format(self._mixer_button_mode), LOG_VERBOSE)
                
                # Update the mixer
                mixer_update = True

            elif (command_id == SET_MIXER_SELECTED_MODE):
                # If entering MIX mode
                if self._active_mode != 'MIXER':
                    # Reset Plugin and Mix mappings
                    for ix in range(NUM_ENCODERS):
                        self._encoder_list[ix].release_parameter()
                        self._button_list[ix].release_parameter()
                    self._clear_mixer_params()
                self._active_mode = 'MIXER'

                # Set the Track mode
                self._mixer_mode = 'MODE_SELECTED'

                # Set the page index
                self._mixer_selected_mode_page_index = data[0]

                # Update the mixer
                mixer_update = True

            elif (command_id == SET_MIXER_CHANNEL_MODE):
                self._clear_mixer_params()
                if (data[0] == 0x1):
                    self._channel_mode = 'MASTER_RETURN'
                else:
                    self._channel_mode = 'AUDIO'

                self._log_print('Channel mode: {}'.format(self._channel_mode), LOG_VERBOSE)
                mixer_update = True

            elif (command_id == TOGGLE_GROUP_TRACK):
                # If the selected track is valid
                track_list = self._get_track_list()
                track_index = (data[0] << 7) | data[1]
                if (track_index < len(track_list)):
                    # Can only toggle audio tracks
                    if self.song().view.selected_track in self._get_track_list('AUDIO'):
                        track = track_list[track_index]
                        if track.is_foldable:
                            self._log_print('Toggle group track: {}'.format(track.name), LOG_VERBOSE)
                            current_state = track.fold_state
                            track.fold_state = not current_state
                            # Since we triggered this fold event force a refresh instead of waiting for the timer
                            self._update_foldable_tracks()

            if mixer_update:
                self._update_mixer()
                return

    def _is_3rd_party_plugin(self):
        is_3rd_party = False
        selected_device = self._get_selected_device()
        if selected_device != None:
            if selected_device.class_name in ['PluginDevice', 'AuPluginDevice']:
                is_3rd_party = True
        return is_3rd_party

    def _get_plugin_names(self):
        plugin_names = []
        devices = self.get_expanded_device_list()
        for ix in range(NUM_ENCODERS):
            current_plugin = self._plugin_first_device + ix 
            if current_plugin < len(devices):
                device = devices[current_plugin]
                plugin_names.append((device.class_name, device.name))
        return plugin_names

    def _process_hash_object(self, hash_object, index):
        if sys.version_info[0] < 3:
            return (ord(hash_object.digest()[index]) & 0x7f)
        else:
            return (hash_object.digest()[index] & 0x7f)

    # Process and format plugin names in preparation for sending
    def _process_return_plugin_names(self, plugin_names_list):
        devices = self.get_expanded_device_list()
        for ix in range(NUM_ENCODERS):
            if (ix < len(plugin_names_list)):
                # Calculate the device hash - for Ableton Live devices that support preset recall we use
                # only the class name to determine the hash - so all presets for the same device use the
                # same mapping. For all other types of plugins or devices use the class name together
                # with the device name.
                plugin_digest = bytearray()
                if self._device_is_macro_rack(plugin_names_list[ix][PLUGIN_CLASS_NAME_INDEX]) and self._rack_has_default_name(plugin_names_list[ix][PLUGIN_NAME_INDEX]):
                    plugin_digest.extend(self._get_plugin_hash(MACRO_DEVICE_NAME.encode('utf-8'), 8))
                elif self._device_supports_preset_recall(plugin_names_list[ix][PLUGIN_CLASS_NAME_INDEX]):
                    plugin_digest.extend(self._get_plugin_hash((plugin_names_list[ix][PLUGIN_CLASS_NAME_INDEX]).encode('utf-8'), 8))
                else:
                    plugin_digest.extend(self._get_plugin_hash((plugin_names_list[ix][PLUGIN_CLASS_NAME_INDEX] + plugin_names_list[ix][PLUGIN_NAME_INDEX]).encode('utf-8'), 4))
                    plugin_digest.extend(self._get_plugin_hash((plugin_names_list[ix][PLUGIN_NAME_INDEX] + plugin_names_list[ix][PLUGIN_CLASS_NAME_INDEX]).encode('utf-8'), 4))
                enabled = 0x01
                device = devices[self._plugin_first_device + ix]
                rack_device = 0
                if not device.is_active:
                    enabled = 0x00
                if self._device_is_macro_rack(plugin_names_list[ix][PLUGIN_CLASS_NAME_INDEX]):
                    rack_device = 1
                elif self._is_3rd_party_plugin():
                    rack_device = 2
                data = bytearray([self._plugin_first_device + ix])
                data.extend(plugin_digest)
                data.append(enabled)
                data.extend(plugin_names_list[ix][PLUGIN_NAME_INDEX][:(MAX_STRING_LENGTH - 1)].ljust(MAX_STRING_LENGTH, '\x00').encode('utf-8'))
                data.append(rack_device)
                data.append(MACRO_PLUGIN_PAGES)
                self._send_sysex(PLUGIN_COMMAND_GROUP, PLUGIN_DETAILS, data)
        self._send_sysex(PLUGIN_COMMAND_GROUP, PLUGIN_DETAILS_END, bytearray())

    def _return_tracks(self):
        # Return the track details
        return_track_names = self._get_track_names()
        return_first_track = self._get_mixer_first_track()
        track_list = self._get_track_list()
        track_index_lsb = self._selected_track_index & 0x7F
        track_index_msb = self._selected_track_index >> 7
        num_tracks_lsb = len(track_list) & 0x7F
        num_tracks_msb = len(track_list) >> 7
        self._send_sysex(GENERAL_COMMAND_GROUP, NUM_TRACKS, bytearray([num_tracks_msb, num_tracks_lsb]))
        first_track_lsb = return_first_track & 0x7F
        first_track_msb = return_first_track >> 7
        self._send_sysex(GENERAL_COMMAND_GROUP, FIRST_TRACK, bytearray([first_track_msb, first_track_lsb]))
        track_name = self.song().view.selected_track.name[:(MAX_STRING_LENGTH - 1)].ljust(MAX_STRING_LENGTH, '\x00')
        is_foldable = 0
        if self.song().view.selected_track.is_foldable:
            is_foldable = 1
        data = bytearray([track_index_msb, track_index_lsb])
        data.extend(track_name.encode('utf-8'))
        data.append(self.song().view.selected_track.color_index)
        data.append(is_foldable)
        self._process_return_track_names(return_track_names)
        self._send_sysex(MIXER_COMMAND_GROUP, DAW_SELECT_TRACK, data)

    def _get_track_list(self, mode = None, show_hidden_tracks = False):
        full_track_list = []
        if mode == None:
            mode = self._channel_mode

        if mode == 'MASTER_RETURN':
            full_track_list = list(self.song().return_tracks)
            full_track_list.append(self.song().master_track)
        else:
            full_track_list = list(self.song().tracks)

        track_list = []

        if (show_hidden_tracks == False) and (mode == 'AUDIO'):
            for track in full_track_list:
                # Remove any hidden tracks
                if track.is_visible:
                    track_list.append(track)
        else:
            track_list = full_track_list

        return track_list

    def _get_visible_track_mask(self, track_list):
        shift = 0
        track_mask = 0
        for track in track_list:
            # Remove any hidden tracks
            if track.is_visible:
                track_mask |= (1 << shift)
            shift += 1
        return track_mask

    def _get_track_names(self):
        track_names = []
        track_list = self._get_track_list()

        for ix in range(NUM_ENCODERS):
            _current_track = self._get_mixer_first_track() + ix 
            if _current_track < len(track_list):
                track_names.append(track_list[_current_track].name)
        return track_names

    def _get_mixer_first_track(self):
        if self._channel_mode == 'MASTER_RETURN':
            return self._mixer_master_return_first_track
        else:
            return self._mixer_audio_first_track

    # Process and format track names in preparation for sending
    def _process_return_track_names(self, return_track_names_list):
        # Send back the index and track name - one sysex message per track
        for ix in range(NUM_ENCODERS):
            # Track string return format
            #    <Track index>   <Track name>
            #       16 bits      7 bit chars
            if (ix < len(return_track_names_list)):
                track_list = self._get_track_list()
                colour_index = track_list[self._get_mixer_first_track() + ix].color_index
                is_foldable = 0
                if track_list[self._get_mixer_first_track() + ix].is_foldable:
                    is_foldable = 1
                track_index = self._get_mixer_first_track() + ix
                track_index_lsb = track_index & 0x7F
                track_index_msb = track_index >> 7
                data = bytearray([track_index_msb, track_index_lsb])
                data.extend(return_track_names_list[ix][:(MAX_STRING_LENGTH - 1)].ljust(MAX_STRING_LENGTH, '\x00').encode('utf-8'))
                data.append(colour_index)
                data.append(is_foldable)
                self._send_sysex(GENERAL_COMMAND_GROUP, TRACK_DETAILS, data)
        self._send_sysex(GENERAL_COMMAND_GROUP, TRACK_DETAILS_END, bytearray())

    def _get_plugin_hash(self, plugin_name, hash_size):
        hash_object = hashlib.sha1(plugin_name)
        plugin_digest = bytearray()
        for ix in range(hash_size):
            plugin_digest.append(self._process_hash_object(hash_object, ix))
        return plugin_digest

    def _get_param_hash(self, param_name):
        hash_object = hashlib.sha1(param_name.encode('utf-8'))
        param_hash = bytearray()
        for ix in range(6):
            param_hash.append(self._process_hash_object(hash_object, ix))
        return param_hash

    def _device_supports_preset_recall(self, device_name):
        return device_name not in UNIQUE_DEVICE_CLASS_NAMES

    def _device_is_macro_rack(self, class_name):
        return class_name in MACRO_DEVICE_CLASS_NAMES

    def _device_is_macro_plugin(self, class_name):
        return class_name in MACRO_PLUGIN_W_LIST

    def _rack_has_default_name(self, device_name):
        return device_name in MACRO_DEFAULT_NAMES

    # Check if we are in Live 10 to hande API differences
    def _is_live_v10(self):
        version = Live.Application.get_application().get_major_version()
        return (version == 10)

    # Process and format track names in preparation for sending
    def _send_sysex(self, sub_id_1, sub_id_2, data):
        # Create the SYSEX command to send
        midi_bytes = bytearray([MIDI_SYSEX_HEADER, 
                                MI_MANUFACTURER_ID[0], MI_MANUFACTURER_ID[1], MI_MANUFACTURER_ID[2], ROTO_CONTROL_DEVICE_ID,
                                sub_id_1, sub_id_2])
        if len(data):
            midi_bytes.extend(data)
        midi_bytes.append(MIDI_SYSEX_END)
        self._log_print('SEND SYSEX: ' + str(tuple(midi_bytes)), LOG_VERBOSE)
        self._send_midi(tuple(midi_bytes))
        sleep(0.005)

    def _log_print(self, log_string, print_level = LOG_BASIC):
        if (print_level <= LOG_PRINT_LEVEL):
            self.log_message(log_string)
