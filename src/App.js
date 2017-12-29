import React, { Component } from 'react';
import logo from './logo.svg';
import Ganglion from 'ganglion-ble';
import './App.css';
import { LineChart, Line, Tooltip, XAxis, YAxis } from 'recharts';

const SUBBUFFER_THRESHOLD = 10;
const MAX_BUFFER_LENGTH = 100;

const average = (arr) => {
  console.log(arr);
  const sum = arr.reduce((acc, x) => acc + x, 0);
  console.log(sum);
  return sum / arr.length;
}

const fakeData = (n=100) => {
  const data = [];
  for (let i = 0; i < n; i++) {
    data.push({ground: Math.random()});
  }
  return data;
}

const AppName = "Psyche: Gymnasium";

class App extends Component {

  constructor(props) {
    super(props);

    this.buffer = [];
    this.subBuffer = [];

    this.state = {
      EMG: fakeData(),
      connected: false,
    }
  }

  async connectToEMG() {
    this.startBufferRotation();
    const ganglion = new Ganglion();
    await ganglion.connect();
    await ganglion.start();

    ganglion.stream.subscribe(sample => {
      // using the subBuffer to downsample the data
      if (this.subBuffer.length > SUBBUFFER_THRESHOLD) {
        this.buffer.push({ground: average(this.subBuffer.slice())});
        this.subBuffer = [];
      }
      if (this.buffer.length > MAX_BUFFER_LENGTH) this.buffer.shift();
      this.subBuffer.push(sample.data[0]);
    });

    this.setState({connected: true});
  }

  stopBufferRotation() {
    clearInterval(this.interval);
  }

  startBufferRotation() {
    this.interval = setInterval(() => {
      this.setState({EMG: this.buffer.slice()});
    }, 100);
  }

  handleClick(e) {
    if (this.state.connected) {
      this.stopBufferRotation();
    } else {
      this.connectToEMG();
    }
  }

  render() {
    return (
      <div className="App">

        <header className="App-header">
          <h1 className="App-title">{ AppName }</h1>
        </header>

        <LineChart width={400} height={400} data={ this.state.EMG }>
          <XAxis />
          <YAxis dataKey="ground" />
          <Tooltip />
          <Line type="monotone" dataKey="ground" stroke="#8884d8" />
        </LineChart>

        <button onClick={ () => this.handleClick() }>
          { this.state.connected ? 'Disconnect' : 'Connect' }
        </button>

      </div>
    );
  }

}

export default App;
