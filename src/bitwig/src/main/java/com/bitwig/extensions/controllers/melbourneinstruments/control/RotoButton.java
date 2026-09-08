package com.bitwig.extensions.controllers.melbourneinstruments.control;

import java.util.function.Consumer;

import com.bitwig.extension.controller.api.AbsoluteHardwareKnob;
import com.bitwig.extension.controller.api.BooleanValue;
import com.bitwig.extension.controller.api.HardwareActionBindable;
import com.bitwig.extension.controller.api.HardwareButton;
import com.bitwig.extension.controller.api.HardwareSurface;
import com.bitwig.extension.controller.api.SettableBooleanValue;
import com.bitwig.extensions.controllers.melbourneinstruments.MidiProcessor;
import com.bitwig.extensions.controllers.melbourneinstruments.binding.BooleanExistToIntegerBinding;
import com.bitwig.extensions.controllers.melbourneinstruments.binding.BooleanToIntegerBinding;
import com.bitwig.extensions.framework.Layer;
import com.bitwig.extensions.framework.values.BasicIntegerValue;

public class RotoButton {
    private final AbsoluteHardwareKnob hwKnob;
    protected HardwareButton hwButton;

    private final MidiProcessor midiProcessor;
    private final int midiId;
    private final BasicIntegerValue lightMidiValue = new BasicIntegerValue();

    public RotoButton(final HardwareSurface surface, final int midiId, final MidiProcessor midiProcessor) {
        hwButton = surface.createHardwareButton("ROTO_BUTTON_%d".formatted(midiId));
        this.hwKnob = surface.createAbsoluteHardwareKnob("ROTO_BUTTON_CONTINUOUS_%d".formatted(midiId));
        this.midiProcessor = midiProcessor;
        this.midiId = midiId;
        midiProcessor.setCcMatcher(this, midiId);
        lightMidiValue.addValueObserver(v -> midiProcessor.setButtonValueState(midiId, v));
        hwButton.isPressed().markInterested();
    }

    public HardwareButton getHwButton() {
        return hwButton;
    }

    public AbsoluteHardwareKnob getHwKnob() {
        return hwKnob;
    }

    public void bindIsPressed(final Layer layer, final SettableBooleanValue value) {
        layer.bind(hwButton, hwButton.pressedAction(), () -> value.set(true));
        layer.bind(hwButton, hwButton.releasedAction(), () -> value.set(false));
    }

    public void bindLight(final Layer layer, final BooleanValue booleanValue) {
        layer.addBinding(new BooleanToIntegerBinding(booleanValue, lightMidiValue));
    }

    public void bindLight(final Layer layer, final BooleanValue booleanValue, final BooleanValue existsValue) {
        layer.addBinding(new BooleanExistToIntegerBinding(booleanValue, lightMidiValue, existsValue));
    }

    public void bindIsPressed(final Layer layer, final Consumer<Boolean> target) {
        layer.bind(hwButton, hwButton.pressedAction(), () -> target.accept(true));
        layer.bind(hwButton, hwButton.releasedAction(), () -> target.accept(false));
    }

    public void bindPressed(final Layer layer, final HardwareActionBindable action) {
        layer.bindPressed(hwButton, action);
    }

    public void bindPressed(final Layer layer, final Runnable action) {
        layer.bindPressed(hwButton, action);
    }

    public void bindToggle(final Layer layer, final SettableBooleanValue value) {
        layer.bind(hwButton, hwButton.pressedAction(), value::toggle);
    }

    public void forceStateUpdate() {
        midiProcessor.setButtonValueState(midiId, lightMidiValue.get());
    }

    public void setLightState(final int value) {
        this.lightMidiValue.set(value);
    }


    public MidiProcessor getMidiProcessor() {
        return midiProcessor;
    }
}
