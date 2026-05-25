package com.bitwig.extensions.controllers.melbourneinstruments.layer;

import java.util.List;

import com.bitwig.extensions.controllers.melbourneinstruments.MainLayerHandler;
import com.bitwig.extensions.controllers.melbourneinstruments.binding.RotoKnobValueBinding;
import com.bitwig.extensions.controllers.melbourneinstruments.binding.SlotMeteringBinding;
import com.bitwig.extensions.controllers.melbourneinstruments.control.RotoButton;
import com.bitwig.extensions.controllers.melbourneinstruments.control.RotoKnob;
import com.bitwig.extensions.controllers.melbourneinstruments.states.MasterEfxTrackBank;
import com.bitwig.extensions.controllers.melbourneinstruments.states.TrackState;
import com.bitwig.extensions.controllers.melbourneinstruments.value.FocusSource;
import com.bitwig.extensions.framework.Layers;
import com.bitwig.extensions.framework.values.BooleanValueObject;

public class MasterMixLayerSet extends MixLayerSet {
    private final MasterEfxTrackBank masterTrackBank;
    
    public MasterMixLayerSet(final Layers layers, final MainLayerHandler layerHandler, final String name,
        final MasterEfxTrackBank masterTrackBank, final EffectTrackSet effectTrackSet) {
        super(layers, layerHandler, name, masterTrackBank.getEffectTrackBank(), effectTrackSet);
        this.masterTrackBank = masterTrackBank;
    }
    
    public void bind(final RotoButton[] buttons, final RotoKnob[] knobs,
        final BooleanValueObject touchAutomationActive) {
        trackBank.itemCount().addValueObserver(count -> {
            setTrackNumber(count + 1);
            layerHandler.markUpdateRequired(FocusSource.MIXER_MASTER);
        });
        
        for (int i = 0; i < 8; i++) {
            int index = i;
            final MasterEfxTrackBank.TrackSlot slot = masterTrackBank.getTrackSlots().get(i);
            this.meteringLayer.addBinding(new SlotMeteringBinding(i, slot, layerHandler.getMidiProcessor()));
            bindButtons(buttons[i], slot);
            bindKnobs(knobs[i], slot);
            bindToTrackState(i, slot);
            slot.getVuActive().addValueObserver(active -> handleVuActivation(index, active));
        }
    }
    
    private void handleVuActivation(int index, final boolean active) {
        if (active != activationState[index]) {
            activationState[index] = active;
            layerHandler.updateVuActivation(FocusSource.MIXER_MASTER);
        }
    }
    
    private void bindKnobs(final RotoKnob knob, final MasterEfxTrackBank.TrackSlot track) {
        this.volumeLayer.addBinding(new RotoKnobValueBinding(knob, track.getVolume()));
        this.panLayer.addBinding(new RotoKnobValueBinding(knob, track.getPan()));
        this.sendLayer.addBinding(new RotoKnobValueBinding(knob, track.getSend()));
        this.states.add(new TrackState());
    }
    
    protected void bindToTrackState(final int index, final MasterEfxTrackBank.TrackSlot slot) {
        slot.exists().addValueObserver(exist -> setTrackExists(index, exist));
        slot.name().addValueObserver(name -> {
            setName(index, name);
            layerHandler.markUpdateRequired(FocusSource.MIXER_MASTER);
        });
        slot.color().addValueObserver(colorIndex -> {
            setColor(index, colorIndex);
            layerHandler.markUpdateRequired(FocusSource.MIXER_MASTER);
        });
    }
    
    private void bindButtons(final RotoButton button, final MasterEfxTrackBank.TrackSlot slot) {
        button.bindLight(buttonSoloLayer, slot.getSolo());
        button.bindLight(buttonMuteLayer, slot.getMute());
        button.bindLight(buttonArmLayer, slot.getArm());
        button.bindPressed(buttonMuteLayer, slot::toggleMute);
        button.bindPressed(buttonSoloLayer, slot::toggleSolo);
        button.bindPressed(buttonArmLayer, slot::toggleArm);
    }
    
    public void setTrackNumber(final int trackNumber) {
        this.numberOfTracks = trackNumber;
        if (this.numberOfTracks <= this.firstIndex && this.firstIndex >= 8) {
            this.firstIndex -= 8;
            setTrackOffset(this.firstIndex);
        } else if (masterTrackBank.getScrollOffset() < this.firstIndex) {
            masterTrackBank.setScrollPosition(this.firstIndex);
        } else if (masterTrackBank.getEffectTrackBank().scrollPosition().get() < this.firstIndex) {
            masterTrackBank.getEffectTrackBank().scrollPosition().set(this.firstIndex);
        } else {
            masterTrackBank.reapplySlots();
        }
    }
    
    @Override
    public List<TrackState> getCurrentTrackStates() {
        if (numberOfTracks - 1 == firstIndex) {
            return List.of(states.get(0));
        }
        return states.stream().filter(TrackState::isExists).toList();
    }
    
    @Override
    public void setTrackOffset(final int position) {
        this.firstIndex = position;
        masterTrackBank.setScrollPosition(this.firstIndex);
    }
    
    @Override
    public void selectTrack(final int trackIndex) {
        if (trackIndex < 0) {
            return;
        }
        masterTrackBank.selectTrack(trackIndex);
    }
}
