package com.bitwig.extensions.controllers.melbourneinstruments.layer;

import com.bitwig.extension.controller.api.CursorTrack;
import com.bitwig.extension.controller.api.Send;
import com.bitwig.extension.controller.api.SendBank;
import com.bitwig.extension.controller.api.Track;
import com.bitwig.extension.controller.api.TrackBank;
import com.bitwig.extensions.controllers.melbourneinstruments.MidiProcessor;
import com.bitwig.extensions.controllers.melbourneinstruments.StringUtil;
import com.bitwig.extensions.controllers.melbourneinstruments.states.MasterEfxTrackBank;
import com.bitwig.extensions.framework.values.BasicIntegerValue;
import com.bitwig.extensions.framework.values.BooleanValueObject;

public class EffectTrackSet implements ScrollViewSet {

    private int sendSection = 0;
    private final SendBank effectBank;

    private int scrollPosition = 0;


    private static final String EMPTY_SYSEX_NAME = StringUtil.toSysExName("");
    private final BasicIntegerValue sendCount;
    private final MidiProcessor midiProcessor;
    private final BooleanValueObject masterSelected;
    private final BooleanValueObject trackMode;


    public EffectTrackSet(final CursorTrack cursorTrack, final MasterEfxTrackBank masterEfx,
        final MidiProcessor midiProcessor, final BooleanValueObject trackMode) {
        effectBank = cursorTrack.sendBank();
        effectBank.scrollPosition().markInterested();
        this.sendCount = masterEfx.getSendCount();
        this.masterSelected = masterEfx.getMasterSelected();
        this.midiProcessor = midiProcessor;
        this.trackMode = trackMode;
    }

    @Override
    public void sendStates() {
        midiProcessor.sendMixCommand("03", trackMode.get() && masterSelected.get() ? 0 : sendCount.get());
        final int offset = sendSection * 6;
        midiProcessor.sendSysEx(getSendStates(this.effectBank, offset));
    }

    @Override
    public boolean scrollInPlace() {
        return scrollPosition == effectBank.scrollPosition().get();
    }

    public void updateNames(final TrackBank trackBank) {
        final String sendStates = getSendStates(trackBank);
        midiProcessor.sendSysEx(sendStates);
    }

    private String getSendStates(final TrackBank trackBank) {
        final StringBuilder efxString = new StringBuilder();
        efxString.append("%02X ".formatted(trackBank.scrollPosition().get()));
        for (int i = 0; i < 8; i++) {
            final Track item = trackBank.getItemAt(i);
            efxString.append(item.exists().get() ? StringUtil.toSysExName(item.name().get()) : EMPTY_SYSEX_NAME);
        }
        return "F0 00 22 03 02 0C 08 %sF7".formatted(efxString.toString());
    }


    private String getSendStates(final SendBank effectBank, final int offset) {
        final StringBuilder efxString = new StringBuilder();
        efxString.append("%02X ".formatted(offset));
        for (int i = offset; i < offset + 8; i++) {
            final Send item = effectBank.getItemAt(i);
            efxString.append(item.exists().get() ? StringUtil.toSysExName(item.name().get()) : EMPTY_SYSEX_NAME);
        }
        return "F0 00 22 03 02 0C 08 %sF7".formatted(efxString.toString());
    }

    public void setSendSection(final int section) {
        this.sendSection = section;
    }

    public void setScrollPosition(final int position) {
        this.scrollPosition = position;
        effectBank.scrollPosition().set(position);
    }
}
