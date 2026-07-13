package com.bitwig.extensions.controllers.melbourneinstruments;

import java.util.Arrays;

import com.bitwig.extension.controller.api.ControllerHost;
import com.bitwig.extension.controller.api.CursorRemoteControlsPage;
import com.bitwig.extension.controller.api.CursorTrack;
import com.bitwig.extension.controller.api.DeviceBank;
import com.bitwig.extension.controller.api.MasterTrack;
import com.bitwig.extension.controller.api.PinnableCursorDevice;
import com.bitwig.extension.controller.api.Track;
import com.bitwig.extension.controller.api.TrackBank;
import com.bitwig.extension.controller.api.Transport;
import com.bitwig.extensions.framework.di.Component;
import com.bitwig.extensions.framework.values.BasicIntegerValue;
import com.bitwig.extensions.framework.values.BooleanValueObject;

@Component
public class RotoViewControl {
    
    private final Track rootTrack;
    private final TrackBank trackBank;
    private final CursorTrack cursorTrack;
    private final PinnableCursorDevice cursorDevice;
    private final DeviceBank deviceBank;
    private final TrackBank effectBank;
    private final MasterTrack masterTrack;
    private final CursorRemoteControlsPage deviceRemotes;
    private final CursorRemoteControlsPage trackRemotes;
    
    private String[] origPageNames = new String[0];
    private String[] devicePageNames = new String[0];
    private int origPageIndex = 0;
    private int devicePageIndex = 0;
    private final CursorRemoteControlsPage origRemotes;
    private final CursorRemoteControlsPage projectRemotes;
    private final BasicIntegerValue cursorIndex = new BasicIntegerValue();
    private final BooleanValueObject touchAutomationActive = new BooleanValueObject();
    
    public RotoViewControl(final ControllerHost host, final Transport transport) {
        rootTrack = host.getProject().getRootTrackGroup();
        trackBank = host.createMainTrackBank(8, 1, 1);
        effectBank = host.createEffectTrackBank(8, 1, 1);
        masterTrack = host.createMasterTrack(1);
        cursorTrack = host.createCursorTrack(14, 1);
        
        //trackBank.followCursorTrack(cursorTrack);
        cursorDevice = cursorTrack.createCursorDevice();
        //deviceBank = cursorTrack.createDeviceBank(8);
        deviceBank = cursorDevice.deviceChain().createDeviceBank(8);
        deviceRemotes = cursorDevice.createCursorRemoteControlsPage("DEVICE", 8, null);
        origRemotes = cursorDevice.createCursorRemoteControlsPage(8);
        
        deviceRemotes.selectedPageIndex().addValueObserver(this::handleDevicePageIndex);
        origRemotes.selectedPageIndex().addValueObserver(this::handleOrigDevicePageIndex);
        deviceRemotes.pageNames().addValueObserver(names -> this.devicePageNames = names);
        origRemotes.pageNames().addValueObserver(names -> this.origPageNames = names);
        
        trackRemotes = cursorTrack.createCursorRemoteControlsPage(8);
        projectRemotes = rootTrack.createCursorRemoteControlsPage(8);
        
        final TrackBank overviewTrackBank = host.createTrackBank(8, 0, 0);
        overviewTrackBank.setShouldShowClipLauncherFeedback(false);
        overviewTrackBank.followCursorTrack(cursorTrack);
        overviewTrackBank.scrollPosition().addValueObserver(pos -> cursorIndex.set(pos));
        
        transport.isAutomationOverrideActive().markInterested();
        transport.isClipLauncherAutomationWriteEnabled().markInterested();
        transport.automationWriteMode().markInterested();
        transport.automationWriteMode()
            .addValueObserver(mode -> handleAutomationChange(
                mode, transport.isArrangerAutomationWriteEnabled().get(),
                transport.isClipLauncherAutomationWriteEnabled().get()));
        transport.isArrangerAutomationWriteEnabled().addValueObserver(
            overwrite -> handleAutomationChange(
                transport.automationWriteMode().get(), overwrite,
                transport.isClipLauncherAutomationWriteEnabled().get()));
        transport.isClipLauncherAutomationWriteEnabled().addValueObserver(
            overwrite -> handleAutomationChange(
                transport.automationWriteMode().get(),
                transport.isArrangerAutomationWriteEnabled().get(), overwrite));
        //        final LastClickedParameter lastParameter = host.createLastClickedParameter("Xy", "Learn Param");
        //        lastParameter.parameter().name()
        //            .addValueObserver(name -> RotoControlExtension.println(" LAST CLICKED %s", name));
        //        lastParameter.parameter().exists()
        //            .addValueObserver(exists -> RotoControlExtension.println(" EXist = %s", exists));
        //        lastParameter.parameter().discreteValueCount()
        //            .addValueObserver(count -> RotoControlExtension.println(" STESP %d", count));
    }
    
    private void handleAutomationChange(final String mode, final boolean automationOverwrite,
        final boolean clipAutomationOverwrite) {
        touchAutomationActive.set(mode.equals("touch") && (automationOverwrite || clipAutomationOverwrite));
        //RotoControlExtension.println(
        //    " %s %s %s = %s", mode, automationOverwrite, clipAutomationOverwrite, touchAutomationActive.get());
    }
    
    public BooleanValueObject getTouchAutomationActive() {
        return touchAutomationActive;
    }
    
    private void handleDevicePageIndex(final int index) {
        if (index == -1) {
            return;
        }
        this.devicePageIndex = index;
        if (Arrays.equals(origPageNames, devicePageNames) && index != this.origPageIndex) {
            this.origRemotes.selectedPageIndex().set(index);
        }
    }
    
    private void handleOrigDevicePageIndex(final int index) {
        if (index == -1) {
            return;
        }
        this.origPageIndex = index;
        if (Arrays.equals(origPageNames, devicePageNames) && index != this.devicePageIndex) {
            this.deviceRemotes.selectedPageIndex().set(index);
        }
    }
    
    public TrackBank getEffectBank() {
        return effectBank;
    }
    
    public MasterTrack getMasterTrack() {
        return masterTrack;
    }
    
    public TrackBank getTrackBank() {
        return trackBank;
    }
    
    public CursorTrack getCursorTrack() {
        return cursorTrack;
    }
    
    public BasicIntegerValue getCursorIndex() {
        return cursorIndex;
    }
    
    public Track getRootTrack() {
        return rootTrack;
    }
    
    public PinnableCursorDevice getCursorDevice() {
        return cursorDevice;
    }
    
    public DeviceBank getDeviceBank() {
        return deviceBank;
    }
    
    public CursorRemoteControlsPage getDeviceRemotes() {
        return deviceRemotes;
    }
    
    public CursorRemoteControlsPage getTrackRemotes() {
        return trackRemotes;
    }
}