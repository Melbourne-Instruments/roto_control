package com.bitwig.extensions.controllers.melbourneinstruments.value;

public enum ButtonMode {
    MUTE,
    SOLO,
    ARM,
    TRANSPORT,
    NONE;
    
    public static ButtonMode toMode(final int id) {
        return switch (id) {
            case 0 -> MUTE;
            case 1 -> SOLO;
            case 2 -> ARM;
            default -> NONE;
        };
    }
    
}
