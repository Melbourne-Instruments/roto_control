package com.bitwig.extensions.controllers.melbourneinstruments.value;

public enum KnobMode {
    LEVEL,
    PANNING,
    SEND,
    FOCUS_TRACK,
    FOCUS_TRACK_PG1,
    PLUGIN,
    MACRO;


    public boolean isFocusMode() {
        return this == FOCUS_TRACK || this == FOCUS_TRACK_PG1;
    }

    public boolean isMixMode() {
        return this == LEVEL || this == SEND || this == PANNING;
    }

    public boolean isPluginMode() {return this == PLUGIN || this == MACRO;}

    public static KnobMode toMode(final int id) {
        return switch (id) {
            case 0 -> LEVEL;
            case 1 -> PANNING;
            case 2 -> SEND;
            case 4 -> FOCUS_TRACK;
            case 5 -> PLUGIN;
            default -> null;
        };
    }
}
