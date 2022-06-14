const TWO_PI = 2 * Math.PI;

function Point(x, y) {
  this.x = x;
  this.y = y;
}

Point.prototype.isValid = function(point) {
  return point && point.x && point.y;
}

function LatLng(latLng) {
  this.lat = latLng.lat;
  this.lng = latLng.lng;
}

LatLng.prototype.isValid = function(position) {
  return position && position.lat && position.lng;
}

function Group(google, map, position, markers, threshold, icon) {
  this.google = google;
  this.map = map;
  this.threshold = threshold;
  
  this.marker = new google.maps.Marker({
    map: map,
    position: position,
    icon: {
      url: icon || '../images/groupedMarkersBlue.svg',
      size: {
        width: 32,
        height: 32
      },
      scaledSize: {
        width: 32,
        height: 32
      },
      anchor: {
        x: 16,
        y: 16,
      },
    },
    label: `${markers.length}`,
  });
  
  this.marker.addListener('click', (function() {
    console.log('Clicked!');
    console.log('this.markers: ', this.markers);
    // circle positions are
    //   top:          { x: this.x, y: this.y - threshold }
    //   topRight:     
    //   right:   { x: this.x + threshold, y: this.y }
    //   bottom:  { x: this.x, y: this.y + threshold }
    //   left:    { x: this.x - threshold, y: this.y }
  }).bind(this));
  
  this.markers = markers;
  this.markers.forEach(marker => marker.setVisible(false));
}

function MapSpiders(google, map, options) {
	Object.assign(this, this.DEFAULT_SETTINGS, options);
	
	this.google = google;
  this.map = map;
  this.markers = [];
  this.groups = [];
  this._lastId = 0;
  
  this.isProjectionInitialized = false;
  this.methodsWaitingForProjection = [];
  
  this.overlay = new google.maps.OverlayView();
  this.overlay.draw = function() {};
  this.overlay.onAdd = (function() {
    // at this point, panes and projection will have been initialized
    this.isProjectionInitialized = true;
    
    for(let methodIndex = 0; methodIndex < this.methodsWaitingForProjection.length; methodIndex++) {      
      this.methodsWaitingForProjection[methodIndex]();
      // setTimeout(this.methodsWaitingForProjection[methodIndex], 2000);
    }
  }).bind(this);
  this.overlay.setMap(map);
}

MapSpiders.prototype.addMarker = function(marker, shouldRecalculate) {
  marker._gId = this._lastId++;
  this.markers.push(marker);
  return;
};

// TODO - add logic in case "shouldRecalculate" is true
MapSpiders.prototype.addMarkers = function(markers, shouldRecalculate) {
  let markerIds = [];
  for(let markerIndex = 0; markerIndex < markers.length; markerIndex++) {
    this.addMarker(markers[markerId]);
  }
};

MapSpiders.prototype.groupByGrid = async function() {
  const startTime = (new Date()).getTime();
  
  console.log('this.map.getZoom(): ');
  console.log(this.map.getZoom());
  if(this.map.getZoom() >= this.ZOOM_THRESHOLD) {
    this.calculateGridByLatLng();
  } else {
    this.calculateGridByPixel();
  }
  
  console.log('grouByGrid took %n ms', (new Date()).getTime() - startTime);
};

MapSpiders.prototype.calculateGridByLatLng = async function() {
    // This method is faster because it doesn't calculate each marker's position in pixel, but assumes an average latLng x pixel relation
    // This can be done because at zoom 8 the distortion causes by the projection is around 3% of the pixel distance at latitude 50 and ~4% at 80
    // I judge that to be acceptable, but the parameter can be changed if necessary
    const mapDiv = this.map.getDiv();
    const mapRect = mapDiv.getBoundingClientRect();
    const origin = await this.fromPixelToLatLng({
        x: mapRect.width / 2,
        y: mapRect.height / 2 - this.DISTANCE_THRESHOLD,
    })
    const cellSizePosition = await this.fromPixelToLatLng({
  	  x: mapRect.width / 2,
	    y: mapRect.height / 2 + this.DISTANCE_THRESHOLD,
    });
  const cellSize = this.calculateDistance(origin, cellSizePosition);

  const cells = {};
  let currentPosition;
  let currentCol;
  let currentRow;

  for (const marker of this.markers) {
    currentPosition = marker.position;
    currentRow = Math.floor(currentPosition.lat() / cellSize);
    currentCol = Math.floor(currentPosition.lng() / cellSize);

    if (cells[`${currentRow}_${currentCol}`]) {
      cells[`${currentRow}_${currentCol}`].push(marker);
    } else {
      cells[`${currentRow}_${currentCol}`] = [ marker ];
    }
  }

  for (const cell in cells) {
    const row = cell.split('_')[0];
    const col = cell.split('_')[1];
    let groupPosition;
    let secondaryCellIndex;
    let shouldMapSpiders = false;
    if (cells[cell]) {
      if (
        cells[cell].length > 1
      ) {
          groupPosition = new LatLng({ 
            lng: col * cellSize + (cellSize / 2),
            lat: row * cellSize + (cellSize / 2),
          });
          shouldMapSpiders = true;
      } else {
        // if a cell has only 1 marker, we try to merge it wtth other cells around it that have only 1 marker
        if (
          cells[`${row - 1}_${col}`] &&
          cells[`${row - 1}_${col}`].length === 1
        ) {
          // check the cell at the top
          groupPosition = new LatLng({
            lng: col * cellSize + (cellSize / 2),
            lat: row * cellSize,
          });
          secondaryCellIndex = `${row - 1}_${col}`;
          shouldMapSpiders = true;
        } else if(
          cells[`${row}_${col + 1}`] && 
          cells[`${row}_${col + 1}`].length === 1
        ) {
          // check the cell at the right
          groupPosition = new LatLng({
            lng: (col + 1) * cellSize,
            lat: row * cellSize + (cellSize / 2),
          });
          secondaryCellIndex = `${row}_${col + 1}`;
          shouldMapSpiders = true;
        } else if(
          cells[`${row + 1}_${col}`] &&
          cells[`${row + 1}_${col}`].length === 1
        ) {
          // check the cell at the bottom
          groupPosition = new LatLng({
            lng: col * cellSize + (cellSize / 2),
            lat: (row + 1) * cellSize,
          });
          secondaryCellIndex = `${row + 1}_${col}`;
          shouldMapSpiders = true;
        } else if(
          cells[`${row}_${col - 1}`] &&
          cells[`${row}_${col - 1}`].length === 1
        ) {
          // check the cell at the left
          groupPosition = new LatLng({
            lng: col * cellSize,
            lat: row * cellSize + (cellSize / 2),
          });
          secondaryCellIndex = `${row}_${col - 1}`;
          shouldMapSpiders = true;
        }
      }
      
      if (shouldMapSpiders) {
        if (secondaryCellIndex) {
          this.groups.push(new Group(
            this.google,
            this.map,
            groupPosition,
            cells[cell].concat(cells[secondaryCellIndex])
          ));
          
          cells[secondaryCellIndex] = null;
        } else {
          this.groups.push(new Group(
            this.google,
            this.map,
            groupPosition,
            cells[cell]
          ));
        }
        
        cells[cell] = null;
      }
    }
  }
};

MapSpiders.prototype.calculateGridByPixel = async function() {
  const startTime = (new Date()).getTime();
  const cellSize = 2 * this.DISTANCE_THRESHOLD;
  const cells = {};
  let currentPoint;
  let currentCol;
  let currentRow;
  console.log('cellSize: ', cellSize);
  for (const marker of this.markers) {
    currentPoint = await this.fromLatLngToPixel(marker.position);
    currentRow = Math.floor(currentPoint.x / cellSize);
    currentCol = Math.floor(currentPoint.y / cellSize);
    console.log('currentRow: ', currentRow);
    console.log('currentCol: ', currentCol);

    console.log(marker);
    if (cells[`${currentRow}_${currentCol}`]) {
      cells[`${currentRow}_${currentCol}`].push(marker);
    } else {
      cells[`${currentRow}_${currentCol}`] = [ marker ];
    }
  }

  console.log('cells: ', cells);
  for (const cell in cells) {
    const row = cell.split('_')[0];
    const col = cell.split('_')[1];
    let groupPosition;
    let secondaryCellIndex;
    let shouldMapSpiders = false;
    if (cells[cell]) {
      if (
        cells[cell].length > 1
      ) {
        groupPosition = await this.fromPixelToLatLng({ 
          x: col * cellSize + (cellSize / 2),
          y: row * cellSize + (cellSize / 2),
        });
        shouldMapSpiders = true;
      } else {
        // if a cell has only 1 marker, we try to merge it wtth other cells around it that have only 1 marker
        if (
          cells[`${row - 1}_${col}`] &&
          cells[`${row - 1}_${col}`].length === 1
        ) {
          // check the cell at the top
          groupPosition = await this.fromPixelToLatLng({ 
            x: col * cellSize + (cellSize / 2),
            y: row * cellSize,
          });
          secondaryCellIndex = `${row - 1}_${col}`;
          shouldMapSpiders = true;
        } else if(
          cells[`${row}_${col + 1}`] && 
          cells[`${row}_${col + 1}`].length === 1
        ) {
          // check the call at the right
          groupPosition = await this.fromPixelToLatLng({ 
            x: (col + 1) * cellSize,
            y: row * cellSize + (cellSize / 2),
          });
          secondaryCellIndex = `${row}_${col + 1}`;
          shouldMapSpiders = true;
        } else if(
          cells[`${row + 1}_${col}`] &&
          cells[`${row + 1}_${col}`].length === 1
        ) {
          // check the cell at the bottom
          groupPosition = await this.fromPixelToLatLng({ 
            x: col * cellSize + (cellSize / 2),
            y: (row + 1) * cellSize,
          });
          secondaryCellIndex = `${row + 1}_${col}`;
          shouldMapSpiders = true;
        } else if(
          cells[`${row}_${col - 1}`] &&
          cells[`${row}_${col - 1}`].length === 1
        ) {
          // check the cell at the left
          groupPosition = await this.fromPixelToLatLng({ 
            x: col * cellSize,
            y: row * cellSize + (cellSize / 2),
          });
          secondaryCellIndex = `${row}_${col - 1}`;
          shouldMapSpiders = true;
        }
      }
      
      if (shouldMapSpiders) {
        if (secondaryCellIndex) {
          this.groups.push(new Group(
            this.google,
            this.map,
            groupPosition,
            cells[cell].concat(cells[secondaryCellIndex])
          ));
          
          cells[secondaryCellIndex] = null;
        } else {
          this.groups.push(new Group(
            this.google,
            this.map,
            groupPosition,
            cells[cell]
          ));
        }
        
        cells[cell] = null;
      }
    }
  }
};

MapSpiders.prototype.groupByRelativeDistance = async function(marker) {
  const startTime = (new Date()).getTime();
  let currentMarker;
  let currentGroup;
  let currentDistance;
  let currentAveragePosition;
  let currentGroupLatLng;
  let groups = [];
  let markersWithGroups = {};
  let points = await Promise.all(this.markers.map(marker => this.fromLatLngToPixel(marker.position)));
  
  // iterate over markers
  // if 2 markers are close enough, add them to a group
  // compare the new group with the other markers as well
  for(let markerIndex = 0; markerIndex < this.markers.length; markerIndex++) {
    // only check markers that have no group yet
    if (!markersWithGroups[markerIndex]) {
      currentGroup = [];
      currentMarker = this.markers[0];
      for(let otherMarkersIndex = (markerIndex + 1); otherMarkersIndex < this.markers.length; otherMarkersIndex++) {
        currentDistance = this.calculateDistance(
          points[markerIndex],
          points[otherMarkersIndex],
        );
        if (currentDistance <= this.DISTANCE_THRESHOLD) {
          currentGroup.push(otherMarkersIndex);
          markersWithGroups[otherMarkersIndex] = true;
        }
      }
      if (currentGroup.length > 0) {
        currentGroup.push(markerIndex);
        markersWithGroups[markerIndex] = true;
        currentAveragePosition = this.getAveragePosition(
          currentGroup.map(markerIndex => points[markerIndex])
        );
        
        currentGroupLatLng = await this.fromPixelToLatLng(currentAveragePosition);
        currentGroup.forEach((i) => {
          this.markers[i].setVisible(false);
        });
        
        groups.push(new Group(
          this.google,
          this.map,
          currentGroupLatLng,
          currentGroup.map((i) => this.markers[i]),
          null,
          '../images/groupedMarkersRed.svg'
        ));
        
        // TODO - check the distance between the groups
      }
    }
  }
  console.log('groupByRelativeDistance took %n ms', (new Date()).getTime() - startTime);
};

MapSpiders.prototype.fromLatLngToPixel = async function(latLng) {
  if (!this.isProjectionInitialized) {
    return new Promise(((resolve, reject) => {
      this.methodsWaitingForProjection.push(
        (async function(latLng) {
          const point = await this.fromLatLngToPixel(latLng);
          resolve(point);
          console.log('Resolved!');
          return;
        }).bind(this, latLng)
      );
    }).bind(this));
    
    return;
  }

  const projection = this.overlay.getProjection();
  const point = projection.fromLatLngToContainerPixel(latLng);
  return new Point(point.x, point.y);
};

MapSpiders.prototype.getMapBounds = async function() {
  if (!this.isProjectionInitialized) {
    return new Promise(((resolve, reject) => {
      this.methodsWaitingForProjection.push(
        (async function() {
          const position = await this.getMapBounds();
          resolve(position);
          console.log('Resolved!');
          return;
        }).bind(this)
      );
    }).bind(this));
    
    return;
  }

  const projection = this.overlay.getProjection();
  const visibleRegion = projection.getVisibleRegion();

  return visibleRegion.latLngBounds.toJSON();
}

MapSpiders.prototype.fromPixelToLatLng = async function(point) {
  if (!this.isProjectionInitialized) {
    return new Promise(((resolve, reject) => {
      this.methodsWaitingForProjection.push(
        (async function(point) {
          const position = await this.fromPixelToLatLng(point);
          resolve(position);
          console.log('Resolved!');
          return;
        }).bind(this, point)
      );
    }).bind(this));
    
    return;
  }

  const projection = this.overlay.getProjection();
  const position = projection.fromContainerPixelToLatLng(point);
  return new LatLng({
    lat: position.lat(), 
    lng: position.lng()
  });
};

MapSpiders.prototype.calculateDistance = function(positionA, positionB) {
  let dx;
  let dy;
  if (positionA.x && positionB.x) {
    dx = positionA.x - positionB.x;
  } else {
    dx = positionA.lng - positionB.lng;
  }
  
  if (positionA.y && positionB.y) {
    dy = positionA.y - positionB.y;
  } else {
    dy = positionA.lat - positionB.lat;
  }
  return Math.sqrt(dx * dx + dy * dy);
};

/**
 * get the average x and y position of different position objects
 * @param  {Array} positions      Array of positions. Points must have the following properties: x and y
 * @return {Object}               Point object 
 */
MapSpiders.prototype.getAveragePosition = function(positions) {
  if (!Array.isArray(positions)) {
    throw new Error(`Expected array of positions. Instead found ${typeof positions}.`)
  }
  
  const sumX = positions.reduce((sum, position, index) => {
    // we make the comparisson here to avoid another loop to check all positions format
    if (!Point.prototype.isValid(position)) {
      throw new Error(`Point #${index} is not a valid position (must contain x and y)`);
      return;
    }
    
    sum = sum + position.x;
    return sum;
  }, 0);
  
  const sumY = positions.reduce((sum, position) => {
    sum = sum + position.y;
    return sum;
  }, 0);
  
  return {
    x: sumX / positions.length,
    y: sumY / positions.length,
  }
};

MapSpiders.prototype.DEFAULT_SETTINGS = {
  DISTANCE_THRESHOLD: 30, // in pixels,
  ZOOM_THRESHOLD: 8,
};

export default MapSpiders;

// Add markers 
//     - add the markers to be "tracked"/calculated
//     - when a new marker is added the the groups may or may not
//       be recalculated automatically
//    - each marker will get an unique id;

// removeMmarkers - remove aecertain marker from the list
//     - when a marker is removed the the groups may or may not
//       be recalculated automatically

// removeAll - remove all markers and clear all listeners

// group - groups all the markers and show them as group marker

// expand - expand all the markers into individual markers (connected by legs)

// - calculated  radius/distances should be based on "dom to map" projections.
//   This simplifies the calculations and means that grouping distamces

// - listen to global zoom change (need to recalculate positions of expanded markers)
//   recalculate which markers will be grouped and their position
// - listen to clicks on the grouped markers (to expand/group them)

// - the markers will be organized in concentric circles

/**
this['OverlappingMarkerSpiderfier'] = (function() {
  var ge, gm, lcH, lcU, mt, p, twoPi;
  p = _Class.prototype;

  gm = google.maps;

  ge = gm.event;

  mt = gm.MapTypeId;

  twoPi = Math.PI * 2;

  p['keepSpiderfied'] = false;

  p['markersWontHide'] = false;

  p['markersWontMove'] = false;

  p['spiderfiedShadowColor'] = 'white';

  p['nudgeStackedMarkers'] = true;

  p['minNudgeZoomLevel'] = 8;

  p['nudgeRadius'] = 1;

  p['markerCountInBaseNudgeLevel'] = 9;

  p['maxNudgeCount'] = 9;

  p['nudgeBucketSize'] = 12;

  p['nearbyDistance'] = 20;

  p['circleSpiralSwitchover'] = 9;

  p['circleFootSeparation'] = 23;

  p['circleStartAngle'] = twoPi / 12;

  p['spiralFootSeparation'] = 26;

  p['spiralLengthStart'] = 11;

  p['spiralLengthFactor'] = 4;

  p['spiderfiedZIndex'] = 1300;

  p['usualLegZIndex'] = 1100;

  p['highlightedLegZIndex'] = 1200;

  p['event'] = 'click';

  p['minZoomLevel'] = false;

  p['lineToCenter'] = true;

  p['legWeight'] = 1.5;

  p['legColors'] = {
    'usual': {},
    'highlighted': {}
  };

  lcU = p['legColors']['usual'];

  lcH = p['legColors']['highlighted'];

  lcU[mt.HYBRID] = lcU[mt.SATELLITE] = '#fff';

  lcH[mt.HYBRID] = lcH[mt.SATELLITE] = '#f00';

  lcU[mt.TERRAIN] = lcU[mt.ROADMAP] = '#444';

  lcH[mt.TERRAIN] = lcH[mt.ROADMAP] = '#f00';


  p.generatePtsCircle = function(count, centerPt) {
    var angle, angleStep, circumference, i, j, legLength, ref, results;
    circumference = this['circleFootSeparation'] * (2 + count);
    legLength = circumference / twoPi;
    angleStep = twoPi / count;
    results = [];
    for (i = j = 0, ref = count; 0 <= ref ? j < ref : j > ref; i = 0 <= ref ? ++j : --j) {
      angle = this['circleStartAngle'] + i * angleStep;
      results.push(new gm.Point(centerPt.x + legLength * Math.cos(angle), centerPt.y + legLength * Math.sin(angle)));
    }
    return results;
  };

  p.generatePtsSpiral = function(count, centerPt) {
    var angle, i, j, legLength, pt, ref, results;
    legLength = this['spiralLengthStart'];
    angle = 0;
    results = [];
    for (i = j = 0, ref = count; 0 <= ref ? j < ref : j > ref; i = 0 <= ref ? ++j : --j) {
      angle += this['spiralFootSeparation'] / legLength + i * 0.0005;
      pt = new gm.Point(centerPt.x + legLength * Math.cos(angle), centerPt.y + legLength * Math.sin(angle));
      legLength += twoPi * this['spiralLengthFactor'] / angle;
      results.push(pt);
    }
    return results;
  };
**/
