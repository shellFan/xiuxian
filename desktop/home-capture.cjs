// Capture the actual desktop renderer, using the same entry and saved game.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
require('./main.cjs');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
app.whenReady().then(async () => {
  const out = path.join(__dirname, '..', 'ai', 'reports', 'home-visual');
  fs.mkdirSync(out, {recursive:true});
  await wait(15000);
  const win = BrowserWindow.getAllWindows()[0];
  if(!win) throw new Error('No desktop window');
  for(const [name,width,height] of [['default',460,850],['small',360,640],['large',1000,900]]) {
    win.setMinimumSize(300,500);win.setContentSize(width,height);await wait(2500);
    fs.writeFileSync(path.join(out,name+'.png'),(await win.webContents.capturePage()).toPNG());
    const state=await win.webContents.executeJavaScript(`(async()=>{
      const cc=await System.import('cc');const c=document.querySelector('canvas');
      return {dpr:devicePixelRatio,inner:[innerWidth,innerHeight],canvas:[c.width,c.height],rect:c.getBoundingClientRect().toJSON(),design:cc.view.getDesignResolutionSize(),visible:cc.view.getVisibleSize()};
    })()`);
    fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(state,null,2));
  }
  win.setContentSize(460,850);
  await wait(1500);
  const checks=[];
  for(const name of ['CultivateButton','WorkButton','FishButton','TabTasks','TabHome','HomeSettingsButton','TabHome']) {
    if(name==='FishButton') await wait(5000);
    const point=await win.webContents.executeJavaScript(`(async()=>{
      const cc=await System.import('cc');const root=cc.director.getScene();
      function find(n){if(n.name===${JSON.stringify(name)})return n;for(const c of n.children){const r=find(c);if(r)return r;}}
      const node=find(root),camera=root.getComponentInChildren(cc.Canvas).cameraComponent;
      const p=camera.worldToScreen(node.worldPosition),canvas=document.querySelector('canvas'),r=canvas.getBoundingClientRect();
      return {x:Math.round(r.x+p.x/canvas.width*r.width),y:Math.round(r.y+(canvas.height-p.y)/canvas.height*r.height)};
    })()`);
    win.webContents.sendInputEvent({type:'mouseMove',...point});
    win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...point});
    win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...point});
    await wait(1100);
    checks.push({name,point,state:await win.webContents.executeJavaScript(`(async()=>{
      const cc=await System.import('cc');const r=cc.director.getScene().getChildByName('Canvas').getChildByName('SafeAreaRoot');
      const ui=r.getComponent('GameUIController');return {tab:ui.currentTab,mode:ui.facade.snapshot().workMode,cultivation:ui.facade.snapshot().cultivationExp};
    })()`)});
  }
  fs.writeFileSync(path.join(out,'clicks.json'),JSON.stringify(checks,null,2));
  console.log('HOME_CAPTURE_COMPLETE '+out);
  app.quit();
}).catch(error=>{console.error(error);app.exit(1);});
