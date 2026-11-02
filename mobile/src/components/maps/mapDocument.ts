import { createMapStyle, mapTheme } from './mapTheme';
import { colors } from '../../constants/colors';
import { currentLocationIcon } from './currentLocationAsset';
import { driverCarIcon } from './driverCarAsset';

// Pinned browser renderer inside Expo's supported WebView. Style and trip data
// stay separate, so recoloring the base map never desaturates the green route.
export function createMapDocument() {
  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<link href="https://unpkg.com/maplibre-gl@5.6.2/dist/maplibre-gl.css" rel="stylesheet">
<style>html,body{margin:0;padding:0;width:100%;height:100%;background:${mapTheme.background};overflow:hidden;overscroll-behavior:none}#map{position:fixed;inset:0;margin:0;padding:0;background:${mapTheme.background};overflow:hidden}.pin{width:32px;height:32px;border:3px solid white;border-radius:50%;background:${mapTheme.accent};box-shadow:0 2px 8px #0002;display:flex;align-items:center;justify-content:center;color:white;font:700 18px sans-serif;box-sizing:border-box}.destination{border-radius:10px}.car{background:white;color:${mapTheme.accent};border-color:${mapTheme.accent}}</style>
</head><body><div id="map"></div>
<script>function send(data){if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify(data));}window.onerror=function(){send({type:'error'});};</script>
<script src="https://unpkg.com/maplibre-gl@5.6.2/dist/maplibre-gl.js" onerror="send({type:'error'})"></script>
<script>
var map,markers=[],driverMarkers={},current={},lastFit='',lastLocationRequest=null;
try {
map=new maplibregl.Map({container:'map',style:${JSON.stringify(createMapStyle())},center:[9.24,4.155],zoom:14.5,minZoom:5,maxZoom:19,attributionControl:false,pitchWithRotate:false,dragRotate:false});
map.touchZoomRotate.disableRotation();
map.on('load',function(){
  map.addSource('trip-route',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
  map.addLayer({id:'trip-route-outline',type:'line',source:'trip-route',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#FFFFFF','line-width':9}});
  map.addLayer({id:'trip-route',type:'line',source:'trip-route',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'${mapTheme.accent}','line-width':5}});
  map.addSource('driver-route',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
  map.addLayer({id:'driver-route-outline',type:'line',source:'driver-route',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'#FFFFFF','line-width':9}});
  map.addLayer({id:'driver-route',type:'line',source:'driver-route',layout:{'line-join':'round','line-cap':'round'},paint:{'line-color':'${colors.yellow}','line-width':5}});
  send({type:'ready'});update(current);
});
map.on('error',function(){send({type:'error'});});
map.on('idle',function(){if(map.areTilesLoaded())send({type:'loaded'});});
map.on('click',function(e){if(current.interactive!==false)send({type:'select',coordinate:{latitude:e.lngLat.lat,longitude:e.lngLat.lng}});});
function lnglat(p){return [p.longitude,p.latitude];}
function addPin(point,type,label){
  if(!point)return;
  var el=document.createElement('div');el.className='pin '+type;
  if(type==='car'){
    el.style.cssText='position:relative;width:46px;height:46px;border:0;background:transparent;box-shadow:none;transition:transform 80ms linear;';
    var car=document.createElement('img');car.src=${JSON.stringify(driverCarIcon)};car.alt='Driver car';car.style.cssText='width:46px;height:46px;object-fit:contain;filter:drop-shadow(0 2px 3px #0003);transform-origin:center;';el.appendChild(car);
    var bubble=document.createElement('div');bubble.textContent=label||'';bubble.style.cssText='position:absolute;bottom:50px;left:50%;transform:translateX(-50%);white-space:nowrap;padding:9px 12px;border-radius:14px;background:#FFFFFF;color:#121B26;font:600 12px sans-serif;box-shadow:0 3px 12px #0002;border-bottom:3px solid ${colors.yellow};';bubble.style.display=label?'block':'none';el.appendChild(bubble);
    return {marker:new maplibregl.Marker({element:el}).setLngLat(lnglat(point)).addTo(map),bubble:bubble,car:car,coordinate:point,heading:null};
  }
  if(type==='current-location'){
    el.style.cssText='width:24px;height:24px;border:0;background:transparent;box-shadow:none;';
    var image=document.createElement('img');image.src=${JSON.stringify(currentLocationIcon)};image.alt='My location';image.style.cssText='width:100%;height:100%;object-fit:contain;filter:drop-shadow(0 2px 3px #0002);';el.appendChild(image);
    markers.push(new maplibregl.Marker({element:el,anchor:'bottom'}).setLngLat(lnglat(point)).addTo(map));return;
  }
  el.innerHTML=type==='car'?'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 10l2-5h10l2 5M4 10h16v8H4zM6 18v3m12-3v3"/><circle cx="7" cy="14" r="1"/><circle cx="17" cy="14" r="1"/></svg>':type==='destination'?'&#9873;':'&#9679;';
  markers.push(new maplibregl.Marker({element:el}).setLngLat(lnglat(point)).addTo(map));
}
function orientDriver(driver,point,heading){
  if(!Number.isFinite(heading)){
    var dx=(point.longitude-driver.coordinate.longitude)*Math.cos(point.latitude*Math.PI/180);
    var dy=point.latitude-driver.coordinate.latitude;
    if(Math.hypot(dx,dy)>0.000001)heading=Math.atan2(dx,dy)*180/Math.PI;
  }
  if(Number.isFinite(heading)){
    driver.heading=heading;
    // The original perspective artwork faces left. Mirror it for eastbound
    // travel, keeping the car upright rather than rotating it upside down.
    var east=Math.sin(heading*Math.PI/180);
    if(Math.abs(east)>0.02)driver.car.style.transform=east>0?'scaleX(-1)':'scaleX(1)';
  }
  driver.coordinate=point;
}
function update(data){
  current=data||{};if(!map.getSource('trip-route'))return;
  markers.forEach(function(m){m.remove();});markers=[];
  var gps=current.locationFocus&&current.locationFocus.coordinate;
  var pickupAtGps=gps&&current.pickup&&Math.abs(gps.latitude-current.pickup.latitude)<0.00002&&Math.abs(gps.longitude-current.pickup.longitude)<0.00002;
  if(!pickupAtGps)addPin(current.pickup,'pickup');
  addPin(current.destination,'destination');
  if(current.locationFocus)addPin(current.locationFocus.coordinate,'current-location');
  var activeDriverIds=[];
  (current.drivers||[]).forEach(function(d,index){
    var id=d.id||String(index);activeDriverIds.push(id);
    if(!driverMarkers[id])driverMarkers[id]=addPin(d.coordinate,'car',d.arrivalLabel);
    else{driverMarkers[id].marker.setLngLat(lnglat(d.coordinate));driverMarkers[id].bubble.textContent=d.arrivalLabel||'';driverMarkers[id].bubble.style.display=d.arrivalLabel?'block':'none';}
    orientDriver(driverMarkers[id],d.coordinate,d.heading);
  });
  Object.keys(driverMarkers).forEach(function(id){if(activeDriverIds.indexOf(id)<0){driverMarkers[id].marker.remove();delete driverMarkers[id];}});
  var coords=(current.route||[]).map(lnglat);
  map.getSource('trip-route').setData({type:'FeatureCollection',features:coords.length>1?[{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:coords}}]:[]});
  var driverCoords=(current.driverRoute||[]).map(lnglat);
  var driverSource=map.getSource('driver-route');if(driverSource)driverSource.setData({type:'FeatureCollection',features:driverCoords.length>1?[{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:driverCoords}}]:[]});
  map.setPaintProperty('trip-route','line-color',current.routeColor||'${mapTheme.accent}');
  ['dragPan','scrollZoom','boxZoom','doubleClickZoom','touchZoomRotate'].forEach(function(handler){map[handler][current.interactive===false?'disable':'enable']();});
  map.touchZoomRotate.disableRotation();
  var points=coords.length?coords:[current.pickup,current.destination].filter(Boolean).map(lnglat);
  points=points.concat(driverCoords,(current.drivers||[]).map(function(d){return lnglat(d.coordinate);}));
  if(current.cameraCoordinates&&current.cameraCoordinates.length)points=current.cameraCoordinates.map(lnglat);
  var bottom=Math.min(current.cameraBottomInset||0,window.innerHeight*0.85);
  var top=Math.min((current.topInset||0)+35,Math.max(10,(window.innerHeight-bottom)*0.45));
  var padding={top:top,bottom:bottom+20,left:45,right:45};
  if(current.locationFocus && current.locationFocus.requestId!==lastLocationRequest){
    lastLocationRequest=current.locationFocus.requestId;
    map.easeTo({center:lnglat(current.locationFocus.coordinate),zoom:16,padding:padding,duration:650});
  }
  var signature=JSON.stringify([points,current.topInset,bottom,window.innerHeight]);
  if(points.length && signature!==lastFit){
    lastFit=signature;var bounds=new maplibregl.LngLatBounds(points[0],points[0]);points.forEach(function(p){bounds.extend(p);});
    map.fitBounds(bounds,{padding:padding,maxZoom:16,duration:350});
  }
}
window.updateZippMap=update;
window.zippMapCommand=function(command){if(command==='in')map.zoomIn();if(command==='out')map.zoomOut();if(command==='center'){map.easeTo({center:current.pickup?lnglat(current.pickup):[9.24,4.155],zoom:15,duration:350});}};
window.addEventListener('resize',function(){map.resize();update(current);});
} catch(error){send({type:'error'});}
</script></body></html>`;
}
