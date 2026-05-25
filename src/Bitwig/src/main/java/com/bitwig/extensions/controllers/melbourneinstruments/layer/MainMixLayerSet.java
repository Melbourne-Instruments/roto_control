package com.bitwig.extensions.controllers.melbourneinstruments.layer;

import com.bitwig.extension.controller.api.Track;
import com.bitwig.extension.controller.api.TrackBank;
import com.bitwig.extensions.controllers.melbourneinstruments.MainLayerHandler;
import com.bitwig.extensions.controllers.melbourneinstruments.binding.TrackMeteringBinding;
import com.bitwig.extensions.controllers.melbourneinstruments.control.RotoButton;
import com.bitwig.extensions.controllers.melbourneinstruments.control.RotoKnob;
import com.bitwig.extensions.controllers.melbourneinstruments.value.FocusSource;
import com.bitwig.extensions.framework.Layers;
import com.bitwig.extensions.framework.values.BooleanValueObject;

public class MainMixLayerSet extends MixLayerSet {
    
    public MainMixLayerSet(final Layers layers, final MainLayerHandler layerHandler, final String name,
        final TrackBank trackBank, final EffectTrackSet effectTrackSet) {
        super(layers, layerHandler, name, trackBank, effectTrackSet);
    }
    
    @Override
    public void bind(final RotoButton[] buttons, final RotoKnob[] knobs,
        final BooleanValueObject touchAutomationActive) {
        trackBank.itemCount().addValueObserver(count -> {
            setTrackNumber(count);
            layerHandler.markUpdateRequired(FocusSource.MIXER_MAIN);
        });
        for (int i = 0; i < trackBank.getSizeOfBank(); i++) {
            final int index = i;
            final Track track = trackBank.getItemAt(i);
            meteringLayer.addBinding(new TrackMeteringBinding(i, track, layerHandler.getMidiProcessor()));
            bindToTrackState(i, track);
            bindButtons(buttons[i], track);
            bindKnobs(knobs[i], track, touchAutomationActive);
            bindMuteSoloState(track, index);
        }
    }
    
    private void bindMuteSoloState(final Track track, final int index) {
        track.isMutedBySolo()
            .addValueObserver(muted -> this.handleMuteState(index, muted, track.mute().get(), track.solo().get()));
        track.mute().addValueObserver(
            muted -> this.handleMuteState(index, track.isMutedBySolo().get(), muted, track.solo().get()));
        track.solo().addValueObserver(
            soloed -> this.handleMuteState(index, track.isMutedBySolo().get(), track.mute().get(), soloed));
    }
    
    private void handleMuteState(final int index, final boolean muteBySolo, final boolean muted, final boolean soloed) {
        boolean newState = soloed || (!muted && !muteBySolo);
        if (newState != activationState[index]) {
            activationState[index] = soloed || (!muted && !muteBySolo);
            layerHandler.updateVuActivation(FocusSource.MIXER_MAIN);
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
