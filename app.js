var serial_port = require('serialport').SerialPort;
var xbee_api    = require('xbee-api');
var fs          = require('fs');
var config      = require('./config.js');
var express     = require('express');
var app         = express();

var dataFileName = './sensorData.json';
var samplesArray = [ ];

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

    app.listen(3000, function() {
        console.log('Listening on port 3000');
    });    
});

app.get('/', function(req, res) {
    res.send(samplesArray);
});


// All frames parsed by the XBee will be emitted here
xbeeApi.on("frame_object", function(frame) {
    var xbeeNode = {
        sensorModules: []
    };
    var sensorModule = {};    
    // Parse xbee frame
    var length = 0, start;
    xbeeNode.xbeeRemote16 = frame.remote16;
    xbeeNode.xbeeRemote64 = frame.remote64;
    xbeeNode.sampleId = frame.data[length++];
    start = length;
    while(frame.data[length++] != 0);
    xbeeNode.nodeName = frame.data.toString('ascii', start, length - 1);
    xbeeNode.position = { 
        x: frame.data[length++], 
        y: frame.data[length++]

    };
    length++; // Skip the cmd field because right now we only have 'U' for a command type
    switch(frame.data[length++]) {
        case 0x00: // Light 
            xbeeNode.lightIntensity = (frame.data[length++] << 24) |
                (frame.data[length++] << 16) | (frame.data[length++] << 8)
                | frame.data[length++];

            // Push to samples array
            var index = samplesArray.findIndex(function(element, idx, arr) {
                if(element.sampleId === xbeeNode.sampleId) {
                    return true;
                }
                return false;
            });
            if(index < 0) {
                if(samplesArray.length > 30) {
                    samplesArray.shift();
                }
                samplesArray.push(xbeeNode);
            }
            else {
                // Merge with existing, the only thing it should be missing is light intensity
                samplesArray[index].lightIntensity = xbeeNode.lightIntensity;
            }
            break;
        case 0x02:
            sensorModule.carbonDioxide = ((frame.data[length++] << 8) 
                | frame.data[length++]) / 10;
        // Intentianal fallthrough here, dont put a break;
        case 0x01: // Temperature, Humidity, pressure
            start = length;
            // Copy sensor module name
            while(frame.data[length++] != 0);
            sensorModule.nodeName = frame.data.toString('ascii', start, length - 1);
            // Copy MAC Address
            sensorModule.macAddress = frame.data.toString('hex', length, length + 6);
            length += 6;

            // Get module height
            sensorModule.height = frame.data[length++];
            sensorModule.temperature = ((frame.data[length++] << 8) 
                | frame.data[length++]) / 10.0;
            sensorModule.humidity = frame.data[length++];
            sensorModule.pressure = ((frame.data[length++] << 8) 
                | frame.data[length++]) / 10.0;
            xbeeNode.sensorModules.push(sensorModule);

            // Push to samples array
             var index = samplesArray.findIndex(function(element, idx, arr) {
                if(element.sampleId === xbeeNode.sampleId) {
                    return true;
                }
                return false;
            });
            if(index < 0) {
                samplesArray.push(xbeeNode);
                if(samplesArray.length > 30) {
                    samplesArray.shift();
                }
            }
            else {
                samplesArray[index].sensorModules.push(sensorModule);
            }
            break;
        default: 
            // Unknown Data packet
            console.error('Unknown data packet recieved!');
            break;
    }
});
