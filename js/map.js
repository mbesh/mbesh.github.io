
$(function () {
    function initMap() {
        var mapLocation = new google.maps.LatLng(45.5633041,-122.6350998);
        var pinLocation = new google.maps.LatLng(45.5624041,-122.6350998);
    
        var mapCanvas = document.getElementById('map');
        var mapOptions = {
            center: mapLocation,
            zoom: 16,
            panControl: false,
            mapTypeId: google.maps.MapTypeId.ROADMAP
        }
        var map = new google.maps.Map(mapCanvas, mapOptions);
        
        var markerImage = 'marker.png';

        var marker = new google.maps.Marker({
            position: pinLocation,
            map: map
        });

        var contentString = '<div class="info-window" style="color:black">' +
                '<h3>Beast</h3>' +
                '<div class="info-content">' +
                '<p>5425 NE 30th Ave, Portland, OR 97211<br>October 14, 2018 @ 7:00pm</p>' +
                '</div>' +
                '</div>';

        var infowindow = new google.maps.InfoWindow({
            content: contentString,
            maxWidth: 200,
            maxHeight: 150
        });
        marker.addListener('click', function () {
            infowindow.open(map, marker);
        });
    }
    
    google.maps.event.addDomListener(window, 'load', initMap);
});