import { useQuery } from '@tanstack/react-query';
import { listDirectoryUsers } from '@/lib/appDirectory';
import VehicleManagement from '@/components/admin/VehicleManagement';
import MaintenanceTracking from '@/components/dispatch/MaintenanceTracking';
import AdminEquipment from '@/pages/AdminEquipment';
import InlineSection from './InlineSection';
export default function AssetsWorkspace(){
 const {data:users=[]}=useQuery({queryKey:['assetPersonnel'],queryFn:()=>listDirectoryUsers('last_name',1000),staleTime:300000});
 return <div className="space-y-4 p-4 text-white md:p-5">
  <header><h1 className="text-2xl font-bold">Company Assets</h1><p className="mt-1 text-sm text-slate-400">Vehicles, assigned equipment and maintenance in one inventory workspace.</p></header>
  <section className="rounded-xl border border-slate-700 bg-slate-900 p-4"><VehicleManagement/></section>
  <InlineSection id="assets-maintenance" title="Maintenance & service" description="Upcoming service, repair history and maintenance tasks." initialOpen><MaintenanceTracking units={users}/></InlineSection>
  <InlineSection id="assets-equipment" title="Equipment & issued property" description="Track equipment ownership, issue and return." initialOpen={new URLSearchParams(window.location.search).get('admin_asset_tool')==='equipment'}><AdminEquipment embedded/></InlineSection>
 </div>;
}
