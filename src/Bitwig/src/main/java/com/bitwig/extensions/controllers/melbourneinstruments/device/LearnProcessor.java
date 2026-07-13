package com.bitwig.extensions.controllers.melbourneinstruments.device;

import java.util.List;

import com.bitwig.extension.controller.api.ControllerHost;
import com.bitwig.extension.controller.api.CursorDevice;
import com.bitwig.extensions.controllers.melbourneinstruments.MidiProcessor;
import com.bitwig.extensions.controllers.melbourneinstruments.RotoControlExtension;

public class LearnProcessor {
    
    public static final int UPDATE_INTERVAL = 5;
    public final static int STEPS = 48;
    private final static double STEP_INC = 1.0 / (double) STEPS;
    
    private final StepDetector stepDetector = new StepDetector();
    private final MidiProcessor midiProcessor;
    private final CursorDevice cursorDevice;
    private final ControllerHost host;
    
    public LearnProcessor(final MidiProcessor midiProcessor, final CursorDevice cursorDevice) {
        this.midiProcessor = midiProcessor;
        this.cursorDevice = cursorDevice;
        this.host = midiProcessor.getHost();
    }
    
    public void captureDisplayValue(final RotoParameter parameter, final String displayValue) {
        if (displayValue.isBlank()) {
            return;
        }
        if (parameter.getId().equals(stepDetector.getParamId())) {
            stepDetector.setValueString(displayValue);
        }
    }
    
    public void captureValue(final RotoParameter parameter, final double value, final double initialValue) {
        if (stepDetector.getParamId() == null && !parameter.isLearned()) {
            stepDetector.init(parameter.getId());
            stepDetector.setValue(value);
            runStepUpdate(parameter, 0, 0, () -> this.captureAndSendLearned(parameter, initialValue));
            parameter.setLearned(true);
        } else if (parameter.getId().equals(stepDetector.getParamId())) {
            stepDetector.setValue(value);
            parameter.setLearned(true);
        }
    }
    
    private void captureAndSendLearned(final RotoParameter parameter) {
        final List<String> stepNames = stepDetector.getStepNames();
        RotoControlExtension.println(
            " STEPS = %d [%s,%s] distinct=%d 3rdParty=%s", stepNames.size(), stepNames.get(0),
            stepNames.get(stepNames.size() - 1), stepDetector.getDistinctValues(), cursorDevice.isPlugin().get());
        if (stepDetector.getNrOfSteps() <= 0x18 && stepDetector.getNrOfSteps() > 1) {
            parameter.setSteps(stepDetector.getNrOfSteps());
            final String sysEx =
                parameter.getLearnSysEx(stepDetector.getStepSysExNames()); //cursorDevice.isPlugin().get()
            midiProcessor.sendSysEx(sysEx);
        } else {
            parameter.setCenterDetent(isCenterDetent(stepNames));
            parameter.setSteps(0);
            // cursorDevice.isPlugin().get()
            midiProcessor.sendSysEx(parameter.getLearnSysEx());
        }
    }
    
    private boolean isCenterDetent(final List<String> stepNames) {
        if (stepNames.size() < 2) {
            return false;
        }
        String firstStep = stepNames.get(0);
        String lastStep = stepNames.get(stepNames.size() - 1);
        if (firstStep.startsWith("-")) {
            firstStep = firstStep.substring(1);
            lastStep = lastStep.startsWith("+") ? lastStep.substring(1) : lastStep;
            return firstStep.equals(lastStep);
        }
        
        return false;
    }
    
    public void captureAndSendLearned(final RotoParameter parameter, final double previousValue) {
        stepDetector.registerCapture();
        parameter.setValue(previousValue);
        cursorDevice.setDirectParameterValueNormalized(parameter.getFullId(), previousValue, 1.0);
        captureAndSendLearned(parameter);
    }
    
    private void runStepUpdate(final RotoParameter parameter, final int step, final double value,
        final Runnable completeAction) {
        cursorDevice.setDirectParameterValueNormalized(parameter.getFullId(), value, 1.0);
        if (step <= STEPS) {
            host.scheduleTask(
                () -> runStepUpdate(parameter, step + 1, value + STEP_INC, completeAction), UPDATE_INTERVAL);
        } else {
            host.scheduleTask(completeAction, UPDATE_INTERVAL);
        }
    }
}
