import {Page} from 'ionic-angular';
import {ConferenceData} from '../../providers/conference-data';

@Page({
  templateUrl: 'build/pages/map/map.html'
})
export class MapPage {
  constructor(private confData: ConferenceData) {}

  onPageLoaded() {
    this.confData.getMap().subscribe(mapData => {
      let mapEle = document.getElementById('map');

      let map = new google.maps.Map(mapEle, {
        // TODO: It's unfortunate that MapOptions.center is typed as only accepting
        // a LatLng, because using a LatLngLiteral (which we have) also works.
        // Temporarily need to kludge TypeScript around this.
        center: <any> mapData.find(d => d.center),
        zoom: 16
      });

      mapData.forEach(markerData => {
        let infoWindow = new google.maps.InfoWindow({
          content: `<h5>${markerData.name}</h5>`
        });

        let marker = new google.maps.Marker({
          // TODO: It's unfortunate that MarkerOptions.position is typed as only accepting
          // a LatLng, because using a LatLngLiteral (which we have) also works.
          // Temporarily need to kludge TypeScript around this.
          position: <any> markerData,
          map: map,
          title: markerData.name
        });

        marker.addListener('click', () => {
          infoWindow.open(map, marker);
        });
      });

      google.maps.event.addListenerOnce(map, 'idle', () => {
        mapEle.classList.add('show-map');
      });

    });
  }
}
