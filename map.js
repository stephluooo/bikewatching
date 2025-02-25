// Set your Mapbox access token here
mapboxgl.accessToken = 'pk.eyJ1Ijoic3RlcGhsdW9vbyIsImEiOiJjbTdjZGFrazkwYXoyMnFwdjNjZTl3c254In0.vDdZpBYpGlzhycek46UudQ';

// Initialize the map
const map = new mapboxgl.Map({
  container: 'map', // ID of the div where the map will render
  style: 'mapbox://styles/mapbox/streets-v12', // Map style
  center: [-71.09415, 42.36027], // [longitude, latitude]
  zoom: 12, // Initial zoom level
  minZoom: 5, // Minimum allowed zoom
  maxZoom: 18 // Maximum allowed zoom
});

let jsonData;
let trips;
let timeFilter;
let stations;
let departuresByMinute = Array.from({ length: 1440 }, () => []);
let arrivalsByMinute = Array.from({ length: 1440 }, () => []);

  function formatTime(minutes) {
     const date = new Date(0, 0, 0, 0, minutes);  // Set hours & minutes
     return date.toLocaleString('en-US', { timeStyle: 'short' }); // Format as HH:MM AM/PM
  }

  function getCoords(station) {
    const point = new mapboxgl.LngLat(+station.lon, +station.lat);  // Convert lon/lat to Mapbox LngLat
    const { x, y } = map.project(point);  // Project to pixel coordinates
    return { cx: x, cy: y };  // Return as object for use in SVG attributes
  }

map.on('load', async () => { 

    const svg = d3.select('#map').select('svg');
    let stations = [];
    let circles;

    // Step 5.2
    const timeSlider = document.getElementById('time-slider');
    const selectedTime = document.getElementById('selected-time');
    const anyTimeLabel = document.getElementById('any-time');

    // 📍 Boston Bike Lanes
    map.addSource('boston_route', {
        type: 'geojson',
        data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson?...'
    });

    map.addLayer({
        id: 'bike-lanes',
        type: 'line',
        source: 'boston_route',
        paint: {
        'line-color': '#32D400',
        'line-width': 5,
        'line-opacity': 0.6
        }
    });

    
    // 📍 Cambridge Bike Lanes 
    map.addSource('cambridge_route', {
        type: 'geojson',
        data: 'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson'
    });

    map.addLayer({
        id: 'bike-lanes-cambridge',
        type: 'line',
        source: 'cambridge_route',
        paint: {
            'line-color': '#0077FF',  // Blue to differentiate from Boston
            'line-width': 5,
            'line-opacity': 0.6
        }
    });
    
    // Function to update circle positions when the map moves/zooms
    function updatePositions() {
        circles
            .attr('cx', d => getCoords(d).cx)
            .attr('cy', d => getCoords(d).cy);
        }
    
        // Load Bluebikes Stations JSON
        try {
            const jsonurl = 'https://dsc106.com/labs/lab07/data/bluebikes-stations.json';
            
            // Await JSON fetch and assign to global jsonData
            jsonData = await d3.json(jsonurl);
            
            console.log('Loaded JSON Data:', jsonData); // Verify structure
        } catch (error) {
            console.error('Error loading JSON:', error); // Handle errors
        }
        
        trips = await d3.csv(
            'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv',
            (trip) => {
            trip.started_at = new Date(trip.started_at);
            trip.ended_at = new Date(trip.ended_at);
            return trip;
            },
        );
        console.log('Trips:',trips)

        // Populate departuresByMinute and arrivalsByMinute
        trips.forEach((trip) => {
            let startedMinutes = minutesSinceMidnight(trip.started_at);
            departuresByMinute[startedMinutes].push(trip);
    
            let endMinutes = minutesSinceMidnight(trip.ended_at);
            arrivalsByMinute[endMinutes].push(trip);
        });
    
        
    
        let stationFlow = d3.scaleQuantize().domain([0, 1]).range([0, 0.5, 1]);
    
        stations = computeStationTraffic(jsonData.data.stations);
        console.log('Stations Array:', stations);
    
        const radiusScale = d3
            .scaleSqrt()
            .domain([0, d3.max(stations, (d) => d.totalTraffic)])
            .range([0, 25]);
    
        circles = svg.selectAll('circle')
            .data(stations, (d) => d.short_name)
            .enter()
            .append('circle')
            .attr('r', d => radiusScale(d.totalTraffic)) // Scale based on total traffic
            .attr('fill', 'steelblue')  // Circle fill color
            .attr('stroke', 'white')    // Circle border color
            .attr('stroke-width', 1)    // Circle border thickness
            .attr('opacity', 0.8)      // Circle opacity
            .style("--departure-ratio", d => stationFlow(d.departures / d.totalTraffic)) 
            .each(function(d) {
                // Add <title> for browser tooltips
                d3.select(this)
                  .append('title')
                  .text(`${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`);
            });
        
        function minutesSinceMidnight(date) {
            return date.getHours() * 60 + date.getMinutes();
        }


        function updateScatterPlot(timeFilter) {
            const filteredStations = computeStationTraffic(stations, timeFilter);
    
            timeFilter === -1 ? radiusScale.range([0, 25]) : radiusScale.range([3, 50]);
    
            // Update the scatterplot by adjusting the radius of circles
            circles
                .data(filteredStations, (d) => d.short_name)
                .join('circle') // Ensure the data is bound correctly
                .attr('r', (d) => radiusScale(d.totalTraffic)) // Update circle sizes
                .style('--departure-ratio', (d) =>
                    stationFlow(d.departures / d.totalTraffic),
                  );
        }

                // Initial position update when map loads
                updatePositions();

    // Reposition markers on map interactions
    map.on('move', updatePositions);     // Update during map movement
    map.on('zoom', updatePositions);     // Update during zooming
    map.on('resize', updatePositions);   // Update on window resize
    map.on('moveend', updatePositions);  // Final adjustment after movement ends

    function updateTimeDisplay() {
        timeFilter = Number(timeSlider.value);  // Get slider value
      
        if (timeFilter === -1) {
          selectedTime.textContent = '';  // Clear time display
          anyTimeLabel.style.display = 'block';  // Show "(any time)"
        } else {
          selectedTime.textContent = formatTime(timeFilter);  // Display formatted time
          anyTimeLabel.style.display = 'none';  // Hide "(any time)"
        }
      
        // Trigger filtering logic which will be implemented in the next step
        updateScatterPlot(timeFilter)
    }

    timeSlider.addEventListener('input', updateTimeDisplay);
    updateTimeDisplay();

});

function filterByMinute(tripsByMinute, minute) {
    if (minute === -1) {
      return tripsByMinute.flat(); // No filtering, return all trips
    }
  
    // Normalize both min and max minutes to the valid range [0, 1439]
    let minMinute = (minute - 60 + 1440) % 1440;
    let maxMinute = (minute + 60) % 1440;
  
    // Handle time filtering across midnight
    if (minMinute > maxMinute) {
      let beforeMidnight = tripsByMinute.slice(minMinute);
      let afterMidnight = tripsByMinute.slice(0, maxMinute);
      return beforeMidnight.concat(afterMidnight).flat();
    } else {
      return tripsByMinute.slice(minMinute, maxMinute).flat();
    }
}

function computeStationTraffic(stations, timeFilter = -1) {
    // Retrieve filtered trips efficiently
    const departures = d3.rollup(
      filterByMinute(departuresByMinute, timeFilter), // Efficient retrieval
      (v) => v.length,
      (d) => d.start_station_id
    );
  
    const arrivals = d3.rollup(
      filterByMinute(arrivalsByMinute, timeFilter), // Efficient retrieval
      (v) => v.length,
      (d) => d.end_station_id
    );
  
    // Update each station..
    const updatedStations = stations.map((station) => {
        let id = station.short_name;
        station.arrivals = arrivals.get(id) ?? 0;
        station.departures = departures.get(id) ?? 0;
        station.totalTraffic = station.arrivals + station.departures;
        return station;
    });

    return updatedStations;
  }