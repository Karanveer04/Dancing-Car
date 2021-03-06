
// @author Simon Löfving and Karanveer Singh

//Global variables
var song;
var count;
var serial;
var portName;
//Commands
var forward, back, left, right, stop;
var commandArr;
var started;

function preload(){
  portName = '/dev/ttyACM0'; //Setup connection to the arduino
  serial = new p5.SerialPort(); // make a new instance of the serialport library
  serial.open(portName); // Open the port to the arduino
}

function setup() {
  started = false; //Variable to control the loop in the drawfunction
  song = loadSound('data/song1.mp3'); //Default song
  //Initialize movement commands and convert them to a byte array.
  forward = toUTF8Array('def'); back = toUTF8Array('deb'); left = toUTF8Array('del'); right = toUTF8Array('der'); stop = toUTF8Array('dqs');
  //Add the movement commands to an array.
  commandArr = [forward, back, left, right];
  count = 0;
  noLoop(); // Stop the draw function from running in the beginning.

  // Get the BPM of the song and then run the playSong function.

}
function draw(){
  if(started){ //Check if the song has started
  var command = Math.floor((Math.random()*(commandArr.length))); //Random number from the length of the command array
  //On every other beat send a dance command to the car, else send a stop command.
  if(count % 2 == 0) {
    serial.write(commandArr[command]);
    console.log(commandArr[command]);
  }
  else{
    serial.write(stop);
    console.log("STOP  " + stop);
  }
  count++;
  song.onended(setStart); //If the song has ended, stop the loop.
}
}
//Function to control the loop of the draw function.
function setStart(){
  if(started == false){
    started = true;
    loop();
  }
  else{
    started = false;
    noLoop();
    count = 0;
    serial.write(stop);
  }
  }
  //Function to load, play and stop songs.
function keyTyped(){
  switch(key){
    case 'a':
      if(!song.isPlaying()) song = loadSound('data/song1.mp3');
      break;
    case 'b':
      if(!song.isPlaying()) song = loadSound('data/song2.mp3');
      break;
    case 'p':
      if(!song.isPlaying()) getBPM(song, playSong); //Calculate the BPM of the song and play it.
      break;
    case 's':
    if(song.isPlaying()){
      serial.write(stop);
      console.log("Stop");
      song.stop(); //Stop the song
      count = 0;
      noLoop();
    }
    break;
    default:
      noLoop();
      song.stop();
      serial.write(stop);
  }
}


function playSong(bpm){
  //Get the BPM of the song from processPeaks and divide it by 60
  //in order to get it in beats per second which will set the loop speed
  //of the draw function.
  var fps = bpm.tempo/60;
  console.log(bpm.tempo);
  frameRate(fps);
  song.play(); //Play the song
  setStart(); // Start the loop
}
/**
 * getBPM is a remake of the P5.Sound function processPeaks. It has been manipulated in
 * such a way that it returns the BPM of the chosen song.
 */
  function getBPM (song, callback) {
    var bufLen = song.buffer.length;
    var sampleRate = song.buffer.sampleRate;
    var buffer = song.buffer;
    var threshold =  0.45;
    var offlineContext = new OfflineAudioContext(1, bufLen, sampleRate);
    var source = offlineContext.createBufferSource();
    source.buffer = buffer;
    var filter = offlineContext.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 166;
    source.connect(filter);
    filter.connect(offlineContext.destination);
    source.start(0);
    offlineContext.startRendering();
    offlineContext.oncomplete = function (e) {
      var filteredBuffer = e.renderedBuffer;
      var bufferData = filteredBuffer.getChannelData(0);
      var allPeaks = getPeaksAtThreshold(bufferData, threshold);
      var intervalCounts = countIntervalsBetweenNearbyPeaks(allPeaks);
      var groups = groupNeighborsByTempo(intervalCounts, filteredBuffer.sampleRate);
      var topTempos = groups.sort(function (intA, intB) {
      return intB.count - intA.count;
      }).splice(0, 5);
      //Return the BPM of the song
      callback(topTempos[0]);
    };
};
var Peak = function (amp, i) {
  this.sampleIndex = i;
  this.amplitude = amp;
  this.tempos = [];
  this.intervals = [];
};

function getPeaksAtThreshold(data, threshold) {
  var peaksObj = {};
  for (var i = 0; i < data.length; i++) {
    if (data[i] > threshold) {
      var amp = data[i];
      var peak = new Peak(amp, i);
      peaksObj[i] = peak;
      // Skip forward ~ 1/8s to get past this peak.
      i += 6000;
    }
    i++;
  }
  return peaksObj;
}

function countIntervalsBetweenNearbyPeaks(peaksObj) {
  var intervalCounts = [];
  var peaksArray = Object.keys(peaksObj).sort();
  for (var index = 0; index < peaksArray.length; index++) {
    // find intervals in comparison to nearby peaks
    for (var i = 0; i < 10; i++) {
      var startPeak = peaksObj[peaksArray[index]];
      var endPeak = peaksObj[peaksArray[index + i]];
      if (startPeak && endPeak) {
        var startPos = startPeak.sampleIndex;
        var endPos = endPeak.sampleIndex;
        var interval = endPos - startPos;
        // add a sample interval to the startPeek in the allPeaks array
        if (interval > 0) {
          startPeak.intervals.push(interval);
        }
        // tally the intervals and return interval counts
        var foundInterval = intervalCounts.some(function (intervalCount, p) {
          if (intervalCount.interval === interval) {
            intervalCount.count++;
            return intervalCount;
          }
        });
        // store with JSON like formatting
        if (!foundInterval) {
          intervalCounts.push({
            interval: interval,
            count: 1
          });
        }
      }
    }
  }
  return intervalCounts;
}
//for processPeaks --> find tempo
function groupNeighborsByTempo(intervalCounts, sampleRate) {
  var tempoCounts = [];
  intervalCounts.forEach(function (intervalCount, i) {
    try {
      // Convert an interval to tempo
      var theoreticalTempo = Math.abs(60 / (intervalCount.interval / sampleRate));
      theoreticalTempo = mapTempo(theoreticalTempo);
      var foundTempo = tempoCounts.some(function (tempoCount) {
        if (tempoCount.tempo === theoreticalTempo)
          return tempoCount.count += intervalCount.count;
      });
      if (!foundTempo) {
        if (isNaN(theoreticalTempo)) {
          return;
        }
        tempoCounts.push({
          tempo: Math.round(theoreticalTempo),
          count: intervalCount.count
        });
      }
    } catch (e) {
      throw e;
    }
  });
  return tempoCounts;
}

// helper function
function mapTempo(theoreticalTempo) {
  // these scenarios create infinite while loop
  if (!isFinite(theoreticalTempo) || theoreticalTempo == 0) {
    return;
  }
  // Adjust the tempo to fit within the 90-180 BPM range
  while (theoreticalTempo < 90)
    theoreticalTempo *= 2;
  while (theoreticalTempo > 180 && theoreticalTempo > 90)
    theoreticalTempo /= 2;
  return theoreticalTempo;
}

//Function to turn a string into a byte array.
function toUTF8Array(str) {
    var utf8 = [];
    for (var i=0; i < str.length; i++) {
        var charcode = str.charCodeAt(i);
        if (charcode < 0x80) utf8.push(charcode);
        else if (charcode < 0x800) {
            utf8.push(0xc0 | (charcode >> 6),
                      0x80 | (charcode & 0x3f));
        }
        else if (charcode < 0xd800 || charcode >= 0xe000) {
            utf8.push(0xe0 | (charcode >> 12),
                      0x80 | ((charcode>>6) & 0x3f),
                      0x80 | (charcode & 0x3f));
        }
        // surrogate pair
        else {
            i++;
            // UTF-16 encodes 0x10000-0x10FFFF by
            // subtracting 0x10000 and splitting the
            // 20 bits of 0x0-0xFFFFF into two halves
            charcode = 0x10000 + (((charcode & 0x3ff)<<10)
                      | (str.charCodeAt(i) & 0x3ff));
            utf8.push(0xf0 | (charcode >>18),
                      0x80 | ((charcode>>12) & 0x3f),
                      0x80 | ((charcode>>6) & 0x3f),
                      0x80 | (charcode & 0x3f));
        }
    }
    return utf8;
}
