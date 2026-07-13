package com.bitwig.extensions.controllers.melbourneinstruments.device;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import com.bitwig.extension.controller.api.CursorRemoteControlsPage;
import com.bitwig.extension.controller.api.Device;
import com.bitwig.extension.controller.api.DeviceBank;
import com.bitwig.extension.controller.api.DirectParameterValueDisplayObserver;
import com.bitwig.extension.controller.api.PinnableCursorDevice;
import com.bitwig.extension.controller.api.RemoteControl;
import com.bitwig.extension.controller.api.SettableRangedValue;
import com.bitwig.extensions.controllers.melbourneinstruments.MainLayerHandler;
import com.bitwig.extensions.controllers.melbourneinstruments.MidiProcessor;
import com.bitwig.extensions.controllers.melbourneinstruments.RotoControlExtension;
import com.bitwig.extensions.controllers.melbourneinstruments.RotoViewControl;
import com.bitwig.extensions.controllers.melbourneinstruments.layer.ScrollViewSet;
import com.bitwig.extensions.controllers.melbourneinstruments.value.FocusSource;
import com.bitwig.extensions.framework.values.BooleanValueObject;

public class PluginModeHandler implements ScrollViewSet {
    private static final Set<String> REMOTES_ONLY_DEVICES = Set.of("Polymer", "Filter+", "Grid FX", "Poly Grid");

    private final MainLayerHandler mainHandler;
    private final MidiProcessor midiProcessor;
    private final DeviceBank deviceBank;
    private final PinnableCursorDevice cursorDevice;

    private final Map<String, DeviceParameterSet> deviceParameterSetMap = new HashMap<>();
    private final Map<String, RotoControlParameter> controlParamMap = new HashMap<>();
    private DeviceParameterSet activeParameterSet = null;

    private boolean inLearningMode;
    private boolean pendingParamUpdate = false;
    private int pluginPosition;
    private int numberOfPlugins;
    private int firstPlugin;

    private final BooleanValueObject inMacroMode = new BooleanValueObject();
    private boolean lockedState = false;

    private final List<DeviceState> deviceStates = new ArrayList<>();
    private final DeviceState cursorDeviceState = new DeviceState(-1);

    private final LearnProcessor learnProcessor;
    private final DirectParameterValueDisplayObserver paramValueObserver;
    private final MacroDevice macroDevice;
    private final MacroDevice trackDevice;

    public PluginModeHandler(final MainLayerHandler mainHandler, final MidiProcessor midiProcessor,
        final RotoViewControl viewControl) {
        this.mainHandler = mainHandler;
        this.cursorDevice = viewControl.getCursorDevice();
        this.macroDevice = new MacroDevice(viewControl.getDeviceRemotes());
        this.trackDevice = new MacroDevice(viewControl.getTrackRemotes());
        this.midiProcessor = midiProcessor;
        deviceBank = viewControl.getDeviceBank();
        this.learnProcessor = new LearnProcessor(midiProcessor, cursorDevice);
        for (int i = 0; i < 8; i++) {
            final Device device = deviceBank.getItemAt(i);
            final DeviceState state = new DeviceState(i);
            deviceStates.add(state);
            device.exists().addValueObserver(exists -> setDeviceExist(state, exists));
            device.isEnabled().addValueObserver(enabled -> setDeviceEnabled(state, enabled));
            device.name().addValueObserver(name -> setDeviceName(state, name));
            device.isPlugin().addValueObserver(isPlugin -> setDeviceIsPlugin(state, isPlugin));
            device.isRemoteControlsSectionVisible()
                .addValueObserver(remotesVisible -> setDeviceRemotesVisible(state, remotesVisible));
        }
        deviceBank.itemCount().addValueObserver(this::handlePluginCount);
        deviceBank.scrollPosition().addValueObserver(pos -> handlePluginScrollChange(midiProcessor, pos));

        cursorDevice.position().addValueObserver(this::setDevicePosition);
        cursorDevice.isPinned().markInterested();
        cursorDevice.name().addValueObserver(this::handleCursorDeviceNameChanged);
        cursorDevice.exists().addValueObserver(cursorDeviceState::setExists);
        cursorDevice.isEnabled().addValueObserver(cursorDeviceState::setEnabled);
        cursorDevice.addDirectParameterIdObserver(this::applyParameterIds);
        cursorDevice.addDirectParameterNameObserver(13, this::handleIncomingParameterNames);

        cursorDevice.isPlugin().addValueObserver(isPlugin -> {
            if (activeParameterSet != null) {
                activeParameterSet.registerPluginState(isPlugin);
            }
            cursorDeviceState.setPlugin(isPlugin);
        });
        final CursorRemoteControlsPage remotes = viewControl.getDeviceRemotes();

        cursorDevice.isRemoteControlsSectionVisible()
            .addValueObserver(remotesVisible -> evaluateMacroMode(cursorDevice.isPlugin().get(), remotesVisible,
                cursorDevice.hasLayers().get(), cursorDevice.name().get()
            ));
        cursorDevice.name()
            .addValueObserver(name -> evaluateMacroMode(cursorDevice.isPlugin().get(),
                cursorDevice.isRemoteControlsSectionVisible().get(), cursorDevice.hasLayers().get(), name
            ));
        cursorDevice.hasLayers()
            .addValueObserver(hasLayers -> evaluateMacroMode(cursorDevice.isPlugin().get(),
                cursorDevice.isRemoteControlsSectionVisible().get(), hasLayers, cursorDevice.name().get()
            ));
        cursorDevice.isPlugin()
            .addValueObserver(
                isPlugin -> evaluateMacroMode(isPlugin, cursorDevice.isRemoteControlsSectionVisible().get(),
                    cursorDevice.hasLayers().get(), cursorDevice.name().get()
                ));

        bindMarcoDevice(macroDevice, remotes);

        cursorDevice.addDirectParameterNormalizedValueObserver(this::handleParameterValueChanged);
        paramValueObserver = cursorDevice.addDirectParameterValueDisplayObserver(13, this::handValueDisplayChanged);
    }

    private static void handlePluginScrollChange(final MidiProcessor midiProcessor, final int pos) {
        if (pos != -1) {
            return;
        }
        midiProcessor.sendPluginCommand("03", pos);
    }

    private void bindMarcoDevice(final MacroDevice rotoDevice, final CursorRemoteControlsPage remotes) {
        remotes.pageCount().addValueObserver(this::handlePageCount);
        for (int i = 0; i < 8; i++) {
            final RemoteControl remoteParam = remotes.getParameter(i);
            final SettableRangedValue parameter = remoteParam.value();
            final RotoMacroParameter rotoParameter = rotoDevice.getItem(i);
            parameter.addValueObserver(v -> setParamValue(rotoParameter, v));
            remoteParam.name().addValueObserver(name -> setParamName(rotoParameter, name));
            remoteParam.exists().addValueObserver(exists -> setParamExists(rotoParameter, exists));
            remoteParam.discreteValueCount().addValueObserver(steps -> setParamSteps(rotoParameter, steps));
            remoteParam.getOrigin().addValueObserver(origin -> setOrigin(rotoParameter, origin));
        }
    }

    private void handlePluginCount(final int count) {
        this.numberOfPlugins = count;
        if (count < this.firstPlugin) {
            deviceBank.scrollPosition().set(0);
            mainHandler.markUpdateRequired(FocusSource.PLUGIN);
        }
    }

    public BooleanValueObject getInMacroMode() {
        return inMacroMode;
    }

    private void setParamSteps(final RotoMacroParameter rotoParameter, final int steps) {
        rotoParameter.setSteps(steps);
        if (mainHandler.singleMacroUpdateReady() && rotoParameter.exists()) {
            sendMacroValues();
        }
    }

    private void setOrigin(final RotoMacroParameter rotoParameter, final double origin) {
        rotoParameter.setCenterDetent(origin == 0.5);
        if (mainHandler.singleMacroUpdateReady() && rotoParameter.exists()) {
            sendMacroValues();
        }
    }

    private void setParamExists(final RotoMacroParameter rotoParameter, final boolean exists) {
        rotoParameter.setExists(exists);
        if (mainHandler.singleMacroUpdateReady()) {
            if (!exists) {
                midiProcessor.sendSysEx(rotoParameter.getSysExUnmap());
                sendPluginSelect(cursorDeviceState.getIndex());
            } else {
                sendMacroValues();
            }
        }
    }

    private void setParamName(final RotoMacroParameter rotoParameter, final String name) {
        rotoParameter.setCurrentName(name);
        if (mainHandler.singleMacroUpdateReady() && rotoParameter.exists()) {
            midiProcessor.sendSysEx(rotoParameter.getSysExNameChange());
        }
    }

    private void setParamValue(final RotoMacroParameter rotoParameter, final double v) {
        rotoParameter.setValue(v);
    }

    private void handlePageCount(final int pageCount) {
        this.macroDevice.setRemotePages(Math.max(pageCount, 0));
        evaluateMacroMode(cursorDevice.isPlugin().get(), cursorDevice.isRemoteControlsSectionVisible().get(),
            cursorDevice.hasLayers().get(), cursorDevice.name().get()
        );
    }

    private void setDeviceRemotesVisible(final DeviceState state, final boolean remotesVisible) {
        state.setInMacroMode(remotesVisible);
    }

    /**
     * Page change from ROTO control
     *
     * @param pageIndex pageIndex index
     */
    public void selectRemotePage(final int pageIndex) {
        if (inMacroMode.get()) {
            macroDevice.setRemotePageIndex(pageIndex);
            macroDevice.selectRemotePageIndex(pageIndex);
        }
    }

    private void setDevicePosition(final int pos) {
        if (pos < 0) {
            return;
        }
        cursorDeviceState.setIndex(pos);
        if (pos < this.firstPlugin || pos >= this.firstPlugin + 8) {
            this.firstPlugin = (pos / 8) * 8;
            this.pluginPosition = pos;
            deviceBank.scrollPosition().set(this.firstPlugin);
            mainHandler.markUpdateRequired(FocusSource.PLUGIN);
        } else {
            this.pluginPosition = pos;
            mainHandler.markUpdateRequired(FocusSource.PLUGIN);
        }
    }

    public void selectPlugin(final int index) {
        if (lockedState) {
            cursorDevice.isPinned().set(false);
        }
        cursorDevice.selectDevice(deviceBank.getItemAt(index));
        if (lockedState) {
            cursorDevice.isPinned().set(true);
        }
    }

    public void updatePluginPosition() {
        if (this.firstPlugin <= pluginPosition && pluginPosition < this.firstPlugin + 8) {
            sendPluginSelect(pluginPosition);
        }
    }

    private void handleIncomingParameterNames(final String id, final String name) {
        if (activeParameterSet != null) {
            activeParameterSet.registerName(id, name);
        }
        //mainHandler.notifyDawPluginUpdate();
    }

    private void applyParameterIds(final String[] ids) {
        if (activeParameterSet == null) {
            return;
        }
        activeParameterSet.registerParameterIds(ids);
        final List<ParameterSettings> stashed = activeParameterSet.getStashedRequestedParameters();
        if (!stashed.isEmpty()) {
            for (final ParameterSettings stashParam : stashed) {
                final RotoParameter parameter = activeParameterSet.getParameterByHash(stashParam.hashValue());
                this.applyParameterToDevice(stashParam.controlType(), stashParam.pageIndex(), parameter);
            }
            activeParameterSet.clearParameterRequestStash();
        }
    }

    private void handleCursorDeviceNameChanged(final String name) {
        activeParameterSet = this.deviceParameterSetMap.computeIfAbsent(name,
            key -> new DeviceParameterSet(name, cursorDevice.isPlugin().get())
        );
        cursorDeviceState.setParameterSet(activeParameterSet);
        this.mainHandler.notifyDawPluginUpdate();
    }

    private void setDeviceIsPlugin(final DeviceState state, final boolean isPlugin) {
        state.setPlugin(isPlugin);
        mainHandler.markUpdateRequired(FocusSource.PLUGIN);
    }


    private void setDeviceExist(final DeviceState state, final boolean exists) {
        state.setExists(exists);
        mainHandler.markUpdateRequired(FocusSource.PLUGIN);
    }

    private void setDeviceEnabled(final DeviceState state, final boolean enabled) {
        state.setEnabled(enabled);
        mainHandler.markUpdateRequired(FocusSource.PLUGIN);
    }

    private void setDeviceName(final DeviceState state, final String name) {
        if (name.isBlank()) {
            state.setParameterSet(null);
        } else {
            final DeviceParameterSet parameterSet = this.deviceParameterSetMap.computeIfAbsent(name,
                key -> new DeviceParameterSet(name, cursorDevice.isPlugin().get())
            );
            state.setParameterSet(parameterSet);
            mainHandler.markUpdateRequired(FocusSource.PLUGIN);
        }
    }

    public void activatePlugin(final int index, final int active) {
        deviceBank.getItemAt(index).isEnabled().set(active == 1);
    }

    private void evaluateMacroMode(final boolean isPlugin, final boolean remoteVisible, final boolean isLayer,
        final String deviceName) {
        if ((isLayer && !isPlugin) || REMOTES_ONLY_DEVICES.contains(deviceName)) {
            inMacroMode.set(true);
        } else {
            inMacroMode.set(remoteVisible && macroDevice.getRemotePages() > 0);
        }
    }


    public void setPluginLearnMode(final boolean inLearningMode) {
        this.inLearningMode = inLearningMode;
        if (inLearningMode) {
            paramValueObserver.setObservedParameterIds(activeParameterSet.getParameters());
        } else {
            paramValueObserver.setObservedParameterIds(new String[] {});
            activeParameterSet.clearLearned();
        }
    }

    public void confirmLearned(final int type, final int paramIndex) {
        if (inLearningMode) {
            RotoControlExtension.println(" CONFIRM LEARN %d index=%d", type, paramIndex);
            activeParameterSet.clearLearned();
        }
    }

    private void handValueDisplayChanged(final String id, final String value) {
        final String pid = DeviceParameterSet.getLastSegment(id);
        //RotoControlExtension.println(" INCOMING %s %s", id, value);
        final RotoParameter parameter = activeParameterSet.getParameter(pid);
        if (parameter != null && inLearningMode) {
            learnProcessor.captureDisplayValue(parameter, value);
        } else if (!inLearningMode) {
            final RotoControlParameter rotoParam = controlParamMap.get(pid);
            if (rotoParam != null) {
                rotoParam.setDisplayValue(value);
            }
        }
    }

    private void handleParameterValueChanged(final String id, final double value) {
        final String pid = DeviceParameterSet.getLastSegment(id);
        final RotoParameter parameter = activeParameterSet.getParameter(pid);
        if (parameter == null) {
            return;
        }
        final double previousValue = parameter.getValue();
        parameter.setValue(value);
        if (inLearningMode) {
            learnProcessor.captureValue(parameter, value, previousValue);
        } else {
            final RotoControlParameter rotoParam = controlParamMap.get(pid);
            if (rotoParam != null) {
                rotoParam.getValue().set(value);
            }
        }
    }

    public void navigatePluginBank(final int firstIndex) {
        firstPlugin = firstIndex;
        deviceBank.scrollPosition().set(firstPlugin);
    }

    public Optional<RotoParameter> activateParameter(final ParameterSettings setting) {
        if (activeParameterSet == null) {
            return Optional.empty();
        }
        final RotoParameter parameter = activeParameterSet.getParameterByHash(setting.hashValue());
        if (parameter != null) {
            applyParameterToDevice(setting.controlType(), setting.pageIndex(), parameter);
            return Optional.of(parameter);
        } else if (inMacroMode.get()) {
            return macroDevice.getParameter(setting.index());
        } else {
            activeParameterSet.stashMissingParam(setting);
        }
        return Optional.empty();
    }

    private void applyParameterToDevice(final int controlType, final int pageIndex, final RotoParameter parameter) {
        if (parameter == null) {
            return;
        }
        if (!pendingParamUpdate) {
            controlParamMap.clear();
        }
        final RotoControlParameter controlParam = mainHandler.getParameter(pageIndex, controlType);

        controlParam.setParameter(parameter);
        controlParamMap.put(parameter.getId(), controlParam);
        if (!pendingParamUpdate && !inLearningMode) {
            pendingParamUpdate = true;
            midiProcessor.invokeDelayed(this::updateParams, 200);
        }
    }

    private void updateParams() {
        List<String> ids = new ArrayList<>();
        controlParamMap.values().stream().map(RotoControlParameter::getParamId).forEach(id -> {
            ids.add("CONTENTS/ROOT_GENERIC_MODULE/%s".formatted(id));
            ids.add("CONTENTS/%s".formatted(id));
        });
        //RotoControlExtension.println(" --------------- ");
        //controlParamMap.values().forEach(pa -> {
        //    RotoControlExtension.println(" > %d %s %s", pa.getIndex(), pa.getName(), pa.getParamId());
        //});
        final String[] idsToObserve = ids.stream().toArray(String[]::new);
        paramValueObserver.setObservedParameterIds(idsToObserve);
        pendingParamUpdate = false;
    }

    @Override
    public boolean scrollInPlace() {
        if (inMacroMode.get()) {
            return macroDevice.scrollInPlace();
        }
        return true;
    }

    @Override
    public void sendStates() {
        if (inMacroMode.get()) {
            sendMacroUpdate();
        } else {
            sendPluginUpdate();
        }
        mainHandler.resetDeviceChange();
    }

    public void sendPluginCount(int firstIndex) {
        midiProcessor.sendPluginCommand("02", Math.min(numberOfPlugins, 0x7F));
        midiProcessor.sendPluginCommand("03", firstIndex);
    }

    public void sendPluginSelect(int position) {
        if (position >= firstPlugin && position < firstPlugin + 8) {
            midiProcessor.sendPluginSelect(cursorDeviceState.getIndex(), macroDevice.getRemotePageIndex(), lockedState);
        }
    }

    public void sendMacroUpdate() {
        int firstIndex = Math.max(0, Math.min(firstPlugin, 0x7F));
        sendPluginCount(firstIndex);
        final int cursorPosition = cursorDeviceState.getIndex();
        for (int i = 0; i < 8; i++) {
            if (firstPlugin + i == cursorPosition) {
                if (cursorDeviceState.exists()) {
                    midiProcessor.sendSysEx(getMacroUpdate());
                }
            } else {
                final DeviceState state = deviceStates.get(i);
                if (state.exists()) {
                    midiProcessor.sendSysEx(state.toSysExUpdate(firstIndex + i));
                }
            }
        }
        midiProcessor.endPluginDetail();
        sendPluginSelect(cursorDeviceState.getIndex());
    }

    public void sendPluginUpdate() {
        int firstIndex = Math.max(0, Math.min(firstPlugin, 0x7F));
        sendPluginCount(firstIndex);
        for (int i = 0; i < 8; i++) {
            final DeviceState state = deviceStates.get(i);
            if (state.exists()) {
                midiProcessor.sendSysEx(state.toSysExUpdate(firstIndex + i));
            }
        }
        midiProcessor.endPluginDetail();
        updatePluginPosition();
    }


    private String getMacroUpdate() {
        return "F0 00 22 03 02 0B 05 %02X %s %02X %s01 %02X F7".formatted(cursorDeviceState.getIndex(),
            macroDevice.getSysExHash(), cursorDeviceState.isEnabled() ? 1 : 0, cursorDeviceState.getSysExName(),
            macroDevice.getRemotePages()
        );
    }

    public MacroDevice getMacroDevice() {
        return macroDevice;
    }

    public void sendMacroValues() {
        //midiProcessor.sendSysEx(getMacroUpdate());
        if (!mainHandler.singleMacroUpdateReady()) {
            return;
        }
        final List<RotoMacroParameter> params = macroDevice.getRotoParameters();
        for (final RotoMacroParameter param : params) {
            if (param.exists()) {
                midiProcessor.sendSysEx(param.getLearnSysEx());
            }
        }
    }

    public void lockDevice(final boolean isLocked) {
        lockedState = isLocked;
        cursorDevice.isPinned().set(isLocked);
    }

    public void toggleRemotePage() {
        cursorDevice.isRemoteControlsSectionVisible().toggle();
    }

}
