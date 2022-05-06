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

function GroupMarkers(google, map, options) {
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
      setTimeout(this.methodsWaitingForProjection[methodIndex], 2000);
    }
  }).bind(this);
  this.overlay.setMap(map);
}

GroupMarkers.prototype.addMarker = function(marker, shouldRecalculate) {
  marker._gId = this._lastId++;
  this.markers.push(marker);
  return;
};

// TODO - add logic in case "shouldRecalculate" is true
GroupMarkers.prototype.addMarkers = function(markers, shouldRecalculate) {
  let markerIds = [];
  for(let markerIndex = 0; markerIndex < markers.length; markerIndex++) {
    this.addMarker(markers[markerId]);
  }
};

GroupMarkers.prototype.groupByGrid = async function() {
  const startTime = (new Date()).getTime();
  const mapDiv = this.map.getDiv();
  const mapBoundingRect = mapDiv.getBoundingClientRect();
  
  const origin = await this.fromPixelToLatLng({
    x: mapBoundingRect.width / 2 - this.THRESHOLD,
    y: mapBoundingRect.height / 2,
  })
  const cellSizePosition = await this.fromPixelToLatLng({
    x: mapBoundingRect.width / 2 + this.THRESHOLD,
    y: mapBoundingRect.height / 2,
  });
  const threshold = this.calculateDistance(origin, cellSizePosition);
  const cells = {};
  let currentPosition;
  let currentCol;
  let currentRow;
  
  for (const marker of this.markers) {
    currentPosition = marker.position;
    currentRow = Math.floor(currentPosition.lat() / threshold);
    currentCol = Math.floor(currentPosition.lng() / threshold);
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
    let shouldGroupMarkers = false;
    if (cells[cell]) {
      if (
        cells[cell].length > 1
      ) {
        groupPosition = new LatLng({ 
          lng: col * threshold + (threshold / 2),
          lat: row * threshold + (threshold / 2),
        });
        shouldGroupMarkers = true;
      } else {
        // if a cell has only 1 marker, we try to merge it wtth other cells around it that have only 1 marker
        if (
          cells[`${row - 1}_${col}`] &&
          cells[`${row - 1}_${col}`].length === 1
        ) {
          // check the cell at the top
          groupPosition = new LatLng({
            lng: col * threshold + (threshold / 2),
            lat: row * threshold,
          });
          secondaryCellIndex = `${row - 1}_${col}`;
          shouldGroupMarkers = true;
        } else if(
          cells[`${row}_${col + 1}`] && 
          cells[`${row}_${col + 1}`].length === 1
        ) {
          // check the call at the right
          groupPosition = new LatLng({
            lng: (col + 1) * threshold,
            lat: row * threshold + (threshold / 2),
          });
          secondaryCellIndex = `${row}_${col + 1}`;
          shouldGroupMarkers = true;
        } else if(
          cells[`${row + 1}_${col}`] &&
          cells[`${row + 1}_${col}`].length === 1
        ) {
          // check the cell at the bottom
          groupPosition = new LatLng({
            lng: col * threshold + (threshold / 2),
            lat: (row + 1) * threshold,
          });
          secondaryCellIndex = `${row + 1}_${col}`;
          shouldGroupMarkers = true;
        } else if(
          cells[`${row}_${col - 1}`] &&
          cells[`${row}_${col - 1}`].length === 1
        ) {
          // check the cell at the left
          groupPosition = new LatLng({
            lng: col * threshold,
            lat: row * threshold + (threshold / 2),
          });
          secondaryCellIndex = `${row}_${col - 1}`;
          shouldGroupMarkers = true;
        }
      }
      
      if (shouldGroupMarkers) {
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
  
  console.log('grouByGrid took %n ms', (new Date()).getTime() - startTime);
};

GroupMarkers.prototype.groupByRelativeDistance = async function(marker) {
  const startTime = (new Date()).getTime();
  let currentMarker;
  let currentGroup;
  let currentDistance;
  let currentAveragePosition;
  let currentGroupLatLng;
  let groups = [];
  let markersWithGroups = {};
  let points = await Promise.all(this.markers.map(marker => this.fromLatLngToPixel(marker)));
  
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
        if (currentDistance <= this.THRESHOLD) {
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

GroupMarkers.prototype.fromLatLngToPixel = async function(marker) {
  if (!this.isProjectionInitialized) {
    return new Promise(((resolve, reject) => {
      this.methodsWaitingForProjection.push(
        (async function(marker) {
          const point = await this.fromLatLngToPixel(marker);
          resolve(point);
          console.log('Resolved!');
          return;
        }).bind(this, marker)
      );
    }).bind(this));
    
    return;
  }

  const projection = this.overlay.getProjection();
  const point = projection.fromLatLngToContainerPixel(marker.position);
  return new Point(point.x, point.y);
};

GroupMarkers.prototype.fromPixelToLatLng = async function(point) {
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

GroupMarkers.prototype.calculateDistance = function(positionA, positionB) {
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
GroupMarkers.prototype.getAveragePosition = function(positions) {
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

GroupMarkers.prototype.DEFAULT_SETTINGS = {
  THRESHOLD: 15, // in pixels
};

export default GroupMarkers;

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

  function _Class(map1, opts) {
    var e, j, k, len, ref, v;
    this.map = map1;
    if (opts == null) {
      opts = {};
    }
    for (k in opts) {
      if (!hasProp.call(opts, k)) continue;
      v = opts[k];
      this[k] = v;
    }
    this.projHelper = new this.constructor.ProjHelper(this.map);
    this.initMarkerArrays();
    this.listeners = {};
    ref = ['click', 'zoom_changed', 'maptypeid_changed'];
    for (j = 0, len = ref.length; j < len; j++) {
      e = ref[j];
      ge.addListener(this.map, e, (function(_this) {
        return function() {
          return _this['unspiderfy']();
        };
      })(this));
    }
    if (this['nudgeStackedMarkers']) {
      ge.addListenerOnce(this.map, 'idle', (function(_this) {
        return function() {
          ge.addListener(_this.map, 'zoom_changed', function() {
            return _this.mapZoomChangeListener();
          });
          return _this.mapZoomChangeListener();
        };
      })(this));
    }
  }

  p.initMarkerArrays = function() {
    this.markers = [];
    return this.markerListenerRefs = [];
  };

  p['addMarker'] = function(marker) {
    var listenerRefs;
    if (marker['_oms'] != null) {
      return this;
    }
    marker['_oms'] = true;
    listenerRefs = [
      ge.addListener(marker, this['event'], (function(_this) {
        return function(event) {
          return _this.spiderListener(marker, event);
        };
      })(this))
    ];
    if (!this['markersWontHide']) {
      listenerRefs.push(ge.addListener(marker, 'visible_changed', (function(_this) {
        return function() {
          return _this.markerChangeListener(marker, false);
        };
      })(this)));
    }
    if (!this['markersWontMove']) {
      listenerRefs.push(ge.addListener(marker, 'position_changed', (function(_this) {
        return function() {
          return _this.markerChangeListener(marker, true);
        };
      })(this)));
    }
    this.markerListenerRefs.push(listenerRefs);
    this.markers.push(marker);
    if (this.isNudgingActive()) {
      this.requestNudge();
    }
    return this;
  };

  p.nudgeTimeout = null;

  p.requestNudge = function() {
    if (this.nudgeTimeout) {
      clearTimeout(this.nudgeTimeout);
    }
    return this.nudgeTimeout = setTimeout((function(_this) {
      return function() {
        return _this.nudgeAllMarkers();
      };
    })(this), 10);
  };

  p.isNudgingActive = function() {
    return this['nudgeStackedMarkers'] && !(this['minNudgeZoomLevel'] && this.map.getZoom() < this['minNudgeZoomLevel']) && !this.spiderfied;
  };

  p.markerChangeListener = function(marker, positionChanged) {
    if ((marker['_omsData'] != null) && marker['_omsData'].leg && (positionChanged || !marker.getVisible()) && !((this.spiderfying != null) || (this.unspiderfying != null))) {
      return this['unspiderfy'](positionChanged ? marker : null);
    }
  };

  p.countsPerLevel = [1, 1];

  p.levelsByCount = [];

  p.getCountPerNudgeLevel = function(level) {
    if (this.countsPerLevel[level] != null) {
      return this.countsPerLevel[level];
    }
    this.countsPerLevel[level] = this.getCountPerNudgeLevel(level - 1) + Math.pow(2, level - 2) * this['markerCountInBaseNudgeLevel'];
    return this.countsPerLevel[level];
  };

  p.getNudgeLevel = function(markerIndex) {
    var level;
    if (this.levelsByCount[markerIndex] != null) {
      return this.levelsByCount[markerIndex];
    }
    level = 0;
    while (markerIndex >= this.countsPerLevel[level]) {
      if (level + 1 >= this.countsPerLevel.length) {
        this.getCountPerNudgeLevel(level + 1);
      }
      level++;
    }
    this.levelsByCount[markerIndex] = level - 1;
    return this.levelsByCount[markerIndex];
  };

  p.nudgeAllMarkers = function() {
    var bucketSize, changeX, changeY, changesX, changesY, count, getHash, j, len, m, needsNudge, originalPos, pos, posHash, positions, ref, ref1, ref2, ref3, ref4, ref5, results, ringLevel;
    if (!this.isNudgingActive()) {
      return;
    }
    positions = {};
    changesX = [];
    changesY = [];
    bucketSize = 1 / ((1 + this['nudgeBucketSize']) * this['nudgeRadius']);
    getHash = (function(_this) {
      return function(pos) {
        return Math.floor(pos.x * bucketSize) + ',' + Math.floor(pos.y * bucketSize);
      };
    })(this);
    ref = this.markers;
    results = [];
    for (j = 0, len = ref.length; j < len; j++) {
      m = ref[j];
      needsNudge = false;
      pos = this.llToPt((ref1 = (ref2 = m['_omsData']) != null ? ref2.usualPosition : void 0) != null ? ref1 : m.position);
      originalPos = {
        x: pos.x,
        y: pos.y
      };
      posHash = getHash(pos);
      while ((positions[posHash] != null) && ((this['maxNudgeCount'] == null) || positions[posHash] <= this['maxNudgeCount'])) {
        count = positions[posHash];
        positions[posHash] += 1;
        if (changesX[count] != null) {
          changeX = changesX[count];
          changeY = changesY[count];
        } else {
          ringLevel = this.getNudgeLevel(count);
          changesX[count] = changeX = Math.sin(twoPi * count / this['markerCountInBaseNudgeLevel'] / ringLevel) * 20 * this['nudgeRadius'] * ringLevel;
          changesY[count] = changeY = Math.cos(twoPi * count / this['markerCountInBaseNudgeLevel'] / ringLevel) * 20 * this['nudgeRadius'] * ringLevel;
        }
        pos.x = originalPos.x + changeX;
        pos.y = originalPos.y + changeY;
        this.nudged = true;
        needsNudge = true;
        posHash = getHash(pos);
      }
      if (needsNudge) {
        m['_omsData'] = (ref3 = m['_omsData']) != null ? ref3 : {};
        m['_omsData'].usualPosition = (ref4 = (ref5 = m['_omsData']) != null ? ref5.usualPosition : void 0) != null ? ref4 : m.position;
        m.setPosition(this.ptToLl(pos));
      } else if ((m['_omsData'] != null) && (m['_omsData'].leg == null)) {
        m.setPosition(m['_omsData'].usualPosition);
        delete m['_omsData'];
      }
      if (!(posHash in positions)) {
        results.push(positions[posHash] = 1);
      } else {
        results.push(void 0);
      }
    }
    return results;
  };

  p.resetNudgedMarkers = function() {
    var j, len, m, ref;
    if (!this.nudged) {
      return;
    }
    ref = this.markers;
    for (j = 0, len = ref.length; j < len; j++) {
      m = ref[j];
      if ((m['_omsData'] != null) && (m['_omsData'].leg == null)) {
        m.setPosition(m['_omsData'].usualPosition);
        delete m['_omsData'];
      }
    }
    return delete this.nudged;
  };

  p.mapZoomChangeListener = function() {
    if (this['minNudgeZoomLevel'] && this.map.getZoom() < this['minNudgeZoomLevel']) {
      return this.resetNudgedMarkers();
    }
    return this.requestNudge();
  };

  p['getMarkers'] = function() {
    return this.markers.slice(0);
  };

  p['removeMarker'] = function(marker) {
    var i, j, len, listenerRef, listenerRefs;
    if (marker['_omsData'] != null) {
      this['unspiderfy']();
    }
    i = this.arrIndexOf(this.markers, marker);
    if (i < 0) {
      return this;
    }
    listenerRefs = this.markerListenerRefs.splice(i, 1)[0];
    for (j = 0, len = listenerRefs.length; j < len; j++) {
      listenerRef = listenerRefs[j];
      ge.removeListener(listenerRef);
    }
    delete marker['_oms'];
    this.markers.splice(i, 1);
    if (this.isNudgingActive()) {
      this.requestNudge();
    }
    return this;
  };

  p['clearMarkers'] = function() {
    var i, j, l, len, len1, listenerRef, listenerRefs, marker, ref;
    this['unspiderfy']();
    ref = this.markers;
    for (i = j = 0, len = ref.length; j < len; i = ++j) {
      marker = ref[i];
      listenerRefs = this.markerListenerRefs[i];
      for (l = 0, len1 = listenerRefs.length; l < len1; l++) {
        listenerRef = listenerRefs[l];
        ge.removeListener(listenerRef);
      }
      delete marker['_oms'];
    }
    this.initMarkerArrays();
    return this;
  };

  p['addListener'] = function(event, func) {
    var base;
    ((base = this.listeners)[event] != null ? base[event] : base[event] = []).push(func);
    return this;
  };

  p['removeListener'] = function(event, func) {
    var i;
    i = this.arrIndexOf(this.listeners[event], func);
    if (!(i < 0)) {
      this.listeners[event].splice(i, 1);
    }
    return this;
  };

  p['clearListeners'] = function(event) {
    this.listeners[event] = [];
    return this;
  };

  p.trigger = function() {
    var args, event, func, j, len, ref, ref1, results;
    event = arguments[0], args = 2 <= arguments.length ? slice.call(arguments, 1) : [];
    ref1 = (ref = this.listeners[event]) != null ? ref : [];
    results = [];
    for (j = 0, len = ref1.length; j < len; j++) {
      func = ref1[j];
      results.push(func.apply(null, args));
    }
    return results;
  };

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

  p.spiderListener = function(marker, event) {
    var j, len, m, mPt, markerPt, markerSpiderfied, nDist, nearbyMarkerData, nonNearbyMarkers, pxSq, ref;
    markerSpiderfied = (marker['_omsData'] != null) && (marker['_omsData'].leg != null);
    if (!(markerSpiderfied && this['keepSpiderfied'])) {
      if (this['event'] === 'mouseover') {
        window.clearTimeout(p.timeout);
        p.timeout = setTimeout((function(_this) {
          return function() {
            return _this['unspiderfy']();
          };
        })(this), 3000);
      } else {
        this['unspiderfy']();
      }
    }
    if (markerSpiderfied || this.map.getStreetView().getVisible() || this.map.getMapTypeId() === 'GoogleEarthAPI' || this['minZoomLevel'] && this.map.getZoom() < this['minZoomLevel']) {
      return this.trigger('click', marker, event);
    } else {
      nearbyMarkerData = [];
      nonNearbyMarkers = [];
      nDist = this['nearbyDistance'];
      pxSq = nDist * nDist;
      markerPt = this.llToPt(marker.position);
      ref = this.markers;
      for (j = 0, len = ref.length; j < len; j++) {
        m = ref[j];
        if (!((m.map != null) && m.getVisible())) {
          continue;
        }
        mPt = this.llToPt(m.position);
        if (this.ptDistanceSq(mPt, markerPt) < pxSq) {
          nearbyMarkerData.push({
            marker: m,
            markerPt: mPt
          });
        } else {
          nonNearbyMarkers.push(m);
        }
      }
      if (nearbyMarkerData.length === 1) {
        return this.trigger('click', marker, event);
      } else {
        return this.spiderfy(nearbyMarkerData, nonNearbyMarkers);
      }
    }
  };

  p['markersNearMarker'] = function(marker, firstOnly) {
    var j, len, m, mPt, markerPt, markers, nDist, pxSq, ref, ref1, ref2;
    if (firstOnly == null) {
      firstOnly = false;
    }
    if (this.projHelper.getProjection() == null) {
      throw "Must wait for 'idle' event on map before calling markersNearMarker";
    }
    nDist = this['nearbyDistance'];
    pxSq = nDist * nDist;
    markerPt = this.llToPt(marker.position);
    markers = [];
    ref = this.markers;
    for (j = 0, len = ref.length; j < len; j++) {
      m = ref[j];
      if (m === marker || (m.map == null) || !m.getVisible()) {
        continue;
      }
      mPt = this.llToPt((ref1 = (ref2 = m['_omsData']) != null ? ref2.usualPosition : void 0) != null ? ref1 : m.position);
      if (this.ptDistanceSq(mPt, markerPt) < pxSq) {
        markers.push(m);
        if (firstOnly) {
          break;
        }
      }
    }
    return markers;
  };

  p['markersNearAnyOtherMarker'] = function() {
    var i, i1, i2, j, l, len, len1, len2, m, m1, m1Data, m2, m2Data, mData, n, nDist, pxSq, ref, ref1, ref2, results;
    if (this.projHelper.getProjection() == null) {
      throw "Must wait for 'idle' event on map before calling markersNearAnyOtherMarker";
    }
    nDist = this['nearbyDistance'];
    pxSq = nDist * nDist;
    mData = (function() {
      var j, len, ref, ref1, ref2, results;
      ref = this.markers;
      results = [];
      for (j = 0, len = ref.length; j < len; j++) {
        m = ref[j];
        results.push({
          pt: this.llToPt((ref1 = (ref2 = m['_omsData']) != null ? ref2.usualPosition : void 0) != null ? ref1 : m.position),
          willSpiderfy: false
        });
      }
      return results;
    }).call(this);
    ref = this.markers;
    for (i1 = j = 0, len = ref.length; j < len; i1 = ++j) {
      m1 = ref[i1];
      if (!((m1.map != null) && m1.getVisible())) {
        continue;
      }
      m1Data = mData[i1];
      if (m1Data.willSpiderfy) {
        continue;
      }
      ref1 = this.markers;
      for (i2 = l = 0, len1 = ref1.length; l < len1; i2 = ++l) {
        m2 = ref1[i2];
        if (i2 === i1) {
          continue;
        }
        if (!((m2.map != null) && m2.getVisible())) {
          continue;
        }
        m2Data = mData[i2];
        if (i2 < i1 && !m2Data.willSpiderfy) {
          continue;
        }
        if (this.ptDistanceSq(m1Data.pt, m2Data.pt) < pxSq) {
          m1Data.willSpiderfy = m2Data.willSpiderfy = true;
          break;
        }
      }
    }
    ref2 = this.markers;
    results = [];
    for (i = n = 0, len2 = ref2.length; n < len2; i = ++n) {
      m = ref2[i];
      if (mData[i].willSpiderfy) {
        results.push(m);
      }
    }
    return results;
  };

  p.makeHighlightListenerFuncs = function(marker) {
    return {
      highlight: (function(_this) {
        return function() {
          var icon;
          marker['_omsData'].leg.setOptions({
            strokeColor: _this['legColors']['highlighted'][_this.map.mapTypeId],
            zIndex: _this['highlightedLegZIndex']
          });
          if (marker['_omsData'].shadow != null) {
            icon = marker['_omsData'].shadow.getIcon();
            icon.fillOpacity = 0.8;
            return marker['_omsData'].shadow.setOptions({
              icon: icon
            });
          }
        };
      })(this),
      unhighlight: (function(_this) {
        return function() {
          var icon;
          marker['_omsData'].leg.setOptions({
            strokeColor: _this['legColors']['usual'][_this.map.mapTypeId],
            zIndex: _this['usualLegZIndex']
          });
          if (marker['_omsData'].shadow != null) {
            icon = marker['_omsData'].shadow.getIcon();
            icon.fillOpacity = 0.3;
            return marker['_omsData'].shadow.setOptions({
              icon: icon
            });
          }
        };
      })(this)
    };
  };

  p.spiderfy = function(markerData, nonNearbyMarkers) {
    var bodyPt, centerLl, footLl, footPt, footPts, highlightListenerFuncs, leg, lineOrigin, marker, md, nearestMarkerDatum, numFeet, spiderfiedMarkers;
    this.spiderfying = true;
    numFeet = markerData.length;
    bodyPt = this.ptAverage((function() {
      var j, len, results;
      results = [];
      for (j = 0, len = markerData.length; j < len; j++) {
        md = markerData[j];
        results.push(md.markerPt);
      }
      return results;
    })());
    footPts = numFeet >= this['circleSpiralSwitchover'] ? this.generatePtsSpiral(numFeet, bodyPt).reverse() : this.generatePtsCircle(numFeet, bodyPt);
    centerLl = this.ptToLl(bodyPt);
    spiderfiedMarkers = (function() {
      var j, len, ref, ref1, ref2, results;
      results = [];
      for (j = 0, len = footPts.length; j < len; j++) {
        footPt = footPts[j];
        footLl = this.ptToLl(footPt);
        nearestMarkerDatum = this.minExtract(markerData, (function(_this) {
          return function(md) {
            return _this.ptDistanceSq(md.markerPt, footPt);
          };
        })(this));
        marker = nearestMarkerDatum.marker;
        lineOrigin = this['lineToCenter'] ? centerLl : marker.position;
        leg = new gm.Polyline({
          map: this.map,
          path: [lineOrigin, footLl],
          strokeColor: this['legColors']['usual'][this.map.mapTypeId],
          strokeWeight: this['legWeight'],
          zIndex: this['usualLegZIndex']
        });
        marker['_omsData'] = (ref = marker['_omsData']) != null ? ref : {};
        marker['_omsData'].usualPosition = (ref1 = (ref2 = marker['_omsData']) != null ? ref2.usualPosition : void 0) != null ? ref1 : marker.position;
        marker['_omsData'].leg = leg;
        if (this['spiderfiedShadowColor']) {
          marker['_omsData'].shadow = new gm.Marker({
            position: footLl,
            map: this.map,
            clickable: false,
            zIndex: -2,
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              fillOpacity: 0.3,
              fillColor: this['spiderfiedShadowColor'],
              strokeWeight: 0,
              scale: 20
            }
          });
        }
        if (this['legColors']['highlighted'][this.map.mapTypeId] !== this['legColors']['usual'][this.map.mapTypeId]) {
          highlightListenerFuncs = this.makeHighlightListenerFuncs(marker);
          marker['_omsData'].hightlightListeners = {
            highlight: ge.addListener(marker, 'mouseover', highlightListenerFuncs.highlight),
            unhighlight: ge.addListener(marker, 'mouseout', highlightListenerFuncs.unhighlight)
          };
        }
        marker.setPosition(footLl);
        marker.setZIndex(Math.round(this['spiderfiedZIndex'] + footPt.y));
        results.push(marker);
      }
      return results;
    }).call(this);
    delete this.spiderfying;
    this.spiderfied = true;
    return this.trigger('spiderfy', spiderfiedMarkers, nonNearbyMarkers);
  };

  p['unspiderfy'] = function(markerNotToMove) {
    var j, len, listeners, marker, nonNearbyMarkers, ref, ref1, unspiderfiedMarkers;
    if (markerNotToMove == null) {
      markerNotToMove = null;
    }
    if (!((this.spiderfied != null) || (this.nudged != null))) {
      return this;
    }
    this.unspiderfying = true;
    unspiderfiedMarkers = [];
    nonNearbyMarkers = [];
    ref = this.markers;
    for (j = 0, len = ref.length; j < len; j++) {
      marker = ref[j];
      if ((marker['_omsData'] != null) && (marker['_omsData'].leg != null)) {
        marker['_omsData'].leg.setMap(null);
        if ((ref1 = marker['_omsData'].shadow) != null) {
          ref1.setMap(null);
        }
        if (marker !== markerNotToMove) {
          marker.setPosition(marker['_omsData'].usualPosition);
        }
        marker.setZIndex(null);
        listeners = marker['_omsData'].hightlightListeners;
        if (listeners != null) {
          ge.removeListener(listeners.highlight);
          ge.removeListener(listeners.unhighlight);
        }
        delete marker['_omsData'];
        unspiderfiedMarkers.push(marker);
      } else {
        nonNearbyMarkers.push(marker);
      }
    }
    delete this.unspiderfying;
    delete this.spiderfied;
    this.trigger('unspiderfy', unspiderfiedMarkers, nonNearbyMarkers);
    if (this.nudged) {
      this.requestNudge();
    }
    return this;
  };

  p.ptDistanceSq = function(pt1, pt2) {
    var dx, dy;
    dx = pt1.x - pt2.x;
    dy = pt1.y - pt2.y;
    return dx * dx + dy * dy;
  };

  p.ptAverage = function(pts) {
    var j, len, numPts, pt, sumX, sumY;
    sumX = sumY = 0;
    for (j = 0, len = pts.length; j < len; j++) {
      pt = pts[j];
      sumX += pt.x;
      sumY += pt.y;
    }
    numPts = pts.length;
    return new gm.Point(sumX / numPts, sumY / numPts);
  };

  p.llToPt = function(ll) {
    return this.projHelper.getProjection().fromLatLngToDivPixel(ll);
  };

  p.ptToLl = function(pt) {
    return this.projHelper.getProjection().fromDivPixelToLatLng(pt);
  };

  p.minExtract = function(set, func) {
    var bestIndex, bestVal, index, item, j, len, val;
    for (index = j = 0, len = set.length; j < len; index = ++j) {
      item = set[index];
      val = func(item);
      if ((typeof bestIndex === "undefined" || bestIndex === null) || val < bestVal) {
        bestVal = val;
        bestIndex = index;
      }
    }
    return set.splice(bestIndex, 1)[0];
  };

  p.arrIndexOf = function(arr, obj) {
    var i, j, len, o;
    if (arr.indexOf != null) {
      return arr.indexOf(obj);
    }
    for (i = j = 0, len = arr.length; j < len; i = ++j) {
      o = arr[i];
      if (o === obj) {
        return i;
      }
    }
    return -1;
  };

  _Class.ProjHelper = function(map) {
    return this.setMap(map);
  };

  _Class.ProjHelper.prototype = new gm.OverlayView();

  _Class.ProjHelper.prototype['draw'] = function() {};

  return _Class;

})();

module.exports = this['OverlappingMarkerSpiderfier'];

**/
