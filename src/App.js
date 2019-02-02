import './App.css';
import React, { Component } from 'react';
import { Checkbox, ControlLabel, FormControl, Modal } from 'react-bootstrap';
import MdBluetooth from 'react-icons/lib/md/bluetooth';
import MdBluetoothDisabled from 'react-icons/lib/md/bluetooth-disabled';
import MdDelete from 'react-icons/lib/md/delete';
import MdSave from 'react-icons/lib/md/save';
import MdSettings from 'react-icons/lib/md/settings';

import Ganglion from 'ganglion-ble';
import uuid from 'uuid/v4';
import { LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const SUBBUFFER_THRESHOLD = 30;
const MAX_BUFFER_LENGTH = 100;

const db = {
  save(samples) {
    //const postUrl = 'https://us-central1-copernican-160521.cloudfunctions.net/owners';
    console.log('samples: ', samples);
    const postUrl = 'https://us-central1-copernican-160521.cloudfunctions.net/psyche';
    const payload = {
      method: 'post',
      headers: {
        "Content-type": "application/json; charset=UTF-8"
      },
      body: JSON.stringify({
        apiKey: 'beep boop' ,
        samples: samples
      })
    }
    return fetch(postUrl, payload);
  },

  read() {
    const postUrl = 'https://us-central1-copernican-160521.cloudfunctions.net/psyche_get';
    const payload = {
      method: 'post',
      headers: {
        "Content-type": "application/json; charset=UTF-8"
      },
      body: JSON.stringify({
        apiKey: 'beep boop' ,
      })
    }
    // a Promise
    return fetch(postUrl, payload);
  }
};

window.db = db;
let idCount = 0;

class ActiveSample {
  constructor(userLDAP, location) {
    this.id = idCount++;
    //this.location = 'home.bedroom';
    this.location = location;
    this.human = userLDAP;
    this.prompt = '';
    this.data = [];
  }
}

const average = (key, arr) => {
  const keys = {
    ground: 2,
    channel1: 0,
    channel2: 1
  };
  const sum = arr.reduce((acc, x) => acc + x[keys[key]], 0);
  return sum / arr.length;
}

const FakeSample = () => {
  return {
    data: [Math.random(), Math.random(), Math.random()]
  };
}

const fakeData = (n=100) => {
  const data = [];
  for (let i = 0; i < n; i++) {
    data.push({
      ground: Math.random(),
      channel1: Math.random(),
      channel2: Math.random(),
    });
  }
  return data;
}

const pick = (arr) => arr[Math.random() * arr.length | 0];

const AppName = "Psyche: Gymnasium";

class App extends Component {

  constructor(props) {
    super(props);

    this.buffer = [];
    this.activeSample = null;
    this.subBuffer = [];
    this.fakeEMGDataInterval = null;
    this.prompts = [
        'OK Google',
        'Yes',
        'No',
        'Play some music',
        'Stop the music',
      ];

    this.state = {
      EMG: fakeData(),
      connected: false,
      numberOfSamplesLabeled: 0,
      prompt: pick(this.prompts),
      recording: false,
      savedSamples: [],
      sessionId: uuid(),
      settingsModalIsOpen: false,
      useFakeData: false,
      userLDAP: 'allisonhsu',
      userLocation: 'work.desk'
    }
  }

  componentDidMount() {
    this.activeSample = new ActiveSample(this.state.userLDAP, this.state.userLocation);
  }

  async connectToEMG() {
    const ganglion = new Ganglion();
    await ganglion.connect();
    await ganglion.start();

    ganglion.stream.subscribe(sample => {
      // using the subBuffer to downsample the data

      if (this.state.recording) this.activeSample.data.push(sample.data);
      if (this.subBuffer.length > SUBBUFFER_THRESHOLD) {
        const subBuffer = this.subBuffer.slice();
        this.buffer.push({
          ground: average('ground', subBuffer),
          channel1: average('channel1', subBuffer),
          channel2: average('channel2', subBuffer)
        });
        this.subBuffer = [];
      }
      if (this.buffer.length > MAX_BUFFER_LENGTH) this.buffer.shift();
      this.subBuffer.push(sample.data);
    });

    this.setState({connected: true});
  }

  async connectToFakeEMG() {

    this.fakeEMGDataInterval = setInterval(() => {
      const { recording } = this.state;
      const sample = FakeSample();
      if (recording) this.activeSample.data.push(sample.data);
      if (this.subBuffer.length > SUBBUFFER_THRESHOLD) {
        const subBuffer = this.subBuffer.slice();
        this.buffer.push({
          ground: average('ground', subBuffer),
          channel1: average('channel1', subBuffer),
          channel2: average('channel2', subBuffer)
        });
        this.subBuffer = [];
      }
      if (this.buffer.length > MAX_BUFFER_LENGTH) this.buffer.shift();
      this.subBuffer.push(sample.data);
    }, 10);

    this.setState({connected: true});
  }

  disconnectFromFakeEMG() {
    if (!this.fakeEMGDataInterval) return;
    clearInterval(this.fakeEMGDataInterval);
    this.stopBufferRotation();
    this.setState({connected: false});
  }

  disconnectFromEMG() {

  }

  stopBufferRotation() {
    clearInterval(this.interval);
  }

  startBufferRotation() {
    this.interval = setInterval(() => {
      this.setState({EMG: this.buffer.slice()});
    }, 100);
  }

  sampleTransform(sample) {
    let transformedSample = Object.assign({
      ground: [],
      channel1: [],
      channel2: [],
      session: this.state.sessionId
    }, sample);
    for (let i = 0; i < sample.data.length; i++) {
      transformedSample.ground.push(sample.data[i][2]);
      transformedSample.channel1.push(sample.data[i][0]);
      transformedSample.channel2.push(sample.data[i][1]);
    }
    delete transformedSample.data;
    delete transformedSample.id;
    return transformedSample;
  }

  save() {
    db.save(this.state.savedSamples.map(sample => this.sampleTransform(sample)))
      .then(data => {
        this.setState({savedSamples: []})
      }).catch(error => console.log(error));
  }

  updateSessionId(e) {
    this.setState({sessionId: e.target.value});
  }

  updateUserLDAP(e) {
    this.setState({userLDAP: e.target.value});
  }

  updateUserLocation(e) {
    this.setState({userLocation: e.target.value});
  }

  handleClick(e) {
    if (this.state.connected) {
      this.stopBufferRotation();
      this.state.useFakeData ? this.disconnectFromFakeEMG(): this.disconnectFromEMG();
    } else {
      this.startBufferRotation();
      this.state.useFakeData ? this.connectToFakeEMG() : this.connectToEMG();
    }
  }

  toggleRecording(e) {
    const { numberOfSamplesLabeled, savedSamples, prompt, recording, userLDAP, userLocation } = this.state;
    let update = {recording: !recording};
    if (recording) {
      update.numberOfSamplesLabeled = numberOfSamplesLabeled + 1;
      console.log('number of samples labeled', update.numberOfSamplesLabeled);
      this.activeSample.prompt = prompt;
      update.prompt = pick(this.prompts);
      savedSamples.push(this.activeSample);
      update.savedSamples = savedSamples;
      this.activeSample = new ActiveSample(userLDAP, userLocation);
    }
    if (!recording) {
      if (savedSamples.length > 9) {
        const oldestSample = savedSamples[0];
        db.save([oldestSample].map(sample => this.sampleTransform(sample)))
          .then(data => {
            this.setState({savedSamples: this.state.savedSamples.filter(sample => {
              return sample.id !== oldestSample.id;
            })});
          }).catch(error => console.log(error));
      }
    }
    this.setState(update);
  }

  deleteSample(id) {
    this.setState({
      savedSamples: this.state.savedSamples.filter(sample => sample.id !== id),
      numberOfSamplesLabeled: this.state.numberOfSamplesLabeled - 1
    });
  }

  openModal() {
    this.setState({settingsModalIsOpen: true});
  }

  closeModal() {
    this.setState({settingsModalIsOpen: false});
  }

  renderSampleChip(sample) {
    const {data, id, prompt} = sample;
    return (
        <span className="Chip" key={ id }>
          <span className="Chip-count">{ data.length }</span>
          { prompt }
          <MdDelete onClick={ () => this.deleteSample(id) }/>
        </span>
      );
  }

  renderLineCharts(key="ground") {
    return (
        <div className="EMG-graph-card">
          <h3>{ key }</h3>
          <ResponsiveContainer width="100%" height={100}>
            <LineChart data={ this.state.EMG }>
              <XAxis />
              <YAxis dataKey={ key } />
              <Tooltip />
              <Line type="monotone" dataKey={ key } stroke="#000" />
            </LineChart>
          </ResponsiveContainer>
        </div>
    );
  }

  renderCompositeLineCharts() {
    // going to do the thing here
    // subtract the ground from the average of channel 1 and 2
    const data = this.state.EMG.map(sample => {
      return {composite: 1000 * ((sample.channel1 * sample.channel2) / 2) - sample.ground};
    });
    return (
        <div className="EMG-graph-card">
          <h3>Composite</h3>
          <ResponsiveContainer width="100%" height={100}>
            <LineChart data={ data }>
              <XAxis />
              <YAxis dataKey={ 'composite' } />
              <Tooltip />
              <Line type="monotone" dataKey={ 'composite' } stroke="#000" />
            </LineChart>
          </ResponsiveContainer>
        </div>
    );
  }

  renderSaveIcon() {
    return (
      <span className="Save-icon">
        <MdSave onClick={() => this.save()} />
        <span className="Badge">{ this.state.savedSamples.length }</span>
      </span>
    );
  }

  render() {
    const { numberOfSamplesLabeled, prompt, savedSamples, settingsModalIsOpen } = this.state;
    return (
      <div className="App">

        <header className="App-header">
          <h1 className="App-title">
            { AppName + ' (' + numberOfSamplesLabeled + ' samples labeled)' }
          </h1>
          <span className="Top-icons">
            { savedSamples.length ? this.renderSaveIcon() : null }
            <MdSettings onClick={ () => this.openModal() } />
            { this.state.connected ? <MdBluetooth onClick={ () => this.handleClick() }/> : <MdBluetoothDisabled onClick={ () => this.handleClick() }/> }
          </span>
        </header>

        <div className="App-body">
          <div className="Controls">
            <h3>Ready? Hit "Begin Recording" and Subvocalize:</h3>
            <p className={ this.state.recording ? "Prompt-active" : "Prompt-inactive"}>
              { prompt }
            </p>
            <button onClick={ () => this.toggleRecording() }>
              <div className={"Recording-indicator " + ( this.state.recording ? "Active" : "Inactive")}></div>
              { this.state.recording ? 'End' : 'Begin' } Recording
            </button>
          </div>
          <div className="Recent-recordings-area">
            { savedSamples.slice(-6).map((sample) => this.renderSampleChip(sample)) }
          </div>
          { this.renderCompositeLineCharts() }
        </div>

        <Modal show={ settingsModalIsOpen } onHide={ () => this.closeModal() }>
          <Modal.Header>
            <Modal.Title>Settings</Modal.Title>
          </Modal.Header>
          <Modal.Body>
              <ControlLabel>Session ID</ControlLabel>
              <FormControl
                type="text"
                value={ this.state.sessionId }
                placeholder="session id"
                onChange={ (e) => this.updateSessionId(e) }
              />
              <ControlLabel>User LDAP</ControlLabel>
              <FormControl
                type="text"
                value={ this.state.userLDAP}
                placeholder="user LDAP"
                onChange={ (e) => this.updateUserLDAP(e) }
              />
              <ControlLabel>User Location</ControlLabel>
              <FormControl
                type="text"
                value={ this.state.userLocation }
                placeholder="user location"
                onChange={ (e) => this.updateUserLocation(e) }
              />
              <ControlLabel>Use Fake Data</ControlLabel>
              <Checkbox
                checked={ this.state.useFakeData }
                value={ this.state.useFakeData }
                onChange={ () => this.setState({useFakeData: !this.state.useFakeData}) }
              />
          </Modal.Body>
        </Modal>

      </div>
    );
  }

}

export default App;

// TODO: Highlight on the graph what time interval is being recorded
