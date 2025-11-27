package com.bitwig.extensions.controllers.melbourneinstruments;

import com.bitwig.extension.controller.api.ControllerHost;
import com.bitwig.extension.controller.api.Preferences;
import com.bitwig.extension.controller.api.SettableStringValue;

public class RotoPreferences {

    private final SettableStringValue version;
    private final SettableStringValue fwVersion;

    public RotoPreferences(final ControllerHost host) {
        final Preferences preferences = host.getPreferences(); // THIS

        version = preferences.getStringSetting("Software", "Version", 30, "");
        fwVersion = preferences.getStringSetting("Firmware", "Version", 30, "");
    }


    public SettableStringValue getFwVersion() {
        return fwVersion;
    }

    public SettableStringValue getVersion() {
        return version;
    }
}
