package com.bitwig.extensions.controllers.melbourneinstruments.layer;

import com.bitwig.extension.controller.api.Track;
import com.bitwig.extension.controller.api.TrackBank;
import com.bitwig.extensions.controllers.melbourneinstruments.MidiProcessor;
import com.bitwig.extensions.controllers.melbourneinstruments.control.RotoButton;
import com.bitwig.extensions.controllers.melbourneinstruments.control.RotoKnob;
import com.bitwig.extensions.framework.Layers;
import com.bitwig.extensions.framework.values.BooleanValueObject;

public class MainMixLayerSet extends MixLayerSet {
    
    public MainMixLayerSet(final Layers layers, final MidiProcessor midiProcessor, final String name,
        final TrackBank trackBank, final EffectTrackSet effectTrackSet) {
        super(layers, midiProcessor, name, trackBank, effectTrackSet);
    }
    
    @Override
    public void bind(final RotoButton[] buttons, final RotoKnob[] knobs, final Runnable updateCall,
        final BooleanValueObject touchAutomationActive) {
        trackBank.itemCount().addValueObserver(count -> {
            setTrackNumber(count);
            updateCall.run();
        });
        for (int i = 0; i < trackBank.getSizeOfBank(); i++) {
            final Track track = trackBank.getItemAt(i);
            
            bindToTrackState(i, track, updateCall);
            bindButtons(buttons[i], track);
            bindKnobs(knobs[i], track, touchAutomationActive);
        }
    }
    
    private void bindButtons(final RotoButton button, final Track track) {
        track.mute().markInterested();
        track.solo().markInterested();
        track.arm().markInterested();
        
        button.bindLight(buttonMuteLayer, track.mute(), track.exists());
        button.bindToggle(buttonMuteLayer, track.mute());
        
        button.bindLight(buttonSoloLayer, track.solo());
        button.bindIsPressed(buttonSoloLayer, pressed -> handleSolo(pressed, track));
        
        button.bindLight(buttonArmLayer, track.arm());
        button.bindToggle(buttonArmLayer, track.arm());
    }
    
    private void handleSolo(final boolean pressed, final Track track) {
        if (pressed) {
            track.solo().toggleUsingPreferences(false);
        }
    }
    
    @Override
    public void selectTrack(final int trackIndex) {
        if (trackIndex < 0) {
            return;
        }
        
        final int index = trackIndex - this.firstIndex;
        if (index >= 0 && index < 8) {
            trackBank.getItemAt(index).selectInMixer();
        }
    }
}
