var serial_port = require('serialport').SerialPort;
var xbee_api    = require('xbee-api');
var fs          = require('fs');
var config      = require('./config.js');
var express     = require('express');
var app         = express();
var fluxmapSeed = require('./appData/fluxmapSeedData.json');

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

// Serve drc-dashboard application from dist directory
app.use(express.static('./drc-dashboard/dist'));

app.get('/raw-data', function(req, res) {
    res.send(samplesArray);
})

// Get fluxmap data
.get('/fluxmap-data', function (req, res) {
    
    // Build fluxmap json object
    var fluxmapLayers = [ ], numLayers = 5;
    
    for(var z = 0; z < numLayers; z++) {
        var layer = require('./appData/fluxmapSeedData' + z + '.json');
        
        for(var len = 0; len < layer.data.length; len++) {
            var change = (Math.random() * 15) - 7.5; // Allow change of +/- 7.5 degrees maximum
            layer.data[len].val += change;
            layer.min = Math.min(layer.min, layer.data[len].val);
            layer.max = Math.max(layer.max, layer.data[len].val);
        }
        
        fluxmapLayers.push(layer);
        
        // Store data to file for next time 
        fs.writeFile('./fluxmapSeedData' + z + '.json', '//Auto-generated file for fluxmap data, Layer #' + z + '\n' 
            + JSON.stringify(layer, null, 4));
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
    var lightSeries = [[]];
    
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
        lightSeries[0].push(samplesArray[i].lightIntensity);
    }
    
    var chartData = {
        labels: labelsData,
        series: [
            {name: "Temperature", data: tempSeries},
            {name: "Humidity", data: humSeries},
            {name: "Pressure", data: presSeries},
            {name: "Light Intensity", data: lightSeries}
        ]
    };
    
    // Get data for gauges
    var gauges = { 
        tempHumGauge: Math.round(Math.random() * 10), // How to calculate these?
        lightGauge:  Math.round(Math.random() * 10)
    };
    
    // Get current conditions
    var current = { };
    current.temperature = tempSeries[0][tempSeries[0].length - 1];
    current.pressure = presSeries[0][presSeries[0].length - 1];
    current.humidity = humSeries[0][humSeries[0].length - 1];
    // Dewpoint approximation equation from Mark G. Lawrence (American Meteorological society)
    // Link : https://iridl.ldeo.columbia.edu/dochelp/QA/Basic/dewpoint.html
    current.dewpoint = Math.round(current.temperature - ((100 - current.humidity) / 5));
    current.lightIntensity = data[samplesArray.length - 1].lightIntensity;
    
    // Today's extremes
    var extremes = { 
        temperature: {
            min: 1000,
            max: 0,
            average: 0
        },
        humidity: {
            min: 1000,
            max: 0,
            average: 0
        },
        pressure: {
            min: 10000,
            max: 0,
            average: 0
        },
        lightIntensity: {
            min: 10000,
            max: 0,
            average: 0
        }
    };
    var numElements;
    for(numElements = 0; numElements < tempSeries[0].length; numElements++) {
        // Calculate temperature min, max, and average
        extremes.temperature.min = Math.min(extremes.temperature.min, tempSeries[0][numElements]);
        extremes.temperature.max = Math.max(extremes.temperature.max, tempSeries[0][numElements]);
        extremes.temperature.average += tempSeries[0][numElements];
        
        // Calculate humidity min, max, and average
        extremes.humidity.min = Math.min(extremes.humidity.min, humSeries[0][numElements]);
        extremes.humidity.max = Math.max(extremes.humidity.max, humSeries[0][numElements]);
        extremes.humidity.average += humSeries[0][numElements];
        
        // Calculate pressure min, max, and average
        extremes.pressure.min = Math.min(extremes.pressure.min, presSeries[0][numElements]);
        extremes.pressure.max = Math.max(extremes.pressure.max, presSeries[0][numElements]);
        extremes.pressure.average += presSeries[0][numElements];
        
        // Calculate light intensity min, max, and average
        extremes.lightIntensity.min = Math.min(extremes.lightIntensity.min, samplesArray[numElements].lightIntensity);
        extremes.lightIntensity.max = Math.max(extremes.lightIntensity.max, samplesArray[numElements].lightIntensity);
        extremes.lightIntensity.average += samplesArray[numElements].lightIntensity;
        
    }
    // Compute current averages
    extremes.temperature.average = Math.round(extremes.temperature.average / numElements);
    extremes.humidity.average = Math.round(extremes.humidity.average / numElements);
    extremes.pressure.average = Math.round(extremes.pressure.average / numElements);
    extremes.lightIntensity.average = Math.round(extremes.lightIntensity.average / numElements);
    
    var overviewData = {
        currentConditions: current,
        gaugeData: gauges,
        chartData: chartData,
        extremes: extremes
    };
    
    res.send(overviewData);
});

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
