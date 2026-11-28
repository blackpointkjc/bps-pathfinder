// Browser CSS pixels are authoritative for fit. Screen resolution, touch and
// a connected receiver are hints, never proof of a particular hardware model.
export function resolveFieldDisplay({mode='auto',width=0,height=0,screenWidth=0,screenHeight=0,touch=false,windows=false,externalGps=false}={}){
 if(mode==='field')return 'field';
 if(mode==='desktop')return 'desktop';
 if(width<800)return 'mobile';
 const ratio=screenWidth&&screenHeight?Math.max(screenWidth,screenHeight)/Math.min(screenWidth,screenHeight):0;
 const ruggedRatio=ratio>=1.45&&ratio<=1.55;
 if(windows&&((ruggedRatio&&(touch||externalGps))||(externalGps&&width<=1800)||(touch&&width<=1440)))return 'field';
 if(width<=1500&&height<=850)return 'compact';
 return 'desktop';
}
export function readFieldDisplayInput(win,externalGps=false){
 return {width:win.innerWidth||0,height:win.innerHeight||0,screenWidth:win.screen?.width||0,screenHeight:win.screen?.height||0,touch:(win.navigator?.maxTouchPoints||0)>0,windows:/win/i.test(win.navigator?.userAgentData?.platform||win.navigator?.platform||win.navigator?.userAgent||''),externalGps};
}
