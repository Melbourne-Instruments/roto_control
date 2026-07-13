package com.bitwig.extensions.controllers.melbourneinstruments;

import com.bitwig.extension.controller.api.HardwareSurface;
import com.bitwig.extensions.controllers.melbourneinstruments.control.RotoButton;
import com.bitwig.extensions.controllers.melbourneinstruments.control.RotoCcButton;
import com.bitwig.extensions.controllers.melbourneinstruments.control.RotoKnob;
import com.bitwig.extensions.framework.di.Component;

@Component
public class RotoHwElements {
    
    private final RotoButton[] buttons = new RotoButton[8];
    private final RotoKnob[] knobs = new RotoKnob[8];
    private final RotoButton[] transportButtons = new RotoButton[8];
    private final RotoCcButton leftTransportButton;
    private final RotoCcButton rightTransportButton;
    
    public RotoHwElements(final MidiProcessor midiProcessor, final HardwareSurface surface) {
        for (int i = 0; i < buttons.length; i++) {
            buttons[i] = new RotoButton(surface, i + 0x14, midiProcessor);
            transportButtons[i] = new RotoButton(surface, i + 0x1C, midiProcessor);
            knobs[i] = new RotoKnob(i, surface, midiProcessor);
        }
        this.leftTransportButton = new RotoCcButton(surface, 0x24, midiProcessor);
        this.rightTransportButton = new RotoCcButton(surface, 0x25, midiProcessor);
    }
    
    public RotoButton[] getTransportButtons() {
        return transportButtons;
    }
    
    public RotoCcButton getLeftTransportButton() {
        return leftTransportButton;
    }
    
    public RotoCcButton getRightTransportButton() {
        return rightTransportButton;
    }
    
    public RotoButton[] getButtons() {
        return buttons;
    }
    
    public RotoKnob[] getKnobs() {
        return knobs;
    }
    
    public void forceButtonUpdates() {
        for (final RotoButton button : buttons) {
            button.forceStateUpdate();
        }
    }
    
    public void forceKnobUpdates() {
        //RotoControlExtension.println(" FORCE UPDATES on knobs");
        for (final RotoKnob knob : knobs) {
            knob.updatePosition(true);
        }
    }
}
