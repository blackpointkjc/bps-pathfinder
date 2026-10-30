"""Refresh pinned station geometry from official GIS; rosters supplied by user."""
import urllib.request, urllib.parse, json, re
from pathlib import Path

sources = {
 "richmond": "https://services1.arcgis.com/k3vhq11XkBNeeOfM/arcgis/rest/services/FireStation/FeatureServer/0",
 "henrico": "https://portal.henrico.gov/mapping/rest/services/Layers/Fire_Stations_and_Rescue_Squads/MapServer/0",
 "chesterfield": "https://services3.arcgis.com/TsynfzBSE6sXfoLq/arcgis/rest/services/Administrative/FeatureServer/19",
}
def read(base):
 url = base + "/query?" + urllib.parse.urlencode(dict(outFields="*",where="1=1",f="json",outSR=4326))
 data = json.load(urllib.request.urlopen(url,timeout=20))
 assert data.get("features"), data.get("error")
 return data["features"]
gis = {key:read(value) for key,value in sources.items()}
richmond = {
1:(1,"Engine 1, Truck 2, Battalion Chief 1"),5:(3,"Engine 5"),6:(3,"Engine 6"),8:(1,"Engine 8"),
10:(2,"Engine 10, Truck 3, Rescue 2"),11:(1,"Engine 11"),12:(2,"Engine 12, Shift Safety Officer"),
13:(3,"Engine 13, Truck 5, Water Rescue 1 & 2"),14:(1,"Engine 14, Truck 6"),15:(1,"Engine 15"),
16:(2,"Engine 16"),17:(3,"Engine 17, Brush 1, Battalion Chief 3"),18:(2,"Engine 18, Truck 7, Battalion Chief 2"),
19:(2,"Engine 19, Brush 2"),20:(4,"Engine 20, Water Rescue 3"),21:(3,"Engine 21, Truck 10, Foam 1"),
22:(4,"Engine 22, Truck 8, Haz-Mat 1 & 2"),23:(4,"Engine 23, Rescue 1, Battalion Chief 4"),
24:(4,"Engine 24, Truck 9"),25:(4,"Engine 25")}
henrico_names = "Azalea|Darbytown|Highland Springs|Varina|Lakeside|Eastover Gardens|Glenwood Farms|Tuckahoe|Regency|Crestview|North Run|West End Manor|Gayton|Elko|Glen Allen|Shady Grove|Mooreland Farms|Glendale|Short Pump|Staples Mill|Magnolia Ridge|Westerre|Bungalow City".split("|")
henrico_units = [
"Engine 301, Truck 301, Medic 301, Heavy Rescue 301, Fuel 301",
"Engine 302, Fire Medic 302, Brush 302, EMS 302, Marine Unit",
"Engine 303, Brush 303, Medic 303, Ambulance 389, Battalion Chief 302",
"Engine 304, Medic 304, Tanker 304, Brush 304",
"Engine 305, Medic 305, Battalion Chief 303",
"Engine 306, Truck 306, Medic 306",
"Engine 307, Medic 307, Air Utility 307",
"Engine 308, Attack Pumper 308, Reserve Engine",
"Engine 309, Medic 9, Ambulance 388",
"Engine 310, Truck 310","Engine 311, Medic 311",
"Engine 312, Truck 312, Medic 312, EMS 1",
"Engine 313, Rescue 313, Medic 313","Engine 314, Tanker 314, Medic 314",
"Engine 315, Tanker 315, Brush 315, Medic 315; MCI Support Team",
"Engine 316, Medic 316, Brush 316",
"Engine 317, SR4, SR1, boats; Search and Rescue Dive Team",
"Engine 318, Squad 318, Tanker 318, Brush 318",
"Engine 319, Medic 319, Truck 319; Robotics Response Team",
"Engine 320, Medic 320",
"Engine 321, Rescue 321, District Chief 310, HazMat 1, 2 & 3",
"Engine 322, Truck 322, Medic 322, Battalion Chief 301","Engine 323, Medic 323"]
cc_text = """1|Chester|4325 Old Hundred Road|Chester, VA 23831
2|Manchester|7541 Hull Street Road|North Chesterfield, VA 23235
3|Bensley|2836 Dundas Road|North Chesterfield, VA 23235
4|Bon Air|2600 Polo Parkway|Midlothian, VA 23113
5|Midlothian|13900 Midlothian Turnpike|Midlothian, VA 23113
6|Enon|1920 E Hundred Road|Chesterfield, VA 23832
7|Clover Hill|13810 Hull Street Road|Midlothian, VA 23112
8|Matoaca|6612 Hickory Road|South Chesterfield, VA 23803
9|Buford|8001 Buford Court|North Chesterfield, VA 23235
10|Wagstaff|2101 Adkins Road|North Chesterfield, VA 23235
11|Dale|5811 Ironbridge Road|North Chesterfield, VA 23235
12|Ettrick|21200 Chesterfield Avenue|South Chesterfield, VA 23803
13|Phillips|10630 River Road|Chesterfield, VA 23832
14|Dutch Gap|2711 W Hundred Road|Chester, VA 23831
15|Airport|7300 Airfield Drive|North Chesterfield, VA 23237
16|Swift Creek|3030 Water Cove Road|Midlothian, VA 23112
17|Centralia|9501 Chester Road|North Chesterfield, VA 23237
18|Rivers Bend|901 Bermuda Hundred Road|Chester, VA 23831
19|Winterpock|14010 Beach Road|Chesterfield, VA 23838
20|Courthouse Road|201 Courthouse Road|North Chesterfield, VA 23236
21|Harrowgate Road|16901 Harrowgate Road|South Chesterfield, VA 23834
24|Manchester Volunteer Rescue Squad – Station 1|3500 Courthouse Road|North Chesterfield, VA 23236
25|Magnolia Green|6730 Woolridge Road|Moseley, VA 23120"""
rescue = [
("bbvrs-main",200,"Bensley Bermuda Volunteer Rescue Squad – Main Base","2500 Rio Vista Street, Chester, VA 23831"),
("bbvrs-south",85,"Bensley Bermuda Volunteer Rescue Squad – South","16001 Walthall Industrial Parkway, South Chesterfield, VA 23834"),
("ettrick-matoaca",104,"Ettrick-Matoaca Volunteer Rescue Squad","5711 River Road, South Chesterfield, VA 23834"),
("forest-view-3",232,"Forest View Volunteer Rescue Squad – Station 3","8008 Midlothian Turnpike, North Chesterfield, VA 23235"),
("forest-view-5",22,"Forest View Volunteer Rescue Squad – Station 5","13420 Midlothian Turnpike, Midlothian, VA 23112"),
("manchester-2",219,"Manchester Volunteer Rescue Squad – Station 2","7810 Winterpock Road, Chesterfield, VA 23832")]
stations=[]
def add(id,name,agency,kind,address,g,**extra):
 stations.append(dict(id=id,name=name,agency=agency,kind=kind,address=address,lat=g["y"],lng=g["x"],coordinateSource=sources[agency],**extra))
for f in gis["richmond"]:
 a=f["attributes"];number=a["StationNumber"]
 if number=="HQ": continue
 n=int(number); battalion,companies=richmond[n]
 add("rfd-"+number,"Richmond Fire Station "+number,"richmond","fire",a["Address"]+", Richmond, VA",f["geometry"],number=n,battalion=battalion,companies=companies,detailsSource="User-supplied Richmond company roster")
for f in gis["henrico"]:
 a=f["attributes"];n=int(a.get("STATION") or 0)
 address=a["ADDRESS"]+", "+a["CITYSTATE"].title()+", VA "+a["ZIP"]
 if n:
  add("hfd-"+str(n),"Henrico Fire Station "+str(n)+" – "+henrico_names[n-1],"henrico","fire",address,f["geometry"],number=n,companies=henrico_units[n-1],detailsSource="https://henrico.gov/fire/firehouses/")
 else:
  add("henrico-rescue-"+str(a["OBJECTID"]),a["NAME"].title(),"henrico","rescue",address,f["geometry"],companies="Volunteer rescue / EMS")
cc_by_num={int(re.search(r"Station (\d+)",f["attributes"]["PublicPtName"]).group(1)):f for f in gis["chesterfield"] if f["attributes"]["PublicPtType"]=="FS"}
cc_by_id={f["attributes"]["OBJECTID"]:f for f in gis["chesterfield"]}
for line in cc_text.splitlines():
 number,name,street,city=line.split("|");n=int(number)
 f=cc_by_id[144] if n==24 else cc_by_num[n]
 add("cfd-"+number,"Chesterfield Station "+number+" – "+name,"chesterfield","fire_rescue" if n==24 else "fire",street+", "+city,f["geometry"],number=n,companies="Volunteer rescue / EMS" if n==24 else "Fire and EMS station",detailsSource="User-supplied Chesterfield station roster")
for id,gis_id,name,address in rescue:
 add(id,name,"chesterfield","rescue",address,cc_by_id[gis_id]["geometry"],companies="Volunteer rescue / EMS",detailsSource="User-supplied rescue-squad roster")
assert len(stations)==75,len(stations)
Path("src/data").mkdir(exist_ok=True)
Path("src/data/emergencyStations.json").write_text(json.dumps(dict(verifiedAt="2026-10-29",sources=sources,stations=stations),indent=2)+"\n")
print("Saved",len(stations),"station locations with official coordinates")
