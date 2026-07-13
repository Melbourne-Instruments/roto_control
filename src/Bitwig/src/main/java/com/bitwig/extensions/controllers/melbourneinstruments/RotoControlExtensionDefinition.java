package com.bitwig.extensions.controllers.melbourneinstruments;

import java.util.UUID;

import com.bitwig.extension.api.PlatformType;
import com.bitwig.extension.controller.AutoDetectionMidiPortNamesList;
import com.bitwig.extension.controller.ControllerExtensionDefinition;
import com.bitwig.extension.controller.api.ControllerHost;

public class RotoControlExtensionDefinition extends ControllerExtensionDefinition {

    private static final UUID DRIVER_ID = UUID.fromString("a6395638-211c-4263-9e66-50c64a6d9986");

    public RotoControlExtensionDefinition() {
    }

    @Override
    public String getName() {
        return "Roto-Control";
    }

    @Override
    public String getAuthor() {
        return "Bitwig";
    }

    @Override
    public String getVersion() {
        return "0.1.01";
    }

    public String getVersionDate() {
        return "22-07-25";
    }

    @Override
    public UUID getId() {
        return DRIVER_ID;
    }

    @Override
    public String getHardwareVendor() {
        return "Melbourne Instruments";
    }

    @Override
    public String getHardwareModel() {
        return "Roto-Control";
    }

    @Override
    public int getRequiredAPIVersion() {
        return 22;
    }

    @Override
    public int getNumMidiInPorts() {
        return 1;
    }

    @Override
    public int getNumMidiOutPorts() {
        return 1;
    }

    public String getHelpFilePath() {
        return "Controllers/Melbourne Instruments/Roto-Control.pdf";
    }


    @Override
    public void listAutoDetectionMidiPortNames(final AutoDetectionMidiPortNamesList list,
        final PlatformType platformType) {
        switch (platformType) {
            case MAC, WINDOWS -> list.add(new String[] {"Roto-Control"}, new String[] {"Roto-Control"});
            case LINUX -> list.add(new String[] {"Roto-Control MIDI 1"}, new String[] {"Roto-Control MIDI 1"});
        }
    }

    @Override
    public RotoControlExtension createInstance(final ControllerHost host) {
        return new RotoControlExtension(this, host);
    }

}
