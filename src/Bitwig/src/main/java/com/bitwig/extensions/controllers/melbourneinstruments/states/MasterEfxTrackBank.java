package com.bitwig.extensions.controllers.melbourneinstruments.states;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import com.bitwig.extension.controller.api.MasterTrack;
import com.bitwig.extension.controller.api.SendBank;
import com.bitwig.extension.controller.api.Track;
import com.bitwig.extension.controller.api.TrackBank;
import com.bitwig.extensions.controllers.melbourneinstruments.RotoViewControl;
import com.bitwig.extensions.controllers.melbourneinstruments.value.ColorUtil;
import com.bitwig.extensions.controllers.melbourneinstruments.value.ValueProxy;
import com.bitwig.extensions.framework.values.BasicIntegerValue;
import com.bitwig.extensions.framework.values.BasicStringValue;
import com.bitwig.extensions.framework.values.BooleanValueObject;

public class MasterEfxTrackBank {
    
    private final TrackBank effectTrackBank;
    private final MasterTrack masterTrack;
    private int masterIndex;
    private int relativeMasterIndex;
    private int scrollOffset = 0;
    private final List<TrackSlot> trackSlots = new ArrayList<>();
    private final BasicIntegerValue sendCount = new BasicIntegerValue();
    private final SendBank sendBank;
    private final BooleanValueObject masterSelected = new BooleanValueObject();
    
    public class TrackSlot {
        private final int index;
        private final BooleanValueObject exists = new BooleanValueObject();
        private final BooleanValueObject mute = new BooleanValueObject();
        private final BooleanValueObject solo = new BooleanValueObject();
        private final BooleanValueObject arm = new BooleanValueObject();
        private final BasicStringValue name = new BasicStringValue();
        private final BasicIntegerValue color = new BasicIntegerValue();
        private final ValueProxy volume = new ValueProxy();
        private final ValueProxy pan = new ValueProxy();
        private final ValueProxy send = new ValueProxy();
        
        private TrackSlot(final int index) {
            this.index = index;
            volume.addValueObserver(this::setVolume);
            volume.addValueObserver(this::touchVolume);
            pan.addValueObserver(this::setPan);
            pan.addValueObserver(this::touchPan);
            send.addValueObserver(this::setSend);
            send.addValueObserver(this::touchSend);
        }
        
        public BooleanValueObject getMute() {
            return mute;
        }
        
        public BooleanValueObject getArm() {
            return arm;
        }
        
        public BooleanValueObject getSolo() {
            return solo;
        }
        
        public ValueProxy getPan() {
            return pan;
        }
        
        public ValueProxy getVolume() {
            return volume;
        }
        
        public void toggleMute() {
            if (index == relativeMasterIndex) {
                masterTrack.mute().toggle();
            } else {
                effectTrackBank.getItemAt(index).mute().toggle();
            }
        }
        
        public void toggleArm() {
            if (index == relativeMasterIndex) {
                masterTrack.arm().toggle();
            } else {
                effectTrackBank.getItemAt(index).arm().toggle();
            }
        }
        
        public void toggleSolo() {
            if (index == relativeMasterIndex) {
                masterTrack.solo().toggleUsingPreferences(false);
            } else {
                effectTrackBank.getItemAt(index).solo().toggleUsingPreferences(false);
            }
        }
        
        private void setVolume(final double value) {
            if (index == relativeMasterIndex) {
                masterTrack.volume().setImmediately(value);
            } else {
                effectTrackBank.getItemAt(index).volume().setImmediately(value);
            }
        }
        
        private void touchVolume(final boolean touch) {
            if (index == relativeMasterIndex) {
                masterTrack.volume().touch(touch);
            } else {
                effectTrackBank.getItemAt(index).volume().touch(touch);
            }
        }
        
        private void setPan(final double value) {
            if (index == relativeMasterIndex) {
                masterTrack.pan().setImmediately(value);
            } else {
                effectTrackBank.getItemAt(index).pan().setImmediately(value);
            }
        }
        
        private void touchPan(final boolean touch) {
            if (index == relativeMasterIndex) {
                masterTrack.pan().touch(touch);
            } else {
                effectTrackBank.getItemAt(index).pan().touch(touch);
            }
        }
        
        private void setSend(final double value) {
            if (index != relativeMasterIndex) {
                effectTrackBank.getItemAt(index).sendBank().getItemAt(0).setImmediately(value);
            }
        }
        
        private void touchSend(final boolean touch) {
            if (index != relativeMasterIndex) {
                effectTrackBank.getItemAt(index).sendBank().getItemAt(0).touch(touch);
            }
        }
        
        
        public BasicStringValue name() {
            return name;
        }
        
        public BooleanValueObject exists() {
            return exists;
        }
        
        public BasicIntegerValue color() {
            return color;
        }
        
        private void applyValues(final Track track, final boolean withSend) {
            this.arm.set(track.arm().get());
            this.mute.set(track.mute().get());
            this.solo.set(track.solo().get());
            this.volume.set(track.volume().get());
            this.pan.set(track.pan().get());
            if (withSend) {
                this.send.set(track.sendBank().getItemAt(0).get());
            }
            this.name.set(track.name().get());
            this.exists.set(track.exists().get());
            this.color.set(ColorUtil.toColor(track.color().get()));
        }
        
        public ValueProxy getSend() {
            return send;
        }
    }
    
    public MasterEfxTrackBank(final RotoViewControl viewControl) {
        sendBank = viewControl.getTrackBank().getItemAt(0).sendBank();
        sendBank.scrollPosition().markInterested();
        sendBank.itemCount().addValueObserver(count -> sendCount.set(count));
        
        for (int i = 0; i < 8; i++) {
            trackSlots.add(new TrackSlot(i));
        }
        
        this.effectTrackBank = viewControl.getEffectBank();
        effectTrackBank.itemCount().addValueObserver(count -> setMasterIndex(count));
        effectTrackBank.scrollPosition().addValueObserver(this::setScrollPosition);
        this.masterTrack = viewControl.getMasterTrack();
        masterTrack.addIsSelectedInEditorObserver(this::handleMasterSelected);
        
        for (int index = 0; index < effectTrackBank.getSizeOfBank(); index++) {
            final Track sendTrack = effectTrackBank.getItemAt(index);
            attachTrackToSlot(sendTrack, index);
        }
        attachTrackToSlot(masterTrack, -1);
        setMasterIndex(effectTrackBank.itemCount().get());
    }
    
    
    private void attachTrackToSlot(final Track track, final int index) {
        track.mute().addValueObserver(mute -> getSlot(index).ifPresent(slot -> slot.getMute().set(mute)));
        track.arm().addValueObserver(arm -> getSlot(index).ifPresent(slot -> slot.getArm().set(arm)));
        track.solo().addValueObserver(solo -> getSlot(index).ifPresent(slot -> slot.getSolo().set(solo)));
        track.volume().value().addValueObserver(value -> getSlot(index).ifPresent(slot -> slot.getVolume().set(value)));
        track.pan().value().addValueObserver(value -> getSlot(index).ifPresent(slot -> slot.getPan().set(value)));
        track.name().addValueObserver(name -> getSlot(index).ifPresent(slot -> slot.name.set(name)));
        track.exists().addValueObserver(exists -> getSlot(index).ifPresent(slot -> slot.exists.set(exists)));
        track.color().addValueObserver(
            (r, g, b) -> getSlot(index).ifPresent(slot -> slot.color.set(ColorUtil.toColor(r, g, b))));
        if (index != -1) {
            track.sendBank().getItemAt(0).value()
                .addValueObserver(value -> getSlot(index).ifPresent(slot -> slot.send.set(value)));
        }
    }
    
    public void setScrollPosition(final int pos) {
        if (pos == -1) {
            return;
        }
        this.scrollOffset = pos;
        this.relativeMasterIndex = masterIndex - scrollOffset;
        if (this.effectTrackBank.scrollPosition().get() != this.scrollOffset) {
            this.effectTrackBank.scrollPosition().set(this.scrollOffset);
        }
        reapplySlots();
    }
    
    public int getScrollOffset() {
        return scrollOffset;
    }
    
    public BooleanValueObject getMasterSelected() {
        return masterSelected;
    }
    
    public void reapplySlots() {
        for (int i = 0; i < 8; i++) {
            final TrackSlot slot = trackSlots.get(i);
            if (i == relativeMasterIndex) {
                slot.applyValues(masterTrack, false);
            } else {
                slot.applyValues(effectTrackBank.getItemAt(i), true);
            }
        }
    }
    
    public BasicIntegerValue getSendCount() {
        return sendCount;
    }
    
    private void handleMasterSelected(final boolean masterSelected) {
        this.masterSelected.set(masterSelected);
    }
    
    public TrackBank getEffectTrackBank() {
        return effectTrackBank;
    }
    
    public void setMasterIndex(final int index) {
        if (index == masterIndex) {
            return;
        }
        this.masterIndex = index;
        this.relativeMasterIndex = masterIndex - scrollOffset;
        reapplySlots();
    }
    
    public Optional<TrackSlot> getSlot(final int slotIndex) {
        if (slotIndex == -1 && relativeMasterIndex >= 0 && relativeMasterIndex < 8) {
            return Optional.of(trackSlots.get(relativeMasterIndex));
        }
        if (slotIndex != -1 && slotIndex != relativeMasterIndex) {
            return Optional.of(trackSlots.get(slotIndex));
        }
        return Optional.empty();
    }
    
    public List<TrackSlot> getTrackSlots() {
        return trackSlots;
    }
    
    public void selectTrack(final int trackIndex) {
        final int index = trackIndex - scrollOffset;
        if (trackIndex == masterIndex) {
            masterTrack.selectInMixer();
        } else if (index >= 0 && index < 8) {
            effectTrackBank.getItemAt(index).selectInMixer();
        }
    }
}
