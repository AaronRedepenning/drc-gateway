var fs = require('fs');

function WriteFluxmapJSON() {
    var height = 275;
    var width = 550;
    
    // Build fluxmap json object
    var fluxmapLayers = [ ];
    var yGrid = 5, xGrid = 10, layers = 5;
    var yOffset = (height / yGrid) / 2;
    var xOffset = (width / xGrid) / 2;
    var points= [ ];
    for(var z = 0; z < 5; z++) {
        for(var y = 0; y < height; y += height / yGrid) {
            for(var x = 0; x < width; x += width / xGrid) {
                var value = 72.5;
                
                var point = {
                    x: x + xOffset,
                    y: y + yOffset,
                    val: value
                };
                points.push(point);
            }
        }

        var data = {
            data: points,
            min: 40,
            max: 100
        };

        fs.writeFile('./fluxmapSeedData' + z + '.json', '//Auto-generated file for fluxmap data, Layer #' + z + '\n' + JSON.stringify(data, null, 4), function () {
            console.log("File written successfuly!");
        });
    }
}

WriteFluxmapJSON();