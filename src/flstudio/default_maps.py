# default_maps.py
# Copyright (c) 2026 Melbourne Instruments. All Rights Reserved.
#
# This script is provided "as is", without any warranty of any kind, express or
# implied, including but not limited to the warranties of merchantability,
# fitness for a particular purpose, and noninfringement. In no event shall the
# authors or copyright holders be liable for any claim, damages, or other
# liability, whether in an action of contract, tort, or otherwise, arising from,
# out of, or in connection with the software or the use or other dealings in the
# software.

# Hand-made default maps for FL Studio's own plugins, which override the ones
# generated into default_maps_data.py (a plugin's whole map). Same keys and
# entry format as default_maps_data.py (see there): FL's name for the plugin,
# and per control its parameter's index and hash (name_hash of the parameter's
# name, 6 bytes; roto_mapper's fl_dumps have them as paramHash).
#
# The script's own entries map the same way: "Mixer strip" (STRIP_PARAMS) and a
# channel's settings ("Sampler", "Audio Clip": CHANNEL_PARAMS), index the
# table's offset and hash name_hash(its name, 6) in device_roto_control.py.

MAPS = {
    # Mixer strip (the insert's own strip: the script's STRIP_NAME, its
    # parameters STRIP_PARAMS, indexed by event offset): the built-in EQ, one
    # page of knobs, freq then gain per band, low to high (user 2026-11-19).
    "Mixer strip": [
        {"ctl": 0, "knob": True, "index": 0x18, "hash": (0x11, 0x25, 0x36, 0x41, 0x53, 0x42), "steps": 0, "name": "Low Freq"},                     # EQ low freq
        {"ctl": 1, "knob": True, "index": 0x10, "hash": (0x08, 0x6A, 0x7A, 0x3B, 0x71, 0x01), "steps": 0, "centre": True, "name": "Low Gain"},     # EQ low gain
        {"ctl": 2, "knob": True, "index": 0x19, "hash": (0x65, 0x28, 0x66, 0x7A, 0x09, 0x40), "steps": 0, "name": "Mid Freq"},                     # EQ mid freq
        {"ctl": 3, "knob": True, "index": 0x11, "hash": (0x3C, 0x04, 0x5F, 0x09, 0x1E, 0x7F), "steps": 0, "centre": True, "name": "Mid Gain"},     # EQ mid gain
        {"ctl": 4, "knob": True, "index": 0x1A, "hash": (0x0D, 0x79, 0x4D, 0x2F, 0x75, 0x72), "steps": 0, "name": "High Freq"},                    # EQ high freq
        {"ctl": 5, "knob": True, "index": 0x12, "hash": (0x64, 0x04, 0x01, 0x66, 0x3A, 0x31), "steps": 0, "centre": True, "name": "High Gain"},    # EQ high gain
    ],
    # Fruity Limiter (effect): a simple test map (2026-11-10), one page of
    # knobs: the limiter, then the compressor. No map in roto_mapper yet.
    "Fruity Limiter": [
        {"ctl": 0, "knob": True, "index": 0, "hash": (0x1E, 0x28, 0x36, 0x2D, 0x60, 0x6F), "steps": 0, "centre": True, "name": "Gain", "colour": 22},    # Gain (0 dB in the middle)
        {"ctl": 1, "knob": True, "index": 2, "hash": (0x2C, 0x48, 0x7D, 0x0A, 0x6F, 0x4C), "steps": 0, "name": "Ceiling", "colour": 22},                # Limiter ceiling
        {"ctl": 2, "knob": True, "index": 3, "hash": (0x6A, 0x65, 0x4A, 0x5C, 0x18, 0x2E), "steps": 0, "name": "Lim Attack", "colour": 22},             # Limiter attack time
        {"ctl": 3, "knob": True, "index": 5, "hash": (0x67, 0x60, 0x47, 0x4A, 0x77, 0x5C), "steps": 0, "name": "Lim Release", "colour": 22},            # Limiter release time
        {"ctl": 4, "knob": True, "index": 8, "hash": (0x09, 0x46, 0x77, 0x30, 0x0E, 0x0C), "steps": 0, "name": "Comp Thresh", "colour": 22},            # Comp threshold
        {"ctl": 5, "knob": True, "index": 9, "hash": (0x65, 0x69, 0x2B, 0x4E, 0x2B, 0x7E), "steps": 0, "name": "Comp Ratio", "colour": 22},             # Comp ratio
        {"ctl": 6, "knob": True, "index": 11, "hash": (0x07, 0x5D, 0x32, 0x2D, 0x3B, 0x6D), "steps": 0, "name": "Comp Attack", "colour": 22},           # Comp attack time
        {"ctl": 7, "knob": True, "index": 12, "hash": (0x04, 0x61, 0x39, 0x77, 0x71, 0x31), "steps": 0, "name": "Comp Release", "colour": 22},          # Comp release time
    ],
}
