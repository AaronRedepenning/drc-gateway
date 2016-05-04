var serial_port = require('serialport').SerialPort;
var xbee_api    = require('xbee-api');
var fs          = require('fs');
var config      = require('./config.js');
var express     = require('express');
var app         = express();

///////////////////////////////////////////////////////////////////////////////////
// Section: Global Variables
///////////////////////////////////////////////////////////////////////////////////
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

//////////////////////////////////////////////////////////////////////////////////
// Section: Express Routes
//////////////////////////////////////////////////////////////////////////////////
app.get('/raw-data', function(req, res) {
    res.send(samplesArray);
})

.get('/fluxmap-data', function (req, res) {
    // Build fluxmap json object
    var fluxmapLayers = [ ];
    var height = 5, width = 10, layers = 5;
    
    for(var z = 0; z < layers; z++) {
        var points= [ ];
        
        for(var y = 0; y < height; y++) {
            for(var x = 0; x < width; x++) {
                var value = 60 + 40 * (Math.random() - 0.5);
                
                var point = {
                    x: x,
                    y: y,
                    val: value
                };
                points.push(point);
            }
        }
        
        var layer = {
            z: z,
            data: points,
            min: 0,
            max: 100
        }
        fluxmapLayers.push(layer);
    }
    
    res.send(fluxmapLayers);
})

.get('/overview-data', function (req, res) {
    // Get a local copy of the array
    var data = samplesArray;
    
    // Get data for graph
    var labelsData = data.map(function (element, index, arr) {
        return element.timestamp;
    });
    
    var tempSeries = [[]];
    var humSeries = [[]];
    var presSeries = [[]];
    var co2Series = [[]];
    
    for(var i = 0; i < data.length; i++) {
        var averageT = 0, averageH = 0, averageP = 0, total = 0;
        for(total = 0; total < data[i].sensorModules.length; total++) {
            averageT += data[i].sensorModules[total].temperature;
            averageH += data[i].sensorModules[total].humidity;
            averageP += data[i].sensorModules[total].pressure;
        }
        
        averageT /= total;
        averageH /= total;
        averageP /= total;
        
        tempSeries[0].push(averageT);
        humSeries[0].push(averageH);
        presSeries[0].push(averageP);
    }
    
    var chartData = {
        labels: labelsData,
        series: [
            {name: "Temperature", data: tempSeries},
            {name: "Humidity", data: humSeries},
            {name: "Pressure", data: presSeries}
        ]
    };
    
    // Get data for gauges
    var gauges = { 
        tempHumGauge: 5,
        ventGauge: 10
    };
    
    // Get current conditions
    var current = { };
    current.temperature = tempSeries[0][tempSeries[0].length - 1];
    current.pressure = presSeries[0][presSeries[0].length - 1];
    current.humidity = humSeries[0][humSeries[0].length - 1];
    // Dewpoint approximation equation from Mark G. Lawrence (American Meteorological society)
    // Link : https://iridl.ldeo.columbia.edu/dochelp/QA/Basic/dewpoint.html
    current.dewpoint = current.temperature - ((100 - current.humidity) / 5);
    
    var overviewData = {
        currentConditions: current,
        gaugeData: gauges,
        chartData: chartData
    };
})


//////////////////////////////////////////////////////////////////////////////////
// Section: Serial port and xbee callbacks
//////////////////////////////////////////////////////////////////////////////////
// Serial port open callback
serialPort.on('open', function () {
    console.log('Serial port ' + config.xbeeSettings.serialPort +
        'is open at ' + config.xbeeSettings.baudrate + ' baud');
        
    // Start server once serial port is open
    app.listen(3000, function() {
        console.log('Listening on port 3000');
    });    
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
    xbeeNode.timestamp = Date.now();
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
