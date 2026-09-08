package com.bitwig.extensions.controllers.melbourneinstruments;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

import com.bitwig.extension.controller.ControllerExtension;
import com.bitwig.extension.controller.api.ControllerHost;
import com.bitwig.extension.controller.api.HardwareSurface;
import com.bitwig.extensions.framework.di.Context;

public class RotoControlExtension extends ControllerExtension {

    private static ControllerHost debugHost;
    private static final DateTimeFormatter DF = DateTimeFormatter.ofPattern("hh:mm:ss SSS");

    private final RotoControlExtensionDefinition definition;
    private HardwareSurface surface;

    public static void println(final String format, final Object... args) {
        if (debugHost != null) {
            final LocalDateTime now = LocalDateTime.now();
            debugHost.println(now.format(DF) + " > " + String.format(format, args));
        }
    }

    public static void showCallLocation(final String message) {
        RotoControlExtension.println("MSG: %s", message);
        for (final StackTraceElement element : Thread.currentThread().getStackTrace()) {
            final String s = element.toString();
            if (s.startsWith("com.bitwig.extensions") && !s.contains("showCallLocation")) {
                RotoControlExtension.println(
                    "  | %s ", s.replace("com.bitwig.extensions.controllers.melbourneinstruments.", ""));
            }
        }
    }


    protected RotoControlExtension(final RotoControlExtensionDefinition definition, final ControllerHost host) {
        super(definition, host);
        this.definition = definition;
    }

    public void init() {
        debugHost = getHost();
        final Context diContext = new Context(this);
        final MidiProcessor midiProcessor = diContext.getService(MidiProcessor.class);
        surface = diContext.getService(HardwareSurface.class);
        //final RotoPreferences preferences = diContext.getService(RotoPreferences.class);
        midiProcessor.initDaw("%s   %s".formatted(this.definition.getVersion(), this.definition.getVersionDate()));
    }

    @Override
    public void exit() {
        // Nothing right now
    }

    @Override
    public void flush() {
        surface.updateHardware();
    }

}
