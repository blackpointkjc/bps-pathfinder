import React from 'react';
import UnitSettings from '@/components/map/UnitSettings';
import LayerFilterPanel from '@/components/map/LayerFilterPanel';
import ActiveCallsList from '@/components/map/ActiveCallsList';
import CallDetailView from '@/components/map/CallDetailView';
import CallDetailSidebar from '@/components/map/CallDetailSidebar';
import UnitStatusPanel from '@/components/map/UnitStatusPanel';
import DispatchPanel from '@/components/map/DispatchPanel';
import DirectionsModal from '@/components/dispatch/DirectionsModal';
import CallNotification from '@/components/dispatch/CallNotification';
import AllUnitsPanel from '@/components/map/AllUnitsPanel';
import HistoricalLogsPanel from '@/components/dispatch/HistoricalLogsPanel';
import AutoDispatchSuggestion from '@/components/map/AutoDispatchSuggestion';
import UnitGroupingPanel from '@/components/map/UnitGroupingPanel';
import AddressLookupTool from '@/components/map/AddressLookupTool';
import RealTimeAlert from '@/components/map/RealTimeAlert';
import UnitSettingsPanel from '@/components/map/UnitSettingsPanel';
import CallFilterPanel from '@/components/map/CallFilterPanel';
import OfflineMapManager from '@/components/map/OfflineMapManager';

export default function NavigationModals({
    showUnitSettings, setShowUnitSettings, unitName, handleSaveUnitName, showLights, handleLightsChange,
    showLayerFilters, setShowLayerFilters, jurisdictionFilters, handleLayerFilterChange,
    showCallsList, setShowCallsList, activeCalls, showCallDetail, setShowCallDetail,
    selectedCall, setSelectedCall, showCallSidebar, setShowCallSidebar,
    handleEnrouteToCall, setMapCenter,
    showStatusPanel, setShowStatusPanel, unitStatus, currentUser, handleStatusChange, activeCallInfo, currentLocation,
    showDispatchPanel, setShowDispatchPanel, selectedCallForDispatch, handleAssignUnit,
    showDirectionsModal, setShowDirectionsModal, directions, destinationName, distance, duration,
    routes, handleSelectRoute, selectedRouteIndex,
    pendingCallNotification, handleAcceptCall, handleDismissNotification,
    showAllUnitsPanel, setShowAllUnitsPanel, showHistoricalLogs, setShowHistoricalLogs,
    showUnitGrouping, setShowUnitGrouping, showUnitSettingsPanel, setShowUnitSettingsPanel,
    autoDispatchSuggestion, setAutoDispatchSuggestion,
    showAddressLookup, setShowAddressLookup, setSearchPin,
    realTimeAlert, setRealTimeAlert,
    showCallFilterPanel, setShowCallFilterPanel, callAgencyFilters, handleCallFilterChange,
    showOfflineManager, setShowOfflineManager, isOnline,
}) {
    return (
        <>
            <UnitSettings
                isOpen={showUnitSettings}
                onClose={() => setShowUnitSettings(false)}
                unitName={unitName}
                onSave={handleSaveUnitName}
                showLights={showLights}
                onLightsChange={handleLightsChange}
            />
            <LayerFilterPanel
                isOpen={showLayerFilters}
                onClose={() => setShowLayerFilters(false)}
                filters={jurisdictionFilters}
                onFilterChange={handleLayerFilterChange}
            />
            <ActiveCallsList
                isOpen={showCallsList}
                onClose={() => setShowCallsList(false)}
                calls={activeCalls}
                onNavigateToCall={(call) => { setShowCallsList(false); setSelectedCall(call); setShowCallDetail(true); }}
            />
            {showCallDetail && selectedCall && (
                <CallDetailView
                    call={selectedCall}
                    onClose={() => { setShowCallDetail(false); setSelectedCall(null); }}
                    onEnroute={() => { handleEnrouteToCall(selectedCall); setShowCallDetail(false); }}
                />
            )}
            {showCallSidebar && selectedCall && (
                <CallDetailSidebar
                    call={selectedCall}
                    onClose={() => { setShowCallSidebar(false); setSelectedCall(null); }}
                    onEnroute={() => { handleEnrouteToCall(selectedCall); setShowCallSidebar(false); }}
                    onCenter={() => { if (selectedCall.latitude && selectedCall.longitude) setMapCenter([selectedCall.latitude, selectedCall.longitude]); }}
                />
            )}
            <UnitStatusPanel
                isOpen={showStatusPanel}
                onClose={() => setShowStatusPanel(false)}
                currentStatus={unitStatus}
                unitName={unitName || currentUser?.unit_number || currentUser?.full_name || 'Unknown Unit'}
                onStatusChange={handleStatusChange}
                activeCall={activeCallInfo}
                currentLocation={currentLocation}
            />
            <DispatchPanel
                isOpen={showDispatchPanel}
                onClose={() => setShowDispatchPanel(false)}
                call={selectedCallForDispatch}
                onAssignUnit={handleAssignUnit}
            />
            <DirectionsModal
                isOpen={showDirectionsModal}
                onClose={() => setShowDirectionsModal(false)}
                directions={directions}
                destination={destinationName}
                distance={distance}
                duration={duration}
                routes={routes}
                onSelectRoute={handleSelectRoute}
                selectedRouteIndex={selectedRouteIndex}
            />
            {pendingCallNotification && (
                <CallNotification
                    call={pendingCallNotification}
                    onAccept={handleAcceptCall}
                    onDismiss={handleDismissNotification}
                />
            )}
            <AllUnitsPanel isOpen={showAllUnitsPanel} onClose={() => setShowAllUnitsPanel(false)} />
            <HistoricalLogsPanel isOpen={showHistoricalLogs} onClose={() => setShowHistoricalLogs(false)} />
            {autoDispatchSuggestion && (
                <AutoDispatchSuggestion
                    suggestion={autoDispatchSuggestion}
                    onAccept={async () => { await handleEnrouteToCall(autoDispatchSuggestion.call); setAutoDispatchSuggestion(null); }}
                    onDismiss={() => setAutoDispatchSuggestion(null)}
                />
            )}
            <UnitGroupingPanel isOpen={showUnitGrouping} onClose={() => setShowUnitGrouping(false)} currentUser={currentUser} />
            <AddressLookupTool
                isOpen={showAddressLookup}
                onClose={() => setShowAddressLookup(false)}
                onLocationFound={(coords, address) => {
                    setMapCenter(coords);
                    setSearchPin({ coords, address, propertyInfo: 'See Address Lookup Tool for full details' });
                }}
            />
            {realTimeAlert && (
                <RealTimeAlert
                    alert={realTimeAlert}
                    onDismiss={() => setRealTimeAlert(null)}
                    onNavigate={(data) => {
                        if (data.latitude && data.longitude) {
                            setMapCenter([data.latitude, data.longitude]);
                            if (data.incident) { setSelectedCall(data); setShowCallSidebar(true); }
                        }
                    }}
                />
            )}
            <UnitSettingsPanel isOpen={showUnitSettingsPanel} onClose={() => setShowUnitSettingsPanel(false)} />
            <CallFilterPanel
                isOpen={showCallFilterPanel}
                onClose={() => setShowCallFilterPanel(false)}
                filters={callAgencyFilters}
                onFilterChange={handleCallFilterChange}
            />
            <OfflineMapManager isOpen={showOfflineManager} onClose={() => setShowOfflineManager(false)} isOnline={isOnline} />
        </>
    );
}