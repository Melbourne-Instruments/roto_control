package com.bitwig.extensions.controllers.melbourneinstruments.binding;

import com.bitwig.extension.controller.api.Track;
import com.bitwig.extensions.controllers.melbourneinstruments.MidiProcessor;

public class TrackMeteringBinding extends MeteringBinding<Track> {
    
    public TrackMeteringBinding(int index, final Track source, final MidiProcessor target) {
        super(index, source, target);
        source.addVuMeterObserver(MeteringBinding.METERING_MAX + 1, 0, false, this::handleMeterLeft);
        source.addVuMeterObserver(MeteringBinding.METERING_MAX + 1, 1, false, this::handleMeterRight);
    }
    
}
