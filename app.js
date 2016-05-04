var serial_port = require('serialport').SerialPort;
var xbee_api    = require('xbee-api');
var config      = require('./config.js');

var C = xbee_api.constants;
var xbeeApi = new xbee_api.XBeeAPI({
    api_mode: 1
});

var serialPort = new serial_port(config.xbeeSettings.serialPort, {
    baudrate: config.xbeeSettings.baudrate,
    parser: xbeeApi.rawParser()
});

// Serial port open callback
serialPort.on('open', function () {
    console.log('Serial port ' + config.xbeeSettings.serialPort +
        'is open at ' + config.xbeeSettings.baudrate + ' baud');
});

// All frames parsed by the XBee will be emitted here
xbeeApi.on("frame_object", function(frame) {
	console.log(">>", frame);
});