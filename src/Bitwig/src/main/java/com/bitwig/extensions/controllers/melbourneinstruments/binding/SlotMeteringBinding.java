package com.bitwig.extensions.controllers.melbourneinstruments.binding;

import com.bitwig.extensions.controllers.melbourneinstruments.MidiProcessor;
import com.bitwig.extensions.controllers.melbourneinstruments.states.MasterEfxTrackBank;

public class SlotMeteringBinding extends MeteringBinding<MasterEfxTrackBank.TrackSlot> {
    
    public SlotMeteringBinding(int index, final MasterEfxTrackBank.TrackSlot source, final MidiProcessor target) {
        super(index, source, target);
        source.getVuMeterLeft().addValueObserver(this::handleMeterLeft);
        source.getVuMeterRight().addValueObserver(this::handleMeterRight);
    }
    
}
