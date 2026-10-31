// All corporate internet browser functionality temporarily disabled.
export default function DisabledCorporateBrowser() {
  return <main className="flex min-h-[55vh] items-center justify-center bg-[#071321] px-5 text-center text-slate-100">
    <div className="max-w-lg rounded-xl border border-slate-700 bg-[#0d1b2a] p-8">
      <h1 className="text-lg font-bold">Corporate internet browser disabled</h1>
      <p className="mt-3 text-sm text-slate-300">In-portal internet browsing and website restriction tools have been temporarily disabled. No remote browser session or internet policy check will start.</p>
    </div>
  </main>;
}
