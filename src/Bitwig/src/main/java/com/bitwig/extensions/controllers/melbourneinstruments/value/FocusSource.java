package com.bitwig.extensions.controllers.melbourneinstruments.value;

import com.bitwig.extensions.controllers.melbourneinstruments.UpdateType;

public enum FocusSource {
    PLUGIN,
    ANY_MIXER,
    MIXER_MAIN,
    MIXER_MASTER;


    public UpdateType getUpdateType() {
        return switch (this) {
            case PLUGIN -> UpdateType.PLUGIN;
            case ANY_MIXER, MIXER_MAIN -> UpdateType.MIXER_MAIN;
            case MIXER_MASTER -> UpdateType.MIXER_MASTER;
        };
    }


}
