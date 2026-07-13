package com.bitwig.extensions.controllers.melbourneinstruments.states;

import com.bitwig.extension.controller.api.Transport;
import com.bitwig.extensions.controllers.melbourneinstruments.RotoHwElements;
import com.bitwig.extensions.controllers.melbourneinstruments.control.RotoButton;
import com.bitwig.extensions.controllers.melbourneinstruments.control.RotoCcButton;
import com.bitwig.extensions.framework.Layer;
import com.bitwig.extensions.framework.di.Component;

@Component
public class TransportState {

    private int play;
    private int stop;
    private int record;
    private int overdub;
    private int loop;
    private int punchIn;
    private int punchOut;
    private int autoOverwrite;
    private final Transport transport;

    public TransportState(final Transport transport) {
        this.transport = transport;
        transport.isPlaying().addValueObserver(play -> this.play = play ? 1 : 0);
        transport.isArrangerRecordEnabled().addValueObserver(record -> this.record = record ? 1 : 0);
        transport.isClipLauncherOverdubEnabled().addValueObserver(overdub -> this.overdub = overdub ? 1 : 0);
        transport.isArrangerLoopEnabled().addValueObserver(loop -> this.loop = loop ? 1 : 0);
        transport.isPunchInEnabled().addValueObserver(loop -> this.loop = loop ? 1 : 0);
        transport.isPunchOutEnabled().addValueObserver(punchIn -> this.punchIn = punchIn ? 1 : 0);
        transport.isPunchOutEnabled().addValueObserver(punchOut -> this.punchOut = punchOut ? 1 : 0);
        transport.isAutomationOverrideActive()
            .addValueObserver(autoOverwrite -> this.autoOverwrite = autoOverwrite ? 1 : 0);
    }

    public String toSysExStateString() {
        return "F0 00 22 03 02 0A 0B %02X %02X %02X %02X %02X %02X %02X %02X F7".formatted(
            play, stop, record, overdub, loop, punchIn, punchOut, autoOverwrite);

    }

    public static void initTransport(final Layer layer, final Transport transport, final RotoHwElements hwElements) {
        final RotoButton[] transportButtons = hwElements.getTransportButtons();
        transport.isPlaying().markInterested();
        transport.isArrangerRecordEnabled().markInterested();
        transport.isClipLauncherOverdubEnabled().markInterested();
        transport.isArrangerLoopEnabled().markInterested();
        transport.isPunchInEnabled().markInterested();
        transport.isPunchOutEnabled().markInterested();
        transport.isAutomationOverrideActive().markInterested();

        final RotoCcButton fastForwardButton = hwElements.getRightTransportButton();
        fastForwardButton.bindRepeatHold(layer, transport::fastForward);
        final RotoCcButton rewindButton = hwElements.getLeftTransportButton();
        rewindButton.bindRepeatHold(layer, transport::rewind);

        transportButtons[0].bindPressed(layer, transport.playAction());
        transportButtons[0].bindLight(layer, transport.isPlaying());
        transportButtons[1].bindPressed(layer, transport.stopAction());
        transportButtons[1].bindLight(layer, transport.isPlaying());
        transportButtons[2].bindToggle(layer, transport.isArrangerRecordEnabled());
        transportButtons[2].bindLight(layer, transport.isArrangerRecordEnabled());
        transportButtons[3].bindToggle(layer, transport.isClipLauncherOverdubEnabled());
        transportButtons[3].bindLight(layer, transport.isClipLauncherOverdubEnabled());
        transportButtons[4].bindToggle(layer, transport.isArrangerLoopEnabled());
        transportButtons[4].bindLight(layer, transport.isArrangerLoopEnabled());

        transportButtons[5].bindToggle(layer, transport.isPunchInEnabled());
        transportButtons[5].bindLight(layer, transport.isPunchInEnabled());

        transportButtons[6].bindToggle(layer, transport.isPunchOutEnabled());
        transportButtons[6].bindLight(layer, transport.isPunchOutEnabled());

        transportButtons[7].bindPressed(layer, () -> transport.resetAutomationOverrides());
        transportButtons[7].bindLight(layer, transport.isAutomationOverrideActive());
    }


}
