package com.bitwig.extensions.controllers.melbourneinstruments;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Queue;
import java.util.concurrent.ConcurrentLinkedQueue;

import com.bitwig.extension.controller.api.AbsoluteHardwareKnob;
import com.bitwig.extension.controller.api.ControllerHost;
import com.bitwig.extension.controller.api.HardwareButton;
import com.bitwig.extension.controller.api.MidiIn;
import com.bitwig.extension.controller.api.MidiOut;
import com.bitwig.extension.controller.api.NoteInput;
import com.bitwig.extensions.controllers.melbourneinstruments.binding.MeteringBinding;
import com.bitwig.extensions.controllers.melbourneinstruments.control.RotoButton;
import com.bitwig.extensions.controllers.melbourneinstruments.control.RotoKnob;
import com.bitwig.extensions.controllers.melbourneinstruments.device.ParameterSettings;
import com.bitwig.extensions.framework.di.Component;
import com.bitwig.extensions.framework.time.TimedEvent;

@Component
public class MidiProcessor {
    
    private static final String RCV_HEADER = "f000220302";
    private static final int RCV_HEADER_OFFSET = RCV_HEADER.length();
    //private RotoPreferences preferences;
    private String version;
    public static final int CMD_ID_GENERAL = 0xA;
    public static final int CMD_ID_PLUGIN = 0xB;
    public static final int CMD_ID_MIXER = 0xC;
    public static final String HEADER = "F0 00 22 03 02 ";
    private static final String END_DETAIL_COMMAND = HEADER + "0A 08 F7";
    private static final String END_PLUGIN_DETAIL_COMMAND = HEADER + "0B 06 F7";
    private static final String COMMAND_PING = HEADER + "0A 03 02 F7";
    private static final String COMMAND_DAW_START = HEADER + "0A 01 F7";
    private static final String COMMAND_METER_THRESHOLD =
        HEADER + "0C 0B 2F %02X F7".formatted(MeteringBinding.METERING_MAX);
    private static final String COMMAND_VALUE_GENERAL_DIR = HEADER + "0A %s F7";
    private static final String COMMAND_VALUE_GENERAL = HEADER + "0A %s %s F7";
    private static final String COMMAND_VALUE_PLUGIN = HEADER + "0B %s %s F7";
    private static final String COMMAND_VALUE_PLUGIN_UPDATE = HEADER + "0B 08 %02X %02X %02X F7";
    private static final MidiCommand COMMAND_VU_ACTIVATION_MSG = new MidiCommand(0xC, 0xC, 8);
    private static final MidiCommand COMMAND_SEND_COUNT_MSG = new MidiCommand(0xC, 0x3, 1);
    
    private final ControllerHost host;
    private final MidiIn midiIn;
    private final MidiOut midiOut;
    private MainLayerHandler mixState;
    private boolean ccOutBlocked = false;
    private boolean ccInsBlocked = false;
    private long inBlockTime = 0L;
    private boolean initialized = false;
    int lastUpdateOnSendsNumber = -1;
    
    private final Map<Integer, RotoKnob> valueMatcherMap = new HashMap<>();
    private final Map<Integer, RotoKnob> valueMatcherBase2Map = new HashMap<>();
    protected final Queue<TimedEvent> timedEvents = new ConcurrentLinkedQueue<>();
    private final List<DisplayResetState> resetCalls = new ArrayList<>();
    private final Map<Integer, int[]> pendingCCs = new HashMap<>();
    private final ParamBuffer paramBuffer = new ParamBuffer();
    
    private class ParamBuffer {
        private final String[] parameterValueUpdate = new String[8];
        private final String[] parameterButtonUpdate = new String[8];
        private final int[] meterUpdates = new int[16];
        private final boolean[] needsMeterUpdate = new boolean[16];
        private boolean hasPendingValue = false;
        private boolean hasPendingButton = false;
        private int counter = 0;
        
        public void placeParameterUpdate(int index, String value) {
            parameterValueUpdate[index] = value;
            hasPendingValue = true;
        }
        
        public void placeButtonUpdate(int index, String value) {
            parameterButtonUpdate[index] = value;
            hasPendingButton = true;
        }
        
        public void updatePendingParamUpdates() {
            counter++;
            if (counter % 2 != 0) {
                if (hasPendingValue) {
                    for (int i = 0; i < parameterValueUpdate.length; i++) {
                        if (parameterValueUpdate[i] != null) {
                            midiOut.sendSysex(getParamUpdate(i, false, parameterValueUpdate[i]));
                            parameterValueUpdate[i] = null;
                        }
                    }
                    hasPendingValue = false;
                }
                if (hasPendingButton) {
                    for (int i = 0; i < parameterButtonUpdate.length; i++) {
                        if (parameterButtonUpdate[i] != null) {
                            midiOut.sendSysex(getParamUpdate(i, true, parameterButtonUpdate[i]));
                            parameterButtonUpdate[i] = null;
                        }
                    }
                    hasPendingButton = false;
                }
            }
            if (counter % 2 == 0) {
                for (int i = 0; i < meterUpdates.length; i++) {
                    if (needsMeterUpdate[i]) {
                        midiOut.sendMidi(0xBF, 65 + i, meterUpdates[i]);
                        needsMeterUpdate[i] = false;
                        meterUpdates[i] = 0;
                    }
                }
            }
        }
        
        public void setMeterUpdate(final int i, final int value) {
            meterUpdates[i] = Math.max(meterUpdates[i], value);
            needsMeterUpdate[i] = true;
        }
        
        public void placeMeterUpdate(final int index, final int leftValue, final int rightValue) {
            meterUpdates[index] = leftValue;
            needsMeterUpdate[index] = true;
            meterUpdates[index + 1] = rightValue;
            needsMeterUpdate[index + 1] = true;
        }
    }
    
    private static class DisplayResetState {
        private Runnable resetCallback;
        private long lastUpdate;
        
        public void set(final Runnable callback) {
            this.resetCallback = callback;
            this.lastUpdate = System.currentTimeMillis();
        }
        
        public void process() {
            if (resetCallback == null) {
                return;
            }
            final long diff = System.currentTimeMillis() - this.lastUpdate;
            if (diff > 1000) {
                resetCallback.run();
                resetCallback = null;
            }
        }
    }
    
    public MidiProcessor(final ControllerHost host) {
        this.host = host;
        this.midiIn = host.getMidiInPort(0);
        this.midiOut = host.getMidiOutPort(0);
        final NoteInput noteInput = midiIn.createNoteInput(
            "MIDI", "8?????", "9?????", "A?????", "D?????", "B0????", "B1????", "B1????", "B3????", "B4????", "B5????",
            "B6????", "B7????", "B8????", "B9????", "BA????", "BB????", "BC????", "BD????", "BE????");
        noteInput.setShouldConsumeEvents(true);
        midiIn.setMidiCallback(this::handleMidiIn);
        midiIn.setSysexCallback(this::handleSysEx);
        for (int i = 0; i < 8; i++) {
            this.resetCalls.add(new DisplayResetState());
        }
    }
    
    public void setMixState(final MainLayerHandler mixState) {
        this.mixState = mixState;
    }
    
    public void setCcMatcher(final RotoButton button, final int ccNr) {
        final HardwareButton hwButton = button.getHwButton();
        hwButton.pressedAction().setActionMatcher(midiIn.createCCActionMatcher(0xF, ccNr, 127));
        hwButton.releasedAction().setActionMatcher(midiIn.createCCActionMatcher(0xF, ccNr, 0));
        final AbsoluteHardwareKnob hwKnob = button.getHwKnob();
        hwKnob.disableTakeOver();
        hwKnob.setAdjustValueMatcher(midiIn.createAbsoluteCCValueMatcher(0xF, ccNr));
    }
    
    public void setCcMatcher(final HardwareButton button, final int ccNr) {
        button.pressedAction().setActionMatcher(midiIn.createCCActionMatcher(0xF, ccNr, 127));
        button.releasedAction().setActionMatcher(midiIn.createCCActionMatcher(0xF, ccNr, 0));
    }
    
    public void setCcOutBlocked(final boolean ccOutBlocked) {
        this.ccOutBlocked = ccOutBlocked;
    }
    
    public void setCcKnobMatcher(final RotoKnob knob) {
        valueMatcherMap.put(knob.getMidiBase(), knob);
        valueMatcherBase2Map.put(knob.getMidiBase() + 0x20, knob);
    }
    
    public void queueEvent(final TimedEvent event) {
        timedEvents.add(event);
    }
    
    private void processMidi() {
        mixState.processPendingUpdate();
        if (!timedEvents.isEmpty()) {
            for (final TimedEvent event : timedEvents) {
                event.process();
                if (event.isCompleted()) {
                    timedEvents.remove(event);
                }
            }
        }
        if (!pendingCCs.isEmpty() && !ccOutBlocked) {
            flushPendingCCs();
        }
        if (ccInsBlocked && (System.currentTimeMillis() - inBlockTime) > 1000) {
            //RotoControlExtension.println(" Free Blockage");
            unBlockCc();
        }
        paramBuffer.updatePendingParamUpdates();
        resetCalls.forEach(DisplayResetState::process);
        host.scheduleTask(this::processMidi, 30);
    }
    
    
    public void flushPendingCCs() {
        final ArrayList<Integer> ccNrs = new ArrayList<>(pendingCCs.keySet());
        for (final var ccNr : ccNrs) {
            final int[] values = pendingCCs.get(ccNr);
            sendCCHiResNow(ccNr, values[0], values[1]);
        }
    }
    
    public ControllerHost getHost() {
        return host;
    }
    
    public void invokeDelayed(final Runnable action, final int delayTime) {
        host.scheduleTask(action, delayTime);
    }
    
    private void handleSysEx(final String data) {
        if (!data.endsWith("f7")) {
            RotoControlExtension.println("Illegal Sysex Received : %s", data);
            return;
        }
        if ("f0002203020a02f7".equals(data)) {
            midiOut.sendSysex(COMMAND_PING);
            midiOut.sendSysex(COMMAND_METER_THRESHOLD);
        } else {
            final int command = getSysExValue(0, data);
            final int commandNum = getSysExValue(2, data);
            handleRotoUpdate(command, commandNum, data);
        }
    }
    
    private void handleRotoUpdate(final int command, final int commandNum, final String data) {
        // RotoControlExtension.println("INCOMING = %s  => %02X // %02X    ", data, command, commandNum);
        //                if (command != CMD_ID_PLUGIN && commandNum != 0xB) {
        //                    RotoControlExtension.println("Sys Ex = %s  => %s // %s", data, command, commandNum);
        //                }
        if (command == CMD_ID_GENERAL) {
            executeGeneralCommand(commandNum, data);
        } else if (command == CMD_ID_PLUGIN) {
            executePluginCommand(commandNum, data);
        } else if (command == CMD_ID_MIXER) {
            executeMixerCommand(commandNum, data);
        }
    }
    
    private void executePluginCommand(final int commandNum, final String data) {
        switch (commandNum) {
            case 0x1 -> {
                ensureInit();
                mixState.toPluginMode(getSysExValue(4, data));
            }
            case 0x4 -> mixState.navigatePluginBank(getSysExValue(4, data));
            case 0x7 -> mixState.selectPlugin(getSysExValue(4, data));
            case 0x9 -> mixState.setPluginLearnMode(getSysExValue(4, data) > 0);
            case 0xB -> mixState.activateParameter(ParameterSettings.fromData(data));
            case 0xC -> mixState.activatePlugin(getSysExValue(4, data), getSysExValue(6, data));
            case 0xD -> mixState.lockDevice(getSysExValue(4, data));
            case 0x10 -> mixState.selectRemotePage(getSysExValue(4, data));
            case 0x11 -> mixState.confirmLearned(getSysExValue(4, data), getSysExValue(6, data));
            case 0x12 -> mixState.toggleRemotePage();
        }
    }
    
    private void executeGeneralCommand(final int commandNum, final String data) {
        switch (commandNum) {
            case 0x6 -> mixState.setTrackOffset(getSysExIntValue(4, data));
            case 0x9 -> mixState.selectTrack(getSysExIntValue(4, data));
            case 0xA -> {
                ensureInit();
                mixState.toTransportMode();
            }
            case 0xC -> sendGeneralCommandDirect("0D");
            case 0xE -> handleVersionInfo(data);
            case 0x14 -> mixState.pluginParameterPage(false);
            case 0x15 -> mixState.pluginParameterPage(true);
        }
    }
    
    private void executeMixerCommand(final int commandNum, final String data) {
        switch (commandNum) {
            case 0x1 -> handleMixerUpdate(data);
            case 0x2 -> mixState.setTrackControl(getSysExValue(4, data));
            case 0x5 -> mixState.setMasterControl(getSysExValue(4, data));
            case 0x6 -> mixState.focusTrackToggle(getSysExIntValue(4, data));
            case 0x7 -> mixState.sendTrackNameRequest(getSysExValue(4, data));
        }
    }
    
    private void handleVersionInfo(final String data) {
        final int major = getSysExValue(4, data);
        final int minor = getSysExValue(6, data);
        final int patch = getSysExValue(8, data);
        RotoControlExtension.println(
            "Firmware Version %d.%d.%d   %s", major, minor, patch,
            StringUtil.toAscii(data.substring(RCV_HEADER_OFFSET + 10, RCV_HEADER_OFFSET + 24)));
        //        this.preferences.getVersion().set(version);
        //        this.preferences.getFwVersion()
        //            .set("%d.%d.%d   %s".formatted(major, minor, patch,
        //                StringUtil.toAscii(data.substring(RCV_HEADER_OFFSET + 10, RCV_HEADER_OFFSET + 24))
        //            ));
    }
    
    private void handleMixerUpdate(final String data) {
        ensureInit();
        mixState.setMixMode(
            getSysExValue(4, data), //
            getSysExValue(6, data), //
            getSysExValue(8, data), getSysExValue(0xA, data));
    }
    
    private void ensureInit() {
        if (!initialized) {
            initialized = true;
            host.scheduleTask(this::processMidi, 50);
        }
    }
    
    private void handleMidiIn(final int status, final int data1, final int data2) {
        if (status == 0xBF) {
            if (ccInsBlocked) {
                return;
            }
            RotoKnob knob = valueMatcherMap.get(data1);
            if (knob != null) {
                knob.setHighByteValue(data2);
            } else {
                knob = valueMatcherBase2Map.get(data1);
                if (knob != null) {
                    knob.setLowValue(data2);
                } else {
                    RotoControlExtension.println("FREE => %02X %02X %02X", status, data1, data2);
                }
            }
        } else {
            RotoControlExtension.println("MIDI => %02X %02X %02X", status, data1, data2);
        }
    }
    
    // final RotoPreferences preferences,
    public void initDaw(final String version) {
        //this.preferences = preferences;
        this.version = version;
        midiOut.sendSysex(COMMAND_DAW_START);
    }
    
    public void endTrackDetail() {
        sendSysEx(END_DETAIL_COMMAND);
    }
    
    public void endPluginDetail() {
        sendSysEx(END_PLUGIN_DETAIL_COMMAND);
    }
    
    public void sendGeneralCommandDirect(final String code) {
        midiOut.sendSysex(COMMAND_VALUE_GENERAL_DIR.formatted(code));
    }
    
    public void sendIndexCommand(final String code, final int indexValue) {
        final int highValue = (indexValue >> 7) & 0x7f;
        final int lowValue = indexValue & 0x7F;
        sendSysEx(COMMAND_VALUE_GENERAL.formatted(code, "%02X %02X".formatted(highValue, lowValue)));
    }
    
    public void sendVuActivation(boolean[] data) {
        for (int i = 0; i < data.length; i++) {
            COMMAND_VU_ACTIVATION_MSG.setValue(i, data[i]);
        }
        sendSysEx(COMMAND_VU_ACTIVATION_MSG.getData());
    }
    
    public void sendSendsUpdate(int nrOfSends) {
        if (nrOfSends != lastUpdateOnSendsNumber) {
            COMMAND_SEND_COUNT_MSG.setValue(Math.min(127, Math.max(0, nrOfSends)));
            sendSysEx(COMMAND_SEND_COUNT_MSG.getData());
            lastUpdateOnSendsNumber = nrOfSends;
        }
    }
    
    public void sendPluginCommand(final String code, final int commandValue) {
        if (commandValue >= 0 && commandValue <= 0x7F) {
            sendSysEx(COMMAND_VALUE_PLUGIN.formatted(code, "%02X".formatted(commandValue)));
        }
    }
    
    public void sendPluginSelect(final int pluginIndex, final int pageIndex, final boolean force) {
        if (pluginIndex >= 0 && pluginIndex <= 0x7F) {
            sendSysEx(COMMAND_VALUE_PLUGIN_UPDATE.formatted(pluginIndex, pageIndex, force ? 1 : 0));
        }
    }
    
    public void placeParameterUpdate(boolean button, int index, String value) {
        if (button) {
            paramBuffer.placeButtonUpdate(index, value);
        } else {
            paramBuffer.placeParameterUpdate(index, value);
        }
    }
    
    public void placeParameterUpdateDirect(boolean button, int index, String value) {
        midiOut.sendSysex(getParamUpdate(index, button, value));
    }
    
    public void sendSysEx(final String sysExData) {
        if (!initialized) {
            return;
        }
        // RotoControlExtension.showCallLocation(" >> ");
        // RotoControlExtension.println("     ==>  " + sysExData);
        midiOut.sendSysex(sysExData);
    }
    
    
    public void sendSysEx(final byte[] sysExData) {
        if (!initialized) {
            return;
        }
        // RotoControlExtension.showCallLocation(" >> ");
        // RotoControlExtension.println("     ==>  " + sysExData);
        midiOut.sendSysex(sysExData);
    }
    
    public void setButtonValueState(final int ccNr, final int value) {
        //RotoControlExtension.println(" BCC -> %02X %02X", ccNr, value);
        midiOut.sendMidi(0xBF, ccNr, value);
    }
    
    
    public void sendCCHiRes(final int ccNr, final int highValue, final int lowValue) {
        if (ccOutBlocked) {
            pendingCCs.put(ccNr, new int[] {highValue, lowValue});
        } else {
            sendCCHiResNow(ccNr, highValue, lowValue);
        }
    }
    
    private void sendCCHiResNow(final int ccNr, final int highValue, final int lowValue) {
        pendingCCs.remove(ccNr);
        midiOut.sendMidi(0xBF, ccNr, highValue);
        midiOut.sendMidi(0xBF, ccNr + 0x20, lowValue);
    }
    
    public static int getSysExValue(final int offset, final String data) {
        final String valueStr = data.substring(RCV_HEADER_OFFSET + offset, RCV_HEADER_OFFSET + offset + 2);
        return Integer.parseInt(valueStr, 16);
    }
    
    public static int getSysExIntValue(final int offset, final String data) {
        final int highValue = getSysExValue(offset, data);
        final int lowValue = getSysExValue(offset + 2, data);
        return (lowValue | (highValue << 7));
    }
    
    
    public static String getSysExBlock(final int offset, final int blocks, final String data) {
        final int beginIndex = RCV_HEADER_OFFSET + offset;
        final int endIndex = RCV_HEADER_OFFSET + offset + blocks * 2;
        if (endIndex < data.length()) {
            return data.substring(beginIndex, endIndex);
        }
        return null;
    }
    
    public void notifyDisplayCall(final int index, final Runnable resetCallback) {
        resetCalls.get(index).set(resetCallback);
    }
    
    public void blockCCIns() {
        //RotoControlExtension.println("## BLOCK CC");
        this.ccInsBlocked = true;
        inBlockTime = System.currentTimeMillis();
    }
    
    public void unBlockCc() {
        //RotoControlExtension.println("** UN-BLOCK CC");
        this.ccInsBlocked = false;
        inBlockTime = -1L;
    }
    
    private static byte[] getParamUpdate(int index, boolean onButton, String value) {
        final byte[] result = new byte[23];
        result[0] = (byte) 0xF0;
        result[1] = (byte) 0x00;
        result[2] = (byte) 0x22;
        result[3] = (byte) 0x03;
        result[4] = (byte) 0x02;
        result[5] = (byte) 0x0A;
        result[6] = (byte) 0x18;
        result[7] = (byte) (onButton ? 0x01 : 0x00);
        result[8] = (byte) index;
        final String text = StringUtil.toAsciiDisplay(value, 12);
        for (int i = 0; i < 13; i++) {
            result[i + 9] = i < text.length() ? (byte) text.charAt(i) : 0x00;
        }
        result[22] = (byte) 0xF7;
        return result;
    }
    
    public void updateMeterRight(final int index, final int value) {
        paramBuffer.setMeterUpdate(index * 2 + 1, value);
    }
    
    public void updateMeterLeft(final int index, final int value) {
        paramBuffer.setMeterUpdate(index * 2, value);
    }
    
    public void setMeter(final int index, final int leftValue, final int rightValue) {
        paramBuffer.placeMeterUpdate(index * 2, leftValue, rightValue);
    }
}
