package com.bitwig.extensions.controllers.melbourneinstruments;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import com.bitwig.extension.controller.api.Application;
import com.bitwig.extension.controller.api.ControllerHost;
import com.bitwig.extension.controller.api.CursorTrack;
import com.bitwig.extension.controller.api.PinnableCursorDevice;
import com.bitwig.extension.controller.api.SendBank;
import com.bitwig.extension.controller.api.Track;
import com.bitwig.extension.controller.api.TrackBank;
import com.bitwig.extension.controller.api.Transport;
import com.bitwig.extensions.controllers.melbourneinstruments.binding.RotoButtonPluginParameterBinding;
import com.bitwig.extensions.controllers.melbourneinstruments.binding.RotoKnobParameterBinding;
import com.bitwig.extensions.controllers.melbourneinstruments.binding.RotoKnobPluginParameterBinding;
import com.bitwig.extensions.controllers.melbourneinstruments.control.RotoButton;
import com.bitwig.extensions.controllers.melbourneinstruments.control.RotoKnob;
import com.bitwig.extensions.controllers.melbourneinstruments.device.MacroDevice;
import com.bitwig.extensions.controllers.melbourneinstruments.device.ParameterSettings;
import com.bitwig.extensions.controllers.melbourneinstruments.device.PluginModeHandler;
import com.bitwig.extensions.controllers.melbourneinstruments.device.RotoControlParameter;
import com.bitwig.extensions.controllers.melbourneinstruments.device.RotoParameter;
import com.bitwig.extensions.controllers.melbourneinstruments.layer.EffectTrackSet;
import com.bitwig.extensions.controllers.melbourneinstruments.layer.MainMixLayerSet;
import com.bitwig.extensions.controllers.melbourneinstruments.layer.MasterMixLayerSet;
import com.bitwig.extensions.controllers.melbourneinstruments.layer.MixLayerSet;
import com.bitwig.extensions.controllers.melbourneinstruments.layer.ScrollViewSet;
import com.bitwig.extensions.controllers.melbourneinstruments.states.MasterEfxTrackBank;
import com.bitwig.extensions.controllers.melbourneinstruments.states.TrackState;
import com.bitwig.extensions.controllers.melbourneinstruments.states.TransportState;
import com.bitwig.extensions.controllers.melbourneinstruments.value.ButtonMode;
import com.bitwig.extensions.controllers.melbourneinstruments.value.ColorUtil;
import com.bitwig.extensions.controllers.melbourneinstruments.value.FocusSource;
import com.bitwig.extensions.controllers.melbourneinstruments.value.KnobMode;
import com.bitwig.extensions.framework.Layer;
import com.bitwig.extensions.framework.Layers;
import com.bitwig.extensions.framework.di.Component;
import com.bitwig.extensions.framework.di.Inject;
import com.bitwig.extensions.framework.values.BasicIntegerValue;
import com.bitwig.extensions.framework.values.BooleanValueObject;

@Component
public class MainLayerHandler {
    
    private final static List<UpdateType> STD_UPDATE_SEQUENCE_MIXER =
        List.of(
            UpdateType.MIXER_MASTER, UpdateType.MIXER_MAIN, UpdateType.SENDS_COUNT, UpdateType.PLUGIN,
            UpdateType.SELECTION, UpdateType.UPDATE_CONTROLS);
    
    private final MidiProcessor midiProcessor;
    private final Layer transportLayerLayer;
    private final Layer cursorTrackLayer;
    private final Layer cursorTrackLayer2;
    private final Layer pluginControlLayer;
    private final Layer macroControlLayer;
    
    private final RotoHwElements hwElements;
    private final CursorTrack cursorTrack;
    private final TrackState cursorTrackState = new TrackState();
    
    private final List<RotoControlParameter> knobParameters = new ArrayList<>();
    private final List<RotoControlParameter> buttonParameters = new ArrayList<>();
    private final PluginModeHandler pluginModeHandler;
    
    private final MixLayerSet mixLayerSet;
    private final MixLayerSet masterMixSet;
    private MixLayerSet currentMixSet;
    private final EffectTrackSet effectTrackSet;
    private final TrackBank selectionEffectBank;
    
    private ButtonMode buttonMode = ButtonMode.MUTE;
    private KnobMode knobMode = KnobMode.LEVEL;
    private FocusSource allMode = FocusSource.MIXER_MAIN;
    private boolean inPluginMode;
    private int focusTrackPage = 0;
    private int selectedTrackIndex = 0;
    
    private final Set<UpdateType> neededUpdate = new HashSet<>();
    private final List<UpdateType> deferredUpdates = new ArrayList<>();
    private final BooleanValueObject trackMode = new BooleanValueObject();
    
    private DeviceParameterUpdateState macroChangeState = DeviceParameterUpdateState.NONE;
    private DeviceParameterUpdateState pendingDeviceChange = DeviceParameterUpdateState.NONE;
    private int lastSentTrackIndex = -1;
    
    private enum DeviceParameterUpdateState {
        NONE,
        CHANGE_INVOKED,
        UPDATE_PENDING
    }
    
    @Inject
    private TransportState transportState;
    
    private boolean macroMode;
    private int trackBankPos = 0;
    private int cursorTrackTbPos = 0;
    private final BasicIntegerValue cursorTrackPosition = new BasicIntegerValue();
    
    public MainLayerHandler(final ControllerHost host, final Layers layers, final MidiProcessor midiProcessor,
        final RotoViewControl viewControl, final RotoHwElements hwElements, final Transport transport,
        final Application application) {
        final MasterEfxTrackBank masterFxTrackBank = new MasterEfxTrackBank(viewControl);
        effectTrackSet = new EffectTrackSet(viewControl.getCursorTrack(), masterFxTrackBank, midiProcessor, trackMode);
        this.mixLayerSet =
            new MainMixLayerSet(layers, midiProcessor, "MAIN", viewControl.getTrackBank(), effectTrackSet);
        this.masterMixSet = new MasterMixLayerSet(layers, midiProcessor, "MASTER", masterFxTrackBank, effectTrackSet);
        application.projectName().addValueObserver(projectName -> unlockDeviceAndTrack(viewControl.getCursorDevice()));
        
        currentMixSet = this.mixLayerSet;
        this.midiProcessor = midiProcessor;
        this.hwElements = hwElements;
        this.midiProcessor.setMixState(this);
        cursorTrack = viewControl.getCursorTrack();
        cursorTrack.isGroup().markInterested();
        cursorTrack.isGroupExpanded().markInterested();
        
        this.selectionEffectBank = host.createEffectTrackBank(8, 0);
        for (int i = 0; i < this.selectionEffectBank.getSizeOfBank(); i++) {
            final Track item = selectionEffectBank.getItemAt(i);
            item.name().markInterested();
            item.exists().markInterested();
        }
        this.selectionEffectBank.scrollPosition().markInterested();
        this.selectionEffectBank.setShouldShowClipLauncherFeedback(false);
        
        //this.selectionEffectBank.scrollPosition().addValueObserver(pos -> RotoControlExtension.println(" EF %d",
        // pos));
        
        bindTrackPositionBind(viewControl.getTrackBank(), cursorTrack, viewControl.getCursorIndex());
        
        cursorTrackLayer = new Layer(layers, "CURSOR_TRACK_LAYER");
        cursorTrackLayer2 = new Layer(layers, "CURSOR_TRACK_LAYER2");
        
        pluginControlLayer = new Layer(layers, "PLUGIN_LAYER");
        macroControlLayer = new Layer(layers, "PLUGIN_LAYER");
        transportLayerLayer = new Layer(layers, "TRANSPORT");
        
        TransportState.initTransport(transportLayerLayer, transport, hwElements);
        final PinnableCursorDevice cursorDevice = viewControl.getCursorDevice();
        for (int i = 0; i < 8; i++) {
            knobParameters.add(new RotoControlParameter(i, cursorDevice));
            buttonParameters.add(new RotoControlParameter(i, cursorDevice));
        }
        
        final RotoButton[] buttons = hwElements.getButtons();
        final RotoKnob[] knobs = hwElements.getKnobs();
        
        pluginModeHandler = new PluginModeHandler(this, midiProcessor, viewControl);
        pluginModeHandler.getInMacroMode().addValueObserver(this::handleMacroMode);
        
        final MacroDevice macroDevice = pluginModeHandler.getMacroDevice();
        for (int i = 0; i < 8; i++) {
            this.pluginControlLayer.addBinding(new RotoKnobPluginParameterBinding(knobs[i], knobParameters.get(i)));
            this.pluginControlLayer.addBinding(
                new RotoButtonPluginParameterBinding(buttons[i], buttonParameters.get(i)));
            
            this.macroControlLayer.addBinding(
                new RotoKnobParameterBinding(
                    knobs[i], macroDevice.getRemoteParameter(i), macroDevice.getItem(i),
                    viewControl.getTouchAutomationActive()));
        }
        mixLayerSet.bind(
            buttons, knobs, () -> markUpdateRequired(FocusSource.MIXER_MAIN), viewControl.getTouchAutomationActive());
        masterMixSet.bind(
            buttons, knobs, () -> markUpdateRequired(FocusSource.MIXER_MASTER), viewControl.getTouchAutomationActive());
        bindCursorTrack(cursorTrack, knobs, viewControl.getTouchAutomationActive());
        masterFxTrackBank.getSendCount().addValueObserver(this::handleSendCountChanged);
        cursorTrack.name().addValueObserver(name -> {
            cursorTrackState.setName(name);
            updateSelectedTrack();
        });
        cursorTrack.color().addValueObserver((r, g, b) -> {
            cursorTrackState.setColorIndex(ColorUtil.toColor(r, g, b));
            updateSelectedTrack();
        });
        cursorTrack.isGroup().addValueObserver(group -> {
            cursorTrackState.setGroup(group);
            updateSelectedTrack();
        });
        
        cursorTrackPosition.addValueObserver(this::setCursorTrackIndex);
        cursorTrack.isPinned().markInterested();
        masterFxTrackBank.getMasterSelected().addValueObserver(this::handleMasterSelected);
    }
    
    private void bindTrackPositionBind(final TrackBank trackBank, final CursorTrack cursorTrack,
        final BasicIntegerValue cursorIndex) {
        trackBank.scrollPosition().addValueObserver(this::handleTrackBankScroll);
        //cursorTrack.position().addValueObserver(pos -> this.handleChannelIndex(trackBank, pos));
        cursorIndex.addValueObserver(this::handleBankCursorIndex);
        for (int i = 0; i < 8; i++) {
            final int index = i;
            final Track track = trackBank.getItemAt(i);
            track.createEqualsValue(cursorTrack).addValueObserver(onCursor -> handleTrackOnCursor(index, onCursor));
        }
    }
    
    public void unlockDeviceAndTrack(final PinnableCursorDevice device) {
        midiProcessor.invokeDelayed(
            () -> {
                device.isPinned().set(false);
                cursorTrack.isPinned().set(false);
            }, 100);
    }
    
    private void handleTrackOnCursor(final int index, final boolean onCursorTrack) {
        if (onCursorTrack) {
            cursorTrackTbPos = index;
            cursorTrackPosition.set(cursorTrackTbPos + trackBankPos);
        }
    }
    
    private void handleTrackBankScroll(final int pos) {
        this.trackBankPos = pos;
    }
    
    private void handleBankCursorIndex(final int newBankPos) {
        if (newBankPos != trackBankPos && allMode == FocusSource.MIXER_MAIN) {
            this.mixLayerSet.setTrackOffset(newBankPos);
        }
    }
    
    private void handleMasterSelected(final boolean masterSelected) {
        if (trackMode.get()) {
            placeUpdate(UpdateType.SENDS_COUNT);
        }
    }
    
    private void handleMacroMode(final boolean macroMode) {
        this.macroMode = macroMode;
        placeUpdate(UpdateType.PLUGIN);
        if (inPluginMode) {
            this.knobMode = macroMode ? KnobMode.MACRO : KnobMode.PLUGIN;
            directModeUpdate();
        }
    }
    
    private void bindCursorTrack(final CursorTrack cursorTrack, final RotoKnob[] knobs,
        final BooleanValueObject touchAutomationActive) {
        cursorTrackLayer.addBinding(
            new RotoKnobParameterBinding(knobs[0], cursorTrack.volume(), touchAutomationActive));
        cursorTrackLayer.addBinding(new RotoKnobParameterBinding(knobs[1], cursorTrack.pan(), touchAutomationActive));
        final SendBank sendBank = cursorTrack.sendBank();
        for (int i = 0; i < 6; i++) {
            cursorTrackLayer.addBinding(
                new RotoKnobParameterBinding(knobs[2 + i], sendBank.getItemAt(i), touchAutomationActive));
        }
        for (int i = 0; i < 8; i++) {
            cursorTrackLayer2.addBinding(
                new RotoKnobParameterBinding(knobs[i], sendBank.getItemAt(6 + i), touchAutomationActive));
        }
    }
    
    public void markUpdateRequired(final FocusSource source) {
        if (inPluginMode) {
            placeUpdate(source.getUpdateType());
        } else {
            placeUpdate(getActiveUpdateType(), UpdateType.UPDATE_CONTROLS);
        }
    }
    
    public void selectTrack(final int trackIndex) {
        this.selectedTrackIndex = trackIndex;
        currentMixSet.selectTrack(trackIndex);
        placeUpdate(UpdateType.SELECTION);
    }
    
    public void toTransportMode() {
        buttonMode = ButtonMode.TRANSPORT;
        activateButtonLayer();
        midiProcessor.sendSysEx(transportState.toSysExStateString());
    }
    
    public void toPluginMode(final int macroMode) {
        this.inPluginMode = true;
        this.knobMode = this.macroMode ? KnobMode.MACRO : KnobMode.PLUGIN;
        trackMode.set(false);
        buttonMode = ButtonMode.NONE;
        pluginModeHandler.sendStates();
        sendUpdateFocusTrack(false);
        directModeUpdate();
    }
    
    public void setMasterControl(final int mode) {
        allMode = mode == 0 ? FocusSource.MIXER_MAIN : FocusSource.MIXER_MASTER;
        trackMode.set(false);
        
        this.currentMixSet = mode == 0 ? mixLayerSet : masterMixSet;
        midiProcessor.setCcOutBlocked(true);
        
        currentMixSet.sendStates();
        sendUpdateFocusTrack(true);
        directModeUpdate();
    }
    
    private void directModeUpdate() {
        midiProcessor.setCcOutBlocked(true);
        activateButtonLayer();
        activateKnobLayer();
        updateControls();
    }
    
    public void setMixMode(final int allMode, final int knobMode, final int buttonMode, final int selectedSend) {
        this.inPluginMode = false;
        this.allMode = allMode == 0 ? FocusSource.MIXER_MAIN : FocusSource.MIXER_MASTER;
        this.currentMixSet = allMode == 0 ? mixLayerSet : masterMixSet;
        trackMode.set(false);
        this.buttonMode = ButtonMode.toMode(buttonMode);
        this.knobMode = KnobMode.toMode(knobMode);
        
        if (this.knobMode == KnobMode.SEND) {
            currentMixSet.selectSendBank(selectedSend);
        }
        currentMixSet.sendStates();
        updateSendNamesGeneral();
        sendUpdateFocusTrack(true);
        directModeUpdate();
    }
    
    public void setTrackControl(final int page) {
        this.inPluginMode = false;
        this.setFocusTrackPage(page);
        trackMode.set(true);
        buttonMode = ButtonMode.NONE;
        if (inPluginMode) {
            placeUpdate(UpdateType.PLUGIN, UpdateType.SELECTION, UpdateType.UPDATE_CONTROLS);
        } else {
            if (knobMode == KnobMode.FOCUS_TRACK || knobMode == KnobMode.FOCUS_TRACK_PG1) {
                placeUpdate(UpdateType.SELECTION, UpdateType.SENDS_COUNT);
            } else {
                placeUpdate(getActiveUpdateType(), UpdateType.SELECTION, UpdateType.UPDATE_CONTROLS);
            }
        }
    }
    
    public void focusTrackToggle(final int index) {
        currentMixSet.toggleGroupTrack(index);
    }
    
    public void sendTrackNameRequest(final int page) {
        if (selectionEffectBank.scrollPosition().get() != page) {
            selectionEffectBank.scrollPosition().set(page);
        }
        midiProcessor.invokeDelayed(this::updateSendNamesGeneral, 20);
    }
    
    private void updateSendNamesGeneral() {
        effectTrackSet.updateNames(selectionEffectBank);
    }
    
    UpdateType getActiveUpdateType() {
        if (inPluginMode) {
            return UpdateType.PLUGIN;
        }
        if (allMode == FocusSource.MIXER_MAIN) {
            return UpdateType.MIXER_MAIN;
        }
        return UpdateType.MIXER_MASTER;
    }
    
    private void setFocusTrackPage(final int page) {
        updateTrackFocusPage(page);
        directModeUpdate();
    }
    
    private void updateTrackFocusPage(final int page) {
        if (knobMode.isFocusMode() && this.focusTrackPage == page) {
            return;
        }
        //RotoControlExtension.println(" PAGE = %d", page);
        this.focusTrackPage = page;
        if (focusTrackPage == 0) {
            effectTrackSet.setSendSection(0);
            knobMode = KnobMode.FOCUS_TRACK;
            effectTrackSet.setScrollPosition(0);
        } else {
            knobMode = KnobMode.FOCUS_TRACK_PG1;
            effectTrackSet.setScrollPosition(getFocusPageOffset());
            effectTrackSet.setSendSection(1);
        }
    }
    
    private void handleSendCountChanged(final int sendsCount) {
        final int maxPage = (sendsCount + 1) / 8;
        if (focusTrackPage > maxPage) {
            setFocusTrackPage(maxPage);
        }
        if (knobMode.isFocusMode()) {
            placeUpdate(UpdateType.SENDS_COUNT, UpdateType.SELECTION);
        } else if (knobMode.isMixMode()) {
            placeUpdate(getActiveUpdateType(), UpdateType.SENDS_COUNT, UpdateType.SELECTION);
        }
    }
    
    private int getFocusPageOffset() {
        return Math.max(focusTrackPage - 1, 0) * 8;
    }
    
    public void setPluginLearnMode(final boolean inLearningMode) {
        pluginModeHandler.setPluginLearnMode(inLearningMode);
    }
    
    public void activatePlugin(final int index, final int active) {
        pluginModeHandler.activatePlugin(index, active);
    }
    
    public void navigatePluginBank(final int firstIndex) {
        //RotoControlExtension.println("NAV PI B = %d", firstIndex);
        pluginModeHandler.navigatePluginBank(firstIndex);
    }
    
    public void activateParameter(final ParameterSettings setting) {
        pluginModeHandler.activateParameter(setting).ifPresent(this::handleParamUpdate);
    }
    
    
    private void handleParamUpdate(final RotoParameter param) {
        if (!inPluginMode) {
            return;
        }
        if (knobMode == KnobMode.MACRO) {
            invokeMacroUpdateTask();
        } else {
            //pluginModeHandler.inPluginMode()
            midiProcessor.sendSysEx(param.getLearnSysEx());
        }
    }
    
    private void invokeMacroUpdateTask() {
        if (macroChangeState == DeviceParameterUpdateState.UPDATE_PENDING) {
            return;
        }
        macroChangeState = DeviceParameterUpdateState.UPDATE_PENDING;
        midiProcessor.invokeDelayed(this::handleMacroUpdate, 100);
    }
    
    private void handleMacroUpdate() {
        macroChangeState = DeviceParameterUpdateState.NONE;
        pluginModeHandler.sendMacroValues();
    }
    
    public boolean singleMacroUpdateReady() {
        return macroChangeState == DeviceParameterUpdateState.NONE && this.knobMode == KnobMode.MACRO
            && pendingDeviceChange == DeviceParameterUpdateState.NONE;
    }
    
    public void lockDevice(final int lock) {
        cursorTrack.isPinned().set(lock == 1);
        pluginModeHandler.lockDevice(lock == 1);
    }
    
    public void processPendingUpdate() {
        if (!neededUpdate.isEmpty()) {
            if (neededUpdate.contains(UpdateType.UPDATE_CONTROLS)) {
                midiProcessor.setCcOutBlocked(true);
            }
            STD_UPDATE_SEQUENCE_MIXER.stream() //
                .filter(neededUpdate::contains) //
                //.peek(u -> RotoControlExtension.println(" UPDATE %s", u)) //
                .forEach(this::doUpdate);
            neededUpdate.clear();
            if (!deferredUpdates.isEmpty()) {
                neededUpdate.addAll(deferredUpdates);
                deferredUpdates.clear();
            }
        }
    }
    
    private void doUpdate(final UpdateType type) {
        switch (type) {
            case SELECTION -> sendUpdateFocusTrack(true);
            case SENDS_COUNT -> handleSendsCount();
            case MIXER_MAIN -> sendUpdates(mixLayerSet, UpdateType.MIXER_MAIN);
            case MIXER_MASTER -> sendUpdates(masterMixSet, UpdateType.MIXER_MASTER);
            case PLUGIN -> sendUpdates(pluginModeHandler, UpdateType.PLUGIN);
            case UPDATE_CONTROLS -> updateControls();
        }
    }
    
    private void handleSendsCount() {
        if (knobMode.isFocusMode()) {
            sendUpdatesGrouped(effectTrackSet, UpdateType.SENDS_COUNT, UpdateType.SELECTION);
        } else {
            sendUpdates(effectTrackSet, UpdateType.SENDS_COUNT);
        }
    }
    
    private void sendUpdates(final ScrollViewSet viewSet, final UpdateType updateType) {
        if (viewSet.scrollInPlace()) {
            viewSet.sendStates();
        } else {
            deferredUpdates.add(updateType);
        }
    }
    
    private void sendUpdatesGrouped(final ScrollViewSet viewSet, final UpdateType... updateTypes) {
        if (viewSet.scrollInPlace()) {
            viewSet.sendStates();
        } else {
            Collections.addAll(deferredUpdates, updateTypes);
        }
    }
    
    private void sendUpdateFocusTrack(final boolean force) {
        if (selectedTrackIndex >= 0 && (force || selectedTrackIndex != lastSentTrackIndex)) {
            midiProcessor.sendSysEx(cursorTrackState.toSysExUpdateSel(selectedTrackIndex));
            lastSentTrackIndex = selectedTrackIndex;
        }
    }
    
    private void placeUpdate(final UpdateType... types) {
        Collections.addAll(neededUpdate, types);
    }
    
    private void updateSelectedTrack() {
        if (selectedTrackIndex >= 0) {
            placeUpdate(UpdateType.SELECTION);
        }
    }
    
    private void setCursorTrackIndex(final int pos) {
        if (pos < 0) {
            return;
        }
        this.selectedTrackIndex = pos;
        updateSelectedTrack();
        if (inPluginMode) {
            markUpdateRequired(FocusSource.PLUGIN);
        } else if (allMode == FocusSource.MIXER_MAIN) {
            //if (mixLayerSet.adjustTrackScroll(pos)) { Bring this back with cursor track follow
            markUpdateRequired(FocusSource.MIXER_MAIN);
            //}
        }
    }
    
    private void updateControls() {
        midiProcessor.setCcOutBlocked(false);
        hwElements.forceButtonUpdates();
        hwElements.forceKnobUpdates();
    }
    
    public void notifyDawPluginUpdate() {
        if (!inPluginMode) {
            return;
        }
        placeUpdate(UpdateType.PLUGIN, UpdateType.SELECTION);
    }
    
    private void activateButtonLayer() {
        disableButtonLayers();
        final Layer activeLayer = getButtonLayer(this.buttonMode);
        if (activeLayer != null) {
            activeLayer.setIsActive(true);
        }
        hwElements.forceButtonUpdates();
    }
    
    private void activateKnobLayer() {
        disableKnobLayers();
        final Layer activeLayer = getKnobLayer(knobMode);
        if (activeLayer != null) {
            activeLayer.setIsActive(true);
        }
    }
    
    private void disableKnobLayers() {
        mixLayerSet.disableKnobLayers();
        masterMixSet.disableKnobLayers();
        cursorTrackLayer.setIsActive(false);
        cursorTrackLayer2.setIsActive(false);
        pluginControlLayer.setIsActive(false);
        macroControlLayer.setIsActive(false);
    }
    
    private void disableButtonLayers() {
        mixLayerSet.disableButtonLayers();
        masterMixSet.disableButtonLayers();
        transportLayerLayer.setIsActive(false);
    }
    
    private Layer getKnobLayer(final KnobMode mode) {
        return switch (mode) {
            case LEVEL, PANNING, SEND -> currentMixSet.getKnobLayer(mode);
            case FOCUS_TRACK -> cursorTrackLayer;
            case FOCUS_TRACK_PG1 -> cursorTrackLayer2;
            case PLUGIN -> pluginControlLayer;
            case MACRO -> macroControlLayer;
        };
    }
    
    private Layer getButtonLayer(final ButtonMode mode) {
        return switch (mode) {
            case MUTE, SOLO, ARM -> currentMixSet.getButtonLayer(mode);
            case TRANSPORT -> transportLayerLayer;
            default -> null;
        };
    }
    
    public void selectRemotePage(final int page) {
        macroChangeState = DeviceParameterUpdateState.CHANGE_INVOKED;
        pluginModeHandler.selectRemotePage(page);
    }
    
    public void setTrackOffset(final int position) {
        midiProcessor.setCcOutBlocked(true);
        currentMixSet.setTrackOffset(position);
        if (inPluginMode) {
            placeUpdate(UpdateType.MIXER_MAIN);
        } else {
            placeUpdate(getActiveUpdateType(), UpdateType.SELECTION, UpdateType.UPDATE_CONTROLS);
        }
    }
    
    public void selectPlugin(final int index) {
        //RotoControlExtension.println(" SEL PI = %d", index);
        pluginModeHandler.selectPlugin(index);
        pendingDeviceChange = DeviceParameterUpdateState.CHANGE_INVOKED;
    }
    
    public void resetDeviceChange() {
        pendingDeviceChange = DeviceParameterUpdateState.NONE;
    }
    
    public RotoControlParameter getParameter(final int pageIndex, final int type) {
        if (type == 0) {
            return knobParameters.get(pageIndex);
        }
        return buttonParameters.get(pageIndex);
    }
    
    public void toggleRemotePage() {
        pluginModeHandler.toggleRemotePage();
    }
    
    public void confirmLearned(final int type, final int paramIndex) {
        pluginModeHandler.confirmLearned(type, paramIndex);
    }
    
}
