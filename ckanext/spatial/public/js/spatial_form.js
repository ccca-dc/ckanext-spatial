/* Module providing a map widget to display, edit, or capture a GeoJSON polygon geometry
 * Based on dataset_map.js with ideas from spatial_query.js
 *
 * Usage:
 * In your form snippet / template, embed a map as follows above an input {{ id }} which
 * accepts a GeoJSON geometry (e.g. the field "spatial" for the dataset extent):

{% import 'macros/form.html' as form %}

    {% with
    name=field.field_name,
    id='field-' + field.field_name,
    label=h.scheming_language_text(field.label),
    placeholder=h.scheming_language_text(field.form_placeholder),
    value=data[field.field_name],
    error=errors[field.field_name],
    classes=['control-medium'],
    is_required=h.scheming_field_required(field)
    %}

    {% call form.input_block(id, label, error, classes, is_required=is_required) %}

    {% set map_config = h.get_common_map_config() %}
    <div class="dataset-map"
        data-module="spatial-form"
        data-input_id="{{ id }}"
        data-extent="{{ value }}"
        data-module-site_url="{{ h.dump_json(h.url('/', locale='default', qualified=true)) }}"
        data-module-map_config="{{ h.dump_json(map_config) }}">
      <div id="dataset-map-container"></div>
    </div>

    {% resource 'ckanext-spatial/spatial_form' %}

    {{ form.info(text="Draw the dataset extent on the map,
       or paste a GeoJSON Polygon or Multipolygon geometry below", inline=false) }}

    <textarea id="{{ id }}" type="{{ type }}" name="{{ name }}"
        placeholder="{{ placeholder }}" rows=10 style="width:100%;">
      {{ value | empty_and_escape }}
    </textarea>

    {% endcall %}
{% endwith %}

 * {{ id }} is the id of the form input to be updated with what you draw on the map
 * {{ value }} is an existing GeoJSON geometry to be shown (editable, deletable) on the map
 * This module will replace the div shown above with:
 * - a map showing the GeoJSON geometry given as {{ value }} if existing
 * - a button "text to map", which overwrites the map with the GeoJSON geometry inside input {{ id }}
 * - a button "map to text", which overwrites the input {{ id }} with the GeoJSON geometry on the map
 * - this module loaded, providing the binding between map and form input
 *
 */
this.ckan.module('spatial-form', function (jQuery, _) {

  return {
    options: {
      table: '<table class="table table-striped table-bordered table-condensed"><tbody>{body}</tbody></table>',
      row: '<tr><th>{key}</th><td>{value}</td></tr>',
      i18n: {
      },
      styles: {
        point:{
          iconUrl: '/js/vendor/leaflet/images/marker-icon.png',
          iconSize: [14, 25],
          iconAnchor: [7, 25]
        },
        default_:{
          color: '#B52',
          weight: 1,
          opacity: 1,
          fillColor: '#FCF6CF',
          fillOpacity: 0.4
        },
      },
      default_extent:[[49, 17], [46, 9.5]]
    },


    initialize: function () {

      this.input = $('#' + this.el.data('input_id'))[0];
      this.extent = this.el.data('extent');
      this.map_id = 'dataset-map-container'; //-' + this.input;

      jQuery.proxyAll(this, /_on/);
      this.el.ready(this._onReady);

    },


    _onReady: function(){

        var map, backgroundLayer, oldExtent, drawnItems, ckanIcon;
        var ckanIcon = L.Icon.extend({options: this.options.styles.point});


        /* Initialise basic map */
        map = ckan.commonLeafletMap(
            this.map_id,
            this.options.map_config,
            {attributionControl: false}
        );
        map.fitBounds(this.options.default_extent);

        /* Add an empty layer for newly drawn items */
        var drawnItems = new L.FeatureGroup();
        map.addLayer(drawnItems);


        /* Add GeoJSON layers for any GeoJSON resources of the dataset */
        //var existingLayers = {};
        var url = window.location.href.split('dataset/edit/');

        /* Add existing extent or new layer */
        if (this.extent) {
            /* update = show existing polygon */
            oldExtent = L.geoJson(this.extent, {
              style: this.options.styles.default_,
              pointToLayer: function (feature, latLng) {
                return new L.Marker(latLng, {icon: new ckanIcon})
              }
            });
            oldExtent.addTo(map);
        }


        /* Leaflet.draw: add drawing controls for drawnItems */
        var drawControl = new L.Control.Draw({
            draw: {
                polyline: false,
                circle: false,
                marker: false,
                rectangle: {repeatMode: false}

            },
            edit: { featureGroup: drawnItems }
        });
        var drawControlGeoJson = new L.Control.Draw({
            draw: {
                polyline: false,
                circle: false,
                marker: false,
                rectangle: {repeatMode: false}

            },
            edit: false
        });
        map.addControl(drawControl);


        /* Aggregate all features in a FeatureGroup into one MultiPolygon,
         * update inputid with that Multipolygon's geometry
         */
        var featureGroupToInput = function(fg, input){
            var gj = fg.toGeoJSON().features;
            var polyarray = [];
            $.each(gj, function(index, value){ polyarray.push(value.geometry.coordinates); });
            mp = {"type": "MultiPolygon", "coordinates": polyarray};
            // TODO use input for element id
            $('#field-spatial').val(JSON.stringify(mp));
            //$("#" + input).val(JSON.stringify(mp)); // doesn't work
        };

        var fillBoundingBox = function(fg){
            var bounds = fg.getLayers()[0].getBounds();
            $('#field-iso_northBL').val(bounds._northEast.lat.toFixed(4));
            $('#field-iso_eastBL').val(bounds._northEast.lng.toFixed(4));
            $('#field-iso_southBL').val(bounds._southWest.lat.toFixed(4));
            $('#field-iso_westBL').val(bounds._southWest.lng.toFixed(4));
        };


        /* When one shape is drawn/edited/deleted, update input_id with all drawn shapes */
        map.on('draw:created', function (e) {
            var type = e.layerType,
                layer = e.layer;
            drawnItems.clearLayers();
            drawnItems.addLayer(layer);
            document.getElementById("select-extent").selectedIndex = "0";
            // To only add the latest drawn element to input #field-spatial:
            //$("#field-spatial")[0].value = JSON.stringify(e.layer.toGeoJSON().geometry);
            featureGroupToInput(drawnItems, this.input);
            fillBoundingBox(drawnItems);

            map.removeControl(drawControlGeoJson);
            map.addControl(drawControl);
        });

        map.on('draw:editstop', function(e){
            featureGroupToInput(drawnItems, this.input);
            fillBoundingBox(drawnItems);
        });

        map.on('draw:deletestop', function(e){
            featureGroupToInput(drawnItems, this.input);
            $('#field-spatial').val("");
        });

        $('#select-extent').on('change', function(e) {
            $('#field-spatial').val($("#select-extent").val());

            drawnItems.clearLayers();
            extent = L.geoJson(JSON.parse($("#select-extent").val()));
            drawnItems.addLayer(extent);

            fillBoundingBox(extent);

            map.removeControl(drawControl);
            map.addControl(drawControlGeoJson);
        });

    }
  }
});
