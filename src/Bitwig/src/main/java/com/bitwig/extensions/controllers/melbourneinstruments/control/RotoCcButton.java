package com.bitwig.extensions.controllers.melbourneinstruments.control;

import java.util.function.Consumer;

import com.bitwig.extension.controller.api.HardwareButton;
import com.bitwig.extension.controller.api.HardwareSurface;
import com.bitwig.extensions.controllers.melbourneinstruments.MidiProcessor;
import com.bitwig.extensions.framework.Layer;
import com.bitwig.extensions.framework.time.TimeRepeatEvent;
import com.bitwig.extensions.framework.time.TimedEvent;

public class RotoCcButton {
    public static final int STD_REPEAT_DELAY = 400;
    public static final int STD_REPEAT_FREQUENCY = 50;

    private final HardwareButton hwButton;
    private final MidiProcessor midiProcessor;
    private TimedEvent currentTimer;

    public RotoCcButton(final HardwareSurface surface, final int midiId, final MidiProcessor midiProcessor) {
        hwButton = surface.createHardwareButton("ROTO_BUTTON_CC_%d".formatted(midiId));
        this.midiProcessor = midiProcessor;
        midiProcessor.setCcMatcher(hwButton, midiId);
        hwButton.isPressed().markInterested();
    }

    public void bindIsPressed(final Layer layer, Consumer<Boolean> consumer) {
        layer.bind(hwButton, hwButton.pressedAction(), () -> consumer.accept(true));
        layer.bind(hwButton, hwButton.releasedAction(), () -> consumer.accept(false));
    }

    public void bindRepeatHold(final Layer layer, final Runnable action) {
        layer.bind(hwButton, hwButton.pressedAction(),
            () -> initiateRepeat(action, STD_REPEAT_DELAY, STD_REPEAT_FREQUENCY)
        );
        layer.bind(hwButton, hwButton.releasedAction(), this::cancelEvent);
    }

    public void initiateRepeat(final Runnable action, final int repeatDelay, final int repeatFrequency) {
        action.run();
        currentTimer = new TimeRepeatEvent(action, repeatDelay, repeatFrequency);
        midiProcessor.queueEvent(currentTimer);
    }

    private void cancelEvent() {
        if (currentTimer != null) {
            currentTimer.cancel();
            currentTimer = null;
        }
    }
}
