export const isAssetLoadError = value => /failed to fetch dynamically imported module|importing a module script failed|loading chunk|chunkloaderror|failed to load module script|error loading dynamically imported module/i.test(String(value?.message || value || ''));

export async function inspectPageModules(modules, { shouldPause = () => false } = {}) {
    const failures = [], assetFailures = [];
    let loaded = 0, checked = 0, incomplete = false;
    const entries = Object.entries(modules);
    for (let i=0; i<entries.length; i+=2) {
        if (shouldPause()) { incomplete = true; break; }
        await Promise.all(entries.slice(i,i+2).map(async ([path,loader]) => {
            checked++;
            try { const page = await loader(); if (!page?.default) throw new Error('Page module has no default component export'); loaded++; }
            catch(error) { const failure={path,message:String(error?.message || error)}; (isAssetLoadError(error) ? assetFailures : failures).push(failure); }
        }));
        if (assetFailures.length) { incomplete = true; break; }
        await new Promise(resolve => setTimeout(resolve,0));
    }
    return { failures, assetFailures, loaded, checked, registered:entries.length, incomplete };
}

export function requestFreshApplication() {
    const url = new URL(window.location.href);
    url.searchParams.set('_pathfinder_refresh',String(Date.now()));
    window.location.replace(url.toString());
}
