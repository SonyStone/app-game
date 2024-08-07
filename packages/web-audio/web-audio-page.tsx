import { createEffect, onCleanup } from 'solid-js';
import { createStore } from 'solid-js/store';
import { Osc1Type } from './osc1-type';
import { QwertyPianoBoard } from './qwerty-piano-board';
import { Range } from './range';

export default function WebAudioPage() {
  let actx = new AudioContext();
  let out = actx.destination;

  let ocs1 = actx.createOscillator();
  let gain1 = actx.createGain();
  let filter = actx.createBiquadFilter();

  ocs1.connect(gain1);
  gain1.connect(filter);
  filter.connect(out);

  const [ocs1Settings, setOcs1Settings] = createStore({
    frequency: ocs1.frequency.value,
    detune: ocs1.detune.value,
    type: ocs1.type,
    gain: 0.25
  });

  createEffect(() => {
    ocs1.frequency.value = ocs1Settings.frequency;
  });
  createEffect(() => {
    ocs1.detune.value = ocs1Settings.detune;
  });
  createEffect(() => {
    ocs1.type = ocs1Settings.type;
  });
  createEffect(() => {
    gain1.gain.value = ocs1Settings.gain;
  });

  const [filterSetting, setFilterSetting] = createStore({
    frequency: filter.frequency.value,
    detune: filter.detune.value,
    Q: filter.Q.value,
    gain: filter.gain.value,
    type: filter.type
  });

  createEffect(() => {
    filter.frequency.value = filterSetting.frequency;
  });
  createEffect(() => {
    filter.detune.value = filterSetting.detune;
  });
  createEffect(() => {
    filter.Q.value = filterSetting.Q;
  });
  createEffect(() => {
    filter.gain.value = filterSetting.gain;
  });
  createEffect(() => {
    filter.type = filterSetting.type;
  });

  onCleanup(() => {
    actx.close();
  });

  const [keyboardSettings, setKeyboardSettings] = createStore({
    width: 1000,
    height: 150,
    borderWidth: 1,
    octaves: 5
  });

  return (
    <div>
      <h1>Welcome to web-audio-page!</h1>
      <div class="flex flex-col gap-2 p-2">
        <button class="place-self-start rounded border border-black px-2" onClick={() => ocs1.start()}>
          start
        </button>
        <button
          class="place-self-start rounded border border-black px-2"
          onClick={() => {
            ocs1.stop();
          }}
        >
          stop
        </button>
        <h2>Oscillator 1</h2>
        <Range
          value={ocs1Settings.frequency}
          valueChange={(value) => setOcs1Settings('frequency', value)}
          name={'frequency'}
          max={5000}
        />
        <Range
          value={ocs1Settings.detune}
          valueChange={(value) => setOcs1Settings('detune', value)}
          name={'detune'}
          max={100}
        />
        <Range
          value={ocs1Settings.gain}
          valueChange={(value) => setOcs1Settings('gain', value)}
          name={'gain'}
          max={1}
          step={0.001}
        />
        <Osc1Type type={ocs1Settings.type} changeType={(value) => setOcs1Settings('type', value)} />

        <h2>Filter</h2>
        <Range
          value={filterSetting.frequency}
          valueChange={(value) => setFilterSetting('frequency', value)}
          name={'frequency'}
          max={10000}
        />
        <Range
          value={filterSetting.detune}
          valueChange={(value) => setFilterSetting('detune', value)}
          name={'detune'}
        />
        <Range value={filterSetting.Q} valueChange={(value) => setFilterSetting('Q', value)} name={'Q'} max={10} />
        <Range
          value={filterSetting.gain}
          valueChange={(value) => setFilterSetting('gain', value)}
          name={'gain'}
          max={10}
        />
        <div class="flex flex-col">
          <h2>Piano Keyboard</h2>
          <Range
            value={keyboardSettings.width}
            valueChange={(value) => setKeyboardSettings('width', value)}
            name={'width'}
            max={3500}
          />
          <Range
            value={keyboardSettings.height}
            valueChange={(value) => setKeyboardSettings('height', value)}
            name={'height'}
            max={500}
          />
          <Range
            value={keyboardSettings.borderWidth}
            valueChange={(value) => setKeyboardSettings('borderWidth', value)}
            name={'borderWidth'}
            step={0.5}
            max={5}
          />
          <Range
            value={keyboardSettings.octaves}
            valueChange={(value) => setKeyboardSettings('octaves', value)}
            name={'octaves'}
            step={1}
            min={1}
            max={6}
          />
          <QwertyPianoBoard
            octaves={keyboardSettings.octaves}
            width={keyboardSettings.width}
            height={keyboardSettings.height}
            borderWidth={keyboardSettings.borderWidth}
            onFrequencyChange={(value) => setOcs1Settings('frequency', value)}
          />
        </div>
      </div>
    </div>
  );
}
