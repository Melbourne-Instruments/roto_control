package com.bitwig.extensions.controllers.melbourneinstruments.layer;

import java.util.ArrayList;
import java.util.List;

import com.bitwig.extension.controller.api.Send;
import com.bitwig.extension.controller.api.Track;
import com.bitwig.extension.controller.api.TrackBank;
import com.bitwig.extensions.controllers.melbourneinstruments.MidiProcessor;
import com.bitwig.extensions.controllers.melbourneinstruments.binding.RotoKnobParameterBinding;
import com.bitwig.extensions.controllers.melbourneinstruments.control.RotoButton;
import com.bitwig.extensions.controllers.melbourneinstruments.control.RotoKnob;
import com.bitwig.extensions.controllers.melbourneinstruments.states.TrackState;
import com.bitwig.extensions.controllers.melbourneinstruments.value.ButtonMode;
import com.bitwig.extensions.controllers.melbourneinstruments.value.ColorUtil;
import com.bitwig.extensions.controllers.melbourneinstruments.value.KnobMode;
import com.bitwig.extensions.framework.Layer;
import com.bitwig.extensions.framework.Layers;
import com.bitwig.extensions.framework.values.BooleanValueObject;

public abstract class MixLayerSet implements ScrollViewSet {
    private final EffectTrackSet effectTrackSet;
    private final String name;
    protected TrackBank trackBank;
    protected MidiProcessor midiProcessor;
    
    protected final List<TrackState> states;
    protected final Layer buttonMuteLayer;
    protected final Layer buttonSoloLayer;
    protected final Layer buttonArmLayer;
    protected final Layer volumeLayer;
    protected final Layer panLayer;
    protected final Layer sendLayer;
    
    protected int numberOfTracks;
    protected int firstIndex;
    
    public MixLayerSet(final Layers layers, final MidiProcessor midiProcessor, final String name,
        final TrackBank trackBank, final EffectTrackSet effectTrackSet) {
        this.states = new ArrayList<>();
        this.trackBank = trackBank;
        //trackBank.scrollPosition().addValueObserver(this::handleScrollPositionChange);
        this.midiProcessor = midiProcessor;
        this.name = name;
        buttonMuteLayer = new Layer(layers, "MUTE_LAYER_%s".formatted(name));
        buttonSoloLayer = new Layer(layers, "SOLO_LAYER_%s".formatted(name));
        buttonArmLayer = new Layer(layers, "ARM_LAYER_%s".formatted(name));
        volumeLayer = new Layer(layers, "VOLUME_LAYER_%s".formatted(name));
        panLayer = new Layer(layers, "PAN_LAYER_%s".formatted(name));
        sendLayer = new Layer(layers, "SEND_LAYER_%s".formatted(name));
        this.effectTrackSet = effectTrackSet;
    }
    
    // Out of commission until we get unlimited tracks and follow again
    public boolean adjustTrackScroll(final int pos) {
        if (pos <= firstIndex || pos >= (firstIndex + 8)) {
            this.firstIndex = (pos / 8) * 8;
            trackBank.scrollPosition().set(firstIndex);
            return true;
        }
        return false;
    }
    
    public String getName() {
        return name;
    }
    
    public void toggleGroupTrack(final int index) {
        final int location = index - this.firstIndex;
        if (location >= 0 && location < 8) {
            trackBank.getItemAt(location).isGroupExpanded().toggle();
        }
    }
    
    public void bindKnobsVolumePan(final RotoKnob knob, final Track track,
        final BooleanValueObject touchAutomationActive) {
        this.volumeLayer.addBinding(new RotoKnobParameterBinding(knob, track.volume(), touchAutomationActive));
        this.panLayer.addBinding(new RotoKnobParameterBinding(knob, track.pan(), touchAutomationActive));
        this.states.add(new TrackState());
    }
    
    public void bindKnobs(final RotoKnob knob, final Track track, final BooleanValueObject touchAutomationActive) {
        bindKnobsVolumePan(knob, track, touchAutomationActive);
        if (track.sendBank().getSizeOfBank() > 0) {
            final Send sendItem = track.sendBank().getItemAt(0);
            this.sendLayer.addBinding(new RotoKnobParameterBinding(knob, sendItem, touchAutomationActive));
        }
    }
    
    public void setTrackNumber(final int trackNumber) {
        this.numberOfTracks = trackNumber;
        if (this.numberOfTracks <= this.firstIndex && this.firstIndex >= 8) {
            this.firstIndex -= 8;
            trackBank.scrollPosition().set(this.firstIndex);
        }
    }
    
    public void selectSendBank(final int position) {
        for (int i = 0; i < trackBank.getSizeOfBank(); i++) {
            final Track track = trackBank.getItemAt(i);
            track.sendBank().scrollPosition().set(position);
        }
    }
    
    @Override
    public void sendStates() {
        effectTrackSet.sendStates();
        midiProcessor.sendIndexCommand("04", numberOfTracks);
        midiProcessor.sendIndexCommand("05", firstIndex);
        final List<TrackState> existingStates = states.stream().filter(TrackState::isExists).toList();
        for (int i = 0; i < existingStates.size(); i++) {
            final TrackState state = existingStates.get(i);
            if (state.exists()) {
                midiProcessor.sendSysEx(state.toSysExUpdate(firstIndex + i));
            }
        }
        midiProcessor.endTrackDetail();
    }
    
    public void setTrackOffset(final int position) {
        this.firstIndex = position;
        trackBank.scrollPosition().set(this.firstIndex);
    }
    
    @Override
    public boolean scrollInPlace() {
        return firstIndex == trackBank.scrollPosition().get();
    }
    
    public void setTrackExists(final int index, final boolean exists) {
        this.states.get(index).setExists(exists);
    }
    
    public void setTrackGroup(final int index, final boolean isGroup) {
        this.states.get(index).setGroup(isGroup);
    }
    
    public void setName(final int index, final String name) {
        this.states.get(index).setName(name);
    }
    
    public void setColor(final int index, final int colorIndex) {
        states.get(index).setColorIndex(colorIndex);
    }
    
    public void disableKnobLayers() {
        volumeLayer.setIsActive(false);
        panLayer.setIsActive(false);
        sendLayer.setIsActive(false);
    }
    
    public void disableButtonLayers() {
        buttonMuteLayer.setIsActive(false);
        buttonSoloLayer.setIsActive(false);
        buttonArmLayer.setIsActive(false);
    }
    
    public Layer getKnobLayer(final KnobMode mode) {
        return switch (mode) {
            case LEVEL -> volumeLayer;
            case PANNING -> panLayer;
            case SEND -> sendLayer;
            default -> null;
        };
    }
    
    public Layer getButtonLayer(final ButtonMode mode) {
        return switch (mode) {
            case MUTE -> buttonMuteLayer;
            case SOLO -> buttonSoloLayer;
            case ARM -> buttonArmLayer;
            default -> null;
        };
    }
    
    protected void bindToTrackState(final int index, final Track track, final Runnable updateCall) {
        track.isGroup().addValueObserver(isGroup -> {
            setTrackGroup(index, isGroup);
            updateCall.run();
        });
        track.exists().addValueObserver(exist -> setTrackExists(index, exist));
        track.name().addValueObserver(name -> {
            setName(index, name);
            updateCall.run();
        });
        track.color().addValueObserver((r, g, b) -> {
            setColor(index, ColorUtil.toColor(r, g, b));
            updateCall.run();
        });
    }
    
    
    public abstract void selectTrack(final int trackIndex);
    
    public abstract void bind(final RotoButton[] buttons, final RotoKnob[] knobs, final Runnable updateCall,
        BooleanValueObject touchAutomationActive);
    
}
