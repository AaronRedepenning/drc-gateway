var serial_port = require('serialport').SerialPort;
var xbee_api    = require('xbee-api');
var config      = require('./config.js');

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
});

// All frames parsed by the XBee will be emitted here
xbeeApi.on("frame_object", function(frame) {
	var xbeeNode = { 
        sampleID,
        nodeName,
        xbeeRemote64,
        xbeeRemote16,
        position: { x, y },
        lightIntensity,
        sensorModules: []
    };
    
    var sensorModule = {
        moduleName,
        macAddress,
        height,
        temperature,
        humidity,
        pressure,
        carbonDioxide
    }
    
    // Parse xbee frame
    var length = 0, start;
    xbeeNode.xbeeRemote16 = frame.remote16;
    xbeeNode.xbeeRemote64 = frame.remote64;
    xbeeNode.sampleID = frame.data[length++];
    start = length;
    while(frame.data[length++] != 0);
    xbeeNode.nodeName = frame.data.toString('ascii', start, length - 1);
    xbeeNode.position.x = frame.data[length++];
    xbeeNode.position.y = frame.data[length++];
    
    switch(frame.data[length++]) {
        case 0x00: // Light 
            xbeeNode.lightIntensity = (frame.data[length++] << 24) |
                (frame.data[length++] << 16) | (frame.data[length++] << 8)
                | frame.data[length++];
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
            length++;
            // Get module height
            sensorModule.height = frame.data[length++];
            sensorModule.temperature = ((frame.data[length++] << 8) 
                | frame.data[length++]) / 10;
            sensorModule.humidity = frame.data[length++];
            sensorModule.pressure = ((frame.data[length++] << 8) 
                | frame.data[length++]) / 10;
            xbeeNode.sensorModules.push(sensorModule);
            break;
        default: 
            // Unknown Data packet
            console.error('Unknown data packet recieved!');
            break;
    }
    
    console.log(xbeeNode);
});