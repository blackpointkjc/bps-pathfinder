import { confirmInApp } from '@/lib/inAppDialog';
import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Shield, MapPin, Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Search, Mail, Calendar, UserCheck, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";


import {
  MobileResponsiveDialog,
  MobileResponsiveDialogContent,
  MobileResponsiveDialogHeader,
  MobileResponsiveDialogTitle,
} from "../components/MobileResponsiveDialog";
import { Checkbox } from "@/components/ui/checkbox";
import { MapContainer, TileLayer, Marker, Circle, Polygon, CircleMarker, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { format, parseISO } from 'date-fns';
import { invalidateAppDirectory, listDirectoryDivisions, listDirectoryUsers } from '@/lib/appDirectory';
import { isClientAccount } from '@/lib/directoryUtils';

// Fix leaflet default marker icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

function MapUpdater({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.setView(center, zoom);
    }
  }, [center, zoom, map]);
  return null;
}

function BoundaryPointEditor({ enabled, points, onAddPoint }) {
  useMapEvents({
    click(event) {
      if (!enabled) return;
      onAddPoint({ lat: event.latlng.lat, lng: event.latlng.lng });
    },
  });
  return (
    <>
      {(points || []).map((point, index) => (
        <CircleMarker
          key={`${point.lat}-${point.lng}-${index}`}
          center={[point.lat, point.lng]}
          radius={5}
          pathOptions={{ color: '#fbbf24', fillColor: '#fbbf24', fillOpacity: 1 }}
        />
      ))}
      {(points || []).length >= 3 && (
        <Polygon
          positions={points.map(point => [point.lat, point.lng])}
          pathOptions={{ color: '#fbbf24', fillColor: '#fbbf24', fillOpacity: 0.18, weight: 3 }}
        />
      )}
    </>
  );
}

export default function AdminLocations({ embedded = false }) {
  const [showDialog, setShowDialog] = useState(false);
  const [editingLocation, setEditingLocation] = useState(null);
  // Removed selectedDivision state as per changes to UI with Tabs
  const [formData, setFormData] = useState({
    site_name: "",
    address: "",
    site_email: "",
    assigned_client_email: "",
    assigned_supervisors: [],
    latitude: null,
    longitude: null,
    division: "",
    subdivision: "",
    time_zone: "America/New_York",
    active: true,
    contract_start_date: "",
    contract_end_date: "",
    is_special_event: false,
    site_bill_rate: null,
    site_bill_rate_holiday_armed: null,
    site_bill_rate_holiday_unarmed: null,
    site_bill_rate_rush_armed: null,
    site_bill_rate_rush_unarmed: null,
    site_bill_rate_unarmed: null,
    max_hours_per_week: null,
    shift_start_time: "",
    shift_end_time: "",
    preferred_shift_length: null,
    min_officers_per_shift: null,
    max_officers_per_shift: null,
    coverage_days: [],
    coverage_notes: "",
    exclude_from_auto_schedule: false,
    day_specific_settings: {},
    notes: "",
    geofence_enabled: false,
    allow_clock_in_anywhere: false,
    geofence_radius_meters: 100,
    geofence_polygon: [],
    property_monitoring_enabled: false,
    property_monitoring_boundary_type: 'circle',
    property_monitoring_description: '',
    auto_dispatch_enabled: false,
    auto_dispatch_mode: 'shadow',
    auto_dispatch_response_radius_miles: 5,
    auto_dispatch_required_units: 1,
    auto_dispatch_backup_required: false,
    auto_dispatch_required_qualifications: [],
    auto_dispatch_required_equipment: [],
    auto_dispatch_required_ranks: [],
    auto_dispatch_acknowledgement_seconds: 120,
    auto_dispatch_escalation_seconds: 300,
    auto_dispatch_recheck_seconds: 60,
    property_safety_warnings: '',
    property_access_instructions: '',
  });
  const [geocoding, setGeocoding] = useState(false);
  const [drawingBoundary, setDrawingBoundary] = useState(false);
  const [mapCenter, setMapCenter] = useState([37.5407, -77.4360]); // Richmond, VA default
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const hasAccess = user?.role === 'admin' || user?.additional_roles?.includes('support') || user?.additional_roles?.includes('support_staff') || user?.additional_roles?.includes('full_access');

  const { data: divisions = [] } = useQuery({
    queryKey: ['directoryDivisions', 'adminLocations'],
    queryFn: () => listDirectoryDivisions('division_name', 1000),
    enabled: hasAccess,
    initialData: [],
  });

  const { data: locations = [], isLoading: locationsLoading, error: locationsError } = useQuery({
    queryKey: ['adminManagedLocations'],
    queryFn: async () => {
      const response = await base44.functions.invoke('manageLocations', { action: 'list' });
      const payload = response?.data || response || {};
      if (payload.error) throw new Error(payload.error);
      return Array.isArray(payload.locations) ? payload.locations : [];
    },
    enabled: hasAccess,
    initialData: [],
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const { data: directoryUsers = [] } = useQuery({
    queryKey: ['directoryUsers', 'adminLocations'],
    queryFn: () => listDirectoryUsers('last_name', 1000),
    enabled: hasAccess,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    initialData: [],
  });
  const clientUsers = directoryUsers.filter(isClientAccount);
  const supervisorUsers = directoryUsers.filter(u => (u.additional_roles || []).map(r => String(r).toLowerCase()).includes('supervisor'));

  const syncClientLocationAssignments = async () => {
    const result = await base44.functions.invoke('manageClientAssignments', { action: 'sync_all' });
    const payload = result?.data || result || {};
    if (payload.error) throw new Error(payload.error);
  };

  const createLocationMutation = useMutation({
    mutationFn: async (data) => {
      const response = await base44.functions.invoke('manageLocations', { action: 'create', data });
      const payload = response?.data || response || {};
      if (payload.error) throw new Error(payload.error);
      return payload.location;
    },
    onSuccess: async () => {
      await syncClientLocationAssignments().catch(error => console.warn('Client location sync failed:', error?.message));
      invalidateAppDirectory();
      queryClient.invalidateQueries({ queryKey: ['adminManagedLocations'] });
      queryClient.invalidateQueries({ queryKey: ['directoryUsers'] });

      setShowDialog(false);
      setEditingLocation(null);
      resetForm();
    },
    onError: (error) => alert(`Unable to create location: ${error.message}`),
  });

  const updateLocationMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      const response = await base44.functions.invoke('manageLocations', { action: 'update', id, data });
      const payload = response?.data || response || {};
      if (payload.error) throw new Error(payload.error);
      return payload.location;
    },
    onSuccess: async () => {
      await syncClientLocationAssignments().catch(error => console.warn('Client location sync failed:', error?.message));
      invalidateAppDirectory();
      queryClient.invalidateQueries({ queryKey: ['adminManagedLocations'] });
      queryClient.invalidateQueries({ queryKey: ['directoryUsers'] });

      setShowDialog(false);
      setEditingLocation(null);
      resetForm();
    },
    onError: (error) => alert(`Unable to update location: ${error.message}`),
  });

  const deleteLocationMutation = useMutation({
    mutationFn: async (id) => {
      const response = await base44.functions.invoke('manageLocations', { action: 'delete', id });
      const payload = response?.data || response || {};
      if (payload.error) throw new Error(payload.error);
      return payload;
    },
    onSuccess: async () => {
      await syncClientLocationAssignments().catch(error => console.warn('Client location sync failed:', error?.message));
      invalidateAppDirectory();
      queryClient.invalidateQueries({ queryKey: ['adminManagedLocations'] });
      queryClient.invalidateQueries({ queryKey: ['directoryUsers'] });
    },
    onError: (error) => alert(`Unable to delete location: ${error.message}`),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, active }) => {
      const response = await base44.functions.invoke('manageLocations', { action: 'update', id, data: { active } });
      const payload = response?.data || response || {};
      if (payload.error) throw new Error(payload.error);
      return payload.location;
    },
    onSuccess: () => {
      invalidateAppDirectory();
      queryClient.invalidateQueries({ queryKey: ['adminManagedLocations'] });
    },
    onError: (error) => alert(`Unable to change location status: ${error.message}`),
  });

  const resetForm = () => {
    setFormData({
      site_name: "",
      address: "",
      site_email: "",
      latitude: null,
      longitude: null,
      division: "",
      subdivision: "",
      time_zone: "America/New_York",
      active: true,
      contract_start_date: "",
      contract_end_date: "",
      notes: "",
      assigned_client_email: "",
      assigned_supervisors: [],
      is_special_event: false,
      site_bill_rate: null,
      site_bill_rate_holiday_armed: null,
      site_bill_rate_holiday_unarmed: null,
      site_bill_rate_rush_armed: null,
      site_bill_rate_rush_unarmed: null,
      site_bill_rate_unarmed: null,
      max_hours_per_week: null,
      shift_start_time: "",
      shift_end_time: "",
      preferred_shift_length: null,
      min_officers_per_shift: null,
      max_officers_per_shift: null,
      coverage_days: [],
      coverage_notes: "",
      exclude_from_auto_schedule: false,
      geofence_enabled: false,
      allow_clock_in_anywhere: false,
      geofence_radius_meters: 100,
      geofence_polygon: [],
      property_monitoring_enabled: false,
      property_monitoring_boundary_type: 'circle',
      property_monitoring_description: '',
      auto_dispatch_enabled: false,
      auto_dispatch_mode: 'shadow',
      auto_dispatch_response_radius_miles: 5,
      auto_dispatch_required_units: 1,
      auto_dispatch_backup_required: false,
      auto_dispatch_required_qualifications: [],
      auto_dispatch_required_equipment: [],
      auto_dispatch_required_ranks: [],
      auto_dispatch_acknowledgement_seconds: 120,
      auto_dispatch_escalation_seconds: 300,
      auto_dispatch_recheck_seconds: 60,
      property_safety_warnings: '',
      property_access_instructions: '',
    });
    setDrawingBoundary(false);
    setMapCenter([37.5407, -77.4360]);
  };

  const geocodeAddress = async () => {
    if (!formData.address) return;

    setGeocoding(true);
    try {
      // Using Nominatim (OpenStreetMap) geocoding service - free and no API key needed
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(formData.address)}`
      );
      const data = await response.json();

      if (data && data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lng = parseFloat(data[0].lon);

        setFormData({
          ...formData,
          latitude: lat,
          longitude: lng
        });
        setMapCenter([lat, lng]);
      } else {
        alert('Address not found. Please try a more specific address or enter coordinates manually.');
      }
    } catch (error) {
      console.error('Geocoding error:', error);
      alert('Failed to geocode address. Please enter coordinates manually.');
    } finally {
      setGeocoding(false);
    }
  };

  const handleEdit = (location) => {
    setEditingLocation(location.id);
    setFormData({
      site_name: location.site_name,
      address: location.address,
      site_email: location.site_email || "",
      assigned_client_email: location.assigned_client_email || "",
      assigned_supervisors: location.assigned_supervisors || [],
      latitude: location.latitude,
      longitude: location.longitude,
      division: location.division || "",
      subdivision: location.subdivision || "",
      time_zone: location.time_zone || "America/New_York",
      active: location.active !== false,
      contract_start_date: location.contract_start_date || "",
      contract_end_date: location.contract_end_date || "",
      is_special_event: location.is_special_event || false,
      site_bill_rate: location.site_bill_rate || null,
      site_bill_rate_holiday_armed: location.site_bill_rate_holiday_armed || null,
      site_bill_rate_holiday_unarmed: location.site_bill_rate_holiday_unarmed || null,
      site_bill_rate_rush_armed: location.site_bill_rate_rush_armed || null,
      site_bill_rate_rush_unarmed: location.site_bill_rate_rush_unarmed || null,
      site_bill_rate_unarmed: location.site_bill_rate_unarmed || null,
      max_hours_per_week: location.max_hours_per_week || null,
      shift_start_time: location.shift_start_time || "",
      shift_end_time: location.shift_end_time || "",
      preferred_shift_length: location.preferred_shift_length || null,
      min_officers_per_shift: location.min_officers_per_shift || null,
      max_officers_per_shift: location.max_officers_per_shift || null,
      coverage_days: location.coverage_days || [],
      coverage_notes: location.coverage_notes || "",
      exclude_from_auto_schedule: location.exclude_from_auto_schedule || false,
      day_specific_settings: location.day_specific_settings || {},
      notes: location.notes || "",
      geofence_enabled: location.geofence_enabled || false,
      allow_clock_in_anywhere: location.allow_clock_in_anywhere || false,
      geofence_radius_meters: location.geofence_radius_meters || 100,
      geofence_polygon: location.geofence_polygon || location.property_monitoring_polygon || [],
      property_monitoring_enabled: location.property_monitoring_enabled || false,
      property_monitoring_boundary_type: location.property_monitoring_boundary_type || 'circle',
      property_monitoring_description: location.property_monitoring_description || '',
      auto_dispatch_enabled: location.auto_dispatch_enabled === true,
      auto_dispatch_mode: location.auto_dispatch_mode || 'shadow',
      auto_dispatch_response_radius_miles: location.auto_dispatch_response_radius_miles || 5,
      auto_dispatch_required_units: location.auto_dispatch_required_units || 1,
      auto_dispatch_backup_required: location.auto_dispatch_backup_required === true,
      auto_dispatch_required_qualifications: location.auto_dispatch_required_qualifications || [],
      auto_dispatch_required_equipment: location.auto_dispatch_required_equipment || [],
      auto_dispatch_required_ranks: location.auto_dispatch_required_ranks || [],
      auto_dispatch_acknowledgement_seconds: location.auto_dispatch_acknowledgement_seconds || 120,
      auto_dispatch_escalation_seconds: location.auto_dispatch_escalation_seconds || 300,
      auto_dispatch_recheck_seconds: location.auto_dispatch_recheck_seconds || 60,
      property_safety_warnings: location.property_safety_warnings || '',
      property_access_instructions: location.property_access_instructions || '',
    });
    if (location.latitude && location.longitude) {
      setMapCenter([location.latitude, location.longitude]);
    }
    setShowDialog(true);
  };

  const addBoundaryPoint = (point) => {
    const next = [...(formData.geofence_polygon || []), point];
    setFormData(prev => ({
      ...prev,
      geofence_polygon: next,
      property_monitoring_boundary_type: next.length >= 3 ? 'polygon' : prev.property_monitoring_boundary_type,
    }));
  };

  const undoBoundaryPoint = () => {
    const next = (formData.geofence_polygon || []).slice(0, -1);
    setFormData(prev => ({ ...prev, geofence_polygon: next }));
  };

  const clearBoundary = () => {
    setFormData(prev => ({ ...prev, geofence_polygon: [], property_monitoring_boundary_type: 'circle' }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Track site rate changes for audit
    let siteRateHistory = formData.site_rate_history || [];
    if (editingLocation) {
      const existingLocation = locations.find(l => l.id === editingLocation);
      if (existingLocation && existingLocation.site_bill_rate !== formData.site_bill_rate) {
        siteRateHistory = [
          ...(existingLocation.site_rate_history || []),
          {
            rate: formData.site_bill_rate,
            effective_date: format(new Date(), 'yyyy-MM-dd'),
            changed_by: user.email
          }
        ];
      }
    } else if (formData.site_bill_rate) {
      siteRateHistory = [{
        rate: formData.site_bill_rate,
        effective_date: format(new Date(), 'yyyy-MM-dd'),
        changed_by: user.email
      }];
    }
    
    const sharedBoundary = (formData.geofence_polygon || []).filter(point => Number.isFinite(Number(point?.lat)) && Number.isFinite(Number(point?.lng)));
    const data = {
      ...formData,
      geofence_polygon: sharedBoundary,
      property_monitoring_polygon: sharedBoundary,
      property_monitoring_boundary_type: sharedBoundary.length >= 3 ? 'polygon' : 'circle',
      latitude: formData.latitude ? parseFloat(formData.latitude) : null,
      longitude: formData.longitude ? parseFloat(formData.longitude) : null,
      assigned_client_email: formData.assigned_client_email === "" ? null : formData.assigned_client_email,
      assigned_supervisors: formData.assigned_supervisors.length > 0 ? formData.assigned_supervisors : null,
      max_hours_per_week: formData.max_hours_per_week ? parseFloat(formData.max_hours_per_week) : null,
      site_bill_rate: formData.site_bill_rate ? parseFloat(formData.site_bill_rate) : null,
      site_rate_history: siteRateHistory
    };

    if (editingLocation) {
      updateLocationMutation.mutate({ id: editingLocation, data });
    } else {
      createLocationMutation.mutate(data);
    }
  };

  const handleDelete = async (id) => {
    if (await confirmInApp('Are you sure you want to delete this location?')) {
      deleteLocationMutation.mutate(id);
    }
  };

  const handleToggleActive = (location) => {
    toggleActiveMutation.mutate({ id: location.id, active: !location.active });
  };

  useEffect(() => {
    // Only update map center if both latitude and longitude are valid numbers
    if (typeof formData.latitude === 'number' && typeof formData.longitude === 'number' && !isNaN(formData.latitude) && !isNaN(formData.longitude)) {
      setMapCenter([formData.latitude, formData.longitude]);
    }
  }, [formData.latitude, formData.longitude]);

  if (!hasAccess) {
    return (
      <div className="p-8 text-center">
        <Shield className="w-16 h-16 mx-auto mb-4 text-slate-400" />
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Access Required</h2>
        <p className="text-slate-600">You don't have permission to access this page.</p>
      </div>
    );
  }

  const activeLocations = locations?.filter(loc => loc.active !== false) || [];
  const inactiveLocations = locations?.filter(loc => !loc.active) || [];

  return (
    <div className={embedded ? "min-h-0 p-0 pb-8" : "min-h-screen p-3 pb-24 sm:p-4 md:p-8"}>
      <div className={`${embedded ? 'w-full' : 'mx-auto max-w-6xl'} space-y-5 sm:space-y-8`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-8 h-8 text-amber-600" />
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Manage Locations</h1>
              <p className="text-slate-600">Add, edit, or remove patrol sites</p>
            </div>
          </div>
          <Button
            onClick={() => {
              setEditingLocation(null);
              resetForm();
              setShowDialog(true);
            }}
            className="w-full bg-blue-600 hover:bg-blue-700 sm:w-auto"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Location
          </Button>
        </div>

        {locationsLoading && (
          <Card className="border border-blue-200 bg-blue-50">
            <CardContent className="p-4 text-sm text-blue-900">Loading locations...</CardContent>
          </Card>
        )}
        {locationsError && (
          <Card className="border border-red-300 bg-red-50">
            <CardContent className="p-4 text-sm text-red-800">
              Unable to load locations: {locationsError.message}. Refresh this page to retry.
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="active" className="space-y-6">
          <TabsList className="grid h-auto w-full grid-cols-1 gap-1 border border-slate-200 bg-white p-1 sm:grid-cols-2">
            <TabsTrigger value="active" className="data-[state=active]:bg-green-50 data-[state=active]:text-green-900">
              <MapPin className="w-4 h-4 mr-2" />
              Active Sites ({activeLocations.length})
            </TabsTrigger>
            <TabsTrigger value="inactive" className="data-[state=active]:bg-red-50 data-[state=active]:text-red-900">
              <MapPin className="w-4 h-4 mr-2" />
              Inactive Sites ({inactiveLocations.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active">
            <Card className="border-none shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-green-600" />
                  Active Locations ({activeLocations.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {activeLocations.map((location) => (
                    <div key={location.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3 transition-shadow hover:shadow-md sm:p-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <h3 className="font-bold text-slate-900 text-lg">{location.site_name}</h3>
                            <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200">
                              Active
                            </Badge>
                            {location.subdivision && (
                              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                {location.division} - {location.subdivision}
                              </Badge>
                            )}
                            {!location.subdivision && location.division && (
                              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                {location.division}
                              </Badge>
                            )}
                            {location.assigned_client_email && (() => {
                              const client = clientUsers?.find(c => c.email === location.assigned_client_email);
                              const clientName = client?.first_name && client?.last_name 
                                ? `${client.first_name} ${client.last_name}`
                                : location.assigned_client_email;
                              return (
                                <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                                  Client Portal: {clientName}
                                </Badge>
                              );
                            })()}
                            {location.assigned_supervisors && location.assigned_supervisors.length > 0 && (
                                <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200">
                                  {location.assigned_supervisors.length} Supervisor{location.assigned_supervisors.length > 1 ? 's' : ''}
                                </Badge>
                            )}
                            {location.is_special_event && (
                              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                                Special Event
                              </Badge>
                            )}
                            {location.geofence_enabled && (
                              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                                <Target className="w-3 h-3 mr-1" />
                                Geofence
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-slate-600 mb-1">
                            <MapPin className="w-3 h-3 inline mr-1" />
                            {location.address}
                          </p>
                          {location.site_email && (
                            <p className="text-sm text-blue-600 mb-1">
                              <Mail className="w-3 h-3 inline mr-1" />
                              {location.site_email}
                            </p>
                          )}
                          {(location.contract_start_date || location.contract_end_date) && (
                            <p className="text-xs text-slate-600 mt-2">
                              <Calendar className="w-3 h-3 inline mr-1" />
                              Contract: {location.contract_start_date ? format(parseISO(location.contract_start_date), 'MMM d, yyyy') : 'N/A'} - {location.contract_end_date ? format(parseISO(location.contract_end_date), 'MMM d, yyyy') : 'N/A'}
                            </p>
                          )}
                          {location.latitude && location.longitude && (
                            <p className="text-xs text-slate-500">
                              Coordinates: {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)} • 165 ft clock-in radius
                            </p>
                          )}
                          {(location.site_bill_rate || location.site_bill_rate_unarmed) && (
                            <div className="text-sm font-semibold text-green-700 space-y-0.5 mt-2">
                              {location.site_bill_rate && <p>Armed: ${location.site_bill_rate.toFixed(2)}/hr</p>}
                              {location.site_bill_rate_unarmed && <p>Unarmed: ${location.site_bill_rate_unarmed.toFixed(2)}/hr</p>}
                              {location.site_bill_rate_holiday_armed && <p className="text-orange-600">Holiday Armed: ${location.site_bill_rate_holiday_armed.toFixed(2)}/hr</p>}
                              {location.site_bill_rate_rush_armed && <p className="text-red-600">Rush Armed: ${location.site_bill_rate_rush_armed.toFixed(2)}/hr</p>}
                            </div>
                          )}
                          {location.max_hours_per_week && (
                            <p className="text-xs text-slate-500">
                              Max Hours/Week: {location.max_hours_per_week}
                            </p>
                          )}
                          {location.notes && (
                            <p className="text-xs text-slate-600 mt-2 italic">{location.notes}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleActive(location)}
                            title="Deactivate"
                          >
                            <ToggleRight className="w-5 h-5 text-green-600" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEdit(location)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDelete(location.id)}
                            className="text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {activeLocations.length === 0 && (
                    <p className="text-center text-slate-500 py-8">No active locations. Add your first patrol site.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="inactive">
            <Card className="border-none shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-red-600" />
                  Inactive Locations ({inactiveLocations.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {inactiveLocations.map((location) => (
                    <div key={location.id} className="p-5 bg-red-50 rounded-lg border border-red-200 opacity-75">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-bold text-slate-900 text-lg">{location.site_name}</h3>
                            <Badge variant="outline" className="bg-red-100 text-red-800 border-red-300">
                              Inactive
                            </Badge>
                            {location.subdivision && (
                              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                {location.division} - {location.subdivision}
                              </Badge>
                            )}
                            {!location.subdivision && location.division && (
                              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                {location.division}
                              </Badge>
                            )}
                            {location.assigned_client_email && (() => {
                              const client = clientUsers?.find(c => c.email === location.assigned_client_email);
                              const clientName = client?.first_name && client?.last_name 
                                ? `${client.first_name} ${client.last_name}`
                                : location.assigned_client_email;
                              return (
                                <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                                  Client Portal: {clientName}
                                </Badge>
                              );
                            })()}
                            {location.assigned_supervisors && location.assigned_supervisors.length > 0 && (
                                <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200">
                                  {location.assigned_supervisors.length} Supervisor{location.assigned_supervisors.length > 1 ? 's' : ''}
                                </Badge>
                            )}
                            {location.is_special_event && (
                              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                                Special Event
                              </Badge>
                            )}
                            {location.assigned_client_email && (() => {
                              const client = clientUsers?.find(c => c.email === location.assigned_client_email);
                              const clientName = client?.first_name && client?.last_name 
                                ? `${client.first_name} ${client.last_name}`
                                : location.assigned_client_email;
                              return (
                                <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                                  Client Portal: {clientName}
                                </Badge>
                              );
                            })()}
                          </div>
                          <p className="text-sm text-slate-600 mb-1">
                            <MapPin className="w-3 h-3 inline mr-1" />
                            {location.address}
                          </p>
                          {(location.contract_start_date || location.contract_end_date) && (
                            <p className="text-xs text-slate-600 mt-2">
                              <Calendar className="w-3 h-3 inline mr-1" />
                              Contract: {location.contract_start_date ? format(parseISO(location.contract_start_date), 'MMM d, yyyy') : 'N/A'} - {location.contract_end_date ? format(parseISO(location.contract_end_date), 'MMM d, yyyy') : 'N/A'}
                            </p>
                          )}
                          {location.max_hours_per_week && (
                            <p className="text-xs text-slate-500">
                              Max Hours/Week: {location.max_hours_per_week}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleActive(location)}
                            title="Activate"
                          >
                            <ToggleLeft className="w-5 h-5 text-gray-400" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEdit(location)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {inactiveLocations.length === 0 && (
                    <p className="text-center text-slate-500 py-8">No inactive locations.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-900">
            <strong>Note:</strong> Active locations appear in dropdowns throughout the system. Set a contract end date to automatically deactivate a location at 12pm on that date. Inactive locations are hidden from dropdowns but can be reactivated anytime.
          </p>
        </div>
      </div>

      <MobileResponsiveDialog open={showDialog} onOpenChange={setShowDialog}>
        <MobileResponsiveDialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <MobileResponsiveDialogHeader>
            <MobileResponsiveDialogTitle>
              {editingLocation ? 'Edit Location' : 'Add New Location'}
            </MobileResponsiveDialogTitle>
          </MobileResponsiveDialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 py-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="site_name">Site Name *</Label>
                <Input
                  id="site_name"
                  placeholder="e.g., Chippenham Place"
                  value={formData.site_name}
                  onChange={(e) => setFormData({...formData, site_name: e.target.value})}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="division">Division</Label>
                <select
                  id="division"
                  value={formData.division || ''}
                  onChange={(e) => setFormData(prev => ({...prev, division: e.target.value, subdivision: ''}))}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">Select division...</option>
                  {divisions.filter(d => !d.is_subdivision && d.active !== false).map((div) => (
                    <option key={div.id} value={div.division_name}>{div.division_name}</option>
                  ))}
                </select>
              </div>
            </div>

            {formData.division && divisions.filter(d => d.is_subdivision && d.parent_division === formData.division && d.active !== false).length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="subdivision">Subdivision</Label>
                <select
                  id="subdivision"
                  value={formData.subdivision || ''}
                  onChange={(e) => setFormData(prev => ({...prev, subdivision: e.target.value}))}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">None</option>
                  {divisions
                    .filter(d => d.is_subdivision && d.parent_division === formData.division && d.active !== false)
                    .map((div) => (
                      <option key={div.id} value={div.subdivision || div.division_name}>{div.subdivision || div.division_name}</option>
                    ))}
                </select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="time_zone">Location Time Zone</Label>
              <select
                id="time_zone"
                value={formData.time_zone || 'America/New_York'}
                onChange={(event) => setFormData(current => ({ ...current, time_zone: event.target.value }))}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="America/New_York">Eastern Time</option>
                <option value="America/Chicago">Central Time</option>
                <option value="America/Denver">Mountain Time</option>
                <option value="America/Los_Angeles">Pacific Time</option>
                <option value="America/Anchorage">Alaska Time</option>
                <option value="Pacific/Honolulu">Hawaii Time</option>
              </select>
              <p className="text-xs text-slate-600">Reports and printed timestamps use this location’s time zone.</p>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="active"
                  checked={formData.active}
                  onCheckedChange={(checked) => setFormData({...formData, active: checked})}
                />
                <Label htmlFor="active" className="cursor-pointer">
                  Active (visible to officers)
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="is_special_event"
                  checked={formData.is_special_event}
                  onCheckedChange={(checked) => setFormData({...formData, is_special_event: checked})}
                />
                <Label htmlFor="is_special_event" className="cursor-pointer">
                  Special Event (No physical location required)
                </Label>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="assigned_client">Assign Client User (Optional)</Label>
              <Select
                value={formData.assigned_client_email || ""} // Ensure value is controlled and handles null/undefined
                onValueChange={(value) => setFormData({...formData, assigned_client_email: value === '__none__' ? '' : value})}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select client user..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {clientUsers?.map((client) => (
                    <SelectItem key={client.id} value={client.email}>
                      {client.first_name && client.last_name
                        ? `${client.first_name} ${client.last_name}`
                        : client.full_name || client.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-600">
                Assign a client user to give them portal access to this location's reports
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="assigned_supervisors">Assign Site Supervisors (Optional)</Label>
              <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                <Label className="text-sm font-medium mb-3 block">Available Supervisors</Label>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {supervisorUsers && supervisorUsers.length > 0 ? (
                    supervisorUsers.map((supervisor) => (
                      <div key={supervisor.id} className="flex items-center space-x-2 p-2 hover:bg-slate-100 rounded">
                        <Checkbox
                          id={`supervisor-${supervisor.id}`}
                          checked={formData.assigned_supervisors?.includes(supervisor.email) || false}
                          onCheckedChange={(checked) => {
                            const currentSupervisors = formData.assigned_supervisors || [];
                            const newSupervisors = checked
                              ? [...currentSupervisors, supervisor.email]
                              : currentSupervisors.filter(s => s !== supervisor.email);
                            setFormData({...formData, assigned_supervisors: newSupervisors});
                          }}
                        />
                        <Label htmlFor={`supervisor-${supervisor.id}`} className="cursor-pointer flex items-center gap-2 flex-1">
                          <UserCheck className="w-4 h-4 text-green-600" />
                          <div>
                            <p className="font-medium">
                              {supervisor.first_name} {supervisor.last_name}
                            </p>
                            <p className="text-xs text-slate-500">
                              {supervisor.rank || 'Supervisor'} {supervisor.unit_number && `• Unit #${supervisor.unit_number}`} • {supervisor.email}
                            </p>
                          </div>
                        </Label>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-slate-500 italic">No users with supervisor role found. Assign the supervisor role to users in Manage Officers.</p>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-3">
                  Supervisors can be assigned to multiple sites. They will be visible to clients in the Client Portal. Make sure users have the "supervisor" additional role in Manage Officers.
                </p>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="contract_start">Contract Start Date</Label>
                <Input
                  id="contract_start"
                  type="date"
                  value={formData.contract_start_date}
                  onChange={(e) => setFormData({...formData, contract_start_date: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contract_end">Contract End Date</Label>
                <Input
                  id="contract_end"
                  type="date"
                  value={formData.contract_end_date}
                  onChange={(e) => setFormData({...formData, contract_end_date: e.target.value})}
                />
                <p className="text-xs text-slate-600">
                  Location will automatically deactivate at 12:00 PM on this date
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Address *</Label>
              <div className="flex gap-2">
                <Input
                  id="address"
                  placeholder="e.g., 5833 Orcutt Ln. Richmond, VA 23224"
                  value={formData.address}
                  onChange={(e) => setFormData({...formData, address: e.target.value})}
                  required={!formData.is_special_event} // Make required only if not special event
                  className="flex-1"
                />
                <Button
                  type="button"
                  onClick={geocodeAddress}
                  disabled={geocoding || !formData.address || formData.is_special_event}
                  variant="outline"
                  className="whitespace-nowrap"
                >
                  <Search className="w-4 h-4 mr-2" />
                  {geocoding ? 'Finding...' : 'Find Coordinates'}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="site_email">Site Contact Email (Optional)</Label>
              <Input
                id="site_email"
                type="email"
                placeholder="e.g., manager@property.com"
                value={formData.site_email}
                onChange={(e) => setFormData({...formData, site_email: e.target.value})}
              />
              <p className="text-xs text-slate-600">
                Reports created for this site will automatically be emailed to this address
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="latitude">Latitude (Optional)</Label>
                <Input
                  id="latitude"
                  type="number"
                  step="any"
                  placeholder="e.g., 37.5015"
                  value={formData.latitude === null ? "" : formData.latitude}
                  onChange={(e) => setFormData({...formData, latitude: e.target.value === "" ? null : parseFloat(e.target.value)})}
                  disabled={formData.is_special_event}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="longitude">Longitude (Optional)</Label>
                <Input
                  id="longitude"
                  type="number"
                  step="any"
                  placeholder="e.g., -77.4967"
                  value={formData.longitude === null ? "" : formData.longitude}
                  onChange={(e) => setFormData({...formData, longitude: e.target.value === "" ? null : parseFloat(e.target.value)})}
                  disabled={formData.is_special_event}
                />
              </div>
            </div>

            {formData.latitude && formData.longitude && !formData.is_special_event && (
              <div className="space-y-3 rounded-xl border border-slate-700 bg-[#081522] p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <Label className="text-slate-100">Property & Geofence Boundary Editor</Label>
                    <p className="mt-1 text-xs text-slate-400">Click around the outside edge of the property. The same custom boundary is used for officer geofencing and CAD property alerts.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" onClick={() => setDrawingBoundary(value => !value)} className={drawingBoundary ? 'bg-amber-500 text-black hover:bg-amber-400' : 'bg-blue-600 text-white hover:bg-blue-500'}>
                      {drawingBoundary ? 'STOP DRAWING' : 'START DRAWING'}
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={undoBoundaryPoint} disabled={!formData.geofence_polygon?.length}>UNDO POINT</Button>
                    <Button type="button" size="sm" variant="outline" onClick={clearBoundary} disabled={!formData.geofence_polygon?.length}>CLEAR BOUNDARY</Button>
                  </div>
                </div>
                <div className={`h-80 rounded-lg overflow-hidden border ${drawingBoundary ? 'border-amber-400 ring-2 ring-amber-400/20' : 'border-slate-700'}`}>
                  <MapContainer center={mapCenter} zoom={17} style={{ height: '100%', width: '100%' }}>
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' />
                    <MapUpdater center={mapCenter} zoom={17} />
                    <Marker position={mapCenter} />
                    {(formData.geofence_polygon || []).length < 3 && (
                      <Circle center={mapCenter} radius={formData.geofence_radius_meters || 100} pathOptions={{ color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: 0.08, dashArray: '8, 8' }} />
                    )}
                    <BoundaryPointEditor enabled={drawingBoundary} points={formData.geofence_polygon || []} onAddPoint={addBoundaryPoint} />
                  </MapContainer>
                </div>
                <div className="grid gap-2 text-xs sm:grid-cols-2">
                  <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-2 text-slate-300"><span className="font-semibold text-white">Boundary Points:</span> {formData.geofence_polygon?.length || 0}</div>
                  <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-2 text-slate-300"><span className="font-semibold text-white">Canonical Geofence:</span> {(formData.geofence_polygon || []).length >= 3 ? 'Custom property polygon' : `${formData.geofence_radius_meters || 100}m shared radius fallback`}</div>
                </div>
                <p className="text-xs text-slate-400">Gold boundary = the single location boundary used for clock-in eligibility, live geofence alerts, property/CAD monitoring, and location enforcement.</p>
              </div>
            )}

            {!formData.is_special_event && (
              <div className="rounded-xl border border-amber-500/40 bg-amber-950/20 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <Label className="font-semibold text-amber-200">Allow Clock In From Anywhere</Label>
                    <p className="mt-1 text-xs text-amber-100/80">Administrative site override. Officers may clock in to this location even when their GPS is outside the property boundary. Pathfinder will still record their GPS coordinates.</p>
                  </div>
                  <Checkbox
                    checked={formData.allow_clock_in_anywhere || false}
                    onCheckedChange={(checked) => setFormData(prev => ({...prev, allow_clock_in_anywhere: checked === true}))}
                  />
                </div>
              </div>
            )}

            {formData.latitude && formData.longitude && !formData.is_special_event && (
              <div className="p-4 bg-green-50 rounded-lg border border-green-200 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-green-900 font-semibold flex items-center gap-2">
                      <Target className="w-4 h-4" />
                      Geofence Monitoring
                    </Label>
                    <p className="text-xs text-green-700 mt-1">Alert supervisors when officers leave the patrol zone</p>
                  </div>
                  <Checkbox
                    checked={formData.geofence_enabled}
                    onCheckedChange={(checked) => setFormData({...formData, geofence_enabled: checked})}
                  />
                </div>

                {formData.geofence_enabled && (
                  <div className="space-y-2">
                    {(formData.geofence_polygon || []).length >= 3 ? (
                      <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 text-xs text-amber-200">
                        Custom property polygon active — officers are considered inside the geofence only while their live GPS position is inside the boundary drawn on the map above.
                      </div>
                    ) : (
                      <>
                        <Label htmlFor="geofence_radius">Geofence Radius (meters)</Label>
                        <Input id="geofence_radius" type="number" min="50" max="5000" value={formData.geofence_radius_meters} onChange={(e) => setFormData({...formData, geofence_radius_meters: parseInt(e.target.value) || 100})} />
                        <p className="text-xs text-green-700">No custom polygon is saved yet, so officer geofencing uses the {formData.geofence_radius_meters}m center radius.</p>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {formData.latitude && formData.longitude && !formData.is_special_event && (
              <div className="rounded-xl border border-blue-500/30 bg-[#0b1d31] p-4 space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <Label className="font-semibold text-blue-200 flex items-center gap-2">
                      <MapPin className="w-4 h-4" /> Property Call Monitoring
                    </Label>
                    <p className="text-xs text-slate-400 mt-1">Use this managed location as a CAD property-alert zone.</p>
                  </div>
                  <Checkbox checked={formData.property_monitoring_enabled} onCheckedChange={(checked) => setFormData({...formData, property_monitoring_enabled: checked})} />
                </div>
                {formData.property_monitoring_enabled && (
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <Label className="text-slate-300">Monitoring Boundary</Label>
                      <div className="mt-1 rounded-lg border border-slate-700 bg-[#0e2138] px-3 py-2 text-sm text-white">
                        {(formData.geofence_polygon || []).length >= 3 ? `Custom map polygon · ${formData.geofence_polygon.length} points` : 'Circle / radius fallback'}
                      </div>
                    </div>
                    <div>
                      <Label className="text-slate-300">Shared Fallback Radius</Label>
                      <div className="mt-1 rounded-lg border border-slate-700 bg-[#0e2138] px-3 py-2 text-sm text-white">{formData.geofence_radius_meters || 100} meters · used only when no polygon is drawn</div>
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-slate-300">Monitoring Notes</Label>
                      <Textarea value={formData.property_monitoring_description || ''} onChange={(e) => setFormData({...formData, property_monitoring_description: e.target.value})} placeholder="Property monitoring notes or special instructions" className="mt-1" />
                    </div>
                    {(formData.geofence_polygon || []).length >= 3 && (
                      <div className="md:col-span-2 rounded-lg border border-amber-500/30 bg-amber-950/20 p-3 text-xs text-amber-200">
                        Synced boundary active: CAD property monitoring and officer geofencing both use the exact polygon drawn on the map.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {formData.property_monitoring_enabled && (
              <div className="rounded-xl border border-cyan-500/40 bg-cyan-950/20 p-4 space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <Label className="font-semibold text-cyan-100">Automatic Property-Alert Dispatch</Label>
                    <p className="mt-1 text-xs text-cyan-200/70">Phase 2A runs in recommendation-only shadow mode. It records which units qualify but never assigns a call or changes a unit status.</p>
                  </div>
                  <Checkbox
                    checked={formData.auto_dispatch_enabled === true}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, auto_dispatch_enabled: checked === true, auto_dispatch_mode: checked === true ? (prev.auto_dispatch_mode || 'shadow') : 'disabled' }))}
                  />
                </div>

                {formData.auto_dispatch_enabled && (
                  <>
                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="space-y-2">
                        <Label>Operating Mode</Label>
                        <Select value={formData.auto_dispatch_mode === 'live' ? 'shadow' : formData.auto_dispatch_mode} onValueChange={(value) => setFormData(prev => ({ ...prev, auto_dispatch_mode: value }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="shadow">Shadow Recommendation</SelectItem>
                            <SelectItem value="manual_review">Manual Review Required</SelectItem>
                            <SelectItem value="disabled">Disabled</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-[11px] text-cyan-200/60">Live assignment remains locked until later end-to-end approval.</p>
                      </div>
                      <div className="space-y-2">
                        <Label>Response Radius (miles)</Label>
                        <Input type="number" min="0.1" max="100" step="0.1" value={formData.auto_dispatch_response_radius_miles} onChange={(e) => setFormData(prev => ({ ...prev, auto_dispatch_response_radius_miles: Number(e.target.value) || 5 }))} />
                      </div>
                      <div className="space-y-2">
                        <Label>Required Units</Label>
                        <Input type="number" min="1" max="10" value={formData.auto_dispatch_required_units} onChange={(e) => setFormData(prev => ({ ...prev, auto_dispatch_required_units: Math.max(1, Number(e.target.value) || 1) }))} />
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-700 bg-slate-950/40 p-3">
                      <div><Label>Backup Required</Label><p className="text-[11px] text-slate-400">Requires at least two qualified recommendations.</p></div>
                      <Checkbox checked={formData.auto_dispatch_backup_required === true} onCheckedChange={(checked) => setFormData(prev => ({ ...prev, auto_dispatch_backup_required: checked === true }))} />
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="space-y-2">
                        <Label>Required Qualifications</Label>
                        <Input value={(formData.auto_dispatch_required_qualifications || []).join(', ')} onChange={(e) => setFormData(prev => ({ ...prev, auto_dispatch_required_qualifications: e.target.value.split(',').map(value => value.trim()).filter(Boolean) }))} placeholder="DCJS Armed, CPR" />
                      </div>
                      <div className="space-y-2">
                        <Label>Required Equipment</Label>
                        <Input value={(formData.auto_dispatch_required_equipment || []).join(', ')} onChange={(e) => setFormData(prev => ({ ...prev, auto_dispatch_required_equipment: e.target.value.split(',').map(value => value.trim()).filter(Boolean) }))} placeholder="Patrol vehicle, AED" />
                      </div>
                      <div className="space-y-2">
                        <Label>Allowed Ranks</Label>
                        <Input value={(formData.auto_dispatch_required_ranks || []).join(', ')} onChange={(e) => setFormData(prev => ({ ...prev, auto_dispatch_required_ranks: e.target.value.split(',').map(value => value.trim()).filter(Boolean) }))} placeholder="Officer, Sergeant" />
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="space-y-2"><Label>Acknowledge Timer (seconds)</Label><Input type="number" min="30" value={formData.auto_dispatch_acknowledgement_seconds} onChange={(e) => setFormData(prev => ({ ...prev, auto_dispatch_acknowledgement_seconds: Math.max(30, Number(e.target.value) || 120) }))} /></div>
                      <div className="space-y-2"><Label>Escalation Timer (seconds)</Label><Input type="number" min="60" value={formData.auto_dispatch_escalation_seconds} onChange={(e) => setFormData(prev => ({ ...prev, auto_dispatch_escalation_seconds: Math.max(60, Number(e.target.value) || 300) }))} /></div>
                      <div className="space-y-2"><Label>Recheck Interval (seconds)</Label><Input type="number" min="30" value={formData.auto_dispatch_recheck_seconds} onChange={(e) => setFormData(prev => ({ ...prev, auto_dispatch_recheck_seconds: Math.max(30, Number(e.target.value) || 60) }))} /></div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2"><Label>Officer Safety Warnings</Label><Textarea value={formData.property_safety_warnings || ''} onChange={(e) => setFormData(prev => ({ ...prev, property_safety_warnings: e.target.value }))} placeholder="Only warnings authorized officers need for response" /></div>
                      <div className="space-y-2"><Label>Property Access Instructions</Label><Textarea value={formData.property_access_instructions || ''} onChange={(e) => setFormData(prev => ({ ...prev, property_access_instructions: e.target.value }))} placeholder="Gate, key, lockbox, staging, or contact instructions" /></div>
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-4 mb-6">
              <Label className="text-amber-900 font-semibold block">Billing Rates for This Location</Label>
              
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="site_bill_rate">Armed Services (Standard) - $/hour</Label>
                  <Input
                    id="site_bill_rate"
                    type="number"
                    step="0.01"
                    placeholder="e.g., 55.00"
                    value={formData.site_bill_rate === null ? "" : formData.site_bill_rate}
                    onChange={(e) => setFormData({...formData, site_bill_rate: e.target.value ? parseFloat(e.target.value) : null})}
                  />
                </div>
                <div>
                  <Label htmlFor="site_bill_rate_unarmed">Unarmed Services (Standard) - $/hour</Label>
                  <Input
                    id="site_bill_rate_unarmed"
                    type="number"
                    step="0.01"
                    placeholder="e.g., 45.00"
                    value={formData.site_bill_rate_unarmed === null ? "" : formData.site_bill_rate_unarmed}
                    onChange={(e) => setFormData({...formData, site_bill_rate_unarmed: e.target.value ? parseFloat(e.target.value) : null})}
                  />
                </div>
              </div>

              <div className="border-t border-amber-200 pt-4">
                <p className="text-sm font-semibold text-amber-900 mb-3">Holiday Coverage Rates</p>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="site_bill_rate_holiday_armed">Holiday Coverage - Armed - $/hour</Label>
                    <Input
                      id="site_bill_rate_holiday_armed"
                      type="number"
                      step="0.01"
                      placeholder="e.g., 68.75"
                      value={formData.site_bill_rate_holiday_armed === null ? "" : formData.site_bill_rate_holiday_armed}
                      onChange={(e) => setFormData({...formData, site_bill_rate_holiday_armed: e.target.value ? parseFloat(e.target.value) : null})}
                    />
                  </div>
                  <div>
                    <Label htmlFor="site_bill_rate_holiday_unarmed">Holiday Coverage - Unarmed - $/hour</Label>
                    <Input
                      id="site_bill_rate_holiday_unarmed"
                      type="number"
                      step="0.01"
                      placeholder="e.g., 56.25"
                      value={formData.site_bill_rate_holiday_unarmed === null ? "" : formData.site_bill_rate_holiday_unarmed}
                      onChange={(e) => setFormData({...formData, site_bill_rate_holiday_unarmed: e.target.value ? parseFloat(e.target.value) : null})}
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-amber-200 pt-4">
                <p className="text-sm font-semibold text-amber-900 mb-3">Rush Coverage Rates</p>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="site_bill_rate_rush_armed">Rush Coverage - Armed - $/hour</Label>
                    <Input
                      id="site_bill_rate_rush_armed"
                      type="number"
                      step="0.01"
                      placeholder="e.g., 82.50"
                      value={formData.site_bill_rate_rush_armed === null ? "" : formData.site_bill_rate_rush_armed}
                      onChange={(e) => setFormData({...formData, site_bill_rate_rush_armed: e.target.value ? parseFloat(e.target.value) : null})}
                    />
                  </div>
                  <div>
                    <Label htmlFor="site_bill_rate_rush_unarmed">Rush Coverage - Unarmed - $/hour</Label>
                    <Input
                      id="site_bill_rate_rush_unarmed"
                      type="number"
                      step="0.01"
                      placeholder="e.g., 67.50"
                      value={formData.site_bill_rate_rush_unarmed === null ? "" : formData.site_bill_rate_rush_unarmed}
                      onChange={(e) => setFormData({...formData, site_bill_rate_rush_unarmed: e.target.value ? parseFloat(e.target.value) : null})}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="max_hours_per_week">Max Hours Per Week</Label>
                <Input
                  id="max_hours_per_week"
                  type="number"
                  step="0.5"
                  placeholder="e.g., 168 for 24/7 coverage"
                  value={formData.max_hours_per_week === null ? "" : formData.max_hours_per_week}
                  onChange={(e) => setFormData({...formData, max_hours_per_week: e.target.value ? parseFloat(e.target.value) : null})}
                />
                <p className="text-xs text-slate-500 mt-1">
                  Optional: Set maximum hours allowed per week. Schedule hours exceeding this will show in red.
                </p>
              </div>
            </div>

            <div className="p-4 bg-indigo-50 rounded-lg border border-indigo-200 space-y-4">
              <Label className="text-indigo-900 font-semibold block">AI Auto-Schedule Settings</Label>
              
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="shift_start_time">Shift Window Start Time</Label>
                  <Input
                    id="shift_start_time"
                    type="time"
                    value={formData.shift_start_time || ""}
                    onChange={(e) => setFormData({...formData, shift_start_time: e.target.value})}
                  />
                  <p className="text-xs text-slate-600">Earliest time shifts can start (e.g., 18:00 for 6 PM)</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="shift_end_time">Shift Window End Time</Label>
                  <Input
                    id="shift_end_time"
                    type="time"
                    value={formData.shift_end_time || ""}
                    onChange={(e) => setFormData({...formData, shift_end_time: e.target.value})}
                  />
                  <p className="text-xs text-slate-600">Latest time shifts can end (e.g., 04:00 for 4 AM next day)</p>
                </div>
              </div>

              <div className="grid md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="preferred_shift_length">Preferred Shift Length (hours)</Label>
                  <Select
                    value={formData.preferred_shift_length?.toString() || ""}
                    onValueChange={(value) => setFormData({...formData, preferred_shift_length: value ? parseInt(value) : null})}
                  >
                    <SelectTrigger id="preferred_shift_length">
                      <SelectValue placeholder="Select shift length..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="6">6 hours</SelectItem>
                      <SelectItem value="8">8 hours</SelectItem>
                      <SelectItem value="10">10 hours</SelectItem>
                      <SelectItem value="12">12 hours</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="min_officers_per_shift">Min Officers Per Shift</Label>
                  <Input
                    id="min_officers_per_shift"
                    type="number"
                    min="1"
                    max="10"
                    value={formData.min_officers_per_shift || ""}
                    onChange={(e) => setFormData({...formData, min_officers_per_shift: e.target.value ? parseInt(e.target.value) : null})}
                    placeholder="e.g., 2"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="max_officers_per_shift">Max Officers Per Shift</Label>
                  <Input
                    id="max_officers_per_shift"
                    type="number"
                    min="1"
                    max="10"
                    value={formData.max_officers_per_shift || ""}
                    onChange={(e) => setFormData({...formData, max_officers_per_shift: e.target.value ? parseInt(e.target.value) : null})}
                    placeholder="e.g., 3"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Coverage Days Required</Label>
                <div className="flex flex-wrap gap-2">
                  {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(day => (
                    <div key={day} className="flex items-center space-x-1">
                      <Checkbox
                        id={`coverage_${day}`}
                        checked={formData.coverage_days?.includes(day) || false}
                        onCheckedChange={(checked) => {
                          const currentDays = formData.coverage_days || [];
                          const newDays = checked 
                            ? [...currentDays, day]
                            : currentDays.filter(d => d !== day);
                          setFormData({...formData, coverage_days: newDays});
                        }}
                      />
                      <Label htmlFor={`coverage_${day}`} className="text-xs cursor-pointer capitalize">{day.slice(0,3)}</Label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="coverage_notes">Coverage Notes</Label>
                <Textarea
                  id="coverage_notes"
                  placeholder="Special coverage requirements (e.g., 'Need armed officer on weekends', 'Double coverage on Fridays')..."
                  value={formData.coverage_notes || ""}
                  onChange={(e) => setFormData({...formData, coverage_notes: e.target.value})}
                  rows={2}
                />
              </div>

              <div className="space-y-4 pt-4 border-t border-indigo-200">
                <Label className="text-indigo-900 font-semibold">Per-Day Multiple Shifts (Override Defaults)</Label>
                <p className="text-xs text-indigo-700">Define multiple shifts for each day that AI should create</p>
                {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(day => {
                  const dayShifts = formData.day_specific_settings?.[day]?.shifts || [];
                  
                  return (
                    <div key={day} className="p-3 bg-white rounded border border-indigo-100">
                      <div className="flex items-center justify-between mb-2">
                        <Label className="text-sm font-semibold capitalize">{day}</Label>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const currentShifts = formData.day_specific_settings?.[day]?.shifts || [];
                            setFormData({
                              ...formData,
                              day_specific_settings: {
                                ...formData.day_specific_settings,
                                [day]: {
                                  shifts: [...currentShifts, { shift_start_time: "", shift_end_time: "", shift_length: null }]
                                }
                              }
                            });
                          }}
                          className="text-xs"
                        >
                          <Plus className="w-3 h-3 mr-1" />
                          Add Shift
                        </Button>
                      </div>
                      
                      {dayShifts.length === 0 ? (
                        <p className="text-xs text-slate-500 italic">No specific shifts defined for {day}</p>
                      ) : (
                        <div className="space-y-2">
                          {dayShifts.map((shift, idx) => (
                            <div key={idx} className="grid grid-cols-4 gap-2 p-2 bg-slate-50 rounded border border-slate-200">
                              <div>
                                <Label className="text-xs">Start</Label>
                                <Input
                                  type="time"
                                  value={shift.shift_start_time || ""}
                                  onChange={(e) => {
                                    const updatedShifts = [...dayShifts];
                                    updatedShifts[idx] = { ...updatedShifts[idx], shift_start_time: e.target.value };
                                    setFormData({
                                      ...formData,
                                      day_specific_settings: {
                                        ...formData.day_specific_settings,
                                        [day]: { shifts: updatedShifts }
                                      }
                                    });
                                  }}
                                  className="text-xs h-8"
                                />
                              </div>
                              <div>
                                <Label className="text-xs">End</Label>
                                <Input
                                  type="time"
                                  value={shift.shift_end_time || ""}
                                  onChange={(e) => {
                                    const updatedShifts = [...dayShifts];
                                    updatedShifts[idx] = { ...updatedShifts[idx], shift_end_time: e.target.value };
                                    setFormData({
                                      ...formData,
                                      day_specific_settings: {
                                        ...formData.day_specific_settings,
                                        [day]: { shifts: updatedShifts }
                                      }
                                    });
                                  }}
                                  className="text-xs h-8"
                                />
                              </div>
                              <div>
                                <Label className="text-xs">Length</Label>
                                <Input
                                  type="number"
                                  min="4"
                                  max="12"
                                  value={shift.shift_length || ""}
                                  onChange={(e) => {
                                    const updatedShifts = [...dayShifts];
                                    updatedShifts[idx] = { ...updatedShifts[idx], shift_length: e.target.value ? parseInt(e.target.value) : null };
                                    setFormData({
                                      ...formData,
                                      day_specific_settings: {
                                        ...formData.day_specific_settings,
                                        [day]: { shifts: updatedShifts }
                                      }
                                    });
                                  }}
                                  className="text-xs h-8"
                                  placeholder="hrs"
                                />
                              </div>
                              <div className="flex items-end">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    const updatedShifts = dayShifts.filter((_, i) => i !== idx);
                                    setFormData({
                                      ...formData,
                                      day_specific_settings: {
                                        ...formData.day_specific_settings,
                                        [day]: { shifts: updatedShifts }
                                      }
                                    });
                                  }}
                                  className="text-red-600 hover:text-red-800 h-8"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center space-x-2 pt-2 border-t border-indigo-200">
                <Checkbox
                  id="exclude_from_auto_schedule"
                  checked={formData.exclude_from_auto_schedule || false}
                  onCheckedChange={(checked) => setFormData({...formData, exclude_from_auto_schedule: checked})}
                />
                <Label htmlFor="exclude_from_auto_schedule" className="cursor-pointer text-indigo-900">
                  Exclude from AI Auto-Schedule
                </Label>
              </div>
              <p className="text-xs text-slate-600">
                When excluded, this location will not be assigned shifts during AI auto-scheduling.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Textarea
                id="notes"
                placeholder="Any special notes about this location..."
                value={formData.notes}
                onChange={(e) => setFormData({...formData, notes: e.target.value})}
                rows={3}
              />
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-sm text-amber-900">
                <strong>Tip:</strong> Check "Special Event" if this location is not a fixed physical site. Otherwise, click "Find Coordinates" after entering the address to automatically populate latitude and longitude. Add a site email to receive automatic report notifications for this location.
              </p>
            </div>

            <div className="flex gap-3 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowDialog(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createLocationMutation.isPending || updateLocationMutation.isPending}
                className="w-full bg-blue-600 hover:bg-blue-700 sm:w-auto"
              >
                {createLocationMutation.isPending || updateLocationMutation.isPending
                  ? 'Saving...'
                  : editingLocation
                  ? 'Update Location'
                  : 'Add Location'}
              </Button>
            </div>
          </form>
        </MobileResponsiveDialogContent>
      </MobileResponsiveDialog>
    </div>
  );
}